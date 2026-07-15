import test from "node:test";
import assert from "node:assert/strict";
import { loadProductionMigrationManifest, requireSafeDatabase } from "../scripts/_staging-db.mjs";

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

test("production migration manifest excludes demo passwords and ends with phase 2", async () => {
  const migrations = await loadProductionMigrationManifest();
  assert.equal(migrations.some(({ filename }) => filename === "012_demo_login_passwords.sql"), false);
  assert.equal(migrations.at(-1).filename, "013_authorization_phase2.sql");
  assert.ok(migrations.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)));
});
