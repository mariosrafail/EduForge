import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { hashToken, sessionCookieName } from "../../netlify/functions/_auth-utils.js";
import { clearCapturedEmailsForTests, getCapturedEmailsForTests } from "../../netlify/functions/_email-utils.js";
import { handler as importUsers } from "../../netlify/functions/user-import.js";
import { handler as tokenCheck } from "../../netlify/functions/account-token-check.js";
import { handler as setPassword } from "../../netlify/functions/account-set-password.js";
import { handler as signIn } from "../../netlify/functions/auth-signin.js";
import { handler as invite } from "../../netlify/functions/account-invite.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";

function scoped(base, schema) {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function parse(response) {
  return { status: response.statusCode, body: JSON.parse(response.body || "{}"), headers: response.headers || {} };
}

async function call(handler, { action, body = {}, cookie = "", origin = "http://localhost:8888", ip = "127.0.20.1" } = {}) {
  const query = action ? { action } : {};
  return parse(await handler({
    httpMethod: "POST",
    headers: { host: "localhost:8888", cookie, origin, "x-nf-client-connection-ip": ip },
    queryStringParameters: query,
    rawQuery: new URLSearchParams(query).toString(),
    body: JSON.stringify(body),
  }));
}

async function session(pool, userId) {
  const token = randomBytes(24).toString("hex");
  await pool.query("insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')", [userId, hashToken(token)]);
  return `${sessionCookieName}=${token}`;
}

function row(number, name, email, role, level = "") {
  return { rowNumber: number, fullName: name, email, role, level };
}

test("CSV user import is atomic, invitation-only, race-safe, recoverable, and tenant-scoped", { skip: !enabled, timeout: 180_000 }, async (t) => {
  const schema = `user_import_${randomBytes(6).toString("hex")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema) });
  const previous = Object.fromEntries([
    "DATABASE_URL",
    "APP_PUBLIC_URL",
    "ACCOUNT_EMAIL_MODE",
    "ACCOUNT_INVITATIONS_ENABLED",
    "LOCAL_DATABASE_CONFIRMATION",
  ].map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    DATABASE_URL: scoped(databaseUrl, schema),
    APP_PUBLIC_URL: "http://localhost:8888",
    ACCOUNT_EMAIL_MODE: "capture",
    ACCOUNT_INVITATIONS_ENABLED: "true",
    LOCAL_DATABASE_CONFIRMATION: "isolated-local-pilot",
  });
  clearCapturedEmailsForTests();
  t.after(async () => {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
    await pool.end();
    await adminPool.query(`drop schema if exists "${schema}" cascade`);
    await adminPool.end();
  });

  await applyCanonicalProductionMigrations(pool);

  const schools = (await pool.query("insert into schools(name) values('Import School A'),('Import School B') returning id")).rows;
  const passwordHash = await bcrypt.hash("Admin-Import-2026", 4);
  const admins = (await pool.query(
    "insert into app_users(school_id,full_name,email,role,status,password_hash) values($1,'Admin A','admin-a@import.invalid','admin','active',$3),($2,'Admin B','admin-b@import.invalid','admin','active',$3) returning id,school_id",
    [schools[0].id, schools[1].id, passwordHash],
  )).rows;
  const adminCookie = await session(pool, admins[0].id);
  const adminBCookie = await session(pool, admins[1].id);

  const batch = [
    row(2, "Teacher One", "teacher-one@import.invalid", "Teacher", "B2"),
    row(3, "Teacher Two", "teacher-two@import.invalid", "teacher", "C1"),
    row(4, "Student One", "student-one@import.invalid", "Student", "A1"),
    row(5, "Student Two", "student-two@import.invalid", "student", "B1+"),
    row(6, "Student Three", "student-three@import.invalid", "Student", ""),
  ];
  const before = {
    users: Number((await pool.query("select count(*) count from app_users")).rows[0].count),
    tokens: Number((await pool.query("select count(*) count from account_tokens")).rows[0].count),
    outbox: Number((await pool.query("select count(*) count from account_email_outbox")).rows[0].count),
    events: Number((await pool.query("select count(*) count from account_security_events")).rows[0].count),
  };
  const preview = await call(importUsers, { action: "preview", cookie: adminCookie, body: { rows: batch } });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.canImport, true);
  assert.deepEqual(preview.body.summary, { total: 5, valid: 5, invalid: 0, duplicateInFile: 0, existingAccounts: 0 });
  assert.equal(Number((await pool.query("select count(*) count from app_users")).rows[0].count), before.users);
  assert.equal(Number((await pool.query("select count(*) count from account_tokens")).rows[0].count), before.tokens);
  assert.equal(Number((await pool.query("select count(*) count from account_email_outbox")).rows[0].count), before.outbox);
  assert.equal(Number((await pool.query("select count(*) count from account_security_events")).rows[0].count), before.events);

  const committed = await call(importUsers, { action: "commit", cookie: adminCookie, body: { rows: batch } });
  assert.equal(committed.status, 201);
  assert.deepEqual(committed.body.summary, { created: 5, delivered: 5, failedDelivery: 0 });
  assert.equal(JSON.stringify(committed.body).includes("token"), false);
  assert.equal(JSON.stringify(committed.body).includes("outbox"), false);
  assert.equal(JSON.stringify(committed.body).includes("preview_url"), false);

  const emails = batch.map((entry) => entry.email);
  const imported = (await pool.query(
    "select id,school_id,email,role,level,status,password_hash,auth_provider,invited_by from app_users where email=any($1::text[]) order by email",
    [emails],
  )).rows;
  assert.equal(imported.length, 5);
  assert.deepEqual(imported.reduce((counts, user) => ({ ...counts, [user.role]: (counts[user.role] || 0) + 1 }), {},), { student: 3, teacher: 2 });
  assert.ok(imported.every((user) => user.school_id === schools[0].id && user.status === "invited" && user.password_hash === null && user.auth_provider === "password" && user.invited_by === admins[0].id));
  const importedIds = imported.map((user) => user.id);
  assert.equal(Number((await pool.query("select count(*) count from account_tokens where user_id=any($1::uuid[]) and purpose='initial_password'", [importedIds])).rows[0].count), 5);
  assert.equal(Number((await pool.query("select count(*) count from account_email_outbox where user_id=any($1::uuid[]) and template_type='account_invitation'", [importedIds])).rows[0].count), 5);
  assert.equal(Number((await pool.query("select count(*) count from account_security_events where user_id=any($1::uuid[]) and event_type='invitation_issued'", [importedIds])).rows[0].count), 5);
  const batchEvent = (await pool.query("select metadata from account_security_events where school_id=$1 and event_type='user_csv_import_completed'", [schools[0].id])).rows[0];
  assert.deepEqual(batchEvent.metadata, { requested_row_count: 5, created_row_count: 5, teacher_count: 2, student_count: 3 });
  assert.equal(Number((await pool.query("select count(*) count from auth_sessions where user_id=any($1::uuid[])", [importedIds])).rows[0].count), 0);
  assert.equal(Number((await pool.query("select count(*) count from class_students where student_id=any($1::uuid[])", [importedIds])).rows[0].count), 0);
  assert.equal(Number((await pool.query("select count(*) count from book_access where user_id=any($1::uuid[])", [importedIds])).rows[0].count), 0);

  const captured = getCapturedEmailsForTests();
  assert.equal(captured.length, 5);
  const rawToken = new URL(captured.find((email) => email.recipient === "student-one@import.invalid").actionUrl).hash.split("token=")[1];
  assert.ok(rawToken);
  assert.equal(JSON.stringify((await pool.query("select token_hash,metadata from account_tokens where user_id=any($1::uuid[])", [importedIds])).rows).includes(rawToken), false);
  assert.equal((await call(signIn, { body: { email: "student-one@import.invalid", password: "Student-Imported-2026" }, ip: "127.0.20.2" })).status, 401);
  assert.equal((await call(tokenCheck, { body: { token: rawToken, purpose: "initial_password" }, ip: "127.0.20.3" })).status, 200);
  const accepted = await call(setPassword, { body: { token: rawToken, password: "Student-Imported-2026" }, ip: "127.0.20.4" });
  assert.equal(accepted.status, 200);
  const signedIn = await call(signIn, { body: { email: "student-one@import.invalid", password: "Student-Imported-2026" }, ip: "127.0.20.5" });
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body.user.school_id, schools[0].id);

  const hidden = await call(importUsers, { action: "preview", cookie: adminBCookie, body: { rows: [row(2, "Hidden", emails[0], "student")] } });
  assert.equal(hidden.status, 200);
  assert.deepEqual(hidden.body.rows[0].errors, [{ code: "account_exists", message: "An account with this email already exists" }]);
  assert.equal(JSON.stringify(hidden.body).includes(schools[0].id), false);

  const staleRows = [
    row(2, "Stale Conflict", "stale-conflict@import.invalid", "student"),
    row(3, "Stale Other", "stale-other@import.invalid", "teacher"),
  ];
  assert.equal((await call(importUsers, { action: "preview", cookie: adminCookie, body: { rows: staleRows } })).body.canImport, true);
  await pool.query("insert into app_users(school_id,full_name,email,role,status) values($1,'Concurrent Existing',$2,'student','invited')", [schools[1].id, staleRows[0].email]);
  assert.equal((await call(importUsers, { action: "commit", cookie: adminCookie, body: { rows: staleRows } })).status, 409);
  assert.equal(Number((await pool.query("select count(*) count from app_users where email=$1", [staleRows[1].email])).rows[0].count), 0);

  const raceEmail = "race-import@import.invalid";
  const races = await Promise.all([
    call(importUsers, { action: "commit", cookie: adminCookie, body: { rows: [row(2, "Race A", raceEmail, "student")] }, ip: "127.0.20.10" }),
    call(importUsers, { action: "commit", cookie: adminBCookie, body: { rows: [row(2, "Race B", raceEmail, "teacher")] }, ip: "127.0.20.11" }),
  ]);
  assert.deepEqual(races.map((result) => result.status).sort(), [201, 409]);
  const raceUser = (await pool.query("select id,school_id from app_users where email=$1", [raceEmail])).rows[0];
  assert.ok([schools[0].id, schools[1].id].includes(raceUser.school_id));
  assert.equal(Number((await pool.query("select count(*) count from account_tokens where user_id=$1", [raceUser.id])).rows[0].count), 1);
  assert.equal(Number((await pool.query("select count(*) count from account_email_outbox where user_id=$1", [raceUser.id])).rows[0].count), 1);

  await pool.query(`
    create function reject_import_fixture() returns trigger language plpgsql as $$
    begin
      if new.recipient_email = 'rollback@import.invalid' then raise exception 'injected outbox failure';
      end if;
      return new;
    end $$;
    create trigger reject_import_fixture before insert on account_email_outbox
      for each row execute function reject_import_fixture()
  `);
  const rollbackRows = [
    row(2, "Rollback User", "rollback@import.invalid", "student"),
    row(3, "Rollback Peer", "rollback-peer@import.invalid", "teacher"),
  ];
  assert.equal((await call(importUsers, { action: "commit", cookie: adminCookie, body: { rows: rollbackRows } })).status, 500);
  assert.equal(Number((await pool.query("select count(*) count from app_users where email=any($1::text[])", [rollbackRows.map((entry) => entry.email)])).rows[0].count), 0);
  await pool.query("drop trigger reject_import_fixture on account_email_outbox");

  const rollbackStages = [
    {
      label: "user",
      table: "app_users",
      condition: "new.email = 'rollback-user-stage@import.invalid'",
      rows: [
        row(2, "Rollback User Stage", "rollback-user-stage@import.invalid", "student"),
        row(3, "Rollback User Peer", "rollback-user-peer@import.invalid", "teacher"),
      ],
    },
    {
      label: "token",
      table: "account_tokens",
      condition: "new.purpose = 'initial_password'",
      rows: [
        row(2, "Rollback Token Stage", "rollback-token-stage@import.invalid", "student"),
        row(3, "Rollback Token Peer", "rollback-token-peer@import.invalid", "teacher"),
      ],
    },
    {
      label: "audit",
      table: "account_security_events",
      condition: "new.event_type = 'user_csv_import_completed'",
      rows: [
        row(2, "Rollback Audit Stage", "rollback-audit-stage@import.invalid", "student"),
        row(3, "Rollback Audit Peer", "rollback-audit-peer@import.invalid", "teacher"),
      ],
    },
  ];
  for (const fixture of rollbackStages) {
    await pool.query(`
      create function reject_${fixture.label}_fixture() returns trigger language plpgsql as $$
      begin
        if ${fixture.condition} then raise exception 'injected ${fixture.label} failure';
        end if;
        return new;
      end $$;
      create trigger reject_${fixture.label}_fixture before insert on ${fixture.table}
        for each row execute function reject_${fixture.label}_fixture()
    `);
    assert.equal((await call(importUsers, { action: "commit", cookie: adminCookie, body: { rows: fixture.rows } })).status, 500);
    assert.equal(Number((await pool.query("select count(*) count from app_users where email=any($1::text[])", [fixture.rows.map((entry) => entry.email)])).rows[0].count), 0);
    await pool.query(`drop trigger reject_${fixture.label}_fixture on ${fixture.table}`);
  }

  process.env.ACCOUNT_EMAIL_MODE = "smtp";
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) delete process.env[key];
  const failureEmail = "delivery-failure-import@import.invalid";
  const deliveryFailure = await call(importUsers, { action: "commit", cookie: adminCookie, body: { rows: [row(2, "Delivery Failure", failureEmail, "student")] } });
  assert.equal(deliveryFailure.status, 201);
  assert.deepEqual(deliveryFailure.body.summary, { created: 1, delivered: 0, failedDelivery: 1 });
  assert.equal((await pool.query("select status from app_users where email=$1", [failureEmail])).rows[0].status, "invited");
  assert.equal((await pool.query("select delivery_state from account_email_outbox where recipient_email=$1", [failureEmail])).rows[0].delivery_state, "failed");
  process.env.ACCOUNT_EMAIL_MODE = "capture";
  assert.equal((await call(invite, { cookie: adminCookie, body: { email: failureEmail, resend: true }, ip: "127.0.20.20" })).status, 200);
});
