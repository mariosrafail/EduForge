import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import pg from "pg";
import { hashToken, sessionCookieName, setSqlForTests } from "../../netlify/functions/_auth-utils.js";
import { handler as usersHandler } from "../../netlify/functions/users.js";
import { handler as userHandler } from "../../netlify/functions/user.js";
import { handler as studentSignupHandler } from "../../netlify/functions/auth-student-signup.js";
import { handler as lessonSubmitHandler } from "../../netlify/functions/lesson-submit.js";
import { handler as bookContentHandler } from "../../netlify/functions/book-content.js";
import { handler as courseHandler } from "../../netlify/functions/course.js";
import { handler as lessonHandler } from "../../netlify/functions/lesson.js";
import { handler as activityHandler } from "../../netlify/functions/activity.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const confirmedIsolated = process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const integrationEnabled = Boolean(testDatabaseUrl && confirmedIsolated);
const { Pool } = pg;

function postgresTemplate(pool) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1]}`;
    }
    return (await pool.query(text, values)).rows;
  };
}

function scopedDatabaseUrl(baseUrl, schema) {
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function parseResponse(response) {
  return { status: response.statusCode, body: JSON.parse(response.body || "{}"), headers: response.headers || {} };
}

async function call(handler, { method = "GET", query = {}, body = {}, cookie = "", ip = "127.0.0.10" } = {}) {
  const rawQuery = new URLSearchParams(query).toString();
  return parseResponse(await handler({
    httpMethod: method,
    headers: { host: "localhost:8888", cookie, "x-nf-client-connection-ip": ip },
    queryStringParameters: query,
    rawQuery,
    body: method === "GET" ? "" : JSON.stringify(body),
  }));
}

async function createSession(pool, userId) {
  const token = randomBytes(24).toString("hex");
  await pool.query(
    "insert into auth_sessions (user_id, token_hash, expires_at) values ($1, $2, now() + interval '1 day')",
    [userId, hashToken(token)],
  );
  return `${sessionCookieName}=${token}`;
}

async function insertUser(pool, { schoolId, name, email, role, status = "active" }) {
  const passwordHash = await bcrypt.hash("integration-password", 4);
  const result = await pool.query(
    `insert into app_users (school_id, full_name, email, role, status, password_hash, auth_provider)
     values ($1, $2, $3, $4, $5, $6, 'password') returning id`,
    [schoolId, name, email, role, status, passwordHash],
  );
  return result.rows[0].id;
}

test("handler-level authorization flows preserve tenant and resource state", { skip: !integrationEnabled, timeout: 120_000 }, async (t) => {
  assert.notEqual(testDatabaseUrl, process.env.DATABASE_URL, "TEST_DATABASE_URL must not equal DATABASE_URL");
  const schema = `eduforge_test_${randomBytes(6).toString("hex")}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const scopedUrl = scopedDatabaseUrl(testDatabaseUrl, schema);
  const pool = new Pool({ connectionString: scopedUrl });
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = scopedUrl;
  setSqlForTests(postgresTemplate(pool));

  t.after(async () => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    setSqlForTests(null);
    await pool.end();
    await adminPool.query(`drop schema if exists "${schema}" cascade`);
    await adminPool.end();
  });

  const migrationFiles = (await readdir("database"))
    .filter((name) => /^\d+.*\.sql$/.test(name) && name !== "012_demo_login_passwords.sql")
    .sort((a, b) => a.localeCompare(b));
  for (const file of migrationFiles) {
    await pool.query(await readFile(`database/${file}`, "utf8"));
  }

  const schools = await pool.query(
    `insert into schools (name) values ('Integration School A'), ('Integration School B') returning id, name`,
  );
  const schoolA = schools.rows.find((row) => row.name.endsWith("A")).id;
  const schoolB = schools.rows.find((row) => row.name.endsWith("B")).id;
  const adminId = await insertUser(pool, { schoolId: schoolA, name: "Admin A", email: "admin-a@integration.test", role: "admin" });
  const teacherId = await insertUser(pool, { schoolId: schoolA, name: "Teacher A", email: "teacher-a@integration.test", role: "teacher" });
  const otherTeacherId = await insertUser(pool, { schoolId: schoolB, name: "Teacher B", email: "teacher-b@integration.test", role: "teacher" });
  const studentId = await insertUser(pool, { schoolId: schoolA, name: "Student A", email: "student-a@integration.test", role: "student" });
  const pausedStudentId = await insertUser(pool, { schoolId: schoolA, name: "Paused Student", email: "paused@integration.test", role: "student", status: "paused" });
  const adminCookie = await createSession(pool, adminId);
  const teacherCookie = await createSession(pool, teacherId);
  const otherTeacherCookie = await createSession(pool, otherTeacherId);
  const studentCookie = await createSession(pool, studentId);
  const pausedCookie = await createSession(pool, pausedStudentId);

  await t.test("users GET/POST/PATCH/DELETE remain school-scoped", async () => {
    const created = await call(usersHandler, {
      method: "POST", cookie: adminCookie,
      body: { full_name: "Disposable Teacher", email: "disposable@integration.test", role: "teacher", status: "active", password: "password123" },
    });
    assert.equal(created.status, 201);
    const disposableId = created.body.user.id;
    const listed = await call(usersHandler, { cookie: adminCookie });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.users.some((user) => user.id === otherTeacherId), false);
    const patched = await call(userHandler, { method: "PATCH", cookie: adminCookie, query: { id: disposableId }, body: { status: "paused" } });
    assert.equal(patched.status, 200);
    assert.equal((await pool.query("select status from app_users where id = $1", [disposableId])).rows[0].status, "paused");
    const deleted = await call(userHandler, { method: "DELETE", cookie: adminCookie, query: { id: disposableId } });
    assert.equal(deleted.status, 200);
    assert.equal((await pool.query("select count(*)::int as count from app_users where id = $1", [disposableId])).rows[0].count, 0);
  });

  const publisher = (await pool.query("insert into publishers (name, slug) values ('Integration Publisher', $1) returning id", [`publisher-${schema}`])).rows[0];
  const bookPackage = (await pool.query(
    "insert into book_packages (publisher_id, title, slug, level, status) values ($1, 'Integration Book', $2, 'B2', 'active') returning id, slug",
    [publisher.id, `book-${schema}`],
  )).rows[0];
  const classA = (await pool.query(
    `insert into classes (school_id, teacher_id, name, level, slug, assigned_book, book_package_id, invite_code, status)
     values ($1, $2, 'Class A', 'B2', $3, 'Integration Book', $4, 'VALIDA12', 'active') returning id`,
    [schoolA, teacherId, `class-a-${schema}`, bookPackage.id],
  )).rows[0];
  const classB = (await pool.query(
    `insert into classes (school_id, teacher_id, name, level, slug, invite_code, status)
     values ($1, $2, 'Class B', 'B2', $3, 'VALIDB12', 'active') returning id`,
    [schoolB, otherTeacherId, `class-b-${schema}`],
  )).rows[0];
  await pool.query(
    `insert into classes (school_id, teacher_id, name, level, slug, invite_code, status)
     values ($1, $2, 'Inactive', 'B2', $3, 'INACT123', 'archived')`,
    [schoolA, teacherId, `inactive-${schema}`],
  );
  await pool.query("insert into class_students (class_id, student_id, status) values ($1, $2, 'active')", [classA.id, studentId]);

  await t.test("signup and joining require active invite codes and are atomic", async () => {
    assert.equal((await call(bookContentHandler, { query: { action: "class-by-slug", slug: `class-a-${schema}` } })).status, 404);
    assert.equal((await call(bookContentHandler, { query: { action: "class-by-invite", inviteCode: "INACT123" } })).status, 404);
    const invalidEmail = "invalid-invite@integration.test";
    const invalid = await call(studentSignupHandler, {
      method: "POST", ip: "127.0.0.20",
      body: { fullName: "Invalid", email: invalidEmail, password: "password123", classCode: `class-a-${schema}` },
    });
    assert.equal(invalid.status, 400);
    assert.equal((await pool.query("select count(*)::int as count from app_users where email = $1", [invalidEmail])).rows[0].count, 0);
    const signup = await call(studentSignupHandler, {
      method: "POST", ip: "127.0.0.21",
      body: { fullName: "New Student", email: "new-student@integration.test", password: "password123", classCode: "VALIDA12" },
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.body.joinedClass.inviteCode, undefined);
    const newStudentId = signup.body.user.id;
    assert.equal((await pool.query("select count(*)::int as count from class_students where class_id = $1 and student_id = $2", [classA.id, newStudentId])).rows[0].count, 1);
    const slugJoin = await call(bookContentHandler, { method: "POST", cookie: studentCookie, query: { action: "join-class" }, body: { slug: `class-a-${schema}` } });
    assert.equal(slugJoin.status, 400);
    const crossSchool = await call(bookContentHandler, { method: "POST", cookie: studentCookie, query: { action: "join-class" }, body: { inviteCode: "VALIDB12" }, ip: "127.0.0.22" });
    assert.equal(crossSchool.status, 403);
    assert.equal((await pool.query("select count(*)::int as count from class_students where class_id = $1 and student_id = $2", [classB.id, studentId])).rows[0].count, 0);
  });

  const courseA = (await pool.query("insert into courses (school_id, title, status) values ($1, 'Course A', 'active') returning id", [schoolA])).rows[0];
  const courseB = (await pool.query("insert into courses (school_id, title, status) values ($1, 'Course B', 'active') returning id", [schoolB])).rows[0];
  const assignedLesson = (await pool.query("insert into lessons (course_id, school_id, title, status) values ($1, $2, 'Assigned Lesson', 'published') returning id", [courseA.id, schoolA])).rows[0];
  const unassignedLesson = (await pool.query("insert into lessons (course_id, school_id, title, status) values ($1, $2, 'Unassigned Lesson', 'published') returning id", [courseA.id, schoolA])).rows[0];
  const foreignLesson = (await pool.query("insert into lessons (course_id, school_id, title, status) values ($1, $2, 'Foreign Lesson', 'published') returning id", [courseB.id, schoolB])).rows[0];
  await pool.query(
    `insert into lesson_activities (lesson_id, school_id, type, title, content, correct_answers, ownership_type)
     values ($1, $2, 'multiple_choice', 'Question', '{"questions":[{"id":"q1","prompt":"Pick"}]}', '{"q1":"yes"}', 'official')`,
    [assignedLesson.id, schoolA],
  );
  await pool.query(
    "insert into lesson_assignments (school_id, lesson_id, assigned_by, student_id, status) values ($1, $2, $3, $4, 'assigned')",
    [schoolA, assignedLesson.id, teacherId, studentId],
  );

  await t.test("lesson submission requires explicit access and session-derived student", async () => {
    const assigned = await call(lessonSubmitHandler, { method: "POST", cookie: studentCookie, body: { lesson_id: assignedLesson.id, answers: {} } });
    assert.equal(assigned.status, 200);
    const stored = (await pool.query("select student_id from lesson_submissions where lesson_id = $1", [assignedLesson.id])).rows[0];
    assert.equal(stored.student_id, studentId);
    assert.equal((await call(lessonSubmitHandler, { method: "POST", cookie: studentCookie, body: { lesson_id: unassignedLesson.id, answers: {} } })).status, 404);
    assert.equal((await call(lessonSubmitHandler, { method: "POST", cookie: studentCookie, body: { lesson_id: foreignLesson.id, answers: {} } })).status, 404);
    assert.equal((await call(lessonSubmitHandler, { method: "POST", cookie: studentCookie, body: { lesson_id: assignedLesson.id, student_id: pausedStudentId, answers: {} } })).status, 403);
    assert.equal((await call(lessonSubmitHandler, { method: "POST", cookie: pausedCookie, body: { lesson_id: assignedLesson.id, answers: {} } })).status, 401);
    assert.equal((await pool.query("select count(*)::int as count from lesson_submissions where lesson_id = $1", [assignedLesson.id])).rows[0].count, 1);
  });

  await t.test("master content is admin-editable while teachers own only custom activities", async () => {
    assert.equal((await call(courseHandler, { method: "PATCH", cookie: teacherCookie, body: { title: "Teacher overwrite" } })).status, 403);
    assert.equal((await call(courseHandler, { method: "PATCH", cookie: adminCookie, body: { title: "Admin Course" } })).status, 200);
    assert.equal((await pool.query("select title from courses where id = $1", [courseA.id])).rows[0].title, "Admin Course");
    assert.equal((await call(lessonHandler, { method: "PATCH", cookie: teacherCookie, query: { id: assignedLesson.id }, body: { title: "Teacher overwrite" } })).status, 403);
    assert.equal((await call(lessonHandler, { method: "PATCH", cookie: adminCookie, query: { id: assignedLesson.id }, body: { title: "Admin Lesson" } })).status, 200);
    const created = await call(activityHandler, {
      method: "POST", cookie: teacherCookie,
      body: { lesson_id: assignedLesson.id, type: "multiple_choice", title: "Teacher Custom", content: { questions: [] }, correct_answers: {} },
    });
    assert.equal(created.status, 200);
    const customActivity = (await pool.query("select id, ownership_type, created_by from lesson_activities where title = 'Teacher Custom' and lesson_id = $1", [assignedLesson.id])).rows[0];
    assert.equal(customActivity.ownership_type, "custom");
    assert.equal(customActivity.created_by, teacherId);
    assert.equal((await call(activityHandler, { method: "PATCH", cookie: teacherCookie, query: { id: customActivity.id }, body: { title: "Teacher Updated" } })).status, 200);
  });

  const component = (await pool.query("insert into book_components (book_package_id, title, slug, component_type) values ($1, 'Book', $2, 'students_book') returning id", [bookPackage.id, `component-${schema}`])).rows[0];
  const unit = (await pool.query("insert into units (book_component_id, title, slug) values ($1, 'Unit', $2) returning id", [component.id, `unit-${schema}`])).rows[0];
  const bookLesson = (await pool.query("insert into lessons (unit_id, title, slug, status) values ($1, 'Book Lesson', $2, 'published') returning id", [unit.id, `lesson-${schema}`])).rows[0];
  const activity = (await pool.query(
    `insert into activities (school_id, lesson_id, title, type, slug, activity_type, content, content_json, ownership_type)
     values ($1, $2, 'Book Activity', 'multiple_choice', $3, 'multiple_choice', '{}', '{}', 'official') returning id`,
    [schoolA, bookLesson.id, `activity-${schema}`],
  )).rows[0];
  const question = (await pool.query("insert into questions (activity_id, question_number, prompt, question_type) values ($1, 1, 'Answer yes', 'multiple_choice') returning id", [activity.id])).rows[0];
  await pool.query("insert into question_options (question_id, option_label, option_text, is_correct) values ($1, 'A', 'yes', true), ($1, 'B', 'no', false)", [question.id]);
  await pool.query("insert into book_access (user_id, book_package_id, role_scope) values ($1, $2, 'teacher')", [teacherId, bookPackage.id]);

  await t.test("assignment, results, review, hotspots and custom activities enforce owner/tenant", async () => {
    const createdAssignment = await call(bookContentHandler, {
      method: "POST", cookie: teacherCookie, query: { action: "create-assignment" },
      body: { activityId: activity.id, classId: classA.id, title: "Assigned work" },
    });
    assert.equal(createdAssignment.status, 200);
    const assignmentId = createdAssignment.body.assignment.id;
    assert.equal((await pool.query("select school_id from activity_assignments where id = $1", [assignmentId])).rows[0].school_id, schoolA);
    const escalated = await call(bookContentHandler, { method: "POST", cookie: studentCookie, query: { action: "create-assignment" }, body: { activityId: activity.id, classId: classA.id } });
    assert.equal(escalated.status, 403);
    const submitted = await call(bookContentHandler, {
      method: "POST", cookie: studentCookie, query: { action: "submit" },
      body: { activityId: activity.id, assignmentId, studentId: studentId, answers: { [question.id]: "yes" } },
    });
    assert.equal(submitted.status, 200);
    const submissionId = submitted.body.submission.id;
    const results = await call(bookContentHandler, { cookie: teacherCookie, query: { action: "assignment-results", assignmentId } });
    assert.equal(results.status, 200);
    assert.equal(results.body.rows.find((row) => row.studentId === studentId)?.submissionId, submissionId);
    assert.equal((await call(bookContentHandler, { cookie: otherTeacherCookie, query: { action: "assignment-results", assignmentId } })).status, 403);
    const reviewed = await call(bookContentHandler, { method: "POST", cookie: teacherCookie, query: { action: "review-submission" }, body: { submissionId, teacherFeedback: "Good" } });
    assert.equal(reviewed.status, 200);
    assert.equal((await pool.query("select teacher_feedback from activity_submissions where id = $1", [submissionId])).rows[0].teacher_feedback, "Good");
    const hotspot = await call(bookContentHandler, {
      method: "POST", cookie: teacherCookie, query: { action: "save-page-hotspots" },
      body: { packageSlug: bookPackage.slug, componentSlug: `component-${schema}`, pageId: "1", hotspots: [{ label: "Open", left: 10, top: 10, width: 10, height: 10, actionType: "none" }] },
    });
    assert.equal(hotspot.status, 200);
    assert.equal((await pool.query("select created_by, school_id from book_page_hotspots where id = $1", [hotspot.body.hotspots[0].id])).rows[0].created_by, teacherId);
    const custom = await call(bookContentHandler, {
      method: "POST", cookie: teacherCookie, query: { action: "create-book-activity" },
      body: { packageSlug: bookPackage.slug, componentSlug: `component-${schema}`, pageId: "1", title: "Custom", type: "open_answer" },
    });
    assert.equal(custom.status, 200);
    const customId = custom.body.activity.id;
    const tamper = await call(bookContentHandler, {
      method: "POST", cookie: otherTeacherCookie, query: { action: "update-book-activity" },
      body: { activityId: customId, title: "Stolen" },
    });
    assert.equal(tamper.status, 404);
    assert.equal((await pool.query("select title from book_activities where id = $1", [customId])).rows[0].title, "Custom");
  });
});
