import assert from "node:assert/strict";
import test from "node:test";
import { setSqlForTests } from "../netlify/functions/_auth-utils.js";
import { handler } from "../netlify/functions/school-adoption-report.js";
import { runtimeReadySql } from "./_runtime-schema-test-helper.js";

const schoolId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000001";

function event({ method = "GET", action = "summary", cookie = "hh_lms_session=test", origin = "http://localhost:8888", body = "" , extraQuery = {}} = {}) {
  const query = { action, ...extraQuery };
  return {
    httpMethod: method,
    headers: { host: "localhost:8888", cookie, ...(origin === null ? {} : { origin }) },
    queryStringParameters: query,
    rawQuery: new URLSearchParams(query).toString(),
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function mockSql({ authenticated = true, role = "admin", empty = false, databaseFailure = false, auditFailure = false } = {}) {
  const state = { reports: 0, audits: 0 };
  const sql = async (strings) => {
    const query = strings.join(" ");
    if (query.includes("from auth_sessions")) {
      return authenticated ? [{ id: userId, school_id: schoolId, role, status: "active" }] : [];
    }
    if (databaseFailure && query.includes("with code_metrics")) throw new Error("private database detail");
    if (query.includes("package_count") && query.includes("from schools school")) {
      state.reports += 1;
      return [{
        school_name: "Athens Academy",
        package_count: empty ? 0 : 1,
        generated_codes: empty ? 0 : 4,
        redeemed_codes: empty ? 0 : 1,
        unused_codes: empty ? 0 : 1,
        expired_codes: empty ? 0 : 1,
        revoked_codes: empty ? 0 : 1,
        active_student_entitlements: empty ? 0 : 2,
        active_teacher_entitlements: empty ? 0 : 1,
        active_assignments: empty ? 0 : 3,
        unique_submitted_assignments: empty ? 0 : 4,
        unique_students_submitted: empty ? 0 : 2,
        scored_submissions: empty ? 0 : 3,
        average_score_percent: empty ? null : 71,
        last_submission_at: empty ? null : "2026-07-30T10:00:00.000Z",
      }];
    }
    if (query.includes("from package_signals signal")) {
      state.reports += 1;
      return empty ? [] : [{
        school_name: "Athens Academy",
        publisher_name: "Example Publisher",
        package_title: "Ultimate B2",
        package_slug: "ultimate-b2",
        level: "B2",
        codes_generated: 4,
        codes_redeemed: 1,
        codes_unused: 1,
        codes_expired: 1,
        codes_revoked: 1,
        active_student_entitlements: 2,
        active_teacher_entitlements: 1,
        active_assignments: 3,
        unique_submitted_assignments: 4,
        unique_students_submitted: 2,
        scored_submissions: 3,
        average_score_percent: 71,
        last_submission_at: "2026-07-30T10:00:00.000Z",
      }];
    }
    if (query.includes("'school_adoption_exported'")) {
      state.audits += 1;
      if (auditFailure) throw new Error("audit unavailable");
      return [];
    }
    throw new Error(`Unexpected SQL: ${query}`);
  };
  return { sql: runtimeReadySql(sql), state };
}

async function withDatabase(t, options = {}) {
  const previous = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  const database = mockSql(options);
  setSqlForTests(database.sql);
  t.after(() => {
    setSqlForTests(null);
    previous === undefined ? delete process.env.TEST_DATABASE_CONFIRMATION : process.env.TEST_DATABASE_CONFIRMATION = previous;
  });
  return database;
}

test("adoption endpoint enforces methods, exact actions, ordinary School Admin role, and private headers", async (t) => {
  await withDatabase(t);
  assert.equal((await handler(event({ method: "OPTIONS" }))).statusCode, 204);
  assert.equal((await handler(event({ method: "PATCH" }))).statusCode, 405);
  assert.equal((await handler(event({ action: "unknown" }))).statusCode, 400);
  assert.equal((await handler(event({ extraQuery: { schoolId } }))).statusCode, 400);
  setSqlForTests(mockSql({ authenticated: false }).sql);
  assert.equal((await handler(event({ cookie: "" }))).statusCode, 401);
  assert.equal((await handler(event({ cookie: "hh_platform_admin_session=platform" }))).statusCode, 401);
  for (const role of ["teacher", "student"]) {
    setSqlForTests(mockSql({ role }).sql);
    assert.equal((await handler(event())).statusCode, 403);
    assert.equal((await handler(event({ method: "POST", action: "export" }))).statusCode, 403);
  }
  setSqlForTests(mockSql().sql);
  const response = await handler(event());
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.equal(response.headers.Vary, "Cookie");
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
});

test("summary returns live values and creates no audit; empty values remain zero/null", async (t) => {
  const database = await withDatabase(t);
  const response = await handler(event());
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.deepEqual(body.school, { name: "Athens Academy" });
  assert.equal(body.summary.generatedCodes, 4);
  assert.equal(body.summary.averageScorePercent, 71);
  assert.equal(body.summary.hasExportableData, true);
  assert.equal(database.state.audits, 0);

  const empty = mockSql({ empty: true });
  setSqlForTests(empty.sql);
  const emptyBody = JSON.parse((await handler(event())).body);
  assert.equal(emptyBody.summary.packageCount, 0);
  assert.equal(emptyBody.summary.averageScorePercent, null);
  assert.equal(emptyBody.summary.lastSubmissionAt, null);
  assert.equal(emptyBody.summary.hasExportableData, false);
  assert.equal(empty.state.audits, 0);
});

test("export validates origin and body before report work, returns real CSV, and writes one safe audit", async (t) => {
  const database = await withDatabase(t);
  const invalidOrigin = await handler(event({ method: "POST", action: "export", origin: "https://attacker.invalid" }));
  assert.equal(invalidOrigin.statusCode, 403);
  assert.equal(database.state.reports, 0);
  assert.equal(database.state.audits, 0);
  for (const field of ["schoolId", "school_id", "userId", "user_id", "tenantId"]) {
    assert.equal((await handler(event({ method: "POST", action: "export", body: { [field]: schoolId } }))).statusCode, 400);
  }
  const response = await handler(event({ method: "POST", action: "export", body: {} }));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "text/csv; charset=utf-8");
  assert.match(response.headers["Content-Disposition"], /^attachment; filename="eduforge-adoption-athens-academy-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.doesNotMatch(response.headers["Content-Disposition"], /[\\/\r\n]/);
  assert.match(response.body, /generated_at_utc,school_name,publisher_name/);
  assert.equal(database.state.audits, 1);
  assert.equal(JSON.stringify(response).includes(schoolId), false);
  for (const forbidden of ["@example.", "answers", "code_mask", "code_hash"]) assert.equal(response.body.includes(forbidden), false);
});

test("empty export, database failure, and audit failure return safe errors without CSV success", async (t) => {
  await withDatabase(t, { empty: true });
  const empty = await handler(event({ method: "POST", action: "export", body: {} }));
  assert.equal(empty.statusCode, 409);
  assert.equal(JSON.parse(empty.body).error, "No adoption data is available to export");

  setSqlForTests(mockSql({ databaseFailure: true }).sql);
  const failed = await handler(event());
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.body.includes("private database detail"), false);

  const audit = mockSql({ auditFailure: true });
  setSqlForTests(audit.sql);
  const auditFailed = await handler(event({ method: "POST", action: "export", body: {} }));
  assert.equal(auditFailed.statusCode, 500);
  assert.notEqual(auditFailed.headers["Content-Type"], "text/csv; charset=utf-8");
  assert.equal(audit.state.audits, 1);
});
