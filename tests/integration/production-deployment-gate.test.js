import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import pg from "pg";
import {
  loadProductionMigrationManifest,
  migrationManifestSummary,
} from "../../scripts/_migration-readiness.mjs";
import {
  checkProductionDatabase,
  productionDatabaseFingerprint,
} from "../../scripts/_production-preflight.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl)
  && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";

function scoped(base, schema) {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

test("production deployment gate is read-only and fails closed on isolated database drift", {
  skip: !enabled,
  timeout: 180_000,
}, async (t) => {
  const schema = `hhplms_test_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`create schema "${schema}"`);
  const scopedUrl = scoped(databaseUrl, schema);
  const setup = new Pool({ connectionString: scopedUrl });
  const migrations = await loadProductionMigrationManifest();
  const manifest = migrationManifestSummary(migrations);
  const neutralUrl = "postgresql://readonly:not-logged@ep-neutral.provider.net/application";
  const environment = {
    DATABASE_URL: neutralUrl,
    PRODUCTION_DATABASE_FINGERPRINT: productionDatabaseFingerprint(neutralUrl),
    PRODUCTION_ENVIRONMENT_CONFIRMATION: "hosted-production",
    PRODUCTION_DATABASE_CONFIRMATION: "read-only-production-preflight",
    PRODUCTION_APP_URL: "https://app.hhplms.example",
  };
  const runPreflight = () => checkProductionDatabase({
    environment,
    migrations,
    createPool: () => new Pool({ connectionString: scopedUrl }),
  });

  t.after(async () => {
    await setup.end();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  });

  for (const migration of migrations) await setup.query(migration.sql);
  await setup.query(`
    create table eduforge_migration_history(
      filename text primary key,
      checksum_sha256 text not null,
      applied_at timestamptz not null default now()
    )
  `);
  for (const migration of migrations) {
    await setup.query(
      "insert into eduforge_migration_history(filename,checksum_sha256) values($1,$2)",
      [migration.filename, migration.checksum],
    );
  }
  await setup.query("create table preflight_probe(value text)");
  await setup.query("insert into preflight_probe(value) values('unchanged')");

  const before = {
    history: Number((await setup.query("select count(*) count from eduforge_migration_history")).rows[0].count),
    probe: Number((await setup.query("select count(*) count from preflight_probe")).rows[0].count),
  };
  const current = await runPreflight();
  assert.equal(current.ready, true);
  assert.equal(current.expectedCount, migrations.length);
  assert.equal(current.latestMigration, manifest.latestMigration);
  assert.equal(current.manifestFingerprint, manifest.manifestFingerprint);
  assert.equal(current.tenantIntegrityClean, true);
  const after = {
    history: Number((await setup.query("select count(*) count from eduforge_migration_history")).rows[0].count),
    probe: Number((await setup.query("select count(*) count from preflight_probe")).rows[0].count),
  };
  assert.deepEqual(after, before);

  const readOnly = await setup.connect();
  try {
    await readOnly.query("begin read only");
    await assert.rejects(
      readOnly.query("insert into preflight_probe(value) values('forbidden')"),
      (error) => error.code === "25006",
    );
  } finally {
    await readOnly.query("rollback");
    readOnly.release();
  }
  assert.equal((await setup.query("select value from preflight_probe")).rows[0].value, "unchanged");

  const latest = migrations.at(-1);
  await setup.query("delete from eduforge_migration_history where filename=$1", [latest.filename]);
  await assert.rejects(runPreflight(), new RegExp(`pending: ${latest.filename}`));
  await setup.query(
    "insert into eduforge_migration_history(filename,checksum_sha256) values($1,$2)",
    [latest.filename, latest.checksum],
  );

  const first = migrations[0];
  await setup.query(
    "update eduforge_migration_history set checksum_sha256=$2 where filename=$1",
    [first.filename, "0".repeat(64)],
  );
  await assert.rejects(runPreflight(), new RegExp(`checksum mismatch: ${first.filename}`));
  await setup.query(
    "update eduforge_migration_history set checksum_sha256=$2 where filename=$1",
    [first.filename, first.checksum],
  );

  await setup.query(
    "insert into eduforge_migration_history(filename,checksum_sha256) values('999_unknown.sql',$1)",
    ["a".repeat(64)],
  );
  await assert.rejects(runPreflight(), /unknown: 999_unknown\.sql/);
  await setup.query("delete from eduforge_migration_history where filename='999_unknown.sql'");

  await setup.query(`
    create or replace view tenant_integrity_issues as
    select 'app_users'::text table_name,1::bigint null_school_rows
  `);
  await assert.rejects(runPreflight(), /tenant integrity failed: app_users=1/);
  await setup.query(migrations.find(({ filename }) => filename === "013_authorization_phase2.sql").sql);
  assert.equal((await runPreflight()).tenantIntegrityClean, true);

  await setup.query("drop table auth_sessions cascade");
  await assert.rejects(runPreflight(), /missing critical tables: auth_sessions/);

  await setup.query("drop table eduforge_migration_history");
  await assert.rejects(runPreflight(), /Production schema exists without verified migration history/);
});
