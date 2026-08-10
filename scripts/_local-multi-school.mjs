import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import pg from "pg";
import { DEMO_ACCOUNT_PASSWORD } from "./_demo-credentials.mjs";
import { LOCAL_DEMO_PORTS } from "./_local-demo-ports.mjs";
import {
  loadProductionMigrationManifest,
  migrationChecksumMatches,
} from "./_migration-readiness.mjs";

export const LOCAL_MULTI_SCHOOL = Object.freeze({
  confirmation: "isolated-local-multi-school-demo",
  databaseName: "hhplms_multi_school_demo",
  containerName: "hhplms-multi-school-postgres",
  host: "127.0.0.1",
  port: LOCAL_DEMO_PORTS.postgres,
  user: "postgres",
  password: "hhplms_multi_school_dev_only",
  markerPath: ".codex/local-multi-school-demo.json",
});

export function localMultiSchoolDatabaseUrl(databaseName = LOCAL_MULTI_SCHOOL.databaseName) {
  const { user, password, host, port } = LOCAL_MULTI_SCHOOL;
  return `postgresql://${user}:${password}@${host}:${port}/${databaseName}`;
}

export function requireLocalMultiSchoolTarget(environment = process.env, argv = process.argv.slice(2)) {
  if (environment.NODE_ENV === "production") throw new Error("Local multi-school demo is forbidden when NODE_ENV=production");
  if (!argv.includes(`--confirm=${LOCAL_MULTI_SCHOOL.confirmation}`)) {
    throw new Error(`Explicit confirmation is required: --confirm=${LOCAL_MULTI_SCHOOL.confirmation}`);
  }
  const raw = String(environment.MULTI_SCHOOL_LOCAL_DATABASE_URL || localMultiSchoolDatabaseUrl());
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Local demo database must use PostgreSQL");
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) throw new Error("Local demo database host must be loopback");
  if (decodeURIComponent(url.pathname.replace(/^\//, "")) !== LOCAL_MULTI_SCHOOL.databaseName) {
    throw new Error(`Local demo database name must be exactly ${LOCAL_MULTI_SCHOOL.databaseName}`);
  }
  if (environment.DATABASE_URL || environment.STAGING_DATABASE_URL || environment.NETLIFY_DATABASE_URL || environment.NEON_DATABASE_URL) {
    throw new Error("Local demo commands refuse generic, hosted, and staging database variables");
  }
  return { connectionString: raw, safeLabel: `${url.hostname}:${url.port}/${LOCAL_MULTI_SCHOOL.databaseName}`, kind: "local-multi-school" };
}

export function readLocalMultiSchoolMarker() {
  if (!existsSync(LOCAL_MULTI_SCHOOL.markerPath)) return null;
  const marker = JSON.parse(readFileSync(LOCAL_MULTI_SCHOOL.markerPath, "utf8"));
  if (marker.confirmation !== LOCAL_MULTI_SCHOOL.confirmation) throw new Error("Local multi-school marker confirmation is invalid");
  const url = new URL(marker.databaseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.pathname !== `/${LOCAL_MULTI_SCHOOL.databaseName}`) {
    throw new Error("Local multi-school marker target is unsafe");
  }
  return marker;
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", stdio: options.inherit ? "inherit" : "pipe" });
  if (result.error) throw new Error(`Docker is required for the local demo: ${result.error.message}`);
  if (result.status !== 0 && !options.allowFailure) throw new Error((result.stderr || result.stdout || "Docker command failed").trim());
  return result;
}

export async function ensureLocalPostgres() {
  const inspect = runDocker(["container", "inspect", LOCAL_MULTI_SCHOOL.containerName], { allowFailure: true });
  if (inspect.status !== 0) {
    runDocker([
      "run", "--detach", "--name", LOCAL_MULTI_SCHOOL.containerName,
      "--publish", `${LOCAL_MULTI_SCHOOL.host}:${LOCAL_MULTI_SCHOOL.port}:5432`,
      "--env", `POSTGRES_PASSWORD=${LOCAL_MULTI_SCHOOL.password}`,
      "--env", "POSTGRES_DB=postgres",
      "postgres:16-alpine",
    ], { inherit: true });
  } else {
    const details = JSON.parse(inspect.stdout)[0];
    const binding = details?.HostConfig?.PortBindings?.["5432/tcp"]?.[0];
    const passwordEnv = details?.Config?.Env?.find((item) => item.startsWith("POSTGRES_PASSWORD="));
    if (binding?.HostIp !== LOCAL_MULTI_SCHOOL.host || Number(binding?.HostPort) !== LOCAL_MULTI_SCHOOL.port || passwordEnv !== `POSTGRES_PASSWORD=${LOCAL_MULTI_SCHOOL.password}`) {
      throw new Error(`Existing ${LOCAL_MULTI_SCHOOL.containerName} does not match the safe local demo configuration`);
    }
    if (!details?.State?.Running) runDocker(["start", LOCAL_MULTI_SCHOOL.containerName], { inherit: true });
  }

  const adminUrl = localMultiSchoolDatabaseUrl("postgres");
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const pool = new pg.Pool({ connectionString: adminUrl, connectionTimeoutMillis: 1_000 });
    try {
      await pool.query("select 1");
      await pool.end();
      return adminUrl;
    } catch (error) {
      lastError = error;
      await pool.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Local PostgreSQL did not become ready: ${lastError?.message || "unknown error"}`);
}

export async function createDemoDatabase(adminUrl) {
  const pool = new pg.Pool({ connectionString: adminUrl });
  try {
    const exists = await pool.query("select 1 from pg_database where datname=$1", [LOCAL_MULTI_SCHOOL.databaseName]);
    if (!exists.rowCount) await pool.query(`create database "${LOCAL_MULTI_SCHOOL.databaseName}"`);
  } finally {
    await pool.end();
  }
}

function assertDedicatedDemoMigrationTarget(connectionString, confirmation) {
  if (confirmation !== LOCAL_MULTI_SCHOOL.confirmation) {
    throw new Error("Canonical local migration history requires explicit local demo confirmation");
  }
  const url = new URL(connectionString);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol)
    || !["127.0.0.1", "localhost", "::1"].includes(url.hostname)
    || databaseName !== LOCAL_MULTI_SCHOOL.databaseName
  ) {
    throw new Error("Canonical local migration history is restricted to the dedicated loopback demo database");
  }
}

export async function applyDemoMigrations(connectionString, {
  confirmation,
  migrations: suppliedMigrations,
} = {}) {
  assertDedicatedDemoMigrationTarget(connectionString, confirmation);
  const migrations = suppliedMigrations || await loadProductionMigrationManifest();
  const pool = new pg.Pool({ connectionString });
  try {
    const relationState = (await pool.query(`
      select
        to_regclass(current_schema() || '.eduforge_migration_history') is not null canonical_exists,
        to_regclass(current_schema() || '.local_multi_school_migrations') is not null legacy_exists
    `)).rows[0];
    const nonHistoryTableCount = Number((await pool.query(`
      select count(*)::int count from information_schema.tables
      where table_schema=current_schema()
        and table_name not in ('eduforge_migration_history','local_multi_school_migrations')
    `)).rows[0].count);

    if (!relationState.canonical_exists && relationState.legacy_exists) {
      const legacyFiles = (await pool.query(
        "select filename from local_multi_school_migrations order by applied_at,filename",
      )).rows.map(({ filename }) => filename);
      const expectedFiles = migrations.map(({ filename }) => filename);
      if (JSON.stringify(legacyFiles) !== JSON.stringify(expectedFiles)) {
        throw new Error("Legacy local migration history cannot be proven; reset the dedicated demo database");
      }
      const requiredTables = [
        "schools", "app_users", "auth_sessions", "auth_login_attempts",
        "account_tokens", "account_email_outbox",
      ];
      const present = new Set((await pool.query(`
        select table_name from information_schema.tables
        where table_schema=current_schema() and table_name=any($1::text[])
      `, [requiredTables])).rows.map(({ table_name }) => table_name));
      if (requiredTables.some((table) => !present.has(table))) {
        throw new Error("Legacy local schema probes failed; reset the dedicated demo database");
      }
      await pool.query("begin");
      try {
        await pool.query(`
          create table eduforge_migration_history(
            filename text primary key,
            checksum_sha256 text not null,
            applied_at timestamptz not null default now()
          )
        `);
        for (const migration of migrations) {
          await pool.query(
            "insert into eduforge_migration_history(filename,checksum_sha256) values($1,$2)",
            [migration.filename, migration.checksum],
          );
        }
        await pool.query("commit");
      } catch (error) {
        await pool.query("rollback").catch(() => {});
        throw error;
      }
    } else if (!relationState.canonical_exists) {
      if (nonHistoryTableCount) {
        throw new Error("Dedicated demo database is non-empty without canonical migration history");
      }
      await pool.query(`
        create table eduforge_migration_history(
          filename text primary key,
          checksum_sha256 text not null,
          applied_at timestamptz not null default now()
        )
      `);
    }

    const appliedRows = (await pool.query(
      "select filename,checksum_sha256 from eduforge_migration_history order by applied_at,filename",
    )).rows;
    const appliedByName = new Map(appliedRows.map((row) => [row.filename, row]));
    for (const row of appliedRows) {
      const migration = migrations.find(({ filename }) => filename === row.filename);
      if (!migration) throw new Error(`Unknown canonical local migration history row: ${row.filename}`);
      if (!migrationChecksumMatches(migration, row.checksum_sha256)) {
        throw new Error(`Canonical local migration checksum mismatch: ${row.filename}`);
      }
    }
    const appliedNames = appliedRows.map(({ filename }) => filename);
    const expectedPrefix = migrations.slice(0, appliedRows.length).map(({ filename }) => filename);
    if (JSON.stringify(appliedNames) !== JSON.stringify(expectedPrefix)) {
      throw new Error("Canonical local migration history is not an ordered manifest prefix");
    }

    for (const migration of migrations) {
      if (appliedByName.has(migration.filename)) continue;
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
    return migrations.length;
  } finally {
    await pool.end();
  }
}

export async function writeLocalMultiSchoolMarker() {
  await mkdir(".codex", { recursive: true });
  await writeFile(LOCAL_MULTI_SCHOOL.markerPath, `${JSON.stringify({
    confirmation: LOCAL_MULTI_SCHOOL.confirmation,
    databaseUrl: localMultiSchoolDatabaseUrl(),
    baseURL: "http://127.0.0.1:8888",
  }, null, 2)}\n`, { mode: 0o600 });
}

export async function removeLocalMultiSchoolMarker() {
  await rm(LOCAL_MULTI_SCHOOL.markerPath, { force: true });
}

export function localDemoEnvironment(extra = {}) {
  const environment = { ...process.env };
  for (const name of ["DATABASE_URL", "STAGING_DATABASE_URL", "STAGING_DATABASE_CONFIRMATION", "NETLIFY_DATABASE_URL", "NEON_DATABASE_URL", "POSTGRES_URL"]) {
    delete environment[name];
  }
  return {
    ...environment,
    ...extra,
    NODE_ENV: "development",
    ALLOW_DEMO_SEED: "true",
    MULTI_SCHOOL_SEED_CONFIRMATION: "fictional-multi-school-development-data",
    MULTI_SCHOOL_DEMO_PASSWORD: DEMO_ACCOUNT_PASSWORD,
    MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD: DEMO_ACCOUNT_PASSWORD,
    AUTH_RATE_LIMIT_SALT: "local-multi-school-ordinary-auth-rate-limit-only",
    PLATFORM_ADMIN_RATE_LIMIT_SALT: "local-multi-school-platform-admin-rate-limit-only",
    MULTI_SCHOOL_LOCAL_CONFIRMATION: LOCAL_MULTI_SCHOOL.confirmation,
    MULTI_SCHOOL_LOCAL_DATABASE_URL: localMultiSchoolDatabaseUrl(),
  };
}

export function spawnInherited(command, args, environment) {
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : command;
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", [command, ...args].join(" ")] : args;
  return spawn(executable, commandArgs, { env: environment, stdio: "inherit" });
}
