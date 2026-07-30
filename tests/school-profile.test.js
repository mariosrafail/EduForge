import assert from "node:assert/strict";
import test from "node:test";
import { setSqlForTests } from "../netlify/functions/_auth-utils.js";
import { handler } from "../netlify/functions/school-profile.js";

const schoolId = "00000000-0000-4000-8000-000000000010";
const userId = "00000000-0000-4000-8000-000000000001";
const initialSchool = {
  id: schoolId,
  name: "School A",
  logo: "SA",
  primary_color: "#1e3a8a",
  secondary_color: "#0f172a",
  status: "active",
};

function event({ method = "GET", cookie = "hh_lms_session=test-token", body, query, origin = "http://localhost:8888" } = {}) {
  return {
    httpMethod: method,
    headers: { cookie, host: "localhost:8888", ...(origin === null ? {} : { origin }) },
    queryStringParameters: query || {},
    rawQuery: query ? new URLSearchParams(query).toString() : "",
    body: body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body),
  };
}

function parse(response) {
  return response.body ? JSON.parse(response.body) : {};
}

function mockDatabase({ role = "admin", authenticated = true, school = initialSchool, failSchool = false, failAudit = false } = {}) {
  const state = { school: school ? { ...school } : null, updates: 0, audits: [], sessionsRevoked: 0 };
  const sql = async (strings, ...values) => {
    const query = strings.join(" ");
    if (query.includes("from auth_sessions")) {
      return authenticated ? [{ id: userId, school_id: schoolId, role, status: "active" }] : [];
    }
    if (query.includes("from schools") && !query.includes("update schools")) {
      if (failSchool) throw new Error("database password leaked");
      return state.school ? [{ ...state.school }] : [];
    }
    if (query.includes("with changed as") && query.includes("school_branding_updated")) {
      if (failAudit) throw new Error("audit insert failed with SQL details");
      const [name, logo, primaryColor, secondaryColor, targetSchoolId, eventUserId, actorId, changedFields] = values;
      assert.equal(targetSchoolId, schoolId);
      assert.equal(eventUserId, userId);
      assert.equal(actorId, userId);
      state.school = {
        ...state.school,
        name,
        logo,
        primary_color: primaryColor,
        secondary_color: secondaryColor,
      };
      state.updates += 1;
      state.audits.push({ eventType: "school_branding_updated", changedFields });
      return [{ ...state.school }];
    }
    throw new Error(`Unexpected query: ${query}`);
  };
  return { sql, state };
}

test("school profile method, authentication, role, session separation, and private cache contract", async (t) => {
  const previousConfirmation = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    if (previousConfirmation === undefined) delete process.env.TEST_DATABASE_CONFIRMATION;
    else process.env.TEST_DATABASE_CONFIRMATION = previousConfirmation;
  });

  const options = await handler(event({ method: "OPTIONS", cookie: "" }));
  assert.equal(options.statusCode, 204);
  const unsupported = await handler(event({ method: "POST" }));
  assert.equal(unsupported.statusCode, 405);

  setSqlForTests(mockDatabase({ authenticated: false }).sql);
  assert.equal((await handler(event({ cookie: "" }))).statusCode, 401);
  assert.equal((await handler(event({ method: "PATCH", cookie: "", body: {} }))).statusCode, 401);
  assert.equal((await handler(event({ cookie: "hh_platform_admin_session=platform-only" }))).statusCode, 401);
  assert.equal((await handler(event({ method: "PATCH", cookie: "hh_platform_admin_session=platform-only", body: {} }))).statusCode, 401);

  for (const role of ["admin", "teacher", "student"]) {
    setSqlForTests(mockDatabase({ role }).sql);
    const response = await handler(event());
    assert.equal(response.statusCode, 200);
    assert.equal(parse(response).school.name, "School A");
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    assert.equal(response.headers.Vary, "Cookie");
  }
  for (const role of ["teacher", "student"]) {
    setSqlForTests(mockDatabase({ role }).sql);
    assert.equal((await handler(event({ method: "PATCH", body: { name: "Updated" } }))).statusCode, 403);
  }

  setSqlForTests(mockDatabase({ school: null }).sql);
  assert.equal((await handler(event())).statusCode, 404);
});

test("school profile rejects caller identity, control fields, invalid origin, and invalid branding without mutation", async (t) => {
  const previousConfirmation = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    if (previousConfirmation === undefined) delete process.env.TEST_DATABASE_CONFIRMATION;
    else process.env.TEST_DATABASE_CONFIRMATION = previousConfirmation;
  });

  const database = mockDatabase();
  setSqlForTests(database.sql);
  for (const key of ["id", "schoolId", "school_id", "slug"]) {
    assert.equal((await handler(event({ query: { [key]: "foreign" } }))).statusCode, 400);
  }
  for (const key of ["id", "schoolId", "school_id", "status", "created_at", "updated_at", "adminId", "userId"]) {
    const response = await handler(event({ method: "PATCH", body: { [key]: "forbidden" } }));
    assert.equal(response.statusCode, 400, key);
  }
  assert.equal((await handler(event({
    method: "PATCH",
    origin: "https://attacker.example",
    body: { name: "Attacker School" },
  }))).statusCode, 403);

  const invalidBodies = [
    [{ name: " " }, "School name must be 2-160 characters"],
    [{ name: "x" }, "School name must be 2-160 characters"],
    [{ name: "x".repeat(161) }, "School name must be 2-160 characters"],
    [{ logo: "x".repeat(241) }, "School logo must be at most 240 characters"],
    [{ primaryColor: "blue" }, "six-digit hexadecimal"],
    [{ primaryColor: "#ffffff" }, "4.5:1 contrast"],
    [{ primaryColor: "#123456" }, "approved palette"],
    [{ secondaryColor: "#12345g" }, "six-digit hexadecimal"],
  ];
  for (const [body, message] of invalidBodies) {
    const response = await handler(event({ method: "PATCH", body }));
    assert.equal(response.statusCode, 400);
    assert.match(parse(response).error, new RegExp(message.replace(".", "\\.")));
  }
  assert.equal(database.state.updates, 0);
  assert.deepEqual(database.state.audits, []);
});

test("school profile PATCH is partial, normalized, audited safely, and does not revoke sessions", async (t) => {
  const previousConfirmation = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    if (previousConfirmation === undefined) delete process.env.TEST_DATABASE_CONFIRMATION;
    else process.env.TEST_DATABASE_CONFIRMATION = previousConfirmation;
  });

  const database = mockDatabase();
  setSqlForTests(database.sql);
  const response = await handler(event({
    method: "PATCH",
    origin: null,
    body: { name: "  Updated School  ", primaryColor: "#C2410C", secondaryColor: "#AABBCC" },
  }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(parse(response).school, {
    id: schoolId,
    name: "Updated School",
    logo: "SA",
    primaryColor: "#c2410c",
    secondaryColor: "#aabbcc",
    status: "active",
  });
  assert.equal(database.state.school.logo, "SA");
  assert.equal(database.state.school.secondary_color, "#aabbcc");
  assert.deepEqual(database.state.audits, [{
    eventType: "school_branding_updated",
    changedFields: ["name", "primary_color", "secondary_color"],
  }]);
  assert.deepEqual(Object.keys(database.state.audits[0]).sort(), ["changedFields", "eventType"]);
  assert.equal(database.state.sessionsRevoked, 0);
});

test("school profile audit failure rolls back conceptually and database failures are safe", async (t) => {
  const previousConfirmation = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    if (previousConfirmation === undefined) delete process.env.TEST_DATABASE_CONFIRMATION;
    else process.env.TEST_DATABASE_CONFIRMATION = previousConfirmation;
  });

  const auditFailure = mockDatabase({ failAudit: true });
  setSqlForTests(auditFailure.sql);
  const failedUpdate = await handler(event({ method: "PATCH", body: { name: "Not Saved" } }));
  assert.equal(failedUpdate.statusCode, 500);
  assert.equal(parse(failedUpdate).error, "School profile request failed");
  assert.equal(auditFailure.state.school.name, "School A");
  assert.equal(auditFailure.state.updates, 0);
  assert.doesNotMatch(failedUpdate.body, /SQL|audit insert/i);

  setSqlForTests(mockDatabase({ failSchool: true }).sql);
  const failedRead = await handler(event());
  assert.equal(failedRead.statusCode, 500);
  assert.equal(parse(failedRead).error, "School profile request failed");
  assert.doesNotMatch(failedRead.body, /password|database/i);
  assert.equal(failedRead.headers.Vary, "Cookie");
});
