import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const integrationEnabled = Boolean(
  testDatabaseUrl
  && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database"
);

function scopedDatabaseUrl(baseUrl, schema) {
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

test("local pilot demo seed is deterministic and complete", {
  skip: !integrationEnabled,
  timeout: 120_000,
}, async (t) => {
  assert.notEqual(testDatabaseUrl, process.env.DATABASE_URL);
  const schema = `eduforge_demo_${randomBytes(6).toString("hex")}`;
  const adminPool = new pg.Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const pool = new pg.Pool({ connectionString: scopedDatabaseUrl(testDatabaseUrl, schema) });

  t.after(async () => {
    await pool.end();
    await adminPool.query(`drop schema if exists "${schema}" cascade`);
    await adminPool.end();
  });

  const migrationFiles = (await readdir("database"))
    .filter((name) => /^\d+.*\.sql$/.test(name) && name !== "012_demo_login_passwords.sql")
    .sort((left, right) => left.localeCompare(right));
  for (const file of migrationFiles) {
    await pool.query(await readFile(`database/${file}`, "utf8"));
  }

  const demoSeed = await readFile("database/012_demo_login_passwords.sql", "utf8");
  await pool.query(demoSeed);
  await pool.query(demoSeed);

  const scalar = async (query) => Number((await pool.query(query)).rows[0].count);
  assert.equal(await scalar(`
    select count(*)::int
    from app_users
    where lower(email) in (
      'elena.admin@example.com',
      'maria.teacher@example.com',
      'anna.student@example.com'
    )
      and status = 'active'
  `), 3);
  assert.equal(await scalar("select count(*)::int from classes where slug = 'ultimate-b2-pilot' and status = 'active'"), 1);
  assert.equal(await scalar(`
    select count(*)::int
    from class_students membership
    join classes class_record on class_record.id = membership.class_id
    where class_record.slug = 'ultimate-b2-pilot'
      and membership.status = 'active'
  `), 1);
  assert.equal(await scalar(`
    select count(*)::int
    from book_access access
    join app_users student on student.id = access.user_id
    join book_packages package_record on package_record.id = access.book_package_id
    where lower(student.email) = 'anna.student@example.com'
      and package_record.slug = 'ultimate-b2'
      and access.role_scope = 'student'
  `), 1);
  assert.equal(await scalar(`
    select count(*)::int
    from activity_assignments
    where idempotency_key like 'demo:ultimate-b2:%'
  `), 2);
  assert.equal(await scalar(`
    select count(*)::int
    from activities
    where slug like 'ultimate-b2-sb-u1-%'
      and is_assignable = true
  `), 37);
  assert.equal(await scalar(`
    select count(*)::int
    from activities
    where slug like 'ultimate-b2-sb-u2-%'
      and is_assignable = true
  `), 40);
});
