import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  builderCookie,
  builderCookieName,
  builderSessionMaxAgeSeconds,
  clearBuilderCookie,
  getBuilderSql,
  safeBuilderAuditMetadata,
} from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { createBuilderAuthHandler } from "../netlify-sites/ultimate-b2-builder/functions/builder-auth.js";

const activeUser = {
  id: "10000000-0000-4000-8000-000000000001",
  full_name: "Builder Developer",
  email: "builder@example.test",
  role: "developer",
  status: "active",
  password_hash: "stored-builder-hash",
  last_login_at: null,
};

function event({ method = "POST", action = "login", origin = "https://builder.example", cookie = "", email = activeUser.email, password = "correct" } = {}) {
  return {
    httpMethod: method,
    headers: { host: "builder.example", ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
    queryStringParameters: { action },
    rawQuery: `action=${action}`,
    body: method === "GET" ? "" : JSON.stringify({ email, password }),
  };
}

function loginHarness({ user = activeUser, passwordValid = true, begin = {}, complete = {} } = {}) {
  const calls = { compare: [], complete: [], sessions: 0, audits: [] };
  const sql = async (strings) => {
    const query = strings.join("?");
    if (query.includes("from builder_users")) return user ? [user] : [];
    if (query.includes("update builder_users set last_login_at")) return [user];
    throw new Error(`Unexpected query: ${query}`);
  };
  const handler = createBuilderAuthHandler({
    getDatabase: () => sql,
    identifiers: () => ({ requestFingerprint: "a".repeat(64), emailHash: "b".repeat(64) }),
    beginAttempt: async () => ({ attemptId: 7, limited: false, accountLimited: false, retryAfter: 900, ...begin }),
    completeAttempt: async (_sql, value) => {
      calls.complete.push(value);
      return { limited: false, retryAfter: 900, thresholdDimension: null, ...complete };
    },
    comparePassword: async (password, hash) => { calls.compare.push({ password, hash }); return passwordValid; },
    createSession: async () => { calls.sessions += 1; return { cookie: "builder-session-cookie" }; },
    writeAudit: async (_sql, value) => calls.audits.push(value),
  });
  return { handler, calls };
}

test("Builder login succeeds only for an active dedicated developer", async () => {
  const { handler, calls } = loginHarness();
  const response = await handler(event());
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Set-Cookie"], "builder-session-cookie");
  assert.equal(JSON.parse(response.body).builderUser.email, activeUser.email);
  assert.equal(calls.complete[0].outcome, "authenticated");
  assert.equal(calls.sessions, 1);
  assert.equal(calls.audits[0].action, "login_succeeded");
});

test("bad email, unknown user, bad password, and paused user share generic denial", async () => {
  const cases = [
    loginHarness({ user: null, passwordValid: false }),
    loginHarness({ passwordValid: false }),
    loginHarness({ user: { ...activeUser, status: "paused" } }),
  ];
  const inputs = [
    event({ email: "missing@example.test", password: "wrong" }),
    event({ password: "wrong" }),
    event(),
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const response = await cases[index].handler(inputs[index]);
    assert.equal(response.statusCode, 401);
    assert.deepEqual(JSON.parse(response.body), { error: "Invalid email or password" });
    assert.equal(cases[index].calls.sessions, 0);
  }
  const malformed = loginHarness();
  const response = await malformed.handler(event({ email: "not-email", password: "wrong" }));
  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), { error: "Invalid email or password" });
});

test("Builder login rate limiting and Origin validation fail before authentication", async () => {
  const limited = loginHarness({ begin: { limited: true, retryAfter: 13 } });
  const limitedResponse = await limited.handler(event());
  assert.equal(limitedResponse.statusCode, 429);
  assert.equal(limitedResponse.headers["Retry-After"], "13");
  assert.equal(limited.calls.compare.length, 0);

  const invalidOrigin = loginHarness();
  const originResponse = await invalidOrigin.handler(event({ origin: "" }));
  assert.equal(originResponse.statusCode, 403);
  assert.equal(invalidOrigin.calls.compare.length, 0);
});

test("Builder cookie is isolated, Strict, HttpOnly, hosted-Secure, root-scoped, and eight hours", () => {
  assert.equal(builderCookieName, "hh_builder_session");
  assert.equal(builderSessionMaxAgeSeconds, 8 * 60 * 60);
  const cookie = builderCookie("secret-token", event());
  assert.match(cookie, /^hh_builder_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Max-Age=28800/);
  assert.doesNotMatch(cookie, /hh_lms_session|hh_platform_admin_session/);
  assert.match(clearBuilderCookie(event()), /Max-Age=0/);
});

test("GET me accepts only a live Builder session; stale, expired, revoked, LMS, and Platform cookies fail closed", async () => {
  function sessionHandler(authenticated) {
    const sql = async (strings) => {
      const query = strings.join("?");
      if (query.includes("from builder_sessions")) return authenticated ? [{ ...activeUser, session_id: "session-1" }] : [];
      if (query.includes("update builder_sessions set last_seen_at")) return [];
      throw new Error(`Unexpected query: ${query}`);
    };
    return createBuilderAuthHandler({ getDatabase: () => sql });
  }
  const live = await sessionHandler(true)(event({ method: "GET", action: "me", cookie: "hh_builder_session=live" }));
  assert.equal(live.statusCode, 200);
  assert.equal(JSON.parse(live.body).authenticated, true);

  for (const cookie of [
    "hh_builder_session=expired",
    "hh_builder_session=revoked",
    "hh_lms_session=ordinary",
    "hh_platform_admin_session=privileged",
  ]) {
    const response = await sessionHandler(false)(event({ method: "GET", action: "me", cookie }));
    assert.equal(response.statusCode, 401);
  }
});

test("logout revokes the server session before clearing the Builder cookie", async () => {
  const queries = [];
  const sql = async (strings) => {
    const query = strings.join("?");
    queries.push(query);
    if (query.includes("from builder_sessions")) return [{ ...activeUser, session_id: "session-1" }];
    if (query.includes("last_seen_at")) return [];
    if (query.includes("set revoked_at")) return [{ builder_user_id: activeUser.id }];
    throw new Error(`Unexpected query: ${query}`);
  };
  const audits = [];
  const handler = createBuilderAuthHandler({ getDatabase: () => sql, writeAudit: async (_sql, value) => audits.push(value) });
  const response = await handler(event({ action: "logout", cookie: "hh_builder_session=live" }));
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["Set-Cookie"], /Max-Age=0/);
  assert.ok(queries.some((query) => query.includes("set revoked_at")));
  assert.equal(audits[0].action, "logout");
});

test("Builder database and audit helpers reject unsafe configuration and metadata", () => {
  assert.throws(() => getBuilderSql({}), /DATABASE_URL is required/);
  assert.throws(() => getBuilderSql({ DATABASE_URL: "https://example.test/db" }), /PostgreSQL/);
  for (const key of ["password", "password_hash", "sessionToken", "token", "databaseUrl", "answers", "teacherSolutions", "secrets"]) {
    assert.throws(() => safeBuilderAuditMetadata({ [key]: "unsafe" }), /Unsafe Builder audit metadata key/);
  }
});

test("Builder auth source contains no ordinary or Platform identity query", async () => {
  const source = await readFile("netlify-sites/ultimate-b2-builder/functions/builder-auth.js", "utf8");
  assert.doesNotMatch(source, /from app_users|from platform_admins|hh_lms_session|hh_platform_admin_session/i);
  assert.doesNotMatch(source, /AUTH_RATE_LIMIT_SALT|PLATFORM_ADMIN_RATE_LIMIT_SALT/);
});
