import assert from "node:assert/strict";
import test from "node:test";
import {
  createSigninHandler,
} from "../netlify/functions/auth-signin.js";
import {
  createSignoutHandler,
} from "../netlify/functions/auth-signout.js";
import {
  createStudentSignupHandler,
} from "../netlify/functions/auth-student-signup.js";
import { schemaNotReadyResponse } from "../netlify/functions/_runtime-schema-readiness.js";

function event({ method = "POST", body = {}, cookie = "" } = {}) {
  return {
    httpMethod: method,
    headers: { host: "localhost:8888", cookie },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function parse(response) {
  return {
    status: response.statusCode,
    body: JSON.parse(response.body || "{}"),
    headers: response.headers || {},
  };
}

test("stale sign-in stops before limiter, bcrypt, account query, and session mutation", async () => {
  const calls = [];
  const handler = createSigninHandler({
    getDatabase: () => async () => { calls.push("sql"); return []; },
    checkReadiness: async () => schemaNotReadyResponse(),
    beginAttempt: async () => { calls.push("limiter"); },
    comparePassword: async () => { calls.push("bcrypt"); },
    createAuthSession: async () => { calls.push("session"); },
  });
  const response = parse(await handler(event({
    body: { email: "ready-check@example.test", password: "not-used" },
  })));
  assert.equal(response.status, 503);
  assert.equal(response.body.code, "SCHEMA_NOT_READY");
  assert.deepEqual(calls, []);
});

test("sign-in validates syntax before acquiring the database", async () => {
  let databaseCalls = 0;
  const handler = createSigninHandler({
    getDatabase: () => { databaseCalls += 1; throw new Error("must not connect"); },
  });
  assert.equal(parse(await handler(event({ body: "{" }))).status, 400);
  assert.equal(parse(await handler(event({
    body: { email: "invalid", password: "x" },
  }))).status, 400);
  assert.equal(databaseCalls, 0);
});

test("student signup readiness precedes rate limiting, lookup, hashing, and writes", async () => {
  const calls = [];
  const handler = createStudentSignupHandler({
    getDatabase: () => async () => { calls.push("sql"); return []; },
    checkReadiness: async () => schemaNotReadyResponse(),
    enforceRateLimit: async () => { calls.push("limiter"); },
    findClass: async () => { calls.push("class"); },
    recordAttempt: async () => { calls.push("attempt"); },
    hashPassword: async () => { calls.push("bcrypt"); },
    createAuthSession: async () => { calls.push("session"); },
  });
  const response = parse(await handler(event({
    body: {
      fullName: "Readiness Student",
      email: "readiness-student@example.test",
      password: "Unique-Readiness-2026!",
      classCode: "VALIDA12",
    },
  })));
  assert.equal(response.status, 503);
  assert.deepEqual(calls, []);
});

test("signout without a cookie clears the browser cookie without database access", async () => {
  let databaseCalls = 0;
  const handler = createSignoutHandler({
    getDatabase: () => { databaseCalls += 1; throw new Error("must not connect"); },
  });
  const response = parse(await handler(event()));
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.match(response.headers["Set-Cookie"], /Max-Age=0/);
  assert.equal(databaseCalls, 0);
});

test("stale signout clears the browser cookie and does not delete the stored session", async () => {
  let queries = 0;
  const handler = createSignoutHandler({
    getDatabase: () => async () => { queries += 1; return []; },
    checkReadiness: async () => schemaNotReadyResponse(),
  });
  const response = parse(await handler(event({ cookie: "hh_lms_session=opaque-token" })));
  assert.equal(response.status, 503);
  assert.equal(response.body.code, "SCHEMA_NOT_READY");
  assert.match(response.headers["Set-Cookie"], /Max-Age=0/);
  assert.equal(queries, 0);
});
