import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import bcrypt from "bcryptjs";
import pg from "pg";
import {
  authLoginAccountLimit,
  authLoginIdentifiers,
  authLoginPairLimit,
  authLoginSourceLimit,
} from "../../netlify/functions/_auth-login-rate-limit.js";
import { setSqlForTests } from "../../netlify/functions/_auth-utils.js";
import { handler as signIn } from "../../netlify/functions/auth-signin.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const password = "Ordinary-Login-Test-2026!";
const testSalt = "isolated-integration-ordinary-auth-rate-limit-only";

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
  return template;
}

function parse(response) {
  return { status: response.statusCode, body: JSON.parse(response.body || "{}"), headers: response.headers || {} };
}

async function call({ email, suppliedPassword = "wrong", ip = "127.0.7.1", method = "POST", rawBody = null } = {}) {
  return parse(await signIn({
    httpMethod: method,
    headers: { host: "localhost:8888", "x-nf-client-connection-ip": ip },
    body: rawBody ?? JSON.stringify({ email, password: suppliedPassword }),
  }));
}

async function insertUser(pool, schoolId, {
  email,
  status = "active",
  role = "student",
  passwordHash,
} = {}) {
  return (await pool.query(`
    insert into app_users(school_id,full_name,email,role,status,password_hash,auth_provider)
    values($1,$2,$3,$4,$5,$6,'password')
    returning id,email
  `, [schoolId, email.split("@")[0], email, role, status, passwordHash])).rows[0];
}

test("ordinary sign-in limiter is distributed, atomic, recoverable, and privacy preserving", {
  skip: !enabled,
  timeout: 180_000,
}, async (t) => {
  assert.notEqual(testDatabaseUrl, process.env.DATABASE_URL);
  const schema = `auth_login_${randomBytes(6).toString("hex")}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const databaseUrl = scoped(testDatabaseUrl, schema);
  const pool = new Pool({ connectionString: databaseUrl, max: 30 });
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    LOCAL_DATABASE_CONFIRMATION: process.env.LOCAL_DATABASE_CONFIRMATION,
    AUTH_RATE_LIMIT_SALT: process.env.AUTH_RATE_LIMIT_SALT,
  };
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    LOCAL_DATABASE_CONFIRMATION: "isolated-local-pilot",
    AUTH_RATE_LIMIT_SALT: testSalt,
  });
  setSqlForTests(tag(pool));
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

  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "048_ultimate_b2_product_publication.sql");

  const columns = (await pool.query(`
    select column_name from information_schema.columns
    where table_schema=$1 and table_name='auth_login_attempts'
    order by ordinal_position
  `, [schema])).rows.map((row) => row.column_name);
  assert.deepEqual(columns, ["id", "user_id", "request_fingerprint", "email_hash", "outcome", "attempted_at"]);
  const indexes = new Set((await pool.query(`
    select indexname from pg_indexes where schemaname=$1 and tablename='auth_login_attempts'
  `, [schema])).rows.map((row) => row.indexname));
  for (const index of [
    "auth_login_attempts_source_failure_idx",
    "auth_login_attempts_email_failure_idx",
    "auth_login_attempts_pair_failure_idx",
    "auth_login_attempts_email_success_idx",
    "auth_login_attempts_pending_idx",
    "auth_login_attempts_retention_idx",
  ]) assert.equal(indexes.has(index), true, `missing ${index}`);

  const schools = (await pool.query("insert into schools(name) values('Limiter Active'),('Limiter Paused') returning id,name")).rows;
  const activeSchool = schools[0];
  const pausedSchool = schools[1];
  await pool.query("update schools set status='paused' where id=$1", [pausedSchool.id]);
  const passwordHash = await bcrypt.hash(password, 4);

  const pairUser = await insertUser(pool, activeSchool.id, { email: "pair@auth-limit.test", passwordHash });
  const pairIp = "127.0.7.10";
  for (let index = 1; index < authLoginPairLimit; index += 1) {
    assert.equal((await call({ email: pairUser.email, ip: pairIp })).status, 401);
  }
  const pairThreshold = await call({ email: pairUser.email, ip: pairIp });
  assert.equal(pairThreshold.status, 429);
  assert.ok(Number(pairThreshold.headers["Retry-After"]) >= 1);
  assert.ok(Number(pairThreshold.headers["Retry-After"]) <= 900);
  assert.deepEqual(pairThreshold.body, { error: "Too many login attempts. Try again later." });
  assert.equal((await call({ email: pairUser.email, ip: pairIp, suppliedPassword: password })).status, 429);

  const pairIdentifiers = authLoginIdentifiers(
    { headers: { "x-nf-client-connection-ip": pairIp } },
    pairUser.email,
  );
  await pool.query(`
    update auth_login_attempts
    set attempted_at=now()-interval '14 minutes 50 seconds'
    where request_fingerprint=$1 and email_hash=$2 and outcome='invalid_credentials'
  `, [pairIdentifiers.requestFingerprint, pairIdentifiers.emailHash]);
  const bounded = await call({ email: pairUser.email, ip: pairIp });
  assert.equal(bounded.status, 429);
  assert.ok(Number(bounded.headers["Retry-After"]) >= 1 && Number(bounded.headers["Retry-After"]) <= 11);
  for (let index = 0; index < 3; index += 1) assert.equal((await call({ email: pairUser.email, ip: pairIp })).status, 429);
  await pool.query(`
    update auth_login_attempts
    set attempted_at=now()-interval '15 minutes'
    where request_fingerprint=$1 and email_hash=$2 and outcome='invalid_credentials'
  `, [pairIdentifiers.requestFingerprint, pairIdentifiers.emailHash]);
  assert.equal((await call({ email: pairUser.email, ip: pairIp })).status, 401);

  const accountUser = await insertUser(pool, activeSchool.id, { email: "distributed@auth-limit.test", passwordHash });
  for (let index = 0; index < authLoginAccountLimit - 1; index += 1) {
    assert.equal((await call({ email: accountUser.email, ip: `127.0.8.${index + 1}` })).status, 401);
  }
  const accountThreshold = await call({ email: accountUser.email, ip: "127.0.8.100" });
  assert.equal(accountThreshold.status, 429);
  assert.equal((await call({ email: accountUser.email, ip: "127.0.8.101" })).status, 429);
  const accountIdentifiers = authLoginIdentifiers(
    { headers: { "x-nf-client-connection-ip": "127.0.8.101" } },
    accountUser.email,
  );
  const accountLimitedRows = await pool.query(`
    select outcome from auth_login_attempts
    where request_fingerprint=$1 and email_hash=$2
    order by attempted_at desc limit 1
  `, [accountIdentifiers.requestFingerprint, accountIdentifiers.emailHash]);
  assert.equal(accountLimitedRows.rows[0].outcome, "rate_limited");
  const recovered = await call({ email: accountUser.email, ip: "127.0.8.102", suppliedPassword: password });
  assert.equal(recovered.status, 200);
  assert.ok(recovered.headers["Set-Cookie"]);
  assert.equal((await call({ email: accountUser.email, ip: "127.0.8.103" })).status, 401);

  const sourceIp = "127.0.9.1";
  const sourceUsers = [];
  for (let index = 0; index < authLoginSourceLimit + 1; index += 1) {
    sourceUsers.push(await insertUser(pool, activeSchool.id, {
      email: `stuffing-${index}@auth-limit.test`,
      passwordHash,
    }));
  }
  for (let index = 0; index < authLoginSourceLimit - 1; index += 1) {
    assert.equal((await call({ email: sourceUsers[index].email, ip: sourceIp })).status, 401);
  }
  assert.equal((await call({ email: sourceUsers[authLoginSourceLimit - 1].email, ip: sourceIp })).status, 429);
  assert.equal((await call({
    email: sourceUsers[authLoginSourceLimit].email,
    ip: sourceIp,
    suppliedPassword: password,
  })).status, 429);

  const concurrentUser = await insertUser(pool, activeSchool.id, { email: "concurrent@auth-limit.test", passwordHash });
  const concurrentIp = "127.0.10.10";
  const concurrent = await Promise.all(Array.from({ length: 12 }, () => call({
    email: concurrentUser.email,
    ip: concurrentIp,
  })));
  assert.equal(concurrent.every((response) => [401, 429].includes(response.status)), true);
  assert.equal(concurrent.some((response) => response.status === 429), true);
  const concurrentIdentifiers = authLoginIdentifiers(
    { headers: { "x-nf-client-connection-ip": concurrentIp } },
    concurrentUser.email,
  );
  const concurrentRows = (await pool.query(`
    select outcome,count(*)::int count from auth_login_attempts
    where request_fingerprint=$1 and email_hash=$2
    group by outcome
  `, [concurrentIdentifiers.requestFingerprint, concurrentIdentifiers.emailHash])).rows;
  assert.ok(Number(concurrentRows.find((row) => row.outcome === "invalid_credentials")?.count || 0) <= authLoginPairLimit);
  assert.equal(Number(concurrentRows.find((row) => row.outcome === "pending")?.count || 0), 0);

  const pausedUser = await insertUser(pool, activeSchool.id, {
    email: "paused-user@auth-limit.test",
    status: "paused",
    passwordHash,
  });
  await pool.query("insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')", [
    pausedUser.id,
    "a".repeat(64),
  ]);
  const pausedResponse = await call({ email: pausedUser.email, ip: "127.0.11.1", suppliedPassword: password });
  assert.equal(pausedResponse.status, 403);
  assert.deepEqual(pausedResponse.body, { error: "This account is not active" });
  assert.equal((await pool.query("select count(*)::int count from auth_sessions where user_id=$1", [pausedUser.id])).rows[0].count, 0);

  const pausedSchoolUser = await insertUser(pool, pausedSchool.id, {
    email: "paused-school@auth-limit.test",
    passwordHash,
  });
  assert.equal((await call({
    email: pausedSchoolUser.email,
    ip: "127.0.11.2",
    suppliedPassword: password,
  })).status, 403);

  const unknown = await call({ email: "unknown@auth-limit.test", ip: "127.0.12.1" });
  const knownWrong = await call({ email: pairUser.email, ip: "127.0.12.2" });
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.body, knownWrong.body);
  assert.equal((await call({ method: "GET" })).status, 405);
  assert.equal((await call({ rawBody: "{" })).status, 400);

  const helperUrl = new URL("../../netlify/functions/_auth-login-rate-limit.js", import.meta.url);
  const helperA = await import(`${helperUrl.href}?instance=a`);
  const helperB = await import(`${helperUrl.href}?instance=b`);
  const sharedIdentifiers = helperA.authLoginIdentifiers(
    { headers: { "x-nf-client-connection-ip": "127.0.13.1" } },
    "shared-instance@auth-limit.test",
  );
  const reservation = await helperA.beginAuthLoginAttempt(tag(pool), sharedIdentifiers);
  const sharedResult = await helperB.completeAuthLoginAttempt(tag(pool), {
    ...sharedIdentifiers,
    attemptId: reservation.attemptId,
    outcome: "invalid_credentials",
  });
  assert.equal(sharedResult.pairFailures, 1);

  await pool.query(`
    insert into auth_login_attempts(request_fingerprint,email_hash,outcome,attempted_at)
    values($1,$2,'rate_limited',now()-interval '8 days')
  `, ["b".repeat(64), "c".repeat(64)]);
  const retentionUser = await insertUser(pool, activeSchool.id, { email: "retention@auth-limit.test", passwordHash });
  assert.equal((await call({ email: retentionUser.email, ip: "127.0.14.1" })).status, 401);
  assert.equal((await pool.query(`
    select count(*)::int count from auth_login_attempts where attempted_at < now()-interval '7 days'
  `)).rows[0].count, 0);

  const stored = await pool.query("select user_id,request_fingerprint,email_hash,outcome,attempted_at from auth_login_attempts");
  assert.equal(stored.rows.every((row) => /^[a-f0-9]{64}$/.test(row.request_fingerprint)), true);
  assert.equal(stored.rows.every((row) => /^[a-f0-9]{64}$/.test(row.email_hash)), true);
  assert.equal(stored.rows.every((row) => [
    "invalid_credentials", "authenticated", "inactive_account", "rate_limited",
  ].includes(row.outcome)), true);
  const serialized = JSON.stringify(stored.rows);
  for (const raw of [
    pairUser.email,
    accountUser.email,
    sourceIp,
    concurrentIp,
    password,
    passwordHash,
  ]) assert.equal(serialized.includes(raw), false, `stored raw limiter input: ${raw}`);
});
