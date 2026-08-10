import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { closeAssignment, deleteAssignment } from "../netlify/functions/_book-content/assignment-actions.js";
import { assignmentIdempotencyKey } from "../netlify/functions/_book-content/shared.js";
import { deriveStudentAssignmentPresentation } from "../src/components/lms/student/portal/studentAssignmentPresentation.js";

const assignmentId = "11111111-1111-4111-8111-111111111111";
const teacher = { id: "22222222-2222-4222-8222-222222222222", school_id: "33333333-3333-4333-8333-333333333333", role: "teacher" };

function responseBody(response) {
  return JSON.parse(response.body || "{}");
}

function lifecycleSql(resultRow) {
  const calls = [];
  const sql = async () => [];
  sql.assignmentLifecycleTransaction = async (lockedAssignmentId, callback) => {
    calls.push({ kind: "lock", assignmentId: lockedAssignmentId });
    const transactionSql = async (strings, ...values) => {
      calls.push({ kind: "query", text: strings.join("?"), values });
      return [resultRow];
    };
    return callback(transactionSql);
  };
  sql.calls = calls;
  return sql;
}

test("assignment idempotency is request-scoped while identical later assignments remain distinct", () => {
  const args = ["teacher", "activity", "class", "target", null, "Same title", "Same notes"];
  const retryOne = assignmentIdempotencyKey({ idempotencyKey: "assignment-request-a" }, ...args);
  const retryTwo = assignmentIdempotencyKey({ idempotencyKey: "assignment-request-a" }, ...args);
  const later = assignmentIdempotencyKey({ idempotencyKey: "assignment-request-b" }, ...args);
  assert.deepEqual(retryOne, retryTwo);
  assert.notEqual(retryOne.value, later.value);
  assert.notEqual(assignmentIdempotencyKey({}, ...args).value, assignmentIdempotencyKey({}, ...args).value);
  assert.doesNotMatch(retryOne.value, /^payload:/);
});

test("owning Teacher can hard-delete an assignment only when the locked database state has zero submissions", async () => {
  const sql = lifecycleSql({ assignment_exists: true, authorized: true, has_submissions: false, assignment_status: "assigned", mutated: true });
  const response = await deleteAssignment(sql, { assignmentId }, teacher);
  assert.equal(response.statusCode, 200);
  assert.equal(responseBody(response).deletedAssignmentId, assignmentId);
  assert.deepEqual(sql.calls[0], { kind: "lock", assignmentId });
  assert.match(sql.calls[1].text, /not target\.has_submissions/);
  assert.match(sql.calls[1].text, /'teacher' and teacher_id = \? and effective_school_id = \?/);
  assert.match(sql.calls[1].text, /'admin' and effective_school_id = \?/);
  assert.deepEqual(sql.calls[1].values.slice(1), [teacher.role, teacher.id, teacher.school_id, teacher.role, teacher.school_id]);
});

test("hard-delete safely rejects submitted, missing, and unauthorized assignments", async () => {
  const submitted = await deleteAssignment(lifecycleSql({ assignment_exists: true, authorized: true, has_submissions: true, assignment_status: "assigned", mutated: false }), { assignmentId }, teacher);
  assert.equal(submitted.statusCode, 409);
  assert.equal(responseBody(submitted).conflict, "assignment-has-submissions");
  assert.match(responseBody(submitted).error, /Close it instead/);

  const missing = await deleteAssignment(lifecycleSql({ assignment_exists: false, authorized: false, has_submissions: false, assignment_status: null, mutated: false }), { assignmentId }, teacher);
  assert.equal(missing.statusCode, 404);

  for (const role of ["another Teacher", "cross-school Teacher/Admin", "Student"]) {
    const denied = await deleteAssignment(lifecycleSql({ assignment_exists: true, authorized: false, has_submissions: false, assignment_status: "assigned", mutated: false }), { assignmentId }, teacher);
    assert.equal(denied.statusCode, 403, role);
  }
});

test("close requires submissions, preserves the row, and is idempotent once closed", async () => {
  const closedSql = lifecycleSql({ assignment_exists: true, authorized: true, has_submissions: true, assignment_status: "assigned", mutated: true });
  const closed = await closeAssignment(closedSql, { assignmentId }, teacher);
  assert.equal(closed.statusCode, 200);
  assert.deepEqual(responseBody(closed).assignment, { id: assignmentId, status: "closed" });
  assert.match(closedSql.calls[1].text, /update activity_assignments/);
  assert.match(closedSql.calls[1].text, /set status = 'closed'/);
  assert.doesNotMatch(closedSql.calls[1].text, /delete from activity_submissions|delete from student_answers/);

  const zero = await closeAssignment(lifecycleSql({ assignment_exists: true, authorized: true, has_submissions: false, assignment_status: "assigned", mutated: false }), { assignmentId }, teacher);
  assert.equal(zero.statusCode, 409);
  assert.equal(responseBody(zero).conflict, "assignment-has-no-submissions");

  const alreadyClosed = await closeAssignment(lifecycleSql({ assignment_exists: true, authorized: true, has_submissions: true, assignment_status: "closed", mutated: false }), { assignmentId }, teacher);
  assert.equal(alreadyClosed.statusCode, 200);
});

test("submit, delete, and close share the same assignment lock and submit rechecks closed/deleted state inside it", async () => {
  const [shared, assignmentActions, submissions, schema] = await Promise.all([
    readFile("netlify/functions/_book-content/shared.js", "utf8"),
    readFile("netlify/functions/_book-content/assignment-actions.js", "utf8"),
    readFile("netlify/functions/_book-content/submission-actions.js", "utf8"),
    readFile("database/006_book_content_platform.sql", "utf8"),
  ]);
  assert.match(shared, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(assignmentActions, /withAssignmentLifecycleTransaction\(sql, assignmentId/);
  assert.match(submissions, /withAssignmentLifecycleTransaction\(sql, body\.assignmentId/);
  assert.match(submissions, /assignment_state\.status = 'assigned'/);
  assert.match(submissions, /This assignment has been closed and can no longer be submitted\./);
  assert.match(submissions, /This assignment is no longer available\./);
  assert.match(schema, /activity_assignment_id uuid references activity_assignments\(id\) on delete set null/);
  assert.match(schema, /submission_id uuid not null references activity_submissions\(id\) on delete cascade/);
});

test("closed Student presentation is unavailable before submission but historical results remain visible", () => {
  assert.deepEqual(deriveStudentAssignmentPresentation({ status: "closed" }), {
    key: "closed", label: "Closed", action: "Closed", tone: "slate", canSubmit: false, score: null,
  });
  const submitted = deriveStudentAssignmentPresentation({ status: "closed", submissionId: "submission-1", submissionStatus: "submitted", scorePercent: 75 });
  assert.equal(submitted.key, "auto-scored");
  assert.equal(submitted.action, "View results");
  assert.equal(submitted.score, 75);
});

test("Teacher and Student lifecycle UI use explicit confirmations and refresh-safe actions", async () => {
  const [teacherUi, studentList, studentWorkspace, service, handler] = await Promise.all([
    readFile("src/components/lms/teacher/sections/TeacherAssignmentsSection.jsx", "utf8"),
    readFile("src/components/lms/student/portal/StudentPortalSections.jsx", "utf8"),
    readFile("src/components/lms/student/portal/StudentAssignmentWorkspace.jsx", "utf8"),
    readFile("src/services/assignmentsApi.js", "utf8"),
    readFile("netlify/functions/book-content.js", "utf8"),
  ]);
  assert.match(teacherUi, /Delete assignment\?/);
  assert.match(teacherUi, /This assignment has no submissions and will be permanently deleted\. This cannot be undone\./);
  assert.match(teacherUi, /Close assignment\?/);
  assert.match(teacherUi, /Existing submissions, scores and feedback will be preserved\./);
  assert.match(teacherUi, /setAssignments\(\(current\) => current\.filter/);
  assert.match(teacherUi, /<Tag tone="slate">Closed<\/Tag>/);
  assert.match(studentList, /key === "closed"/);
  assert.match(studentWorkspace, /assignment\.status !== "closed" \|\| assignment\.submissionId/);
  assert.match(service, /action=delete-assignment/);
  assert.match(service, /action=close-assignment/);
  assert.match(handler, /requireResourceRole\(currentUser, \["teacher", "admin"\]\)[\s\S]*deleteAssignment/);
});
