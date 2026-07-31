import { readFile } from "node:fs/promises";
import pg from "pg";
import {
  loadProductionMigrationManifest,
  migrationChecksumMatches,
} from "./_migration-readiness.mjs";

function requireIsolatedLocalDatabase(environment = process.env) {
  if (environment.PILOT_DATABASE_CONFIRMATION !== "isolated-local-pilot") {
    throw new Error("PILOT_DATABASE_CONFIRMATION must equal isolated-local-pilot");
  }
  const raw = String(environment.PILOT_DATABASE_URL || "");
  if (!raw) throw new Error("PILOT_DATABASE_URL is required");
  if (environment.DATABASE_URL && raw === environment.DATABASE_URL) {
    throw new Error("PILOT_DATABASE_URL must not equal DATABASE_URL");
  }
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Local pilot seed accepts loopback PostgreSQL only");
  }
  return raw;
}

const connectionString = requireIsolatedLocalDatabase();
const pool = new pg.Pool({ connectionString });

try {
  const migrations = await loadProductionMigrationManifest();
  const historyExists = (await pool.query(
    "select to_regclass(current_schema() || '.eduforge_migration_history') is not null as exists",
  )).rows[0].exists;
  const existingTables = Number((await pool.query(`
    select count(*)::int count from information_schema.tables
    where table_schema=current_schema()
      and table_name not in ('eduforge_migration_history','local_pilot_migrations')
  `)).rows[0].count);
  if (!historyExists && existingTables) {
    throw new Error("Local pilot schema predates canonical migration history; reset the explicitly isolated pilot database");
  }
  await pool.query(`
    create table if not exists eduforge_migration_history (
      filename text primary key,
      checksum_sha256 text not null,
      applied_at timestamptz not null default now()
    )
  `);
  const applied = (await pool.query(
    "select filename,checksum_sha256 from eduforge_migration_history order by applied_at,filename",
  )).rows;
  const expectedPrefix = migrations.slice(0, applied.length).map(({ filename }) => filename);
  if (JSON.stringify(applied.map(({ filename }) => filename)) !== JSON.stringify(expectedPrefix)) {
    throw new Error("Local pilot canonical migration history is not an ordered manifest prefix");
  }
  for (const row of applied) {
    const migration = migrations.find(({ filename }) => filename === row.filename);
    if (!migration || !migrationChecksumMatches(migration, row.checksum_sha256)) {
      throw new Error(`Local pilot canonical migration history mismatch: ${row.filename}`);
    }
  }
  const tracked = new Set(applied.map(({ filename }) => filename));
  for (const migration of migrations) {
    if (tracked.has(migration.filename)) continue;
    await pool.query("begin");
    try {
      await pool.query(migration.sql);
      await pool.query(
        "insert into eduforge_migration_history(filename,checksum_sha256) values($1,$2)",
        [migration.filename, migration.checksum],
      );
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback").catch(() => {});
      throw error;
    }
  }
  await pool.query(await readFile("database/012_demo_login_passwords.sql", "utf8"));
  console.log(`Seeded isolated local pilot with ${migrations.length} canonical production migrations and the demo-only seed.`);
} finally {
  await pool.end();
}
