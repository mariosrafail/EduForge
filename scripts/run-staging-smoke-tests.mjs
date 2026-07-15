import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { createSafePool, callHandler, postgresTemplate } from "./_staging-db.mjs";
import { QA, QA_PASSWORD, QA_SEED_KEY } from "./_staging-qa-data.mjs";
import { setSqlForVerification } from "../netlify/functions/_auth-utils.js";
import { handler as signIn } from "../netlify/functions/auth-signin.js";
import { handler as users } from "../netlify/functions/users.js";
import { handler as user } from "../netlify/functions/user.js";
import { handler as course } from "../netlify/functions/course.js";
import { handler as lesson } from "../netlify/functions/lesson.js";
import { handler as activity } from "../netlify/functions/activity.js";
import { handler as lessonSubmit } from "../netlify/functions/lesson-submit.js";
import { handler as bookContent } from "../netlify/functions/book-content.js";

const { pool, safeLabel } = createSafePool("staging");
setSqlForVerification(postgresTemplate(pool));
const [schoolA, schoolB] = QA.schools;
const artifacts = {
  users: [], assignments: [], activities: [], activitySubmissions: [], lessonSubmissions: [],
  courses: [], classMemberships: [], inviteFingerprints: [],
};
let failures = 0;

async function check(name, callback) {
  try {
    await callback();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

function noSecrets(value) {
  const encoded = JSON.stringify(value);
  for (const key of ["password_hash", "token_hash", "session_token", "invite_code"]) assert.equal(encoded.includes(key), false);
}

async function login(account, password = QA_PASSWORD) {
  const response = await callHandler(signIn, { method: "POST", body: { email: account.email, password } });
  return { ...response, cookie: response.headers["Set-Cookie"] || response.headers["set-cookie"] || "" };
}

function fingerprint(ip) {
  const salt = process.env.INVITE_RATE_LIMIT_SALT || "eduforge-invite-rate-limit";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

async function count(sql, values = []) {
  return Number((await pool.query(sql, values)).rows[0].count);
}

try {
  console.log(`Running handler-level smoke tests against isolated staging target: ${safeLabel}`);
  assert.equal(await count("select count(*) from staging_qa_registry where seed_key = $1", [QA_SEED_KEY]) > 0, true,
    "Run npm run staging:seed before smoke tests");

  const sessions = {};
  await check("authentication succeeds for both schools and all active roles", async () => {
    for (const school of QA.schools) {
      for (const role of ["admin", "teacher1", "student1"]) {
        const result = await login(school.users[role]);
        assert.equal(result.status, 200);
        assert.ok(result.cookie);
        assert.equal(result.body.user.school_id, school.id);
        noSecrets(result.body);
        sessions[`${school.key}-${role}`] = result.cookie;
      }
    }
  });
  await check("invalid password, paused account, and unauthenticated access fail closed", async () => {
    assert.equal((await login(schoolA.users.admin, "definitely-wrong")).status, 401);
    assert.equal((await login(schoolA.users.paused)).status, 403);
    assert.equal((await callHandler(users)).status, 401);
  });

  await check("admin user listing and cross-school user mutations are tenant-scoped", async () => {
    const cookie = sessions["a-admin"];
    const listed = await callHandler(users, { cookie });
    assert.equal(listed.status, 200);
    assert.ok(listed.body.users.every((entry) => entry.school_id === schoolA.id));
    assert.equal(listed.body.users.some((entry) => entry.id === schoolB.users.teacher1.id), false);
    noSecrets(listed.body);
    const before = (await pool.query("select full_name, status from app_users where id = $1", [schoolB.users.teacher1.id])).rows[0];
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const response = await callHandler(user, { method, cookie, query: { id: schoolB.users.teacher1.id }, body: { full_name: "Tampered", status: "paused" } });
      assert.equal(response.status, 404);
    }
    assert.deepEqual((await pool.query("select full_name, status from app_users where id = $1", [schoolB.users.teacher1.id])).rows[0], before);
    assert.equal((await callHandler(user, { method: "DELETE", cookie, query: { id: schoolA.users.admin.id } })).status, 409);
    assert.equal(await count("select count(*) from app_users where id = $1 and status = 'active'", [schoolA.users.admin.id]), 1);
  });

  await check("admin creates and removes an account only in the authenticated school", async () => {
    const email = `qa.transient.${randomUUID()}@eduforge.invalid`;
    const created = await callHandler(users, { method: "POST", cookie: sessions["a-admin"], body: {
      full_name: "QA Transient Teacher", email, role: "teacher", status: "active", password: "Transient!2026",
    } });
    assert.equal(created.status, 201);
    artifacts.users.push(created.body.user.id);
    assert.equal((await pool.query("select school_id from app_users where id = $1", [created.body.user.id])).rows[0].school_id, schoolA.id);
    assert.equal((await callHandler(user, { method: "DELETE", cookie: sessions["a-admin"], query: { id: created.body.user.id } })).status, 200);
    artifacts.users = artifacts.users.filter((id) => id !== created.body.user.id);
    assert.equal(await count("select count(*) from app_users where id = $1", [created.body.user.id]), 0);
  });

  await check("teachers see only owned classes and cannot change official master content", async () => {
    const cookie = sessions["a-teacher1"];
    const classes = await callHandler(bookContent, { cookie, query: { action: "classes" } });
    assert.equal(classes.status, 200);
    const encoded = JSON.stringify(classes.body);
    assert.equal(encoded.includes(schoolB.classes[0].id), false);
    assert.equal(encoded.includes(schoolA.classes[1].id), false);
    assert.equal((await callHandler(bookContent, { cookie, query: { action: "class-students", classId: schoolA.classes[1].id } })).status, 403);
    const courseTitle = (await pool.query("select title from courses where id = $1", [schoolA.courseId])).rows[0].title;
    assert.equal((await callHandler(course, { method: "PATCH", cookie, body: { title: "Tampered" } })).status, 403);
    assert.equal((await pool.query("select title from courses where id = $1", [schoolA.courseId])).rows[0].title, courseTitle);
    const lessonTitle = (await pool.query("select title from lessons where id = $1", [schoolA.lessonId])).rows[0].title;
    assert.equal((await callHandler(lesson, { method: "PATCH", cookie, query: { id: schoolA.lessonId }, body: { title: "Tampered" } })).status, 403);
    assert.equal((await pool.query("select title from lessons where id = $1", [schoolA.lessonId])).rows[0].title, lessonTitle);
  });

  await check("custom activity ownership permits owner edits and blocks other teachers/tenants", async () => {
    const original = (await pool.query("select title from lesson_activities where id = $1", [schoolA.customLessonActivityId])).rows[0].title;
    const changed = `${original} verified`;
    assert.equal((await callHandler(activity, { method: "PATCH", cookie: sessions["a-teacher1"], query: { id: schoolA.customLessonActivityId }, body: { title: changed } })).status, 200);
    assert.equal((await pool.query("select title from lesson_activities where id = $1", [schoolA.customLessonActivityId])).rows[0].title, changed);
    assert.equal((await callHandler(activity, { method: "PATCH", cookie: sessions["b-teacher1"], query: { id: schoolA.customLessonActivityId }, body: { title: "Stolen" } })).status, 404);
    assert.equal((await pool.query("select title from lesson_activities where id = $1", [schoolA.customLessonActivityId])).rows[0].title, changed);
    await pool.query("update lesson_activities set title = $1 where id = $2", [original, schoolA.customLessonActivityId]);
    const title = `QA transient custom ${randomUUID()}`;
    const created = await callHandler(activity, { method: "POST", cookie: sessions["a-teacher1"], body: {
      lesson_id: schoolA.lessonId, type: "multiple_choice", title, content: { questions: [] }, correct_answers: {},
    } });
    assert.equal(created.status, 200);
    const custom = (await pool.query("select id, school_id, created_by, ownership_type from lesson_activities where title = $1", [title])).rows[0];
    artifacts.activities.push(custom.id);
    assert.deepEqual(custom, { id: custom.id, school_id: schoolA.id, created_by: schoolA.users.teacher1.id, ownership_type: "custom" });
  });

  await check("assignment creation, result visibility, and review stay with the owning teacher", async () => {
    const created = await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher1"], query: { action: "create-assignment" }, body: {
      activityId: schoolA.activityId, classId: schoolA.classes[0].id, title: "QA transient assignment",
    } });
    assert.equal(created.status, 200);
    const id = created.body.assignment.id;
    artifacts.assignments.push(id);
    const row = (await pool.query("select school_id, teacher_id, class_id from activity_assignments where id = $1", [id])).rows[0];
    assert.deepEqual(row, { school_id: schoolA.id, teacher_id: schoolA.users.teacher1.id, class_id: schoolA.classes[0].id });
    assert.equal((await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher1"], query: { action: "create-assignment" }, body: {
      activityId: schoolB.activityId, classId: schoolB.classes[0].id,
    } })).status >= 403, true);
    assert.equal((await callHandler(bookContent, { cookie: sessions["b-teacher1"], query: { action: "assignment-results", assignmentId: schoolA.classAssignmentId } })).status, 403);
    const before = (await pool.query("select teacher_feedback from activity_submissions where id = $1", [schoolA.unreviewedSubmissionId])).rows[0].teacher_feedback;
    assert.equal((await callHandler(bookContent, { method: "POST", cookie: sessions["b-teacher1"], query: { action: "review-submission" }, body: { submissionId: schoolA.unreviewedSubmissionId, teacherFeedback: "Stolen" } })).status >= 403, true);
    assert.equal((await pool.query("select teacher_feedback from activity_submissions where id = $1", [schoolA.unreviewedSubmissionId])).rows[0].teacher_feedback, before);
    const submitted = await callHandler(bookContent, { method: "POST", cookie: sessions["a-student1"], query: { action: "submit" }, body: {
      activityId: schoolA.activityId, assignmentId: id, answers: { [schoolA.questionId]: "yes" },
    } });
    assert.equal(submitted.status, 200);
    artifacts.activitySubmissions.push(submitted.body.submission.id);
    const reviewed = await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher1"], query: { action: "review-submission" }, body: {
      submissionId: submitted.body.submission.id, teacherFeedback: "QA verified",
    } });
    assert.equal(reviewed.status, 200);
    assert.equal((await pool.query("select teacher_feedback, reviewed_by from activity_submissions where id = $1", [submitted.body.submission.id])).rows[0].teacher_feedback, "QA verified");
  });

  await check("students see accessible books, cannot override identity, and cannot cross lessons", async () => {
    const list = await callHandler(bookContent, { cookie: sessions["a-student1"], query: { action: "list" } });
    assert.equal(list.status, 200);
    assert.equal(JSON.stringify(list.body).includes(QA.package.slug), true);
    const before = await count("select count(*) from lesson_submissions where lesson_id = $1 and student_id = $2", [schoolA.lessonId, schoolA.users.student1.id]);
    const submitted = await callHandler(lessonSubmit, { method: "POST", cookie: sessions["a-student1"], body: { lesson_id: schoolA.lessonId, answers: {} } });
    assert.equal(submitted.status, 200);
    const rows = await pool.query("select id from lesson_submissions where lesson_id = $1 and student_id = $2 order by submitted_at desc limit 1", [schoolA.lessonId, schoolA.users.student1.id]);
    artifacts.lessonSubmissions.push(rows.rows[0].id);
    assert.equal(await count("select count(*) from lesson_submissions where lesson_id = $1 and student_id = $2", [schoolA.lessonId, schoolA.users.student1.id]), before + 1);
    assert.equal((await callHandler(lessonSubmit, { method: "POST", cookie: sessions["a-student1"], body: { lesson_id: schoolA.lessonId, student_id: schoolA.users.student2.id, answers: {} } })).status, 403);
    const transientCourse = (await pool.query(
      "insert into courses (school_id, ownership_type, created_by, title, status) values ($1, 'official', $2, 'QA unassigned course', 'active') returning id",
      [schoolA.id, schoolA.users.admin.id],
    )).rows[0];
    artifacts.courses.push(transientCourse.id);
    const unassignedLesson = (await pool.query(
      "insert into lessons (course_id, school_id, ownership_type, created_by, title, status) values ($1, $2, 'official', $3, 'QA unassigned lesson', 'published') returning id",
      [transientCourse.id, schoolA.id, schoolA.users.admin.id],
    )).rows[0];
    assert.equal((await callHandler(lessonSubmit, { method: "POST", cookie: sessions["a-student1"], body: { lesson_id: unassignedLesson.id, answers: {} } })).status, 404);
    assert.equal(await count("select count(*) from lesson_submissions where lesson_id = $1", [unassignedLesson.id]), 0);
    assert.equal((await callHandler(lessonSubmit, { method: "POST", cookie: sessions["a-student1"], body: { lesson_id: schoolB.lessonId, answers: {} } })).status, 404);
  });

  await check("students join only by valid active invite code, never by slug or UUID", async () => {
    const cookie = sessions["a-student1"];
    const classId = schoolA.classes[1].id;
    await pool.query("delete from class_students where class_id = $1 and student_id = $2", [classId, schoolA.users.student1.id]);
    assert.equal((await callHandler(bookContent, { method: "POST", cookie, query: { action: "join-class" }, body: { slug: schoolA.classes[1].slug } })).status, 400);
    assert.equal((await callHandler(bookContent, { method: "POST", cookie, query: { action: "join-class" }, body: { inviteCode: classId } })).status, 400);
    assert.equal(await count("select count(*) from class_students where class_id = $1 and student_id = $2", [classId, schoolA.users.student1.id]), 0);
    const joined = await callHandler(bookContent, { method: "POST", cookie, query: { action: "join-class" }, body: { inviteCode: schoolA.classes[1].invite }, ip: "127.77.0.3" });
    artifacts.inviteFingerprints.push(fingerprint("127.77.0.3"));
    assert.equal(joined.status, 200);
    noSecrets(joined.body);
    assert.equal(await count("select count(*) from class_students where class_id = $1 and student_id = $2 and status = 'active'", [classId, schoolA.users.student1.id]), 1);
    artifacts.classMemberships.push([classId, schoolA.users.student1.id]);
  });

  await check("invite lookup is non-disclosing and invalid attempts are throttled", async () => {
    const publicResult = await callHandler(bookContent, { query: { action: "class-by-invite", inviteCode: schoolA.classes[0].invite }, ip: "127.77.0.1" });
    artifacts.inviteFingerprints.push(fingerprint("127.77.0.1"));
    assert.equal(publicResult.status, 200);
    noSecrets(publicResult.body);
    const encoded = JSON.stringify(publicResult.body);
    for (const hidden of [schoolA.classes[0].id, schoolA.classes[0].slug, schoolA.id]) assert.equal(encoded.includes(hidden), false);
    const ip = "127.77.0.2";
    const fp = fingerprint(ip);
    artifacts.inviteFingerprints.push(fp);
    await pool.query("delete from class_invite_attempts where request_fingerprint = $1", [fp]);
    for (let index = 0; index < 20; index += 1) {
      assert.equal((await callHandler(bookContent, { query: { action: "class-by-invite", inviteCode: "ZZZZZZ99" }, ip })).status, 404);
    }
    const limited = await callHandler(bookContent, { query: { action: "class-by-invite", inviteCode: "ZZZZZZ99" }, ip });
    assert.equal(limited.status, 429);
    assert.ok(limited.headers["Retry-After"] || limited.headers["retry-after"]);
    assert.equal(await count("select count(*) from class_invite_attempts where request_fingerprint = $1", [fp]), 20);
    await pool.query("update class_invite_attempts set attempted_at = now() - interval '16 minutes' where request_fingerprint = $1", [fp]);
    assert.equal((await callHandler(bookContent, { query: { action: "class-by-invite", inviteCode: "ZZZZZZ99" }, ip })).status, 404);
  });
} finally {
  try {
    if (artifacts.lessonSubmissions.length) await pool.query("delete from lesson_submissions where id = any($1::uuid[])", [artifacts.lessonSubmissions]);
    if (artifacts.activitySubmissions.length) await pool.query("delete from activity_submissions where id = any($1::uuid[])", [artifacts.activitySubmissions]);
    if (artifacts.assignments.length) await pool.query("delete from activity_assignments where id = any($1::uuid[])", [artifacts.assignments]);
    if (artifacts.activities.length) await pool.query("delete from lesson_activities where id = any($1::uuid[])", [artifacts.activities]);
    for (const [classId, studentId] of artifacts.classMemberships) {
      await pool.query("delete from class_students where class_id = $1 and student_id = $2", [classId, studentId]);
    }
    if (artifacts.courses.length) await pool.query("delete from courses where id = any($1::uuid[])", [artifacts.courses]);
    if (artifacts.users.length) await pool.query("delete from app_users where id = any($1::uuid[])", [artifacts.users]);
    if (artifacts.inviteFingerprints.length) await pool.query("delete from class_invite_attempts where request_fingerprint = any($1::text[])", [artifacts.inviteFingerprints]);
  } finally {
    setSqlForVerification(null);
    await pool.end();
  }
}

if (failures) throw new Error(`${failures} staging smoke check(s) failed`);
console.log("All staging handler smoke checks passed and transient artifacts were removed.");
