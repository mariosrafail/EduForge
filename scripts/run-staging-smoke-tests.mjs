import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createSafePool, callHandler, postgresTemplate } from "./_staging-db.mjs";
import { QA, QA_SEED_KEYS, qaInviteFingerprint, requireQaPassword } from "./_staging-qa-data.mjs";
import { hashToken, sessionCookieName, setSqlForVerification } from "../netlify/functions/_auth-utils.js";
import { handler as signIn } from "../netlify/functions/auth-signin.js";
import { handler as studentSignup } from "../netlify/functions/auth-student-signup.js";
import { handler as users } from "../netlify/functions/users.js";
import { handler as user } from "../netlify/functions/user.js";
import { handler as course } from "../netlify/functions/course.js";
import { handler as lesson } from "../netlify/functions/lesson.js";
import { handler as activity } from "../netlify/functions/activity.js";
import { handler as lessonSubmit } from "../netlify/functions/lesson-submit.js";
import { handler as bookContent } from "../netlify/functions/book-content.js";
import { requestFingerprint } from "../netlify/functions/_account-lifecycle-utils.js";
import { clearCapturedEmailsForTests, getCapturedEmailsForTests } from "../netlify/functions/_email-utils.js";
import { handler as accountInvite } from "../netlify/functions/account-invite.js";
import { handler as accountSetPassword } from "../netlify/functions/account-set-password.js";
import { handler as forgotPassword } from "../netlify/functions/auth-forgot-password.js";
import { handler as resetPassword } from "../netlify/functions/auth-reset-password.js";
import { handler as revokeSessions } from "../netlify/functions/auth-revoke-sessions.js";
import { handler as operationalHealth } from "../netlify/functions/operational-health.js";

const { pool, safeLabel } = createSafePool("staging");
const QA_PASSWORD = requireQaPassword();
setSqlForVerification(postgresTemplate(pool));
const [schoolA, schoolB] = QA.schools;
const artifacts = {
  users: [], assignments: [], activities: [], activitySubmissions: [], lessonSubmissions: [],
  bookActivities: [], courses: [], classes: [], classMemberships: [], inviteFingerprints: [],
  accountEmails: [],
};
const lifecycleFingerprints = [];
let failures = 0;
let unexpectedFailure = false;

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
  return qaInviteFingerprint(ip);
}

async function count(sql, values = []) {
  return Number((await pool.query(sql, values)).rows[0].count);
}

try {
  console.log(`Running handler-level smoke tests against isolated staging target: ${safeLabel}`);
  assert.equal(await count("select count(*) from staging_qa_registry where seed_key = any($1::text[])", [QA_SEED_KEYS]) > 0, true,
    "Run npm run staging:seed before smoke tests");

  await check("operational health reports a ready migrated database", async () => {
    const response = await callHandler(operationalHealth);
    assert.equal(response.status, 200);
    assert.equal(response.body.status, "ok");
    assert.equal(response.body.database, "ok");
    assert.equal(typeof response.body.build, "string");
  });

  const sessions = {};
  await check("authentication succeeds for both schools and all active roles", async () => {
    for (const school of QA.schools) {
      for (const role of ["admin", "teacher1", "teacher2", "student1", "student2"]) {
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
    const expectedActiveBookPackages = await count(
      "select count(distinct ba.book_package_id) from book_access ba join app_users u on u.id = ba.user_id where u.school_id = $1",
      [schoolA.id],
    );
    const metrics = await callHandler(bookContent, { cookie, query: { action: "school-metrics" } });
    assert.equal(metrics.status, 200);
    assert.deepEqual(metrics.body.metrics, {
      activeUsers: 5, teacherCount: 2, studentCount: 3, activeClasses: 2,
      activeBookPackages: expectedActiveBookPackages, activeAssignments: 2, submittedWorkCount: 2,
    });
    assert.equal((await callHandler(bookContent, { cookie: sessions["a-teacher1"], query: { action: "school-metrics" } })).status, 403);
  });

  await check("admin creates and removes an account only in the authenticated school", async () => {
    const email = `qa.transient.${randomUUID()}@hhplms.invalid`;
    artifacts.accountEmails.push(email);
    const created = await callHandler(users, { method: "POST", cookie: sessions["a-admin"], body: {
      full_name: "QA Transient Teacher", email, role: "teacher", status: "active", password: "Transient!2026",
    } });
    assert.equal(created.status, 201);
    artifacts.users.push(created.body.user.id);
    assert.equal((await pool.query("select school_id from app_users where id = $1", [created.body.user.id])).rows[0].school_id, schoolA.id);
    assert.equal((await callHandler(user, { method: "DELETE", cookie: sessions["a-admin"], query: { id: created.body.user.id } })).status, 200);
    assert.equal(await count("select count(*) from app_users where id = $1", [created.body.user.id]), 0);
  });

  await check("account invitation, reset and session revocation complete without exposing raw tokens", async () => {
    process.env.APP_PUBLIC_URL ||= "https://staging.local";
    process.env.ACCOUNT_EMAIL_MODE = "capture";
    clearCapturedEmailsForTests();
    const email = `qa.lifecycle.${randomUUID()}@hhplms.invalid`;
    const inviteIp = "127.76.0.1";
    lifecycleFingerprints.push(requestFingerprint({ headers: { "x-nf-client-connection-ip": inviteIp } }));
    const invited = await callHandler(accountInvite, { method: "POST", cookie: sessions["a-admin"], ip: inviteIp, body: {
      full_name: "QA Lifecycle Teacher", email, role: "teacher", school_id: schoolB.id,
    } });
    assert.equal(invited.status, 400);
    const created = await callHandler(accountInvite, { method: "POST", cookie: sessions["a-admin"], ip: inviteIp, body: {
      full_name: "QA Lifecycle Teacher", email, role: "teacher",
    } });
    assert.equal(created.status, 201);
    artifacts.users.push(created.body.user.id);
    assert.equal(JSON.stringify(created.body).includes(schoolA.id), false);
    const invitationUrl = getCapturedEmailsForTests().at(-1).actionUrl;
    const invitationToken = new URL(invitationUrl).hash.split("token=")[1];
    const accepted = await callHandler(accountSetPassword, { method: "POST", ip: "127.76.0.2", body: { token: invitationToken, password: "Qa-Lifecycle-Teacher-2026" } });
    assert.equal(accepted.status, 200);
    assert.equal((await callHandler(accountSetPassword, { method: "POST", ip: "127.76.0.2", body: { token: invitationToken, password: "Qa-Replay-Teacher-2026" } })).status, 400);
    const forgotIp = "127.76.0.3";
    lifecycleFingerprints.push(requestFingerprint({ headers: { "x-nf-client-connection-ip": forgotIp } }));
    assert.equal((await callHandler(forgotPassword, { method: "POST", ip: forgotIp, body: { email } })).status, 200);
    const resetToken = new URL(getCapturedEmailsForTests().at(-1).actionUrl).hash.split("token=")[1];
    const resetResult = await callHandler(resetPassword, { method: "POST", ip: "127.76.0.4", body: { token: resetToken, password: "Qa-Lifecycle-Reset-2026" } });
    assert.equal(resetResult.status, 200);
    const resetCookie = resetResult.headers["Set-Cookie"] || resetResult.headers["set-cookie"];
    assert.equal((await callHandler(revokeSessions, { method: "POST", cookie: resetCookie, ip: "127.76.0.5", body: {} })).status, 200);
    const tokenRows = await pool.query("select token_hash from account_tokens where user_id = $1", [created.body.user.id]);
    assert.equal(JSON.stringify(tokenRows.rows).includes(invitationToken), false);
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
    assert.equal((await callHandler(activity, { method: "PATCH", cookie: sessions["a-teacher2"], query: { id: schoolA.customLessonActivityId }, body: { title: "Same-school stolen" } })).status, 403);
    assert.equal((await callHandler(activity, { method: "DELETE", cookie: sessions["a-teacher2"], query: { id: schoolA.customLessonActivityId } })).status, 405);
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

  await check("same-school teachers cannot replace hotspots or edit/delete another teacher's book activity", async () => {
    const hotspotBefore = (await pool.query(
      "select id, label, created_by, school_id, left_percent::text, top_percent::text, width_percent::text, height_percent::text from book_page_hotspots where id = $1",
      [schoolA.hotspotId],
    )).rows[0];
    const hotspotAttempt = await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher2"], query: { action: "save-page-hotspots" }, body: {
      packageSlug: QA.package.slug, componentSlug: QA.component.slug, pageId: "qa-page-1",
      hotspots: [{ label: "Same-school stolen", left: 1, top: 1, width: 5, height: 5, actionType: "none" }],
    } });
    assert.equal(hotspotAttempt.status, 403);
    assert.deepEqual((await pool.query(
      "select id, label, created_by, school_id, left_percent::text, top_percent::text, width_percent::text, height_percent::text from book_page_hotspots where id = $1",
      [schoolA.hotspotId],
    )).rows[0], hotspotBefore);

    const created = await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher1"], query: { action: "create-book-activity" }, body: {
      packageSlug: QA.package.slug, componentSlug: QA.component.slug, pageId: "qa-owner-page",
      title: `QA owned book activity ${randomUUID()}`, type: "open_answer",
    } });
    assert.equal(created.status, 200);
    const bookActivityId = created.body.activity.id;
    artifacts.bookActivities.push(bookActivityId);
    const before = (await pool.query("select title, created_by, school_id, content, status from book_activities where id = $1", [bookActivityId])).rows[0];
    assert.equal((await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher2"], query: { action: "update-book-activity" }, body: {
      activityId: bookActivityId, title: "Same-school stolen", type: "open_answer",
    } })).status, 404);
    assert.equal((await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher2"], query: { action: "delete-book-activity" }, body: {
      activityId: bookActivityId,
    } })).status, 404);
    assert.deepEqual((await pool.query("select title, created_by, school_id, content, status from book_activities where id = $1", [bookActivityId])).rows[0], before);
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
    const visible = await callHandler(bookContent, { cookie: sessions["a-student1"], query: { action: "assignments" } });
    assert.equal(visible.status, 200);
    const visibleActivity = visible.body.assignments.find((assignment) => assignment.assignmentId === id).activity;
    const visibleQuestion = visibleActivity.questions[0];
    assert.equal(visibleQuestion.id, schoolA.questionId);
    assert.equal("answer" in visibleQuestion, false);
    assert.doesNotMatch(JSON.stringify(visibleActivity), /acceptedAnswers|correct_answers|Contents[\\/]Resources|sourceRelativePath|sourceProvenance/);
    const assignmentCount = await count("select count(*) from activity_assignments where teacher_id = $1 and class_id = $2", [schoolA.users.teacher2.id, schoolA.classes[0].id]);
    assert.equal((await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher2"], query: { action: "create-assignment" }, body: {
      activityId: schoolA.activityId, classId: schoolA.classes[0].id, title: "Same-school unauthorized",
    } })).status, 403);
    assert.equal(await count("select count(*) from activity_assignments where teacher_id = $1 and class_id = $2", [schoolA.users.teacher2.id, schoolA.classes[0].id]), assignmentCount);
    assert.equal((await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher1"], query: { action: "create-assignment" }, body: {
      activityId: schoolB.activityId, classId: schoolB.classes[0].id,
    } })).status >= 403, true);
    assert.equal((await callHandler(bookContent, { cookie: sessions["b-teacher1"], query: { action: "assignment-results", assignmentId: schoolA.classAssignmentId } })).status, 403);
    assert.equal((await callHandler(bookContent, { cookie: sessions["a-teacher2"], query: { action: "assignment-results", assignmentId: schoolA.classAssignmentId } })).status, 403);
    const before = (await pool.query("select teacher_feedback from activity_submissions where id = $1", [schoolA.unreviewedSubmissionId])).rows[0].teacher_feedback;
    assert.equal((await callHandler(bookContent, { method: "POST", cookie: sessions["b-teacher1"], query: { action: "review-submission" }, body: { submissionId: schoolA.unreviewedSubmissionId, teacherFeedback: "Stolen" } })).status >= 403, true);
    assert.equal((await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher2"], query: { action: "review-submission" }, body: { submissionId: schoolA.unreviewedSubmissionId, teacherFeedback: "Same-school stolen" } })).status, 403);
    assert.equal((await pool.query("select teacher_feedback from activity_submissions where id = $1", [schoolA.unreviewedSubmissionId])).rows[0].teacher_feedback, before);
    const submitted = await callHandler(bookContent, { method: "POST", cookie: sessions["a-student1"], query: { action: "submit" }, body: {
      activityId: schoolA.activityId, assignmentId: id, result: { answers: { [schoolA.questionId]: "yes" } },
    } });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.body.submission.scorePercent, 100);
    artifacts.activitySubmissions.push(submitted.body.submission.id);
    const reviewed = await callHandler(bookContent, { method: "POST", cookie: sessions["a-teacher1"], query: { action: "review-submission" }, body: {
      submissionId: submitted.body.submission.id, teacherFeedback: "QA verified",
    } });
    assert.equal(reviewed.status, 200);
    assert.equal((await pool.query("select teacher_feedback, reviewed_by from activity_submissions where id = $1", [submitted.body.submission.id])).rows[0].teacher_feedback, "QA verified");
    const studentGrades = await callHandler(bookContent, { cookie: sessions["a-student1"], query: { action: "grades", studentId: schoolB.users.student1.id } });
    assert.equal(studentGrades.status, 200);
    const visibleGrade = studentGrades.body.grades.find((grade) => grade.id === submitted.body.submission.id);
    assert.equal(visibleGrade.scorePercent, 100);
    assert.equal(visibleGrade.teacherFeedback, "QA verified");
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

  await check("same-school and cross-school students cannot read or mutate another student's work", async () => {
    const cookie = sessions["a-student1"];
    const grades = await callHandler(bookContent, { cookie, query: { action: "grades", studentId: schoolA.users.student2.id } });
    assert.equal(grades.status, 200);
    const encoded = JSON.stringify(grades.body);
    assert.equal(encoded.includes(schoolA.unreviewedSubmissionId), false);
    assert.equal(encoded.includes(schoolB.unreviewedSubmissionId), false);

    for (const target of [
      [schoolA, schoolA.directAssignmentId, schoolA.unreviewedSubmissionId],
      [schoolB, schoolB.directAssignmentId, schoolB.unreviewedSubmissionId],
    ]) {
      const [school, assignmentId, submissionId] = target;
      const before = (await pool.query(
        "select student_id, answers, teacher_feedback, reviewed_at, reviewed_by from activity_submissions where id = $1",
        [submissionId],
      )).rows[0];
      const countBefore = await count("select count(*) from activity_submissions where activity_assignment_id = $1", [assignmentId]);
      assert.equal((await callHandler(bookContent, { method: "POST", cookie, query: { action: "submit" }, body: {
        activityId: school.activityId, assignmentId, studentId: school.users.student2.id, answers: { [school.questionId]: "yes" },
      } })).status, 403);
      assert.equal((await callHandler(bookContent, { method: "POST", cookie, query: { action: "submit" }, body: {
        activityId: school.activityId, assignmentId, answers: { [school.questionId]: "yes" },
      } })).status, 403);
      assert.equal((await callHandler(bookContent, { method: "POST", cookie, query: { action: "review-submission" }, body: {
        submissionId, teacherFeedback: "Student overwrite",
      } })).status, 403);
      assert.equal((await callHandler(bookContent, { method: "POST", cookie, query: { action: "delete-submission" }, body: { submissionId } })).status, 400);
      assert.equal(await count("select count(*) from activity_submissions where activity_assignment_id = $1", [assignmentId]), countBefore);
      assert.deepEqual((await pool.query(
        "select student_id, answers, teacher_feedback, reviewed_at, reviewed_by from activity_submissions where id = $1",
        [submissionId],
      )).rows[0], before);
    }
  });

  await check("complete student signup is atomic, school-bound, sanitized, and throttled", async () => {
    const inactiveClass = (await pool.query(
      `insert into classes (school_id, teacher_id, name, level, slug, invite_code, status)
       values ($1, $2, 'QA inactive signup class', 'B2', $3, 'QAINAC01', 'archived') returning id`,
      [schoolA.id, schoolA.users.teacher1.id, `qa-inactive-${randomUUID()}`],
    )).rows[0];
    artifacts.classes.push(inactiveClass.id);

    const base = await count("select count(*) from app_users");
    const membershipBase = await count("select count(*) from class_students");
    const failureCases = [
      { email: `qa.signup.slug.${randomUUID()}@hhplms.invalid`, classCode: schoolA.classes[0].slug, classSlug: schoolA.classes[0].slug },
      { email: `qa.signup.uuid.${randomUUID()}@hhplms.invalid`, classCode: schoolA.classes[0].id, classId: schoolA.classes[0].id },
      { email: `qa.signup.invalid.${randomUUID()}@hhplms.invalid`, classCode: "NOCLASS9" },
      { email: `qa.signup.inactive.${randomUUID()}@hhplms.invalid`, classCode: "QAINAC01" },
    ];
    for (const [index, failure] of failureCases.entries()) {
      const ip = `127.78.0.${index + 1}`;
      artifacts.inviteFingerprints.push(fingerprint(ip));
      const response = await callHandler(studentSignup, { method: "POST", ip, body: {
        fullName: "QA Failed Signup", password: "SignupOnly!2026", ...failure,
      } });
      assert.equal(response.status >= 400, true);
      assert.equal(await count("select count(*) from app_users where email = $1", [failure.email]), 0);
      assert.equal(await count("select count(*) from app_users"), base);
      assert.equal(await count("select count(*) from class_students"), membershipBase);
    }

    const email = `qa.signup.valid.${randomUUID()}@hhplms.invalid`;
    const signupIp = "127.78.0.10";
    artifacts.inviteFingerprints.push(fingerprint(signupIp));
    const signup = await callHandler(studentSignup, { method: "POST", ip: signupIp, body: {
      fullName: "QA Transient Signup", email, password: "SignupOnly!2026", classCode: schoolA.classes[0].invite,
      schoolId: schoolB.id,
    } });
    assert.equal(signup.status, 201);
    const signupUserId = signup.body.user.id;
    artifacts.users.push(signupUserId);
    const userRow = (await pool.query("select id, school_id, role, status from app_users where id = $1", [signupUserId])).rows[0];
    assert.deepEqual(userRow, { id: signupUserId, school_id: schoolA.id, role: "student", status: "active" });
    assert.equal(await count("select count(*) from class_students where class_id = $1 and student_id = $2 and status = 'active'", [schoolA.classes[0].id, signupUserId]), 1);
    const responseText = JSON.stringify(signup.body);
    for (const hidden of ["password_hash", "token_hash", "session_token", "school_id", schoolA.id, schoolB.id,
      schoolA.classes[0].id, schoolA.classes[0].slug, schoolA.classes[0].invite, "students"]) {
      assert.equal(responseText.includes(hidden), false);
    }
    const cookie = signup.headers["Set-Cookie"] || signup.headers["set-cookie"] || "";
    const token = cookie.split(";")[0].split("=")[1] || "";
    assert.equal(cookie.startsWith(`${sessionCookieName}=`), true);
    assert.equal(await count("select count(*) from auth_sessions where user_id = $1 and token_hash = $2", [signupUserId, hashToken(token)]), 1);

    const membershipAfterSignup = await count("select count(*) from class_students where student_id = $1", [signupUserId]);
    const duplicate = await callHandler(studentSignup, { method: "POST", ip: signupIp, body: {
      fullName: "QA Duplicate", email, password: "SignupOnly!2026", classCode: schoolA.classes[1].invite,
    } });
    assert.equal(duplicate.status, 409);
    assert.equal(await count("select count(*) from app_users where email = $1", [email]), 1);
    assert.equal(await count("select count(*) from class_students where student_id = $1", [signupUserId]), membershipAfterSignup);

    const pausedMembershipBefore = await count("select count(*) from class_students where student_id = $1", [schoolA.users.paused.id]);
    assert.equal((await callHandler(studentSignup, { method: "POST", ip: signupIp, body: {
      fullName: "QA Paused Duplicate", email: schoolA.users.paused.email, password: "SignupOnly!2026", classCode: schoolA.classes[1].invite,
    } })).status, 409);
    assert.equal(await count("select count(*) from class_students where student_id = $1", [schoolA.users.paused.id]), pausedMembershipBefore);

    const throttleIp = "127.78.0.20";
    const throttleFingerprint = fingerprint(throttleIp);
    artifacts.inviteFingerprints.push(throttleFingerprint);
    await pool.query("delete from class_invite_attempts where request_fingerprint = $1", [throttleFingerprint]);
    const throttleEmail = `qa.signup.throttle.${randomUUID()}@hhplms.invalid`;
    const throttleUsersBefore = await count("select count(*) from app_users where email = $1", [throttleEmail]);
    for (let index = 0; index < 20; index += 1) {
      assert.equal((await callHandler(studentSignup, { method: "POST", ip: throttleIp, body: {
        fullName: "QA Throttled", email: throttleEmail, password: "SignupOnly!2026", classCode: "NOCLASS9",
      } })).status, 400);
    }
    const limited = await callHandler(studentSignup, { method: "POST", ip: throttleIp, body: {
      fullName: "QA Throttled", email: throttleEmail, password: "SignupOnly!2026", classCode: "NOCLASS9",
    } });
    assert.equal(limited.status, 429);
    assert.ok(limited.headers["Retry-After"] || limited.headers["retry-after"]);
    assert.equal(await count("select count(*) from class_invite_attempts where request_fingerprint = $1", [throttleFingerprint]), 20);
    assert.equal(await count("select count(*) from app_users where email = $1", [throttleEmail]), throttleUsersBefore);
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
  if (process.env.HHPLMS_STAGING_SMOKE_FORCE_FAILURE === "after-transient-artifacts") {
    await check("forced partial-failure cleanup regression", async () => {
      throw new Error("Intentional smoke failure requested for cleanup verification");
    });
  }
} catch (error) {
  unexpectedFailure = true;
  throw error;
} finally {
  try {
    if (artifacts.users.length) {
      await pool.query("delete from account_email_outbox where user_id = any($1::uuid[])", [artifacts.users]);
      await pool.query("delete from account_security_events where user_id = any($1::uuid[]) or actor_user_id = any($1::uuid[])", [artifacts.users]);
      await pool.query("delete from account_security_events where metadata->>'target_user_id' = any($1::text[])", [artifacts.users]);
    }
    if (artifacts.accountEmails.length) await pool.query("delete from account_email_outbox where recipient_email = any($1::text[])", [artifacts.accountEmails]);
    if (lifecycleFingerprints.length) await pool.query("delete from account_rate_limit_attempts where request_fingerprint = any($1::text[])", [lifecycleFingerprints]);
    if (artifacts.lessonSubmissions.length) await pool.query("delete from lesson_submissions where id = any($1::uuid[])", [artifacts.lessonSubmissions]);
    if (artifacts.activitySubmissions.length) await pool.query("delete from activity_submissions where id = any($1::uuid[])", [artifacts.activitySubmissions]);
    if (artifacts.assignments.length) await pool.query("delete from activity_assignments where id = any($1::uuid[])", [artifacts.assignments]);
    if (artifacts.activities.length) await pool.query("delete from lesson_activities where id = any($1::uuid[])", [artifacts.activities]);
    if (artifacts.bookActivities.length) await pool.query("delete from book_activities where id = any($1::uuid[])", [artifacts.bookActivities]);
    for (const [classId, studentId] of artifacts.classMemberships) {
      await pool.query("delete from class_students where class_id = $1 and student_id = $2", [classId, studentId]);
    }
    if (artifacts.courses.length) await pool.query("delete from courses where id = any($1::uuid[])", [artifacts.courses]);
    if (artifacts.classes.length) await pool.query("delete from classes where id = any($1::uuid[])", [artifacts.classes]);
    if (artifacts.users.length) await pool.query("delete from app_users where id = any($1::uuid[])", [artifacts.users]);
    if (artifacts.inviteFingerprints.length) await pool.query("delete from class_invite_attempts where request_fingerprint = any($1::text[])", [artifacts.inviteFingerprints]);
  } finally {
    await pool.query(
      "insert into operational_runs(run_type,finished_at,succeeded,aggregate_counts,failure_code,build_identifier) values('staging_smoke',now(),$1,jsonb_build_object('failed_checks',$2::int),$3,$4)",
      [!unexpectedFailure && failures === 0, failures, unexpectedFailure || failures ? "staging_smoke_failed" : null, String(process.env.COMMIT_REF || process.env.DEPLOY_ID || process.env.BUILD_ID || "unknown").slice(0, 128)],
    );
    setSqlForVerification(null);
    await pool.end();
  }
}

if (failures) throw new Error(`${failures} staging smoke check(s) failed`);
console.log("All staging handler smoke checks passed and transient artifacts were removed.");
