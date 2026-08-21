import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadProductionMigrationFiles, loadProductionMigrationManifest, migrationChecksumMatches, parseProductionMigrationManifest, postgresTemplate, requireSafeDatabase } from "../scripts/_staging-db.mjs";
import { classifyQaCleanupState } from "../scripts/_staging-cleanup-safety.mjs";

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("staging database guard fails closed", () => {
  withEnvironment({ STAGING_DATABASE_URL: undefined, STAGING_DATABASE_CONFIRMATION: undefined, DATABASE_URL: undefined }, () => {
    assert.throws(() => requireSafeDatabase("staging"), /STAGING_DATABASE_URL is required/);
  });
  withEnvironment({
    STAGING_DATABASE_URL: "postgresql://user:secret@localhost/hhplms_staging",
    STAGING_DATABASE_CONFIRMATION: undefined,
    DATABASE_URL: undefined,
  }, () => assert.throws(() => requireSafeDatabase("staging"), /STAGING_DATABASE_CONFIRMATION/));
  withEnvironment({
    STAGING_DATABASE_URL: "postgresql://staging:secret@db.example/hhplms_staging",
    STAGING_DATABASE_CONFIRMATION: "isolated-staging-database",
    DATABASE_URL: "postgresql://runtime:different@db.example/hhplms_staging",
  }, () => assert.throws(() => requireSafeDatabase("staging"), /same database/));
  withEnvironment({
    STAGING_DATABASE_URL: "postgresql://user:secret@production.example/hhplms_staging",
    STAGING_DATABASE_CONFIRMATION: "isolated-staging-database",
    DATABASE_URL: undefined,
  }, () => assert.throws(() => requireSafeDatabase("staging"), /appears to identify a production/));
  withEnvironment({
    STAGING_DATABASE_URL: "postgresql://user:secret@db.example/neondb",
    STAGING_DATABASE_CONFIRMATION: "isolated-staging-database",
    DATABASE_URL: undefined,
  }, () => assert.throws(() => requireSafeDatabase("staging"), /visibly identify an isolated/));
});

test("staging database guard accepts a visibly isolated confirmed target without exposing credentials", () => {
  withEnvironment({
    STAGING_DATABASE_URL: "postgresql://user:top-secret@localhost/hhplms_staging",
    STAGING_DATABASE_CONFIRMATION: "isolated-staging-database",
    DATABASE_URL: undefined,
  }, () => {
    const target = requireSafeDatabase("staging");
    assert.equal(target.safeLabel, "localhost/hhplms_staging");
    assert.equal(target.safeLabel.includes("top-secret"), false);
  });
});

function assignmentLifecycleHarness({ rollbackError = null } = {}) {
  const events = [];
  const client = {
    async query(text, values = []) {
      events.push({ kind: "query", text, values });
      if (text === "rollback" && rollbackError) throw rollbackError;
      return { rows: [{ source: "transaction-client" }] };
    },
    release() {
      events.push({ kind: "release" });
    },
  };
  const pool = {
    async connect() {
      events.push({ kind: "connect" });
      return client;
    },
    async query() {
      throw new Error("transaction callback must not use the pool query method");
    },
  };
  return { events, sql: postgresTemplate(pool) };
}

test("staging PostgreSQL adapter commits assignment lifecycle work under the canonical advisory lock", async () => {
  const assignmentId = "11111111-1111-4111-8111-111111111111";
  const { events, sql } = assignmentLifecycleHarness();

  const result = await sql.assignmentLifecycleTransaction(assignmentId, async (transactionSql) => {
    events.push({ kind: "callback" });
    assert.deepEqual(await transactionSql`select ${"probe"} as source`, [{ source: "transaction-client" }]);
    return { status: "committed" };
  });

  assert.deepEqual(result, { status: "committed" });
  assert.deepEqual(events.map((event) => event.kind), ["connect", "query", "query", "callback", "query", "query", "release"]);
  assert.equal(events[1].text, "begin");
  assert.match(events[2].text, /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.deepEqual(events[2].values, [`activity-assignment:${assignmentId}`]);
  assert.equal(events[5].text, "commit");
  assert.equal(events.some((event) => event.text === "rollback"), false);
});

test("staging PostgreSQL adapter rolls back assignment lifecycle failures and preserves the original error", async () => {
  const callbackError = new Error("callback failed");
  const { events, sql } = assignmentLifecycleHarness({ rollbackError: new Error("rollback failed") });

  await assert.rejects(
    sql.assignmentLifecycleTransaction("22222222-2222-4222-8222-222222222222", async () => {
      events.push({ kind: "callback" });
      throw callbackError;
    }),
    (error) => error === callbackError,
  );

  assert.deepEqual(events.map((event) => event.kind), ["connect", "query", "query", "callback", "query", "release"]);
  assert.equal(events[4].text, "rollback");
  assert.equal(events.some((event) => event.text === "commit"), false);
});

test("production migration manifest excludes demo passwords, includes phase 2, and supports later migrations", async () => {
  const migrations = await loadProductionMigrationManifest();
  assert.equal(migrations.some(({ filename }) => filename === "012_demo_login_passwords.sql"), false);
  assert.equal(migrations.some(({ filename }) => filename === "013_authorization_phase2.sql"), true);
  assert.ok(migrations.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)));

  const future = parseProductionMigrationManifest([
    "1. `010_assignment_live_flow.sql`",
    "2. `010_assignment_mvp_metadata.sql`",
    "3. `013_authorization_phase2.sql`",
    "4. `014_future_safe.sql`",
    "5. `015_later.sql`",
  ].join("\n"));
  assert.deepEqual(future, [
    "010_assignment_live_flow.sql", "010_assignment_mvp_metadata.sql", "013_authorization_phase2.sql",
    "014_future_safe.sql", "015_later.sql",
  ]);
  assert.throws(() => parseProductionMigrationManifest("1. `014_future_safe.sql`"), /013_authorization_phase2.*present/);
  assert.throws(() => parseProductionMigrationManifest([
    "1. `013_authorization_phase2.sql`", "2. `012_demo_login_passwords.sql`",
  ].join("\n")), /Demo password migration/);
  assert.throws(() => parseProductionMigrationManifest([
    "1. `013_authorization_phase2.sql`", "2. `013_authorization_phase2.sql`",
  ].join("\n")), /duplicate filename/);
  await assert.rejects(
    loadProductionMigrationFiles(["013_authorization_phase2.sql", "014_missing.sql"], async (filename) => {
      if (filename === "014_missing.sql") throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return "select 1;";
    }),
    /listed in manifest does not exist: 014_missing.sql/,
  );
});

test("migration checksums are deterministic across LF and CRLF checkouts while rejecting changed SQL", async () => {
  const lfSql = "begin;\nselect 1;\ncommit;\n";
  const crlfSql = lfSql.replaceAll("\n", "\r\n");
  const [lfMigration] = await loadProductionMigrationFiles(["013_authorization_phase2.sql"], async () => lfSql);
  const [crlfMigration] = await loadProductionMigrationFiles(["013_authorization_phase2.sql"], async () => crlfSql);

  assert.equal(lfMigration.checksum, crlfMigration.checksum);
  assert.equal(migrationChecksumMatches(lfMigration, crlfMigration.compatibleChecksums.at(-1)), true);
  assert.equal(migrationChecksumMatches(crlfMigration, lfMigration.checksum), true);
  assert.equal(migrationChecksumMatches(lfMigration, "0".repeat(64)), false);
});

test("staging preflight derives the latest migration rather than hardcoding migration 030", async () => {
  const source = await readFile("scripts/_staging-preflight.mjs", "utf8");
  assert.match(source, /migrationManifestSummary/);
  assert.doesNotMatch(source, /030_platform_admin_login_rate_limit\.sql/);
  assert.match(source, /manifest_fingerprint/);
});

test("staging migration and verification runners use the explicit hosted-preflight handoff", async () => {
  const [migrationRunner, verificationRunner] = await Promise.all([
    readFile("scripts/run-staging-migrations.mjs", "utf8"),
    readFile("scripts/run-staging-verification.mjs", "utf8"),
  ]);
  assert.match(migrationRunner, /openVerifiedStagingMigrationPool/);
  assert.doesNotMatch(migrationRunner, /createSafePool\("staging"\)/);
  assert.match(verificationRunner, /await checkStagingDeployment\(verifiedEnvironment\)/);
  assert.match(verificationRunner, /delete targetOnlyEnvironment\.DATABASE_URL/);
  assert.match(verificationRunner, /script === "staging:migrate" \? verifiedEnvironment : targetOnlyEnvironment/);
});

test("staging smoke derives active book-package metrics from retained staging entitlements", async () => {
  const smoke = await readFile("scripts/run-staging-smoke-tests.mjs", "utf8");
  assert.match(smoke, /const expectedActiveBookPackages = await count/);
  assert.match(smoke, /activeBookPackages: expectedActiveBookPackages/);
  assert.doesNotMatch(smoke, /activeBookPackages:\s*1/);
});

test("QA cleanup accepts only an exact registry and is idempotent only after roots are gone", () => {
  const expected = new Set(["school:a", "school:b", "publisher:p"]);
  assert.equal(classifyQaCleanupState(new Set(expected), expected, 3), "ready");
  assert.equal(classifyQaCleanupState(new Set(), expected, 0), "already-clean");
  assert.throws(() => classifyQaCleanupState(new Set(["school:a"]), expected, 2), /does not exactly match/);
  assert.throws(() => classifyQaCleanupState(new Set([...expected, "school:foreign"]), expected, 3), /does not exactly match/);
  assert.throws(() => classifyQaCleanupState(new Set(expected), expected, 0), /roots are missing/);
});
