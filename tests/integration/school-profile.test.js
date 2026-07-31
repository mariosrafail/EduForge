import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  hashToken,
  sessionCookieName,
  setSqlForTests,
} from "../../netlify/functions/_auth-utils.js";
import { handler as schoolProfile } from "../../netlify/functions/school-profile.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl)
  && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";

function scopedDatabaseUrl(baseUrl, schema) {
  const url = new URL(baseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function sqlTemplate(pool) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await pool.query(text, values)).rows;
  };
}

async function call({ method = "GET", cookie = "", body = {}, query = {}, origin = "http://localhost:8888" } = {}) {
  const response = await schoolProfile({
    httpMethod: method,
    headers: { host: "localhost:8888", cookie, origin },
    queryStringParameters: query,
    rawQuery: new URLSearchParams(query).toString(),
    body: method === "GET" ? "" : JSON.stringify(body),
  });
  return { status: response.statusCode, body: JSON.parse(response.body || "{}"), headers: response.headers || {} };
}

async function createSession(pool, userId) {
  const token = randomBytes(24).toString("hex");
  await pool.query(
    "insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')",
    [userId, hashToken(token)],
  );
  return `${sessionCookieName}=${token}`;
}

test("school profile persistence is atomic and isolated across ordinary tenants", {
  skip: !enabled,
  timeout: 120_000,
}, async (t) => {
  assert.notEqual(testDatabaseUrl, process.env.DATABASE_URL, "TEST_DATABASE_URL must not equal DATABASE_URL");
  const schema = `school_profile_${randomBytes(6).toString("hex")}`;
  const adminPool = new pg.Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const pool = new pg.Pool({ connectionString: scopedDatabaseUrl(testDatabaseUrl, schema) });
  setSqlForTests(sqlTemplate(pool));
  t.after(async () => {
    setSqlForTests(null);
    await pool.end();
    await adminPool.query(`drop schema if exists "${schema}" cascade`);
    await adminPool.end();
  });

  await applyCanonicalProductionMigrations(pool);

  const schools = (await pool.query(`
    insert into schools(name,logo,primary_color,secondary_color,status)
    values
      ('School A','SA','#1e3a8a','#0f172a','active'),
      ('School B','SB','#166534','#112233','active')
    returning id,name
  `)).rows;
  const schoolA = schools.find((school) => school.name === "School A");
  const schoolB = schools.find((school) => school.name === "School B");
  const users = (await pool.query(`
    insert into app_users(school_id,full_name,email,role,status)
    values
      ($1,'Admin A','admin-a@profile.test','admin','active'),
      ($2,'Admin B','admin-b@profile.test','admin','active'),
      ($1,'Teacher A','teacher-a@profile.test','teacher','active'),
      ($1,'Student A','student-a@profile.test','student','active')
    returning id,school_id,role
  `, [schoolA.id, schoolB.id])).rows;
  const adminA = users.find((user) => user.role === "admin" && user.school_id === schoolA.id);
  const adminB = users.find((user) => user.role === "admin" && user.school_id === schoolB.id);
  const teacherA = users.find((user) => user.role === "teacher");
  const studentA = users.find((user) => user.role === "student");
  const cookies = {
    adminA: await createSession(pool, adminA.id),
    adminB: await createSession(pool, adminB.id),
    teacherA: await createSession(pool, teacherA.id),
    studentA: await createSession(pool, studentA.id),
  };
  const countsBefore = (await pool.query(`
    select
      (select count(*)::int from schools) schools,
      (select count(*)::int from app_users) users,
      (select count(*)::int from auth_sessions) sessions,
      (select count(*)::int from book_access) access
  `)).rows[0];

  assert.equal((await call({ cookie: cookies.adminA })).body.school.name, "School A");
  assert.equal((await call({ cookie: cookies.adminB })).body.school.name, "School B");
  assert.equal((await call({ cookie: cookies.teacherA })).body.school.name, "School A");
  assert.equal((await call({ cookie: cookies.studentA })).body.school.name, "School A");
  assert.equal((await call({ cookie: cookies.adminA, query: { schoolId: schoolB.id } })).status, 400);
  assert.equal((await call({ method: "PATCH", cookie: cookies.teacherA, body: { name: "No" } })).status, 403);
  assert.equal((await call({ method: "PATCH", cookie: cookies.studentA, body: { name: "No" } })).status, 403);
  assert.equal((await call()).status, 401);
  assert.equal((await call({ method: "PATCH", body: { name: "No" } })).status, 401);
  assert.equal((await call({ cookie: "hh_platform_admin_session=platform-only" })).status, 401);

  const [updatedA, updatedB] = await Promise.all([
    call({
      method: "PATCH",
      cookie: cookies.adminA,
      body: { name: "School A Updated", primaryColor: "#581c87", secondaryColor: "#223344" },
    }),
    call({
      method: "PATCH",
      cookie: cookies.adminB,
      body: { logo: "B2" },
    }),
  ]);
  assert.equal(updatedA.status, 200);
  assert.equal(updatedB.status, 200);
  assert.equal(updatedA.body.school.name, "School A Updated");
  assert.equal(updatedB.body.school.name, "School B");

  const reloadedA = await call({ cookie: cookies.adminA });
  assert.deepEqual(
    {
      name: reloadedA.body.school.name,
      primary: reloadedA.body.school.primaryColor,
      secondary: reloadedA.body.school.secondaryColor,
    },
    { name: "School A Updated", primary: "#581c87", secondary: "#223344" },
  );
  assert.equal((await call({ cookie: cookies.teacherA })).body.school.name, "School A Updated");
  assert.equal((await call({ cookie: cookies.studentA })).body.school.name, "School A Updated");
  assert.equal((await call({ cookie: cookies.adminB })).body.school.name, "School B");

  const beforeInvalid = { ...(await pool.query("select * from schools where id=$1", [schoolA.id])).rows[0] };
  assert.equal((await call({
    method: "PATCH",
    cookie: cookies.adminA,
    body: { name: "Invalid Together", secondaryColor: "not-a-color" },
  })).status, 400);
  assert.deepEqual(
    (await pool.query("select name,logo,primary_color,secondary_color from schools where id=$1", [schoolA.id])).rows[0],
    {
      name: beforeInvalid.name,
      logo: beforeInvalid.logo,
      primary_color: beforeInvalid.primary_color,
      secondary_color: beforeInvalid.secondary_color,
    },
  );

  const audit = (await pool.query(`
    select user_id,actor_user_id,school_id,event_type,metadata
    from account_security_events
    where event_type='school_branding_updated' and school_id=$1
    order by created_at desc limit 1
  `, [schoolA.id])).rows[0];
  assert.equal(audit.user_id, adminA.id);
  assert.equal(audit.actor_user_id, adminA.id);
  assert.equal(audit.school_id, schoolA.id);
  assert.deepEqual(audit.metadata, { changed_fields: ["name", "primary_color", "secondary_color"] });

  await pool.query(`
    create function reject_brand_audit() returns trigger language plpgsql as $$
    begin
      if new.event_type='school_branding_updated' then raise exception 'forced audit failure';
      end if;
      return new;
    end $$;
    create trigger reject_brand_audit before insert on account_security_events
    for each row execute function reject_brand_audit()
  `);
  const nameBeforeAuditFailure = (await pool.query("select name from schools where id=$1", [schoolA.id])).rows[0].name;
  assert.equal((await call({
    method: "PATCH",
    cookie: cookies.adminA,
    body: { name: "Must Roll Back" },
  })).status, 500);
  assert.equal((await pool.query("select name from schools where id=$1", [schoolA.id])).rows[0].name, nameBeforeAuditFailure);
  await pool.query("drop trigger reject_brand_audit on account_security_events; drop function reject_brand_audit()");

  const countsAfter = (await pool.query(`
    select
      (select count(*)::int from schools) schools,
      (select count(*)::int from app_users) users,
      (select count(*)::int from auth_sessions) sessions,
      (select count(*)::int from book_access) access
  `)).rows[0];
  assert.deepEqual(countsAfter, countsBefore);
});
