import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

import { createSafePool, callHandler, postgresTemplate } from "./_staging-db.mjs";
import { hashToken, sessionCookieName, setSqlForVerification } from "../netlify/functions/_auth-utils.js";
import { handler as bookContent } from "../netlify/functions/book-content.js";

const { pool, safeLabel } = createSafePool("staging");
setSqlForVerification(postgresTemplate(pool));
const assignmentIds = [];
const sessionHashes = [];

async function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  sessionHashes.push(tokenHash);
  await pool.query("insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')", [userId, tokenHash]);
  return `${sessionCookieName}=${token}`;
}

async function activityFor(unit, mode) {
  const result = await pool.query(
    `select id, slug from activities
     where slug like $1 and content_json->>'implementationMode' = $2
     order by slug limit 1`,
    [`ultimate-b2-sb-u${unit}-%`, mode],
  );
  assert.equal(result.rows.length, 1, `Missing Unit ${unit} ${mode} staging activity`);
  return result.rows[0];
}

async function explicitResponses(activityId) {
  const result = await pool.query(
    `select q.id,
            coalesce(q.feedback_json->'acceptedAnswers'->>0,
              (select qo.option_text from question_options qo where qo.question_id=q.id and qo.is_correct order by qo.sort_order limit 1)) as answer
     from questions q where q.activity_id=$1 order by q.sort_order, q.question_number`,
    [activityId],
  );
  assert.ok(result.rows.length > 0);
  assert.ok(result.rows.every((row) => row.answer));
  return Object.fromEntries(result.rows.map((row) => [row.id, row.answer]));
}

async function assign(activityId, schoolId, teacherId, studentId, label) {
  const id = randomUUID();
  assignmentIds.push(id);
  await pool.query(
    `insert into activity_assignments(id,school_id,activity_id,teacher_id,student_id,status,title)
     values($1,$2,$3,$4,$5,'assigned',$6)`,
    [id, schoolId, activityId, teacherId, studentId, `Transient release hardening ${label}`],
  );
  return id;
}

function assertNoStudentLeak(value) {
  const encoded = JSON.stringify(value);
  assert.doesNotMatch(encoded, /acceptedAnswers|accepted_answers|correct_answers|sourceRelativePath|sourceProvenance|Contents[\\/]Resources|Ultimate English B2\.app|\.iwb|\.swf/);
  assert.equal(/"answer"\s*:/.test(encoded), false);
}

try {
  console.log(`Verifying Ultimate B2 release hardening on isolated staging: ${safeLabel}`);
  const accounts = (await pool.query(
    `select id,school_id,email,role from app_users
     where email = any($1::text[]) order by role`,
    [["admin.staging@eduforge.invalid", "teacher.staging@eduforge.invalid", "student.staging@eduforge.invalid"]],
  )).rows;
  assert.deepEqual(accounts.map((account) => account.role).sort(), ["admin", "student", "teacher"]);
  assert.equal(new Set(accounts.map((account) => account.school_id)).size, 1);
  const teacher = accounts.find((account) => account.role === "teacher");
  const student = accounts.find((account) => account.role === "student");
  const [teacherCookie, studentCookie] = await Promise.all([createSession(teacher.id), createSession(student.id)]);

  const unit1Auto = await activityFor(1, "auto-scored");
  const unit2Auto = await activityFor(2, "auto-scored");
  const teacherReviewed = await activityFor(1, "teacher-reviewed");
  const unscored = await activityFor(1, "unscored-practice");

  for (const activity of [unit1Auto, unit2Auto, teacherReviewed, unscored]) {
    const response = await callHandler(bookContent, { cookie: studentCookie, query: { action: "activity", activityId: activity.id } });
    assert.equal(response.status, 200);
    assertNoStudentLeak(response.body.activity);
  }

  for (const [label, activity] of [["unit-1", unit1Auto], ["unit-2", unit2Auto]]) {
    const assignmentId = await assign(activity.id, student.school_id, teacher.id, student.id, label);
    const response = await callHandler(bookContent, {
      method: "POST", cookie: studentCookie, query: { action: "submit" },
      body: { activityId: activity.id, assignmentId, answers: await explicitResponses(activity.id) },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.submission.scorePercent, 100);
    assert.equal(response.body.submission.correctCount, response.body.submission.totalCount);
  }

  const reviewAssignment = await assign(teacherReviewed.id, student.school_id, teacher.id, student.id, "teacher-review");
  const reviewQuestions = (await pool.query("select id from questions where activity_id=$1 order by sort_order", [teacherReviewed.id])).rows;
  const reviewResponse = await callHandler(bookContent, {
    method: "POST", cookie: studentCookie, query: { action: "submit" },
    body: { activityId: teacherReviewed.id, assignmentId: reviewAssignment, answers: Object.fromEntries(reviewQuestions.map((row) => [row.id, "Evidence-based staging response"])) },
  });
  assert.equal(reviewResponse.status, 200);
  assert.equal(reviewResponse.body.submission.status, "awaiting_review");
  assert.equal(reviewResponse.body.submission.scorePercent, null);
  const reviewed = await callHandler(bookContent, {
    method: "POST", cookie: teacherCookie, query: { action: "review-submission" },
    body: { submissionId: reviewResponse.body.submission.id, teacherFeedback: "Release hardening feedback persisted" },
  });
  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.submission.status, "reviewed");

  const unscoredAssignment = await assign(unscored.id, student.school_id, teacher.id, student.id, "unscored");
  const unscoredResponse = await callHandler(bookContent, {
    method: "POST", cookie: studentCookie, query: { action: "submit" },
    body: { activityId: unscored.id, assignmentId: unscoredAssignment, answers: {} },
  });
  assert.equal(unscoredResponse.status, 200);
  assert.equal(unscoredResponse.body.submission.status, "completed");
  assert.equal(unscoredResponse.body.submission.scorePercent, null);
  assert.equal(unscoredResponse.body.submission.correctCount, null);

  console.log(JSON.stringify({
    manualRoles: accounts.map((account) => account.role).sort(),
    unit1AutoScore: 100,
    unit2AutoScore: 100,
    teacherReview: "reviewed-feedback-persisted",
    unscoredPractice: "completed-null-score",
    studentApiLeakMatches: 0,
  }, null, 2));
} finally {
  if (assignmentIds.length) {
    await pool.query("delete from activity_submissions where activity_assignment_id = any($1::uuid[])", [assignmentIds]);
    await pool.query("delete from activity_assignments where id = any($1::uuid[])", [assignmentIds]);
  }
  if (sessionHashes.length) await pool.query("delete from auth_sessions where token_hash = any($1::text[])", [sessionHashes]);
  setSqlForVerification(null);
  await pool.end();
}

console.log("Ultimate B2 isolated staging hardening verification passed; transient submissions and sessions were removed.");
