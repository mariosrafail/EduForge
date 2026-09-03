import assert from "node:assert/strict";
import test from "node:test";

import { setSqlForTests } from "../netlify/functions/_auth-utils.js";
import { handler } from "../netlify/functions/book-content.js";
import { runtimeReadySql } from "./_runtime-schema-test-helper.js";

const teacher = { id: "00000000-0000-4000-8000-000000000001", school_id: "00000000-0000-4000-8000-000000000010", role: "teacher" };

function event(query = {}, cookie = "hh_lms_session=test-token") {
  const parameters = { action: "teacher-grade-analytics", ...query };
  return { httpMethod: "GET", headers: { cookie }, queryStringParameters: parameters, rawQuery: new URLSearchParams(parameters).toString(), body: "" };
}

function mockSql(user, { foreignOnly = false } = {}) {
  return runtimeReadySql(async (strings) => {
    const query = strings.join(" ");
    if (query.includes("from auth_sessions")) return user ? [user] : [];
    if (query.includes("select c.id, c.name")) return foreignOnly ? [] : [{ id: "00000000-0000-4000-8000-000000000020", name: "Class A" }];
    if (query.includes("select assignment.id, assignment.title")) return [];
    if (query.includes("assigned_slots") && query.includes("median_score")) return [{ assigned_slots: 0, submitted: 0, missing: 0, completion_rate: 0 }];
    if (query.includes("string_agg(distinct class_name")) return [];
    if (query.includes("date_trunc('week'")) return [];
    if (query.includes("assigned_slots") && query.includes("limit 8")) return [];
    throw new Error(`Unexpected query: ${query}`);
  });
}

test("teacher analytics handler rejects missing auth, non-teachers, and client identity fields", async (t) => {
  const previousConfirmation = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    if (previousConfirmation === undefined) delete process.env.TEST_DATABASE_CONFIRMATION;
    else process.env.TEST_DATABASE_CONFIRMATION = previousConfirmation;
  });

  setSqlForTests(mockSql(null));
  assert.equal((await handler(event({}, ""))).statusCode, 401);

  setSqlForTests(mockSql({ ...teacher, role: "student" }));
  assert.equal((await handler(event())).statusCode, 403);

  setSqlForTests(mockSql(teacher));
  for (const key of ["teacherId", "studentId", "schoolId"]) {
    const response = await handler(event({ [key]: teacher.id }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.headers["Cache-Control"], "private, no-store");
  }
});

test("teacher analytics validates accessible filters without leaking a foreign class", async (t) => {
  const previousConfirmation = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    if (previousConfirmation === undefined) delete process.env.TEST_DATABASE_CONFIRMATION;
    else process.env.TEST_DATABASE_CONFIRMATION = previousConfirmation;
  });
  setSqlForTests(mockSql(teacher, { foreignOnly: true }));
  const response = await handler(event({ classId: "00000000-0000-4000-8000-000000000099" }));
  assert.equal(response.statusCode, 404);
  assert.deepEqual(JSON.parse(response.body), { error: "Analytics filter not found" });
});

test("teacher analytics returns an honest empty contract", async (t) => {
  const previousConfirmation = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    if (previousConfirmation === undefined) delete process.env.TEST_DATABASE_CONFIRMATION;
    else process.env.TEST_DATABASE_CONFIRMATION = previousConfirmation;
  });
  setSqlForTests(mockSql(teacher));
  const response = await handler(event({ classId: "00000000-0000-4000-8000-000000000020" }));
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.overview.averageScore, null);
  assert.equal(payload.overview.assignedSlots, 0);
  assert.equal(payload.trend.insufficientData, true);
  assert.deepEqual(payload.students, []);
  assert.doesNotMatch(response.body, /teacherProject|correctAnswer|answerKey|teacherDocument/);
});
