import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_MULTI_SCHOOL, localMultiSchoolDatabaseUrl, requireLocalMultiSchoolTarget } from "../scripts/_local-multi-school.mjs";

const confirmation = [`--confirm=${LOCAL_MULTI_SCHOOL.confirmation}`];

test("local multi-school target requires explicit confirmation", () => {
  assert.throws(() => requireLocalMultiSchoolTarget({}, []), /confirmation/i);
});

test("local multi-school target rejects production and non-loopback databases", () => {
  assert.throws(() => requireLocalMultiSchoolTarget({ NODE_ENV: "production" }, confirmation), /production/i);
  assert.throws(() => requireLocalMultiSchoolTarget({
    MULTI_SCHOOL_LOCAL_DATABASE_URL: "postgresql://demo:secret@db.example.com/eduforge_multi_school_demo",
  }, confirmation), /loopback/i);
});

test("local multi-school target rejects ambiguous database names and generic database variables", () => {
  assert.throws(() => requireLocalMultiSchoolTarget({
    MULTI_SCHOOL_LOCAL_DATABASE_URL: "postgresql://demo:secret@127.0.0.1/eduforge",
  }, confirmation), /exactly/i);
  assert.throws(() => requireLocalMultiSchoolTarget({
    MULTI_SCHOOL_LOCAL_DATABASE_URL: localMultiSchoolDatabaseUrl(),
    DATABASE_URL: localMultiSchoolDatabaseUrl(),
  }, confirmation), /generic/i);
});
