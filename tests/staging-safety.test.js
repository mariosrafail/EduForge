import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { loadProductionMigrationFiles, loadProductionMigrationManifest, migrationChecksumMatches, parseProductionMigrationManifest, requireSafeDatabase } from "../scripts/_staging-db.mjs";
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
    STAGING_DATABASE_URL: "postgresql://user:secret@localhost/eduforge_staging",
    STAGING_DATABASE_CONFIRMATION: undefined,
    DATABASE_URL: undefined,
  }, () => assert.throws(() => requireSafeDatabase("staging"), /STAGING_DATABASE_CONFIRMATION/));
  withEnvironment({
    STAGING_DATABASE_URL: "postgresql://staging:secret@db.example/eduforge_staging",
    STAGING_DATABASE_CONFIRMATION: "isolated-staging-database",
    DATABASE_URL: "postgresql://runtime:different@db.example/eduforge_staging",
  }, () => assert.throws(() => requireSafeDatabase("staging"), /same database/));
  withEnvironment({
    STAGING_DATABASE_URL: "postgresql://user:secret@production.example/eduforge_staging",
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
    STAGING_DATABASE_URL: "postgresql://user:top-secret@localhost/eduforge_staging",
    STAGING_DATABASE_CONFIRMATION: "isolated-staging-database",
    DATABASE_URL: undefined,
  }, () => {
    const target = requireSafeDatabase("staging");
    assert.equal(target.safeLabel, "localhost/eduforge_staging");
    assert.equal(target.safeLabel.includes("top-secret"), false);
  });
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
