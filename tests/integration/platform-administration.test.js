import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import bcrypt from "bcryptjs";
import pg from "pg";
import { hashToken, sessionCookieName, setSqlForTests } from "../../netlify/functions/_auth-utils.js";
import { platformAdminCookieName } from "../../netlify/functions/_platform-admin-auth.js";
import { handler as platformAuth } from "../../netlify/functions/platform-admin-auth.js";
import { handler as platformApi } from "../../netlify/functions/platform-admin.js";
import { handler as ordinarySignin } from "../../netlify/functions/auth-signin.js";
import { handler as ordinaryMe } from "../../netlify/functions/auth-me.js";
import { handler as accountTokenCheck } from "../../netlify/functions/account-token-check.js";
import { handler as accountSetPassword } from "../../netlify/functions/account-set-password.js";
import { handler as schoolUsers } from "../../netlify/functions/users.js";
import { handler as schoolUser } from "../../netlify/functions/user.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";
import {
  clearCapturedEmailsForTests,
  getCapturedEmailsForTests,
  setEmailTransportForTests,
} from "../../netlify/functions/_email-utils.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const { Pool } = pg;

function scoped(base, schema) {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function tag(pool) {
  const queryTemplate = (queryable) => async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await queryable.query(text, values)).rows;
  };
  const template = queryTemplate(pool);
  template.authLoginTransaction = async (lockValues, callback) => {
    const client = await pool.connect();
    const transactionSql = queryTemplate(client);
    try {
      await client.query("begin");
      await transactionSql`
        select pg_advisory_xact_lock(lock_key)
        from (
          select distinct hashtextextended(value, 0) as lock_key
          from unnest(${lockValues}::text[]) value
        ) locks
        order by lock_key
      `;
      const result = await callback(transactionSql);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  template.schoolProvisioningTransaction = async (email, callback) => {
    const client = await pool.connect();
    const transactionSql = queryTemplate(client);
    try {
      await client.query("begin");
      await transactionSql`select pg_advisory_xact_lock(hashtextextended(${"school-provisioning:" + email}, 0))`;
      const result = await callback(transactionSql);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  return template;
}

function parse(response) {
  return { status: response.statusCode, body: JSON.parse(response.body || "{}"), headers: response.headers || {} };
}

async function call(handler, { method = "GET", query = {}, body = {}, cookie = "", ip = "127.0.8.1", origin = true } = {}) {
  return parse(await handler({
    httpMethod: method,
    headers: {
      host: "localhost:8888",
      cookie,
      "x-nf-client-connection-ip": ip,
      "user-agent": "Hamilton House LMS isolated integration",
      ...(origin ? { origin: "http://localhost:8888" } : {}),
    },
    queryStringParameters: query,
    rawQuery: new URLSearchParams(query).toString(),
    body: method === "GET" ? "" : JSON.stringify(body),
  }));
}

async function ordinarySession(pool, userId) {
  const token = randomBytes(24).toString("hex");
  await pool.query("insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')", [userId, hashToken(token)]);
  return `${sessionCookieName}=${token}`;
}

test("dedicated Platform Administration enforces cross-tenant capability without ordinary-role escalation", { skip: !enabled, timeout: 120_000 }, async (t) => {
  assert.notEqual(testDatabaseUrl, process.env.DATABASE_URL);
  const schema = `platform_admin_${randomBytes(6).toString("hex")}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const databaseUrl = scoped(testDatabaseUrl, schema);
  const pool = new Pool({ connectionString: databaseUrl });
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    LOCAL_DATABASE_CONFIRMATION: process.env.LOCAL_DATABASE_CONFIRMATION,
    PLATFORM_ADMIN_RATE_LIMIT_SALT: process.env.PLATFORM_ADMIN_RATE_LIMIT_SALT,
    ACCOUNT_RATE_LIMIT_SALT: process.env.ACCOUNT_RATE_LIMIT_SALT,
    ACCOUNT_EMAIL_MODE: process.env.ACCOUNT_EMAIL_MODE,
    APP_PUBLIC_URL: process.env.APP_PUBLIC_URL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM,
  };
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    LOCAL_DATABASE_CONFIRMATION: "isolated-local-pilot",
    PLATFORM_ADMIN_RATE_LIMIT_SALT: "isolated-platform-admin-integration-rate-limit",
    ACCOUNT_RATE_LIMIT_SALT: "isolated-account-lifecycle-integration-rate-limit",
    ACCOUNT_EMAIL_MODE: "capture",
    APP_PUBLIC_URL: "http://localhost:8888",
  });
  setSqlForTests(tag(pool));
  clearCapturedEmailsForTests();
  t.after(async () => {
    setSqlForTests(null);
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await pool.end();
    await adminPool.query(`drop schema if exists "${schema}" cascade`);
    await adminPool.end();
  });

  await applyCanonicalProductionMigrations(pool);

  const platformColumns = (await pool.query("select column_name from information_schema.columns where table_schema=$1 and table_name='platform_admins'", [schema])).rows.map((row) => row.column_name);
  assert.equal(platformColumns.includes("school_id"), false);
  assert.equal((await pool.query("select to_regclass('platform_admin_sessions') is not null exists")).rows[0].exists, true);

  const schools = (await pool.query("insert into schools(name) values('Athens Test'),('Piraeus Test'),('Thessaloniki Test') returning id,name")).rows;
  const athens = schools.find((item) => item.name.startsWith("Athens"));
  const piraeus = schools.find((item) => item.name.startsWith("Piraeus"));
  const ordinaryHash = await bcrypt.hash("Ordinary-Safe-2026!", 4);
  const users = (await pool.query(`
    insert into app_users(school_id,full_name,email,role,status,password_hash,auth_provider) values
      ($1,'Athens Admin','athens-admin@platform.test','admin','active',$3,'password'),
      ($1,'Athens Teacher','athens-teacher@platform.test','teacher','active',$3,'password'),
      ($1,'Athens Student','athens-student@platform.test','student','active',$3,'password'),
      ($2,'Piraeus Admin','piraeus-admin@platform.test','admin','active',$3,'password')
    returning id,school_id,email,role
  `, [athens.id, piraeus.id, ordinaryHash])).rows;
  const platformHash = await bcrypt.hash("Platform-Safe-2026!", 4);
  const platformAdminId = (await pool.query(`
    insert into platform_admins(full_name,email,password_hash,status)
    values('Platform Operator','operator@platform.test',$1,'active') returning id
  `, [platformHash])).rows[0].id;

  const cookies = {};
  for (const user of users) cookies[user.role + (user.school_id === piraeus.id ? "-piraeus" : "")] = await ordinarySession(pool, user.id);
  assert.equal((await call(platformApi)).status, 401);
  assert.equal((await call(platformApi, { cookie: cookies.admin })).status, 401);
  assert.equal((await call(platformApi, { cookie: cookies.teacher })).status, 401);
  assert.equal((await call(platformApi, { cookie: cookies.student })).status, 401);
  const invalidPlatformCookie = `${platformAdminCookieName}=unknown-platform-session`;
  assert.equal((await call(platformApi, { cookie: invalidPlatformCookie })).status, 401);
  assert.equal((await call(platformApi, { cookie: `${cookies.admin}; ${invalidPlatformCookie}` })).status, 401);

  const unknown = await call(platformAuth, { method: "POST", query: { action: "login" }, body: { email: "missing@platform.test", password: "wrong" }, ip: "127.0.8.20" });
  const wrong = await call(platformAuth, { method: "POST", query: { action: "login" }, body: { email: "operator@platform.test", password: "wrong" }, ip: "127.0.8.21" });
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
  assert.equal((await call(platformAuth, { method: "POST", query: { action: "login" }, body: { email: "operator@platform.test", password: "Platform-Safe-2026!" }, origin: false })).status, 403);

  const login = await call(platformAuth, { method: "POST", query: { action: "login" }, body: { email: "operator@platform.test", password: "Platform-Safe-2026!" }, ip: "127.0.8.22" });
  assert.equal(login.status, 200);
  const platformCookie = login.headers["Set-Cookie"].split(";")[0];
  assert.match(platformCookie, new RegExp(`^${platformAdminCookieName}=`));
  assert.equal((await call(ordinaryMe, { cookie: platformCookie })).status, 401);
  assert.equal((await call(platformAuth, { query: { action: "me" }, cookie: platformCookie })).status, 200);
  assert.equal((await call(platformApi, { cookie: `${cookies.admin}; ${platformCookie}`, query: { action: "overview" } })).status, 200);

  const forbiddenMutation = await call(platformApi, {
    method: "POST",
    cookie: platformCookie,
    origin: false,
    query: { action: "create-school" },
    body: { name: "Must Not Be Created" },
  });
  assert.equal(forbiddenMutation.status, 403);
  assert.equal((await call(platformApi, {
    method: "POST",
    query: { action: "provision-school" },
    body: { name: "Denied School", admin_full_name: "Denied Admin", admin_email: "denied@platform.test" },
  })).status, 401);
  assert.equal((await call(platformApi, {
    method: "POST",
    cookie: cookies.admin,
    query: { action: "provision-school" },
    body: { name: "Denied School", admin_full_name: "Denied Admin", admin_email: "denied@platform.test" },
  })).status, 401);
  assert.equal((await call(platformApi, {
    method: "POST",
    cookie: platformCookie,
    origin: false,
    query: { action: "provision-school" },
    body: { name: "Denied School", admin_full_name: "Denied Admin", admin_email: "denied@platform.test" },
  })).status, 403);
  for (const body of [
    { name: "", admin_full_name: "Valid Admin", admin_email: "valid@platform.test" },
    { name: "Valid School", admin_full_name: "", admin_email: "valid@platform.test" },
    { name: "Valid School", admin_full_name: "Valid Admin", admin_email: "invalid" },
  ]) {
    assert.equal((await call(platformApi, {
      method: "POST", cookie: platformCookie, query: { action: "provision-school" }, body,
    })).status, 400);
  }
  assert.equal((await call(platformAuth, { query: { action: "me" }, cookie: platformCookie })).status, 200);

  const logoutLogin = await call(platformAuth, { method: "POST", query: { action: "login" }, body: { email: "operator@platform.test", password: "Platform-Safe-2026!" }, ip: "127.0.8.23" });
  const logoutCookie = logoutLogin.headers["Set-Cookie"].split(";")[0];
  assert.equal((await call(platformAuth, { method: "POST", query: { action: "logout" }, cookie: logoutCookie })).status, 200);
  assert.equal((await call(platformAuth, { method: "POST", query: { action: "logout" }, cookie: logoutCookie })).status, 200);
  assert.equal((await call(platformAuth, { query: { action: "me" }, cookie: logoutCookie })).status, 401);

  const overview = await call(platformApi, { cookie: platformCookie, query: { action: "overview" } });
  assert.equal(overview.body.overview.schools, 4);
  assert.equal(overview.body.overview.schoolAdmins, 3);
  const allUsers = await call(platformApi, { cookie: platformCookie, query: { action: "users", pageSize: "100" } });
  assert.equal(allUsers.body.users.length, 7);

  const provisioned = await call(platformApi, {
    method: "POST",
    cookie: platformCookie,
    query: { action: "provision-school" },
    body: {
      name: "Temporary Platform School",
      admin_full_name: "Temporary School Admin",
      admin_email: "TEMPORARY-ADMIN@PLATFORM.TEST",
      role: "teacher",
      status: "active",
      password: "request-must-not-control-this",
      school_id: athens.id,
    },
  });
  assert.equal(provisioned.status, 201);
  assert.equal(provisioned.body.school.status, "active");
  assert.equal(provisioned.body.administrator.role, "admin");
  assert.equal(provisioned.body.administrator.status, "invited");
  assert.equal(provisioned.body.delivery_status, "captured");
  assert.equal(provisioned.body.preview_url, undefined);
  const temporarySchoolId = provisioned.body.school.id;
  const temporaryAdminId = provisioned.body.administrator.id;
  const provisionedUser = (await pool.query("select * from app_users where id=$1", [temporaryAdminId])).rows[0];
  assert.equal(provisionedUser.email, "temporary-admin@platform.test");
  assert.equal(provisionedUser.password_hash, null);
  assert.equal(provisionedUser.auth_provider, "password");
  assert.equal((await pool.query("select count(*)::int count from auth_sessions where user_id=$1", [temporaryAdminId])).rows[0].count, 0);
  const tokenRows = (await pool.query("select purpose,token_hash from account_tokens where user_id=$1", [temporaryAdminId])).rows;
  assert.equal(tokenRows.length, 1);
  assert.equal(tokenRows[0].purpose, "initial_password");
  assert.match(tokenRows[0].token_hash, /^[a-f0-9]{64}$/);
  assert.equal((await pool.query("select count(*)::int count from account_email_outbox where user_id=$1 and template_type='account_invitation'", [temporaryAdminId])).rows[0].count, 1);
  assert.equal((await call(ordinarySignin, { method: "POST", body: { email: "temporary-admin@platform.test", password: "Ordinary-Safe-2026!" } })).status, 401);

  const captured = getCapturedEmailsForTests().find((message) => message.recipient === "temporary-admin@platform.test");
  assert.ok(captured);
  const invitationToken = new URL(captured.actionUrl).hash.match(/[?&]token=([^&]+)/)?.[1];
  assert.ok(invitationToken);
  assert.notEqual(tokenRows[0].token_hash, invitationToken);
  assert.equal((await call(accountTokenCheck, { method: "POST", body: { token: invitationToken, purpose: "initial_password" } })).status, 200);
  const weakPassword = await call(accountSetPassword, { method: "POST", body: { token: invitationToken, password: "short" } });
  assert.equal(weakPassword.status, 400);
  const accepted = await call(accountSetPassword, { method: "POST", body: { token: invitationToken, password: "Ordinary-Safe-2026!" } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.user.status, "active");
  assert.match(accepted.headers["Set-Cookie"], new RegExp(`^${sessionCookieName}=`));

  const countSchools = async (name) => Number((await pool.query("select count(*) count from schools where name=$1", [name])).rows[0].count);
  const duplicate = await call(platformApi, {
    method: "POST", cookie: platformCookie, query: { action: "provision-school" },
    body: { name: "Must Not Survive Duplicate", admin_full_name: "Duplicate Admin", admin_email: "temporary-admin@platform.test" },
  });
  assert.equal(duplicate.status, 409);
  assert.equal(await countSchools("Must Not Survive Duplicate"), 0);

  const concurrentName = "Concurrent Provisioning School";
  const concurrentBody = {
    name: concurrentName,
    admin_full_name: "Concurrent Admin",
    admin_email: "concurrent-admin@platform.test",
  };
  const concurrent = await Promise.all([
    call(platformApi, { method: "POST", cookie: platformCookie, query: { action: "provision-school" }, body: concurrentBody, ip: "127.0.8.51" }),
    call(platformApi, { method: "POST", cookie: platformCookie, query: { action: "provision-school" }, body: concurrentBody, ip: "127.0.8.52" }),
  ]);
  assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409]);
  assert.equal(await countSchools(concurrentName), 1);
  assert.equal((await pool.query("select count(*)::int count from app_users where email='concurrent-admin@platform.test'")).rows[0].count, 1);

  await pool.query(`
    create function fail_provisioning_token() returns trigger language plpgsql as $$
    begin
      if new.user_id in (select id from app_users where email='rollback-admin@platform.test') then
        raise exception 'injected provisioning failure';
      end if;
      return new;
    end $$;
    create trigger fail_provisioning_token before insert on account_tokens
    for each row execute function fail_provisioning_token()
  `);
  const rollback = await call(platformApi, {
    method: "POST", cookie: platformCookie, query: { action: "provision-school" },
    body: { name: "Rollback Provisioning School", admin_full_name: "Rollback Admin", admin_email: "rollback-admin@platform.test" },
  });
  assert.equal(rollback.status, 500);
  await pool.query("drop trigger fail_provisioning_token on account_tokens; drop function fail_provisioning_token()");
  assert.equal(await countSchools("Rollback Provisioning School"), 0);
  assert.equal((await pool.query("select count(*)::int count from app_users where email='rollback-admin@platform.test'")).rows[0].count, 0);
  assert.equal((await pool.query("select count(*)::int count from platform_admin_audit_log where action='school_provisioned' and target_id in (select id::text from schools where name='Rollback Provisioning School')")).rows[0].count, 0);

  process.env.ACCOUNT_EMAIL_MODE = "smtp";
  Object.assign(process.env, {
    SMTP_HOST: "smtp.invalid", SMTP_PORT: "587", SMTP_SECURE: "false",
    SMTP_USER: "isolated", SMTP_PASS: "isolated", SMTP_FROM: "Hamilton House LMS <noreply@example.test>",
  });
  setEmailTransportForTests({ sendMail: async () => { throw new Error("isolated delivery failure"); } });
  const deliveryFailure = await call(platformApi, {
    method: "POST", cookie: platformCookie, query: { action: "provision-school" },
    body: { name: "Delivery Failure School", admin_full_name: "Delivery Failure Admin", admin_email: "delivery-failure@platform.test" },
  });
  setEmailTransportForTests(null);
  process.env.ACCOUNT_EMAIL_MODE = "capture";
  assert.equal(deliveryFailure.status, 201);
  assert.equal(deliveryFailure.body.delivery_status, "failed");
  assert.equal(deliveryFailure.body.preview_url, undefined);
  assert.equal((await pool.query("select status from app_users where email='delivery-failure@platform.test'")).rows[0].status, "invited");
  assert.equal((await pool.query("select delivery_state from account_email_outbox where user_id=$1", [deliveryFailure.body.administrator.id])).rows[0].delivery_state, "failed");

  const temporaryLogin = await call(ordinarySignin, { method: "POST", body: { email: "temporary-admin@platform.test", password: "Ordinary-Safe-2026!" } });
  assert.equal(temporaryLogin.status, 200);
  const temporaryCookie = temporaryLogin.headers["Set-Cookie"].split(";")[0];
  const paused = await call(platformApi, { method: "POST", cookie: platformCookie, query: { action: "school-status" }, body: { id: temporarySchoolId, status: "paused" } });
  assert.equal(paused.status, 200);
  assert.equal((await call(ordinaryMe, { cookie: temporaryCookie })).status, 401);
  assert.equal((await call(ordinarySignin, { method: "POST", body: { email: "temporary-admin@platform.test", password: "Ordinary-Safe-2026!" } })).status, 403);
  assert.equal((await pool.query("select status from app_users where id=$1", [temporaryAdminId])).rows[0].status, "active");

  assert.equal((await call(platformApi, { method: "POST", cookie: platformCookie, query: { action: "school-status" }, body: { id: temporarySchoolId, status: "active" } })).status, 200);
  const restoredLogin = await call(ordinarySignin, { method: "POST", body: { email: "temporary-admin@platform.test", password: "Ordinary-Safe-2026!" } });
  assert.equal(restoredLogin.status, 200);
  const restoredCookie = restoredLogin.headers["Set-Cookie"].split(";")[0];
  assert.equal((await call(platformApi, { method: "POST", cookie: platformCookie, query: { action: "revoke-user-sessions" }, body: { id: temporaryAdminId } })).status, 200);
  assert.equal((await call(ordinaryMe, { cookie: restoredCookie })).status, 401);

  const athensAdminCookie = cookies.admin;
  const ownUsers = await call(schoolUsers, { cookie: athensAdminCookie });
  assert.equal(ownUsers.status, 200);
  assert.equal(ownUsers.body.users.every((user) => user.school_id === undefined || user.school_id === athens.id), true);
  assert.equal((await call(schoolUser, { cookie: athensAdminCookie, query: { id: users.find((user) => user.school_id === piraeus.id).id } })).status, 404);
  assert.equal((await call(platformApi, { cookie: platformCookie, query: { action: "teacher-solutions" } })).status, 404);

  await pool.query("update platform_admins set status='paused' where id=$1", [platformAdminId]);
  assert.equal((await call(platformAuth, { query: { action: "me" }, cookie: platformCookie })).status, 401);
  await pool.query("update platform_admins set status='active' where id=$1", [platformAdminId]);
  assert.equal((await call(platformAuth, { query: { action: "me" }, cookie: platformCookie })).status, 200);

  const audit = (await pool.query("select action,metadata::text metadata from platform_admin_audit_log where platform_admin_id=$1", [platformAdminId])).rows;
  for (const action of ["login_succeeded", "school_provisioned", "school_paused", "school_reactivated", "ordinary_sessions_revoked"]) {
    assert.equal(audit.some((row) => row.action === action), true, `missing audit action ${action}`);
  }
  assert.doesNotMatch(JSON.stringify(audit), /Platform-Safe-2026|Ordinary-Safe-2026|hh_platform_admin_session/);
  const provisioningAudit = audit.find((row) => row.action === "school_provisioned");
  assert.ok(provisioningAudit);
  assert.match(provisioningAudit.metadata, /"initial_admin_role": "admin"/);
  assert.match(provisioningAudit.metadata, /"initial_admin_status": "invited"/);
  assert.match(provisioningAudit.metadata, /"provisioning_source": "platform_admin"/);
  assert.doesNotMatch(JSON.stringify(audit), /temporary-admin@platform\.test|token|password|session_id|cookie|127\.0\./i);

  const sessionTokenHash = (await pool.query("select token_hash from platform_admin_sessions where platform_admin_id=$1 and revoked_at is null limit 1", [platformAdminId])).rows[0].token_hash;
  await pool.query("update platform_admin_sessions set created_at=now()-interval '9 hours',last_seen_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' where token_hash=$1", [sessionTokenHash]);
  assert.equal((await call(platformAuth, { query: { action: "me" }, cookie: platformCookie })).status, 401);
  await pool.query("update platform_admins set status='paused' where id=$1", [platformAdminId]);
  assert.equal((await call(platformAuth, { method: "POST", query: { action: "login" }, body: { email: "operator@platform.test", password: "Platform-Safe-2026!" }, ip: "127.0.8.30" })).status, 401);

  for (let index = 0; index < 5; index += 1) {
    await call(platformAuth, { method: "POST", query: { action: "login" }, body: { email: "rate-limit@platform.test", password: "wrong" }, ip: "127.0.8.40" });
  }
  const limited = await call(platformAuth, { method: "POST", query: { action: "login" }, body: { email: "rate-limit@platform.test", password: "wrong" }, ip: "127.0.8.40" });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers["Retry-After"]) >= 1);
  assert.ok(Number(limited.headers["Retry-After"]) <= 900);
});
