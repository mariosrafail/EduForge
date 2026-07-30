import pg from "pg";
import {
  LOCAL_MULTI_SCHOOL,
  applyDemoMigrations,
  createDemoDatabase,
  ensureLocalPostgres,
  localDemoEnvironment,
  localMultiSchoolDatabaseUrl,
  removeLocalMultiSchoolMarker,
  requireLocalMultiSchoolTarget,
  spawnInherited,
  writeLocalMultiSchoolMarker,
} from "./_local-multi-school.mjs";

const action = process.argv[2];
const confirmationArg = process.argv.find((value) => value.startsWith("--confirm="));
requireLocalMultiSchoolTarget(process.env, confirmationArg ? [confirmationArg] : []);

async function runNode(script) {
  await new Promise((resolve, reject) => {
    const child = spawnInherited("node", [script], localDemoEnvironment());
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)));
  });
}

if (action === "setup") {
  const adminUrl = await ensureLocalPostgres();
  await createDemoDatabase(adminUrl);
  const count = await applyDemoMigrations(localMultiSchoolDatabaseUrl());
  await runNode("scripts/seed-multi-school.mjs");
  await writeLocalMultiSchoolMarker();
  console.log(`Local multi-school demo ready: ${count} production migrations, dedicated database ${LOCAL_MULTI_SCHOOL.databaseName}.`);
  console.log("Start it with: npm run demo:multi-school:start");
} else if (action === "start") {
  const pool = new pg.Pool({ connectionString: localMultiSchoolDatabaseUrl(), connectionTimeoutMillis: 2_000 });
  try {
    await pool.query("select 1");
  } finally {
    await pool.end();
  }
  console.log("EduForge multi-school demo: http://127.0.0.1:8888");
  const child = spawnInherited("node", ["scripts/run-netlify-dev.mjs"], localDemoEnvironment({
    DATABASE_URL: localMultiSchoolDatabaseUrl(),
    LOCAL_DATABASE_CONFIRMATION: "isolated-local-pilot",
    EDUFORGE_NETLIFY_LOOPBACK: "true",
    STAGING_DATABASE_CONFIRMATION: "isolated-staging-database",
    ACCOUNT_EMAIL_MODE: "preview",
    ACCOUNT_RATE_LIMIT_SALT: "local-multi-school-account-lifecycle-only",
    APP_PUBLIC_URL: "http://127.0.0.1:8888",
  }));
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exitCode = code ?? 1;
  });
} else if (action === "verify") {
  await runNode("scripts/verify-local-multi-school.mjs");
} else if (action === "reset") {
  const adminUrl = await ensureLocalPostgres();
  const admin = new pg.Pool({ connectionString: adminUrl });
  try {
    await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid <> pg_backend_pid()", [LOCAL_MULTI_SCHOOL.databaseName]);
    await admin.query(`drop database if exists "${LOCAL_MULTI_SCHOOL.databaseName}"`);
    const remains = await admin.query("select 1 from pg_database where datname=$1", [LOCAL_MULTI_SCHOOL.databaseName]);
    if (remains.rowCount) throw new Error("Dedicated demo database still exists after reset");
  } finally {
    await admin.end();
  }
  await removeLocalMultiSchoolMarker();
  console.log(`Reset complete. Only database ${LOCAL_MULTI_SCHOOL.databaseName} was removed; the local PostgreSQL container was retained.`);
} else {
  throw new Error("Expected setup, start, verify, or reset");
}
