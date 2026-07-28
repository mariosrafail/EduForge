import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

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
  await pool.query(`
    create table if not exists local_pilot_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const tracked = new Set((await pool.query("select filename from local_pilot_migrations")).rows.map((row) => row.filename));
  const existingTables = Number((await pool.query(`
    select count(*)::int as count
    from information_schema.tables
    where table_schema = current_schema()
      and table_name <> 'local_pilot_migrations'
  `)).rows[0].count);
  if (!tracked.size && existingTables) {
    throw new Error("Local pilot database is not empty and has no migration history; use a fresh isolated database");
  }
  const migrationFiles = (await readdir("database"))
    .filter((name) => /^\d+.*\.sql$/.test(name) && name !== "012_demo_login_passwords.sql")
    .sort((left, right) => left.localeCompare(right));
  for (const file of migrationFiles) {
    if (tracked.has(file)) continue;
    await pool.query(await readFile(`database/${file}`, "utf8"));
    await pool.query("insert into local_pilot_migrations (filename) values ($1)", [file]);
  }
  await pool.query(await readFile("database/012_demo_login_passwords.sql", "utf8"));
  console.log(`Seeded isolated local pilot with ${migrationFiles.length} production migrations and the demo-only seed.`);
} finally {
  await pool.end();
}
