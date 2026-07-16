import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import { setSqlForTests } from "../../netlify/functions/_auth-utils.js";
import { runAccountEmailDispatch } from "../../netlify/functions/_account-email-dispatcher.js";
import { runScheduledEmailDispatch } from "../../netlify/functions/scheduled-account-email-dispatch.js";
import { runScheduledLifecycleCleanup } from "../../netlify/functions/scheduled-lifecycle-cleanup.js";
import { handler as health } from "../../netlify/functions/operational-health.js";

const { Pool } = pg;
const url = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(url) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
function scoped(base, schema) { const value = new URL(base); value.searchParams.set("options", `-c search_path=${schema}`); return value.toString(); }
function tag(pool) { return async (strings, ...values) => { let text = strings[0]; for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`; return (await pool.query(text, values)).rows; }; }
function parse(response) { return { status: response.statusCode, body: JSON.parse(response.body || "{}") }; }

test("scheduled operations, cleanup retention and private health are safe", { skip: !enabled, timeout: 120000 }, async (t) => {
  const schema = `operations_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(url, schema) });
  const sql = tag(pool);
  const previous = { DATABASE_URL: process.env.DATABASE_URL, OPERATIONAL_MONITORING_SECRET: process.env.OPERATIONAL_MONITORING_SECRET, ACCOUNT_EMAIL_MODE: process.env.ACCOUNT_EMAIL_MODE };
  process.env.DATABASE_URL = scoped(url, schema);
  process.env.OPERATIONAL_MONITORING_SECRET = "monitoring-test-secret";
  process.env.ACCOUNT_EMAIL_MODE = "capture";
  setSqlForTests(sql);
  t.after(async () => {
    setSqlForTests(null);
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end();
  });
  const files = (await readdir("database")).filter((name) => /^\d+.*\.sql$/.test(name) && name !== "012_demo_login_passwords.sql").sort((a, b) => a.localeCompare(b));
  for (const file of files) await pool.query(await readFile(`database/${file}`, "utf8"));
  await pool.query("create table eduforge_migration_history(filename text primary key, checksum_sha256 text not null, applied_at timestamptz not null default now())");
  for (const file of files) await pool.query("insert into eduforge_migration_history(filename,checksum_sha256) values($1,'test-checksum')", [file]);

  const school = (await pool.query("insert into schools(name) values('Operations School') returning id")).rows[0];
  const user = (await pool.query("insert into app_users(school_id,full_name,email,role,status) values($1,'Operations User','operations@qa.test','student','active') returning id", [school.id])).rows[0];
  await pool.query("insert into account_email_outbox(user_id,recipient_email,template_type,template_variables) values($1,'operations@qa.test','password_changed','{}')", [user.id]);
  const dispatch = await runAccountEmailDispatch({ sql, deliver: async () => ({ state: "sent", reference: "test-reference" }) });
  assert.deepEqual({ claimed: dispatch.claimed, sent: dispatch.sent, failed: dispatch.failed }, { claimed: 1, sent: 1, failed: 0 });
  const previewId = (await pool.query("insert into account_email_outbox(user_id,recipient_email,template_type,template_variables) values($1,'operations@qa.test','password_changed','{}') returning id", [user.id])).rows[0].id;
  const preview = await runAccountEmailDispatch({ sql, deliver: async () => ({ state: "preview", reference: "preview:test" }) });
  assert.deepEqual({ claimed: preview.claimed, sent: preview.sent, failed: preview.failed }, { claimed: 1, sent: 1, failed: 0 });
  assert.equal((await pool.query("select delivery_state from account_email_outbox where id=$1", [previewId])).rows[0].delivery_state, "preview");
  const zeroWork = await runScheduledEmailDispatch(sql);
  assert.equal(zeroWork.claimed, 0);
  await pool.query("insert into account_email_outbox(user_id,recipient_email,template_type,template_variables,delivery_state,claim_id,claimed_at) values($1,'operations@qa.test','password_changed','{}','sending',gen_random_uuid(),now()-interval '20 minutes')", [user.id]);
  await pool.query("insert into account_email_outbox(user_id,recipient_email,template_type,template_variables,delivery_state,attempt_count,next_attempt_at) values($1,'operations@qa.test','password_changed','{}','retryable',4,now())", [user.id]);
  const failures = await runAccountEmailDispatch({ sql, deliver: async () => ({ state: "failed", errorCode: "smtp_delivery_failed" }) });
  assert.equal(failures.stale_claims_recovered, 1);
  assert.equal(failures.failed, 2);
  assert.equal(failures.exhausted, 1);
  assert.equal((await pool.query("select count(*)::int count from account_email_outbox where delivery_state='exhausted'")).rows[0].count, 1);
  assert.equal((await pool.query("select count(*)::int count from account_email_outbox where delivery_state='retryable'")).rows[0].count, 1);

  await pool.query("insert into account_rate_limit_attempts(scope,request_fingerprint,attempted_at) values('token_validation','old',now()-interval '8 days'),('token_validation','recent',now())");
  await pool.query("insert into class_invite_attempts(request_fingerprint,attempted_at) values('old',now()-interval '8 days'),('recent',now())");
  await pool.query("insert into account_tokens(user_id,purpose,token_hash,expires_at,revoked_at) values($1,'password_reset','old-terminal',now()-interval '40 days',now()-interval '39 days'),($1,'password_reset','active-current',now()+interval '1 day',null)", [user.id]);
  await pool.query("insert into account_email_outbox(user_id,recipient_email,template_type,delivery_state,created_at) values($1,'operations@qa.test','password_changed','sent',now()-interval '100 days')", [user.id]);
  const cleanup = await runScheduledLifecycleCleanup(sql);
  assert.equal(cleanup.rate_limit_rows, 1);
  assert.equal(cleanup.token_rows, 1);
  assert.equal(cleanup.invite_attempt_rows, 1);
  assert.equal(cleanup.outbox_rows, 1);
  assert.equal((await pool.query("select count(*)::int count from account_tokens where token_hash='active-current'")).rows[0].count, 1);
  assert.equal((await pool.query("select count(*)::int count from eduforge_migration_history")).rows[0].count, files.length);
  const repeat = await runScheduledLifecycleCleanup(sql);
  assert.equal(repeat.rate_limit_rows + repeat.token_rows + repeat.invite_attempt_rows + repeat.outbox_rows, 0);

  const publicHealth = parse(await health({ httpMethod: "GET", headers: {}, queryStringParameters: {} }));
  assert.equal(publicHealth.status, 200);
  assert.deepEqual(Object.keys(publicHealth.body).sort(), ["build", "database", "status"]);
  const rejected = parse(await health({ httpMethod: "GET", headers: { "x-operational-monitoring-secret": "wrong" }, queryStringParameters: { detail: "private" } }));
  assert.equal(rejected.status, 401);
  const privateHealth = parse(await health({ httpMethod: "GET", headers: { "x-operational-monitoring-secret": "monitoring-test-secret" }, queryStringParameters: { detail: "private" } }));
  assert.equal(privateHealth.status, 200);
  assert.equal(privateHealth.body.migration, "016_operations_readiness.sql");
  assert.equal("recipient_email" in privateHealth.body, false);
  assert.ok((await pool.query("select count(*)::int count from operational_runs where succeeded=true")).rows[0].count >= 3);
});
