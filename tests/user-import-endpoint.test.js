import assert from "node:assert/strict";
import test from "node:test";
import { setSqlForTests } from "../netlify/functions/_auth-utils.js";
import { clearCapturedEmailsForTests, getCapturedEmailsForTests } from "../netlify/functions/_email-utils.js";
import { handler } from "../netlify/functions/user-import.js";
import { runtimeReadySql } from "./_runtime-schema-test-helper.js";

const schoolId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000001";
const validRows = [
  { rowNumber: 2, fullName: "Example Teacher", email: "teacher@example.invalid", role: "Teacher", level: "B2" },
  { rowNumber: 3, fullName: "Example Student", email: "student@example.invalid", role: "Student", level: "" },
];

function event({ method = "POST", action = "preview", cookie = "hh_lms_session=test", origin = "http://localhost:8888", body = { rows: validRows } } = {}) {
  return {
    httpMethod: method,
    headers: { host: "localhost:8888", cookie, ...(origin === null ? {} : { origin }) },
    queryStringParameters: action ? { action } : {},
    rawQuery: action ? `action=${action}` : "",
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function parse(response) {
  return response.body ? JSON.parse(response.body) : {};
}

function mockSql({ authenticated = true, role = "admin", existing = [], failCreate = null } = {}) {
  const state = { previewQueries: 0, creates: 0, deliveries: 0, deliveryEvents: 0 };
  const sql = async (strings, ...values) => {
    const query = strings.join(" ");
    if (query.includes("from auth_sessions")) {
      return authenticated ? [{ id: userId, school_id: schoolId, role, status: "active" }] : [];
    }
    if (query.includes("select lower(email) as email")) {
      state.previewQueries += 1;
      return existing.map((email) => ({ email }));
    }
    if (query.includes("with input as") && query.includes("user_csv_import_completed")) {
      if (failCreate) {
        const error = new Error("injected database failure");
        error.code = failCreate;
        throw error;
      }
      state.creates += 1;
      const rows = JSON.parse(values[0]);
      return rows.map((row) => ({
        id: row.userId,
        full_name: row.fullName,
        email: row.email,
        role: row.role,
        level: row.level,
        status: "invited",
        outbox_id: row.outboxId,
      }));
    }
    if (query.includes("update account_email_outbox")) {
      state.deliveries += 1;
      return [];
    }
    if (query.includes("'email_delivery_failed'")) {
      state.deliveryEvents += 1;
      return [];
    }
    throw new Error(`Unexpected SQL: ${query}`);
  };
  return { sql: runtimeReadySql(sql), state };
}

test("user import endpoint enforces method, authentication, role, origin, controls, and private caching", async (t) => {
  const previous = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    previous === undefined ? delete process.env.TEST_DATABASE_CONFIRMATION : process.env.TEST_DATABASE_CONFIRMATION = previous;
  });

  assert.equal((await handler(event({ method: "OPTIONS" }))).statusCode, 204);
  assert.equal((await handler(event({ method: "GET" }))).statusCode, 405);
  assert.equal((await handler(event({ action: "other" }))).statusCode, 400);
  setSqlForTests(mockSql({ authenticated: false }).sql);
  assert.equal((await handler(event({ cookie: "" }))).statusCode, 401);
  assert.equal((await handler(event({ cookie: "hh_platform_admin_session=platform" }))).statusCode, 401);
  for (const role of ["teacher", "student"]) {
    setSqlForTests(mockSql({ role }).sql);
    assert.equal((await handler(event())).statusCode, 403);
  }
  const database = mockSql();
  setSqlForTests(database.sql);
  assert.equal((await handler(event({ origin: "https://attacker.example" }))).statusCode, 403);
  assert.equal(database.state.previewQueries, 0);
  for (const field of ["school_id", "status", "password"]) {
    assert.equal((await handler(event({ body: { rows: validRows, [field]: "forbidden" } }))).statusCode, 400);
  }
  for (const field of ["school_id", "status", "password"]) {
    assert.equal((await handler(event({ body: { rows: [{ ...validRows[0], [field]: "forbidden" }] } }))).statusCode, 400);
  }
  assert.equal((await handler(event({ body: { rows: [] } }))).statusCode, 400);
  assert.equal((await handler(event({ body: { rows: Array.from({ length: 201 }, () => validRows[0]) } }))).statusCode, 413);
  const response = await handler(event());
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.equal(response.headers.Vary, "Cookie");
});

test("user import preview normalizes safely, detects duplicates/existing accounts, and never mutates", async (t) => {
  const previous = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    previous === undefined ? delete process.env.TEST_DATABASE_CONFIRMATION : process.env.TEST_DATABASE_CONFIRMATION = previous;
  });
  const database = mockSql({ existing: ["student@example.invalid"] });
  setSqlForTests(database.sql);
  const response = await handler(event({ body: { rows: [...validRows, { ...validRows[0], rowNumber: 4 }] } }));
  assert.equal(response.statusCode, 200);
  const body = parse(response);
  assert.equal(body.canImport, false);
  assert.equal(body.summary.duplicateInFile, 2);
  assert.equal(body.summary.existingAccounts, 1);
  assert.equal(JSON.stringify(body).includes(schoolId), false);
  assert.equal(database.state.creates, 0);
  assert.equal(database.state.deliveries, 0);
});

test("user import commit revalidates, creates a complete invitation batch, and returns no secrets", async (t) => {
  const previous = Object.fromEntries(["TEST_DATABASE_CONFIRMATION", "ACCOUNT_EMAIL_MODE", "APP_PUBLIC_URL", "ACCOUNT_INVITATIONS_ENABLED"].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    ACCOUNT_EMAIL_MODE: "capture",
    APP_PUBLIC_URL: "http://localhost:8888",
    ACCOUNT_INVITATIONS_ENABLED: "true",
  });
  const database = mockSql();
  setSqlForTests(database.sql);
  clearCapturedEmailsForTests();
  t.after(() => {
    setSqlForTests(null);
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });

  const response = await handler(event({ action: "commit", origin: null }));
  assert.equal(response.statusCode, 201);
  const body = parse(response);
  assert.deepEqual(body.summary, { created: 2, delivered: 2, failedDelivery: 0 });
  assert.deepEqual(body.users.map(({ role, status, level }) => ({ role, status, level })), [
    { role: "teacher", status: "invited", level: "B2" },
    { role: "student", status: "invited", level: null },
  ]);
  assert.equal(database.state.creates, 1);
  assert.equal(database.state.deliveries, 2);
  assert.equal(getCapturedEmailsForTests().length, 2);
  assert.doesNotMatch(response.body, /token|outbox|preview_url|school_id/i);

  const conflictDatabase = mockSql({ existing: ["teacher@example.invalid"] });
  setSqlForTests(conflictDatabase.sql);
  assert.equal((await handler(event({ action: "commit" }))).statusCode, 409);
  assert.equal(conflictDatabase.state.creates, 0);

  const invalidDatabase = mockSql();
  setSqlForTests(invalidDatabase.sql);
  assert.equal((await handler(event({ action: "commit", body: { rows: [{ ...validRows[0], role: "admin" }] } }))).statusCode, 400);
  assert.equal(invalidDatabase.state.creates, 0);

  const racedDatabase = mockSql({ failCreate: "23505" });
  setSqlForTests(racedDatabase.sql);
  assert.equal((await handler(event({ action: "commit" }))).statusCode, 409);
  assert.equal(racedDatabase.state.creates, 0);

  process.env.ACCOUNT_INVITATIONS_ENABLED = "false";
  assert.equal((await handler(event({ action: "commit" }))).statusCode, 503);
});
