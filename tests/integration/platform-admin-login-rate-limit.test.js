import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import bcrypt from "bcryptjs";
import pg from "pg";
import { setSqlForTests, sessionCookieName } from "../../netlify/functions/_auth-utils.js";
import {
  platformAdminAccountLimit,
  platformAdminLoginIdentifiers,
  platformAdminPairLimit,
  platformAdminSourcePendingLimit,
  platformAdminSourceLimit,
} from "../../netlify/functions/_platform-admin-login-rate-limit.js";
import {
  authLoginAccountLimit,
  authLoginPairLimit,
  authLoginSourceLimit,
} from "../../netlify/functions/_auth-login-rate-limit.js";
import { platformAdminCookieName } from "../../netlify/functions/_platform-admin-auth.js";
import { handler as platformAuth } from "../../netlify/functions/platform-admin-auth.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const password = "Platform-Limiter-2026!";
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
  return template;
}

function parse(response) {
  return { status: response.statusCode, body: JSON.parse(response.body || "{}"), headers: response.headers || {} };
}

async function call({
  email,
  suppliedPassword = "wrong",
  ip = "127.0.20.1",
  origin = "http://localhost:8888",
  method = "POST",
  action = "login",
  cookie = "",
} = {}) {
  return parse(await platformAuth({
    httpMethod: method,
    headers: {
      host: "localhost:8888",
      cookie,
      "x-nf-client-connection-ip": ip,
      "user-agent": "Platform limiter isolated integration",
      ...(origin ? { origin } : {}),
    },
    queryStringParameters: { action },
    rawQuery: `action=${action}`,
    body: method === "GET" ? "" : JSON.stringify({ email, password: suppliedPassword }),
  }));
}

async function insertAdmin(pool, email, passwordHash, status = "active") {
  return (await pool.query(`
    insert into platform_admins(full_name,email,password_hash,status)
    values($1,$2,$3,$4) returning id,email,status
  `, [`Admin ${email}`, email, passwordHash, status])).rows[0];
}

test("Platform Admin limiter is distributed, recoverable, atomic, and privacy preserving", {
  skip: !enabled,
  timeout: 120_000,
}, async (t) => {
  assert.notEqual(testDatabaseUrl, process.env.DATABASE_URL);
  assert.deepEqual(
    [authLoginPairLimit, authLoginAccountLimit, authLoginSourceLimit],
    [5, 20, 75],
  );

  const schema = `platform_limit_${randomBytes(6).toString("hex")}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const databaseUrl = scoped(testDatabaseUrl, schema);
  const pool = new Pool({ connectionString: databaseUrl, max: 30 });
  const previous = {
    DATABASE_URL: process.env.DATABASE_URL,
    TEST_DATABASE_CONFIRMATION: process.env.TEST_DATABASE_CONFIRMATION,
    PLATFORM_ADMIN_RATE_LIMIT_SALT: process.env.PLATFORM_ADMIN_RATE_LIMIT_SALT,
  };
  Object.assign(process.env, {
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_CONFIRMATION: "isolated-test-database",
    PLATFORM_ADMIN_RATE_LIMIT_SALT: "isolated-platform-admin-integration-rate-limit",
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

  const migrationFiles = (await readdir("database"))
    .filter((name) => /^\d+.*\.sql$/.test(name) && name !== "012_demo_login_passwords.sql" && Number(name.slice(0, 3)) <= 30)
    .sort((left, right) => left.localeCompare(right));
  assert.equal(migrationFiles.at(-1), "030_platform_admin_login_rate_limit.sql");
  for (const filename of migrationFiles.filter((name) => name !== "030_platform_admin_login_rate_limit.sql")) {
    await pool.query(await readFile(`database/${filename}`, "utf8"));
  }
  await pool.query(`
    insert into platform_admin_login_attempts(request_fingerprint,email_hash,succeeded)
    values($1,$2,false),($3,$4,true)
  `, ["1".repeat(64), "2".repeat(64), "3".repeat(64), "4".repeat(64)]);
  await pool.query(await readFile("database/030_platform_admin_login_rate_limit.sql", "utf8"));
  assert.deepEqual(
    (await pool.query("select outcome from platform_admin_login_attempts order by id")).rows.map((row) => row.outcome),
    ["invalid_credentials", "authenticated"],
  );

  const columns = (await pool.query(`
    select column_name from information_schema.columns
    where table_schema=$1 and table_name='platform_admin_login_attempts'
    order by ordinal_position
  `, [schema])).rows.map((row) => row.column_name);
  assert.deepEqual(columns, [
    "id", "platform_admin_id", "request_fingerprint", "email_hash", "succeeded", "attempted_at", "outcome",
  ]);
  const indexes = new Set((await pool.query(`
    select indexname from pg_indexes
    where schemaname=$1 and tablename='platform_admin_login_attempts'
  `, [schema])).rows.map((row) => row.indexname));
  for (const index of [
    "platform_admin_login_attempts_source_failure_idx",
    "platform_admin_login_attempts_email_failure_idx",
    "platform_admin_login_attempts_pair_failure_idx",
    "platform_admin_login_attempts_email_success_idx",
    "platform_admin_login_attempts_pending_idx",
    "platform_admin_login_attempts_retention_idx",
  ]) assert.equal(indexes.has(index), true, `missing ${index}`);
  await pool.query("delete from platform_admin_login_attempts");

  const passwordHash = await bcrypt.hash(password, 4);
  const pairAdmin = await insertAdmin(pool, "pair@platform-limit.test", passwordHash);
  const pairIp = "127.0.21.1";
  const rowsBeforeInvalidOrigin = (await pool.query("select count(*)::int count from platform_admin_login_attempts")).rows[0].count;
  assert.equal((await call({
    email: pairAdmin.email,
    suppliedPassword: password,
    ip: pairIp,
    origin: "",
  })).status, 403);
  assert.equal((await pool.query("select count(*)::int count from platform_admin_login_attempts")).rows[0].count, rowsBeforeInvalidOrigin);

  for (let index = 1; index < platformAdminPairLimit; index += 1) {
    assert.equal((await call({ email: pairAdmin.email, ip: pairIp })).status, 401);
  }
  const pairThreshold = await call({ email: pairAdmin.email, ip: pairIp });
  assert.equal(pairThreshold.status, 429);
  assert.ok(Number(pairThreshold.headers["Retry-After"]) >= 1);
  assert.ok(Number(pairThreshold.headers["Retry-After"]) <= 900);
  assert.deepEqual(pairThreshold.body, { error: "Too many login attempts. Try again later." });
  assert.equal((await call({ email: pairAdmin.email, suppliedPassword: password, ip: pairIp })).status, 429);

  const pairIdentifiers = platformAdminLoginIdentifiers({ headers: {
    "x-nf-client-connection-ip": pairIp,
  } }, pairAdmin.email);
  await pool.query(`
    update platform_admin_login_attempts set attempted_at=now()-interval '14 minutes 50 seconds'
    where request_fingerprint=$1 and email_hash=$2 and outcome='invalid_credentials'
  `, [pairIdentifiers.requestFingerprint, pairIdentifiers.emailHash]);
  const shortRetry = await call({ email: pairAdmin.email, ip: pairIp });
  assert.equal(shortRetry.status, 429);
  assert.ok(Number(shortRetry.headers["Retry-After"]) >= 1 && Number(shortRetry.headers["Retry-After"]) <= 11);
  const pairInvalidBefore = (await pool.query(`
    select count(*)::int count from platform_admin_login_attempts
    where request_fingerprint=$1 and email_hash=$2 and outcome='invalid_credentials'
  `, [pairIdentifiers.requestFingerprint, pairIdentifiers.emailHash])).rows[0].count;
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await call({ email: pairAdmin.email, ip: pairIp })).status, 429);
  }
  assert.equal((await pool.query(`
    select count(*)::int count from platform_admin_login_attempts
    where request_fingerprint=$1 and email_hash=$2 and outcome='invalid_credentials'
  `, [pairIdentifiers.requestFingerprint, pairIdentifiers.emailHash])).rows[0].count, pairInvalidBefore);
  await pool.query(`
    update platform_admin_login_attempts set attempted_at=now()-interval '15 minutes'
    where request_fingerprint=$1 and email_hash=$2 and outcome='invalid_credentials'
  `, [pairIdentifiers.requestFingerprint, pairIdentifiers.emailHash]);
  assert.equal((await call({ email: pairAdmin.email, ip: pairIp })).status, 401);

  const accountAdmin = await insertAdmin(pool, "distributed@platform-limit.test", passwordHash);
  for (let index = 0; index < platformAdminAccountLimit - 1; index += 1) {
    assert.equal((await call({ email: accountAdmin.email, ip: `127.0.22.${index + 1}` })).status, 401);
  }
  assert.equal((await call({ email: accountAdmin.email, ip: "127.0.22.100" })).status, 429);
  assert.equal((await call({ email: accountAdmin.email, ip: "127.0.22.101" })).status, 429);
  const accountLimitedIdentifiers = platformAdminLoginIdentifiers({ headers: {
    "x-nf-client-connection-ip": "127.0.22.101",
  } }, accountAdmin.email);
  assert.equal((await pool.query(`
    select outcome from platform_admin_login_attempts
    where request_fingerprint=$1 and email_hash=$2
    order by attempted_at desc limit 1
  `, [accountLimitedIdentifiers.requestFingerprint, accountLimitedIdentifiers.emailHash])).rows[0].outcome, "rate_limited");
  for (let index = 0; index < 2; index += 1) {
    assert.equal((await call({
      email: `unrelated-source-${index}@platform-limit.test`,
      ip: "127.0.22.102",
    })).status, 401);
  }
  const recovered = await call({
    email: accountAdmin.email,
    suppliedPassword: password,
    ip: "127.0.22.102",
  });
  assert.equal(recovered.status, 200);
  assert.ok(recovered.headers["Set-Cookie"]);
  const platformCookie = recovered.headers["Set-Cookie"].split(";")[0];
  assert.match(platformCookie, new RegExp(`^${platformAdminCookieName}=`));
  assert.equal((await call({ method: "GET", action: "me", cookie: platformCookie })).status, 200);
  assert.equal((await call({ email: accountAdmin.email, ip: "127.0.22.103" })).status, 401);
  const recoverySource = platformAdminLoginIdentifiers({ headers: {
    "x-nf-client-connection-ip": "127.0.22.102",
  } }, accountAdmin.email).requestFingerprint;
  assert.equal((await pool.query(`
    select count(*)::int count from platform_admin_login_attempts
    where request_fingerprint=$1 and outcome='invalid_credentials'
  `, [recoverySource])).rows[0].count, 2);

  const sourceIp = "127.0.23.1";
  for (let index = 0; index < platformAdminSourceLimit - 1; index += 1) {
    assert.equal((await call({ email: `stuffing-${index}@platform-limit.test`, ip: sourceIp })).status, 401);
  }
  assert.equal((await call({ email: "stuffing-threshold@platform-limit.test", ip: sourceIp })).status, 429);
  assert.equal((await call({
    email: accountAdmin.email,
    suppliedPassword: password,
    ip: sourceIp,
  })).status, 429);

  const concurrentAdmin = await insertAdmin(pool, "concurrent@platform-limit.test", passwordHash);
  const concurrentIp = "127.0.24.1";
  const concurrent = await Promise.all(Array.from({ length: 12 }, () => call({
    email: concurrentAdmin.email,
    ip: concurrentIp,
  })));
  assert.equal(concurrent.every((response) => [401, 429].includes(response.status)), true);
  assert.equal(concurrent.some((response) => response.status === 429), true);
  const concurrentIdentifiers = platformAdminLoginIdentifiers({ headers: {
    "x-nf-client-connection-ip": concurrentIp,
  } }, concurrentAdmin.email);
  const concurrentRows = (await pool.query(`
    select outcome,count(*)::int count from platform_admin_login_attempts
    where request_fingerprint=$1 and email_hash=$2 group by outcome
  `, [concurrentIdentifiers.requestFingerprint, concurrentIdentifiers.emailHash])).rows;
  assert.ok(Number(concurrentRows.find((row) => row.outcome === "invalid_credentials")?.count || 0) <= platformAdminPairLimit);
  assert.equal(Number(concurrentRows.find((row) => row.outcome === "pending")?.count || 0), 0);

  const concurrentAccount = await insertAdmin(pool, "concurrent-account@platform-limit.test", passwordHash);
  const accountBurst = await Promise.all(Array.from({ length: 30 }, (_, index) => call({
    email: concurrentAccount.email,
    ip: `127.0.28.${index + 1}`,
  })));
  assert.equal(accountBurst.every((response) => [401, 429].includes(response.status)), true);
  assert.equal(accountBurst.some((response) => response.status === 429), true);
  const concurrentAccountHash = platformAdminLoginIdentifiers({ headers: {
    "x-nf-client-connection-ip": "127.0.28.1",
  } }, concurrentAccount.email).emailHash;
  assert.ok((await pool.query(`
    select count(*)::int count from platform_admin_login_attempts
    where email_hash=$1 and outcome='invalid_credentials'
  `, [concurrentAccountHash])).rows[0].count <= platformAdminAccountLimit);

  const concurrentSourceIp = "127.0.29.1";
  const sourceBurst = await Promise.all(Array.from({ length: 30 }, (_, index) => call({
    email: `concurrent-source-${index}@platform-limit.test`,
    ip: concurrentSourceIp,
  })));
  assert.equal(sourceBurst.every((response) => [401, 429].includes(response.status)), true);
  assert.equal(sourceBurst.some((response) => response.status === 429), true);
  const concurrentSourceFingerprint = platformAdminLoginIdentifiers({ headers: {
    "x-nf-client-connection-ip": concurrentSourceIp,
  } }, "source-burst@platform-limit.test").requestFingerprint;
  assert.ok((await pool.query(`
    select count(*)::int count from platform_admin_login_attempts
    where request_fingerprint=$1 and outcome='invalid_credentials'
  `, [concurrentSourceFingerprint])).rows[0].count <= platformAdminSourcePendingLimit);

  const inactiveAdmin = await insertAdmin(pool, "inactive@platform-limit.test", passwordHash, "paused");
  const inactive = await call({
    email: inactiveAdmin.email,
    suppliedPassword: password,
    ip: "127.0.25.1",
  });
  assert.equal(inactive.status, 401);
  assert.deepEqual(inactive.body, { error: "Invalid email or password" });
  assert.equal((await pool.query(`
    select outcome from platform_admin_login_attempts where platform_admin_id=$1 order by attempted_at desc limit 1
  `, [inactiveAdmin.id])).rows[0].outcome, "rejected_account");
  assert.equal((await pool.query(`
    select count(*)::int count from platform_admin_sessions where platform_admin_id=$1
  `, [inactiveAdmin.id])).rows[0].count, 0);

  const unknown = await call({ email: "unknown@platform-limit.test", ip: "127.0.25.2" });
  const knownWrong = await call({ email: accountAdmin.email, ip: "127.0.25.3" });
  assert.equal(unknown.status, 401);
  assert.deepEqual(unknown.body, knownWrong.body);
  assert.equal((await call({ method: "POST", action: "logout", cookie: platformCookie })).status, 200);
  assert.equal((await call({ method: "GET", action: "me", cookie: platformCookie })).status, 401);
  assert.equal((await call({
    method: "GET",
    action: "me",
    cookie: `${sessionCookieName}=ordinary-session-does-not-count`,
  })).status, 401);

  const helperUrl = new URL("../../netlify/functions/_platform-admin-login-rate-limit.js", import.meta.url);
  const helperA = await import(`${helperUrl.href}?instance=a`);
  const helperB = await import(`${helperUrl.href}?instance=b`);
  const sharedIdentifiers = helperA.platformAdminLoginIdentifiers({ headers: {
    "x-nf-client-connection-ip": "127.0.26.1",
  } }, "shared@platform-limit.test");
  const reservation = await helperA.beginPlatformAdminLoginAttempt(tag(pool), sharedIdentifiers);
  const sharedResult = await helperB.completePlatformAdminLoginAttempt(tag(pool), {
    ...sharedIdentifiers,
    attemptId: reservation.attemptId,
    outcome: "invalid_credentials",
  });
  assert.equal(sharedResult.pairFailures, 1);

  await pool.query(`
    insert into platform_admin_login_attempts(request_fingerprint,email_hash,succeeded,outcome,attempted_at)
    values($1,$2,false,'rate_limited',now()-interval '15 days')
  `, ["a".repeat(64), "b".repeat(64)]);
  assert.equal((await call({ email: "retention@platform-limit.test", ip: "127.0.27.1" })).status, 401);
  assert.equal((await pool.query(`
    select count(*)::int count from platform_admin_login_attempts where attempted_at < now()-interval '14 days'
  `)).rows[0].count, 0);

  const attempts = await pool.query(`
    select request_fingerprint,email_hash,outcome,attempted_at from platform_admin_login_attempts
  `);
  assert.equal(attempts.rows.every((row) => /^[a-f0-9]{64}$/.test(row.request_fingerprint)), true);
  assert.equal(attempts.rows.every((row) => /^[a-f0-9]{64}$/.test(row.email_hash)), true);
  assert.equal(attempts.rows.every((row) => [
    "invalid_credentials", "authenticated", "rejected_account", "rate_limited",
  ].includes(row.outcome)), true);
  assert.doesNotMatch(JSON.stringify(attempts.rows), /@platform-limit\.test|127\.0\.|Platform-Limiter-2026/);

  const audits = (await pool.query(`
    select action,metadata::text metadata from platform_admin_audit_log
    where platform_admin_id=$1 order by created_at
  `, [accountAdmin.id])).rows;
  assert.equal(audits.some((row) => row.action === "login_account_risk_detected"), true);
  assert.equal(audits.some((row) => row.action === "login_succeeded" && /"recovery": true/.test(row.metadata)), true);
  assert.doesNotMatch(JSON.stringify(audits), /@platform-limit\.test|127\.0\.|[a-f0-9]{64}|Platform-Limiter-2026/);
});
