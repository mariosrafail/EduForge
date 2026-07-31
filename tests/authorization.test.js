import assert from "node:assert/strict";
import test from "node:test";

import { requireAuth, requireRole, requireSameSchool } from "../netlify/functions/_auth-utils.js";
import { runtimeReadySql } from "./_runtime-schema-test-helper.js";
import {
  browserSafeBookActivityPayload,
  canAccessStudentScopedRow,
  canAccessTeacherScopedRow,
  scoreBookActivityRecord,
  studentSafeActivityPayload,
  validateSubmittedAnswers,
} from "../netlify/functions/book-content.js";

const activeAdmin = { id: "admin-1", school_id: "school-a", role: "admin", status: "active" };
const activeTeacher = { id: "teacher-1", school_id: "school-a", role: "teacher", status: "active" };
const activeStudent = { id: "student-1", school_id: "school-a", role: "student", status: "active" };

function eventWithSession(body = {}) {
  return {
    headers: {
      cookie: "hh_lms_session=test-session-token",
      host: "localhost:8888",
    },
    body: JSON.stringify(body),
  };
}

function fakeSqlForUser(user) {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return user ? [user] : [];
  };
  sql.calls = calls;
  return runtimeReadySql(sql);
}

test("unauthenticated request returns 401", async () => {
  const result = await requireAuth({ headers: {} }, fakeSqlForUser(activeStudent));

  assert.equal(result.error.statusCode, 401);
});

test("student calling an admin-only endpoint returns 403", async () => {
  const result = await requireRole(eventWithSession(), ["admin"], fakeSqlForUser(activeStudent));

  assert.equal(result.error.statusCode, 403);
});

test("active authorized user can pass the intended role check", async () => {
  const result = await requireRole(eventWithSession(), ["teacher"], fakeSqlForUser(activeTeacher));

  assert.equal(result.error, undefined);
  assert.equal(result.currentUser.id, activeTeacher.id);
});

test("paused or otherwise inactive user with an existing session is blocked", async () => {
  const sql = fakeSqlForUser(null);
  const result = await requireAuth(eventWithSession(), sql);

  assert.equal(result.error.statusCode, 401);
  assert.match(sql.calls[0].text, /u\.status = 'active'/);
});

test("same-school guard rejects cross-school resources", () => {
  const result = requireSameSchool("school-b", activeAdmin);

  assert.equal(result.statusCode, 403);
});

test("same-school guard allows matching school resources", () => {
  const result = requireSameSchool("school-a", activeAdmin);

  assert.equal(result, null);
});

test("student-facing activity payloads omit all authoritative answer fields", () => {
  const safe = studentSafeActivityPayload({
    id: "activity-1",
    contentJson: { implementationMode: "auto-scored", publisherSourceActivityId: "ultimate-b2-sb-u2-p3-o1" },
    questions: [{
      answer: "secret",
      feedbackJson: { acceptedAnswers: ["secret"], source: "publisher" },
      options: [{ text: "A", correct: true, is_correct: true }],
    }],
  });
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  assert.deepEqual(safe.questions[0].feedbackJson, { source: "publisher" });
  assert.deepEqual(safe.questions[0].options, [{ text: "A" }]);
  const legacy = { id: "legacy", sourceRelativePath: "Contents/Resources/private.iwb", questions: [{ answer: "legacy-secret" }] };
  assert.deepEqual(studentSafeActivityPayload(legacy), { id: "legacy", questions: [{}] });
});

test("normal book activity payloads omit answers and publisher paths", () => {
  const safe = browserSafeBookActivityPayload({
    id: "activity-1",
    content: { items: [{ id: "gap-1", prompt: "Complete ___", answer: "secret", acceptedAnswers: ["secret"] }] },
    correct_answers: { "gap-1": ["secret"] },
    sourceProvenance: ["Contents/Resources/private.iwb"],
  });
  assert.deepEqual(safe, { id: "activity-1", content: { items: [{ id: "gap-1", prompt: "Complete ___" }] } });
  assert.doesNotMatch(JSON.stringify(safe), /secret|Contents[\\/]Resources|correct_answers|acceptedAnswers/);
});

test("custom book activities are scored authoritatively on the server", () => {
  assert.deepEqual(scoreBookActivityRecord({
    type: "multiple_choice",
    content: { questions: [{ id: "q1" }, { id: "q2" }] },
    correct_answers: { q1: "A", q2: "B" },
  }, { q1: "A", q2: "C" }), {
    status: "submitted",
    correctCount: 1,
    totalCount: 2,
    scorePercent: 50,
  });
  assert.deepEqual(scoreBookActivityRecord({ type: "open_answer", content: {}, correct_answers: {} }, { answer: "draft" }), {
    status: "awaiting_review",
    correctCount: null,
    totalCount: null,
    scorePercent: null,
  });
});

test("student answers reject malformed, missing, and unexpected question data", () => {
  const activity = {
    questions: [
      { id: "question-a", questionNumber: 1 },
      { id: "question-b", questionNumber: 2 },
    ],
  };
  assert.deepEqual(validateSubmittedAnswers(activity, { 1: " Yes ", "question-b": "No" }), {
    answers: { "question-a": "Yes", "question-b": "No" },
  });
  assert.match(validateSubmittedAnswers(activity, []).error, /object/);
  assert.match(validateSubmittedAnswers(activity, { 1: "Yes" }).error, /question 2/);
  assert.match(validateSubmittedAnswers(activity, { 1: "Yes", 2: "No", unexpected: "tamper" }).error, /Unexpected/);
});

test("teacher cannot access another teacher's class or assignment row", () => {
  assert.equal(canAccessTeacherScopedRow(activeTeacher, {
    teacher_id: "teacher-2",
    school_id: "school-a",
  }), false);
});

test("teacher access requires both assigned teacher and matching school", () => {
  assert.equal(canAccessTeacherScopedRow(activeTeacher, {
    teacher_id: "teacher-1",
    school_id: "school-b",
  }), false);
});

test("admin cannot access another school's user-scoped row", () => {
  assert.equal(canAccessStudentScopedRow(activeAdmin, {
    student_id: "student-1",
    school_id: "school-b",
  }), false);
});

test("student cannot access another student's submission row", () => {
  assert.equal(canAccessStudentScopedRow(activeStudent, {
    student_id: "student-2",
    school_id: "school-a",
  }), false);
});

test("changing school_id in the body does not affect the authenticated tenant", async () => {
  const result = await requireAuth(eventWithSession({ school_id: "school-b" }), fakeSqlForUser(activeStudent));

  assert.equal(result.error, undefined);
  assert.equal(result.currentUser.school_id, "school-a");
});
