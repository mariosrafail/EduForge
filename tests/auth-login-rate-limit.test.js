import assert from "node:assert/strict";
import test from "node:test";
import {
  authLoginAccountLimit,
  authLoginDummyPasswordHash,
  authLoginIdentifier,
  authLoginIdentifiers,
  authLoginPairLimit,
  authLoginRateLimitSalt,
  authLoginSourceLimit,
  authLoginWindowSeconds,
  boundedRetryAfter,
  canonicalizeSourceIp,
  limiterDecision,
  sourceIpFromEvent,
} from "../netlify/functions/_auth-login-rate-limit.js";
import { createSigninHandler } from "../netlify/functions/auth-signin.js";

const testSalt = "unit-only-ordinary-login-rate-limit-salt";

function event({ method = "POST", body = {}, ip = "203.0.113.10", headers = {} } = {}) {
  return {
    httpMethod: method,
    headers: { host: "localhost:8888", "x-nf-client-connection-ip": ip, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function parse(response) {
  return { status: response.statusCode, body: JSON.parse(response.body || "{}"), headers: response.headers || {} };
}

function fakeSql(user = null) {
  return async (strings) => {
    const text = strings.join("?");
    if (text.includes("from app_users u")) return user ? [user] : [];
    if (text.includes("update app_users")) return user ? [user] : [];
    if (text.includes("delete from auth_sessions")) return [];
    throw new Error(`Unexpected test SQL: ${text}`);
  };
}

async function withSalt(callback) {
  const previous = process.env.AUTH_RATE_LIMIT_SALT;
  process.env.AUTH_RATE_LIMIT_SALT = testSalt;
  try {
    return await callback();
  } finally {
    if (previous === undefined) delete process.env.AUTH_RATE_LIMIT_SALT;
    else process.env.AUTH_RATE_LIMIT_SALT = previous;
  }
}

test("ordinary login identifiers are canonical, deterministic, keyed, and domain separated", () => {
  assert.equal(canonicalizeSourceIp("203.0.113.010"), "unknown");
  assert.equal(canonicalizeSourceIp("203.0.113.10"), "203.0.113.10");
  assert.equal(canonicalizeSourceIp("2001:0db8:0:0:0:0:0:1"), "2001:db8::1");
  assert.equal(canonicalizeSourceIp("not-an-ip"), "unknown");
  assert.equal(sourceIpFromEvent({ headers: { "x-nf-client-connection-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1" } }), "203.0.113.9");
  assert.equal(sourceIpFromEvent({ headers: { "x-forwarded-for": "198.51.100.2, 198.51.100.3" } }), "198.51.100.2");
  assert.equal(sourceIpFromEvent({ headers: {} }), "unknown");

  const first = authLoginIdentifier("email", "user@example.test", "a".repeat(32));
  const repeat = authLoginIdentifier("email", "user@example.test", "a".repeat(32));
  const otherSalt = authLoginIdentifier("email", "user@example.test", "b".repeat(32));
  const otherDomain = authLoginIdentifier("source", "user@example.test", "a".repeat(32));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, repeat);
  assert.notEqual(first, otherSalt);
  assert.notEqual(first, otherDomain);

  const identifiers = authLoginIdentifiers(
    { headers: { "x-nf-client-connection-ip": "203.0.113.4" } },
    "  USER@EXAMPLE.TEST ",
    { AUTH_RATE_LIMIT_SALT: "c".repeat(32) },
  );
  assert.match(identifiers.requestFingerprint, /^[a-f0-9]{64}$/);
  assert.match(identifiers.emailHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(identifiers).includes("203.0.113.4"), false);
  assert.equal(JSON.stringify(identifiers).includes("USER@EXAMPLE.TEST"), false);
});

test("ordinary login salt fails closed except in explicitly confirmed isolated environments", () => {
  assert.throws(() => authLoginRateLimitSalt({}), /AUTH_RATE_LIMIT_SALT is required/);
  assert.throws(() => authLoginRateLimitSalt({ AUTH_RATE_LIMIT_SALT: "short" }), /at least 32/);
  assert.match(authLoginRateLimitSalt({ TEST_DATABASE_CONFIRMATION: "isolated-test-database" }), /^isolated-/);
  assert.match(authLoginRateLimitSalt({ LOCAL_DATABASE_CONFIRMATION: "isolated-local-pilot" }), /^isolated-/);
  assert.throws(() => authLoginRateLimitSalt({ STAGING_DATABASE_CONFIRMATION: "isolated-staging-database" }), /required/);
});

test("policy thresholds are ordered and exact", () => {
  assert.ok(authLoginPairLimit < authLoginAccountLimit);
  assert.ok(authLoginAccountLimit < authLoginSourceLimit);
  assert.equal(authLoginWindowSeconds, 900);
  assert.deepEqual(limiterDecision({
    pairFailures: authLoginPairLimit - 1,
    sourceFailures: authLoginSourceLimit - 1,
    accountFailures: authLoginAccountLimit - 1,
  }), { pairLimited: false, sourceLimited: false, accountLimited: false });
  assert.deepEqual(limiterDecision({
    pairFailures: authLoginPairLimit,
    sourceFailures: authLoginSourceLimit,
    accountFailures: authLoginAccountLimit,
  }), { pairLimited: true, sourceLimited: true, accountLimited: true });
});

test("Retry-After is positive, rounded up, and bounded by the active window", () => {
  assert.equal(boundedRetryAfter(0), 1);
  assert.equal(boundedRetryAfter(0.1), 1);
  assert.equal(boundedRetryAfter(10.01), 11);
  assert.equal(boundedRetryAfter(authLoginWindowSeconds + 100), authLoginWindowSeconds);
  assert.equal(boundedRetryAfter(Number.NaN), authLoginWindowSeconds);
});

test("handler pre-blocks pair/source limits without bcrypt or session creation", async () => withSalt(async () => {
  let compares = 0;
  let sessions = 0;
  const handler = createSigninHandler({
    getDatabase: () => fakeSql(),
    checkReadiness: async () => null,
    beginAttempt: async () => ({ limited: true, retryAfter: 17 }),
    completeAttempt: async () => { throw new Error("must not finalize a pre-blocked request"); },
    comparePassword: async () => { compares += 1; return false; },
    createAuthSession: async () => { sessions += 1; return {}; },
  });
  const response = parse(await handler(event({ body: { email: "user@example.test", password: "wrong" } })));
  assert.equal(response.status, 429);
  assert.equal(response.headers["Retry-After"], "17");
  assert.deepEqual(response.body, { error: "Too many login attempts. Try again later." });
  assert.equal(compares, 0);
  assert.equal(sessions, 0);
}));

test("handler verifies account-limited requests and lets a correct active password recover", async () => withSalt(async () => {
  const user = {
    id: "10000000-0000-4000-8000-000000000001",
    school_id: "20000000-0000-4000-8000-000000000001",
    full_name: "Test Teacher",
    email: "teacher@example.test",
    role: "teacher",
    status: "active",
    school_status: "active",
    password_hash: "stored-password-hash",
  };
  const outcomes = [];
  let compares = 0;
  let sessions = 0;
  const handler = createSigninHandler({
    getDatabase: () => fakeSql(user),
    checkReadiness: async () => null,
    beginAttempt: async () => ({ attemptId: "1", limited: false, accountLimited: true }),
    completeAttempt: async (_sql, attempt) => {
      outcomes.push(attempt);
      return { limited: false, retryAfter: 1 };
    },
    comparePassword: async (_password, hash) => { compares += 1; assert.equal(hash, user.password_hash); return true; },
    createAuthSession: async () => { sessions += 1; return { cookie: "hh_lms_session=test" }; },
  });
  const response = parse(await handler(event({ body: { email: user.email, password: "correct" } })));
  assert.equal(response.status, 200);
  assert.equal(compares, 1);
  assert.equal(sessions, 1);
  assert.equal(outcomes[0].outcome, "authenticated");
  assert.ok(response.headers["Set-Cookie"]);
}));

test("handler keeps unknown and wrong-account errors generic and uses the dummy bcrypt hash", async () => withSalt(async () => {
  let comparedHash = "";
  let completed = null;
  const handler = createSigninHandler({
    getDatabase: () => fakeSql(),
    checkReadiness: async () => null,
    beginAttempt: async () => ({ attemptId: "2", limited: false }),
    completeAttempt: async (_sql, attempt) => {
      completed = attempt;
      return { limited: false, retryAfter: 1 };
    },
    comparePassword: async (_password, hash) => { comparedHash = hash; return false; },
  });
  const response = parse(await handler(event({
    ip: "203.0.113.77",
    body: { email: "missing@example.test", password: "not-the-password" },
  })));
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { error: "Invalid email or password" });
  assert.equal(comparedHash, authLoginDummyPasswordHash);
  assert.equal(completed.outcome, "invalid_credentials");
  assert.equal(JSON.stringify(completed).includes("missing@example.test"), false);
  assert.equal(JSON.stringify(completed).includes("203.0.113.77"), false);
  assert.equal(JSON.stringify(completed).includes("not-the-password"), false);
}));

test("handler preserves inactive-account, method, and payload contracts", async () => withSalt(async () => {
  const user = {
    id: "10000000-0000-4000-8000-000000000002",
    school_id: "20000000-0000-4000-8000-000000000002",
    full_name: "Paused Student",
    email: "paused@example.test",
    role: "student",
    status: "paused",
    school_status: "active",
    password_hash: "stored-password-hash",
  };
  let outcome = "";
  let sessions = 0;
  const handler = createSigninHandler({
    getDatabase: () => fakeSql(user),
    checkReadiness: async () => null,
    beginAttempt: async () => ({ attemptId: "3", limited: false }),
    completeAttempt: async (_sql, attempt) => { outcome = attempt.outcome; return { limited: false, retryAfter: 1 }; },
    comparePassword: async () => true,
    createAuthSession: async () => { sessions += 1; return {}; },
  });
  assert.equal(parse(await handler(event({ method: "GET" }))).status, 405);
  assert.equal(parse(await handler(event({ body: "{" }))).status, 400);
  assert.equal(parse(await handler(event({ body: { email: "bad", password: "x" } }))).status, 400);
  const inactive = parse(await handler(event({ body: { email: user.email, password: "correct" } })));
  assert.equal(inactive.status, 403);
  assert.deepEqual(inactive.body, { error: "This account is not active" });
  assert.equal(outcome, "inactive_account");
  assert.equal(sessions, 0);
}));
