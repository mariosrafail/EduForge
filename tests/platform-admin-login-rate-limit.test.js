import assert from "node:assert/strict";
import test from "node:test";
import {
  boundedPlatformAdminRetryAfter,
  canonicalizePlatformAdminSourceIp,
  platformAdminAccountLimit,
  platformAdminLimiterDecision,
  platformAdminLoginIdentifier,
  platformAdminLoginIdentifiers,
  platformAdminLoginWindowSeconds,
  platformAdminPairLimit,
  platformAdminRateLimitSalt,
  platformAdminSourceIp,
  platformAdminSourceLimit,
} from "../netlify/functions/_platform-admin-login-rate-limit.js";
import { createPlatformAdminAuthHandler } from "../netlify/functions/platform-admin-auth.js";

const salt = "platform-admin-unit-rate-limit-salt-only";
const activeAdmin = {
  id: "00000000-0000-4000-8000-000000000001",
  full_name: "Platform Operator",
  email: "operator@example.test",
  status: "active",
  password_hash: "stored-platform-hash",
  last_login_at: null,
};

function event({ origin = "http://localhost:8888", email = activeAdmin.email, password = "correct" } = {}) {
  return {
    httpMethod: "POST",
    headers: {
      host: "localhost:8888",
      ...(origin ? { origin } : {}),
      "x-nf-client-connection-ip": "127.0.0.9",
    },
    queryStringParameters: { action: "login" },
    rawQuery: "action=login",
    body: JSON.stringify({ email, password }),
  };
}

function fakeSql(admin = activeAdmin) {
  return async (strings) => {
    const query = strings.join("?");
    if (query.includes("from platform_admins")) return admin ? [admin] : [];
    if (query.includes("update platform_admins set last_login_at")) return [admin];
    throw new Error(`Unexpected query: ${query}`);
  };
}

function handlerHarness({
  admin = activeAdmin,
  begin = {},
  complete = {},
  passwordValid = true,
} = {}) {
  const calls = { begin: 0, complete: [], compare: [], sessions: 0, audits: [] };
  const handler = createPlatformAdminAuthHandler({
    getDatabase: () => fakeSql(admin),
    identifiers: () => ({ requestFingerprint: "a".repeat(64), emailHash: "b".repeat(64) }),
    beginAttempt: async () => {
      calls.begin += 1;
      return {
        attemptId: 1,
        limited: false,
        accountLimited: false,
        retryAfter: 900,
        ...begin,
      };
    },
    completeAttempt: async (_sql, value) => {
      calls.complete.push(value);
      return {
        limited: false,
        retryAfter: 900,
        thresholdDimension: null,
        ...complete,
      };
    },
    comparePassword: async (password, hash) => {
      calls.compare.push({ password, hash });
      return passwordValid;
    },
    createSession: async () => {
      calls.sessions += 1;
      return { cookie: "platform-session-cookie" };
    },
    writeAudit: async (_sql, value) => calls.audits.push(value),
  });
  return { handler, calls };
}

test("Platform Admin identifiers are canonical, deterministic, keyed, and domain separated", () => {
  assert.equal(canonicalizePlatformAdminSourceIp("127.000.000.009"), "unknown");
  assert.equal(canonicalizePlatformAdminSourceIp("127.0.0.9"), "127.0.0.9");
  assert.equal(canonicalizePlatformAdminSourceIp("2001:0db8::1"), "2001:db8::1");
  assert.equal(canonicalizePlatformAdminSourceIp("not-an-ip"), "unknown");
  assert.equal(platformAdminSourceIp({ headers: {
    "x-nf-client-connection-ip": "127.0.0.9",
    "x-forwarded-for": "198.51.100.1, 198.51.100.2",
  } }), "127.0.0.9");
  assert.equal(platformAdminSourceIp({ headers: { "x-forwarded-for": "198.51.100.1, 198.51.100.2" } }), "198.51.100.1");

  const first = platformAdminLoginIdentifiers(event(), " Operator@Example.Test ", { PLATFORM_ADMIN_RATE_LIMIT_SALT: salt });
  const second = platformAdminLoginIdentifiers(event(), "operator@example.test", { PLATFORM_ADMIN_RATE_LIMIT_SALT: salt });
  assert.deepEqual(first, second);
  assert.match(first.requestFingerprint, /^[a-f0-9]{64}$/);
  assert.match(first.emailHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.requestFingerprint, first.emailHash);
  assert.notEqual(
    first.emailHash,
    platformAdminLoginIdentifier("email", "operator@example.test", `${salt}-different`),
  );
});

test("Platform Admin salt fails closed except in explicitly isolated environments", () => {
  assert.throws(() => platformAdminRateLimitSalt({}), /required/);
  assert.throws(() => platformAdminRateLimitSalt({ PLATFORM_ADMIN_RATE_LIMIT_SALT: "short" }), /at least 32/);
  assert.equal(platformAdminRateLimitSalt({ TEST_DATABASE_CONFIRMATION: "isolated-test-database" }), "isolated-platform-admin-rate-limit-only");
  assert.equal(platformAdminRateLimitSalt({ LOCAL_DATABASE_CONFIRMATION: "isolated-local-pilot" }), "isolated-platform-admin-rate-limit-only");
});

test("Platform Admin thresholds are ordered and exact", () => {
  assert.equal(platformAdminLoginWindowSeconds, 900);
  assert.equal(platformAdminPairLimit, 5);
  assert.equal(platformAdminAccountLimit, 20);
  assert.equal(platformAdminSourceLimit, 40);
  assert.ok(platformAdminPairLimit < platformAdminAccountLimit);
  assert.ok(platformAdminAccountLimit < platformAdminSourceLimit);
  assert.deepEqual(platformAdminLimiterDecision({
    pairFailures: platformAdminPairLimit - 1,
    accountFailures: platformAdminAccountLimit - 1,
    sourceFailures: platformAdminSourceLimit - 1,
  }), { pairLimited: false, sourceLimited: false, accountLimited: false });
  assert.deepEqual(platformAdminLimiterDecision({
    pairFailures: platformAdminPairLimit,
    accountFailures: platformAdminAccountLimit,
    sourceFailures: platformAdminSourceLimit,
  }), { pairLimited: true, sourceLimited: true, accountLimited: true });
});

test("Platform Admin Retry-After is rounded, positive, and bounded", () => {
  assert.equal(boundedPlatformAdminRetryAfter(0), 1);
  assert.equal(boundedPlatformAdminRetryAfter(1.01), 2);
  assert.equal(boundedPlatformAdminRetryAfter(901), 900);
  assert.equal(boundedPlatformAdminRetryAfter(Number.NaN), 900);
});

test("pair/source pre-block happens before account lookup, bcrypt, session, or audit", async () => {
  const { handler, calls } = handlerHarness({ begin: { limited: true, retryAfter: 17, limitedDimension: "pair" } });
  const response = await handler(event());
  assert.equal(response.statusCode, 429);
  assert.equal(response.headers["Retry-After"], "17");
  assert.deepEqual(JSON.parse(response.body), { error: "Too many login attempts. Try again later." });
  assert.equal(calls.compare.length, 0);
  assert.equal(calls.complete.length, 0);
  assert.equal(calls.sessions, 0);
  assert.equal(calls.audits.length, 0);
});

test("account-only pressure still verifies a correct password and creates the normal session", async () => {
  const { handler, calls } = handlerHarness({ begin: { accountLimited: true } });
  const response = await handler(event());
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Set-Cookie"], "platform-session-cookie");
  assert.equal(calls.compare.length, 1);
  assert.equal(calls.complete[0].outcome, "authenticated");
  assert.equal(calls.sessions, 1);
  assert.equal(calls.audits[0].action, "login_succeeded");
  assert.deepEqual(calls.audits[0].metadata, { session_hours: 8, recovery: true });
});

test("account-only pressure plus a wrong password is generic 429 without a session", async () => {
  const { handler, calls } = handlerHarness({
    begin: { accountLimited: true },
    complete: { limited: true, thresholdDimension: null },
    passwordValid: false,
  });
  const response = await handler(event({ password: "wrong" }));
  assert.equal(response.statusCode, 429);
  assert.deepEqual(JSON.parse(response.body), { error: "Too many login attempts. Try again later." });
  assert.equal(calls.compare.length, 1);
  assert.equal(calls.complete[0].outcome, "invalid_credentials");
  assert.equal(calls.sessions, 0);
});

test("unknown and inactive accounts stay generic and never create sessions", async () => {
  const unknown = handlerHarness({ admin: null, passwordValid: false });
  const unknownResponse = await unknown.handler(event({ email: "missing@example.test", password: "wrong" }));
  assert.equal(unknownResponse.statusCode, 401);
  assert.deepEqual(JSON.parse(unknownResponse.body), { error: "Invalid email or password" });
  assert.match(unknown.calls.compare[0].hash, /^\$2b\$12\$/);
  assert.equal(unknown.calls.complete[0].outcome, "invalid_credentials");
  assert.equal(unknown.calls.sessions, 0);

  const inactive = handlerHarness({ admin: { ...activeAdmin, status: "paused" }, passwordValid: true });
  const inactiveResponse = await inactive.handler(event());
  assert.equal(inactiveResponse.statusCode, 401);
  assert.deepEqual(JSON.parse(inactiveResponse.body), { error: "Invalid email or password" });
  assert.equal(inactive.calls.complete[0].outcome, "rejected_account");
  assert.equal(inactive.calls.sessions, 0);
});

test("invalid Origin returns 403 before limiter state or bcrypt is touched", async () => {
  const { handler, calls } = handlerHarness();
  const response = await handler(event({ origin: "" }));
  assert.equal(response.statusCode, 403);
  assert.equal(calls.begin, 0);
  assert.equal(calls.compare.length, 0);
  assert.equal(calls.complete.length, 0);
  assert.equal(calls.sessions, 0);
});
