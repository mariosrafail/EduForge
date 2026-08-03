import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { hashToken, sessionCookieName, setSqlForTests } from "../../netlify/functions/_auth-utils.js";
import { hashAccessCode, maskAccessCode } from "../../netlify/functions/_licensing-utils.js";
import { handler as licensingHandler } from "../../netlify/functions/book-licensing.js";
import { handler as bookContentHandler } from "../../netlify/functions/book-content.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const integrationEnabled = Boolean(testDatabaseUrl && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database");
const { Pool } = pg;

function scopedDatabaseUrl(baseUrl, schema) {
  const url = new URL(baseUrl); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString();
}
function postgresTemplate(pool) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await pool.query(text, values)).rows;
  };
}
async function call({ method = "GET", query = {}, body = {}, cookie = "", ip = "127.0.0.80" } = {}) {
  const response = await licensingHandler({ httpMethod: method, headers: { host: "localhost:8888", cookie, "x-nf-client-connection-ip": ip }, queryStringParameters: query, rawQuery: new URLSearchParams(query).toString(), body: method === "GET" ? "" : JSON.stringify(body) });
  return { status: response.statusCode, body: JSON.parse(response.body || "{}") };
}
async function callBook({ method = "GET", query = {}, body = {}, cookie = "", ip = "127.0.0.90" } = {}) {
  const response = await bookContentHandler({ httpMethod: method, headers: { host: "localhost:8888", cookie, "x-nf-client-connection-ip": ip }, queryStringParameters: query, rawQuery: new URLSearchParams(query).toString(), body: method === "GET" ? "" : JSON.stringify(body) });
  return { status: response.statusCode, body: JSON.parse(response.body || "{}") };
}
async function user(pool, schoolId, role, label) {
  const passwordHash = await bcrypt.hash("integration-password", 4);
  return (await pool.query(`insert into app_users(school_id,full_name,email,role,status,password_hash,auth_provider) values($1,$2,$3,$4,'active',$5,'password') returning id`, [schoolId, label, `${label.toLowerCase().replaceAll(" ", "-")}@licensing.test`, role, passwordHash])).rows[0].id;
}
async function session(pool, userId) {
  const token = randomBytes(24).toString("hex");
  await pool.query("insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')", [userId, hashToken(token)]);
  return `${sessionCookieName}=${token}`;
}
async function insertCode(pool, { packageId, schoolId, adminId, status = "unused", redeemedBy = null, value = randomUUID(), batchId = null }) {
  const codeId = randomUUID();
  await pool.query(`insert into activation_codes(id,code_hash,code_mask,batch_id,book_package_id,school_id,max_uses,used_count,status,expires_at,redeemed_at,redeemed_by,revoked_at,revocation_reason,created_by) values($1,$2,$3,$4,$5,$6,1,$7,$8,$9,$10,$11,$12,$13,$14)`, [codeId, hashAccessCode(value), maskAccessCode(value), batchId, packageId, schoolId, redeemedBy ? 1 : 0, status, status === "expired" ? new Date(Date.now() - 86400000) : new Date(Date.now() + 86400000), redeemedBy ? new Date() : null, redeemedBy, status === "revoked" ? new Date() : null, status === "revoked" ? "integration test" : null, adminId]);
  return { id: codeId, value };
}

test("one-time book licensing is atomic, role-scoped, and tenant-isolated", { skip: !integrationEnabled, timeout: 120_000 }, async (t) => {
  assert.notEqual(testDatabaseUrl, process.env.DATABASE_URL);
  const schema = `hhplms_test_${randomBytes(6).toString("hex")}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const scopedUrl = scopedDatabaseUrl(testDatabaseUrl, schema);
  const pool = new Pool({ connectionString: scopedUrl });
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = scopedUrl;
  setSqlForTests(postgresTemplate(pool));
  t.after(async () => {
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    setSqlForTests(null); await pool.end(); await adminPool.query(`drop schema if exists "${schema}" cascade`); await adminPool.end();
  });
  await applyCanonicalProductionMigrations(pool);

  const schools = (await pool.query("insert into schools(name) values('License School A'),('License School B') returning id,name")).rows;
  const schoolA = schools.find((row) => row.name.endsWith("A")).id;
  const schoolB = schools.find((row) => row.name.endsWith("B")).id;
  const adminA = await user(pool, schoolA, "admin", "License Admin A");
  const adminB = await user(pool, schoolB, "admin", "License Admin B");
  const teacherA = await user(pool, schoolA, "teacher", "License Teacher A");
  const studentA1 = await user(pool, schoolA, "student", "License Student A1");
  const studentA2 = await user(pool, schoolA, "student", "License Student A2");
  const studentB = await user(pool, schoolB, "student", "License Student B");
  const cookies = { adminA: await session(pool, adminA), adminB: await session(pool, adminB), teacherA: await session(pool, teacherA), studentA1: await session(pool, studentA1), studentA2: await session(pool, studentA2), studentB: await session(pool, studentB) };
  const publisher = (await pool.query("insert into publishers(name,slug) values('License Publisher',$1) returning id", [`license-${schema}`])).rows[0];
  const packages = (await pool.query("insert into book_packages(publisher_id,title,slug,level,status) values($1,'License Book One',$2,'B2','active'),($1,'License Book Two',$3,'B2','active') returning id,title", [publisher.id, `license-one-${schema}`, `license-two-${schema}`])).rows;
  const packageOne = packages.find((row) => row.title.endsWith("One"));
  const packageTwo = packages.find((row) => row.title.endsWith("Two"));
  const classA = (await pool.query(`insert into classes(school_id,teacher_id,name,level,slug,book_package_id,invite_code,status) values($1,$2,'License Class A','B2',$3,$4,'LICA1234','active') returning id`, [schoolA, teacherA, `license-class-${schema}`, packageOne.id])).rows[0];
  await pool.query("insert into class_students(class_id,student_id,status) values($1,$2,'active')", [classA.id, studentA1]);

  let generated;
  await t.test("admin generates unique codes once and listings remain masked", async () => {
    generated = await call({ method: "POST", cookie: cookies.adminA, query: { action: "generate-batch" }, body: { bookPackageId: packageOne.id, quantity: 3, label: "A batch", requestKey: randomUUID() } });
    assert.equal(generated.status, 201);
    assert.equal(new Set(generated.body.codes).size, 3);
    assert.equal(generated.body.csv.includes(generated.body.codes[0]), true);
    const details = await call({ cookie: cookies.adminA, query: { action: "batch", batchId: generated.body.batch.id } });
    assert.equal(details.status, 200);
    assert.equal(details.body.codes.every((item) => item.maskedCode && !generated.body.codes.includes(item.maskedCode)), true);
    assert.equal(JSON.stringify(details.body).includes(generated.body.codes[0]), false);
  });

  await t.test("duplicate request keys cannot regenerate or re-export codes", async () => {
    const requestKey = randomUUID();
    const first = await call({ method: "POST", cookie: cookies.adminA, query: { action: "generate-batch" }, body: { bookPackageId: packageOne.id, quantity: 1, requestKey } });
    const second = await call({ method: "POST", cookie: cookies.adminA, query: { action: "generate-batch" }, body: { bookPackageId: packageOne.id, quantity: 1, requestKey } });
    assert.equal(first.status, 201); assert.equal(second.status, 409); assert.equal(second.body.codes, undefined);
  });

  await t.test("teacher and student cannot administer licenses or inject identity", async () => {
    assert.equal((await call({ cookie: cookies.teacherA, query: { action: "overview" } })).status, 403);
    assert.equal((await call({ method: "POST", cookie: cookies.studentA1, query: { action: "generate-batch" }, body: { bookPackageId: packageOne.id, quantity: 1, requestKey: randomUUID() } })).status, 403);
    assert.equal((await call({ method: "POST", cookie: cookies.studentA1, query: { action: "redeem" }, body: { code: generated.body.codes[0], studentId: studentA2 } })).status, 400);
  });

  await t.test("redemption creates only its package entitlement and cannot be repeated", async () => {
    const before = await callBook({ cookie: cookies.studentA1, query: { action: "list" } });
    assert.equal(before.body.bookPackages.length, 0, "class assignment alone must not expose the full book package");
    const redeemed = await call({ method: "POST", cookie: cookies.studentA1, query: { action: "redeem" }, body: { code: generated.body.codes[0] }, ip: "127.0.0.81" });
    assert.equal(redeemed.status, 200); assert.equal(redeemed.body.bookPackage.id, packageOne.id);
    const access = (await pool.query("select book_package_id from book_access where user_id=$1", [studentA1])).rows;
    assert.deepEqual(access.map((row) => row.book_package_id), [packageOne.id]);
    const after = await callBook({ cookie: cookies.studentA1, query: { action: "list" } });
    assert.deepEqual(after.body.bookPackages.map((item) => item.id), [packageOne.id]);
    const repeat = await call({ method: "POST", cookie: cookies.studentA2, query: { action: "redeem" }, body: { code: generated.body.codes[0] }, ip: "127.0.0.82" });
    assert.equal(repeat.status, 400);
  });

  await t.test("concurrent redemption has exactly one winner", async () => {
    const code = await insertCode(pool, { packageId: packageTwo.id, schoolId: schoolA, adminId: adminA, value: `CONCURRENT-${randomBytes(10).toString("hex")}` });
    const results = await Promise.all([
      call({ method: "POST", cookie: cookies.studentA1, query: { action: "redeem" }, body: { code: code.value }, ip: "127.0.0.83" }),
      call({ method: "POST", cookie: cookies.studentA2, query: { action: "redeem" }, body: { code: code.value }, ip: "127.0.0.84" }),
    ]);
    assert.equal(results.filter((result) => result.status === 200).length, 1, JSON.stringify(results));
    assert.equal(results.filter((result) => result.status === 400).length, 1);
    assert.equal(Number((await pool.query("select count(*) count from book_access where activation_code_id=$1", [code.id])).rows[0].count), 1);
  });

  await t.test("expired, revoked, and wrong-school codes use the same safe failure", async () => {
    const expired = await insertCode(pool, { packageId: packageOne.id, schoolId: schoolA, adminId: adminA, status: "expired", value: `EXPIRED-${randomUUID()}` });
    const revoked = await insertCode(pool, { packageId: packageOne.id, schoolId: schoolA, adminId: adminA, status: "revoked", value: `REVOKED-${randomUUID()}` });
    for (const [code, cookie, ip] of [[expired, cookies.studentA2, "127.0.0.85"], [revoked, cookies.studentA2, "127.0.0.86"], [{ value: generated.body.codes[1] }, cookies.studentB, "127.0.0.87"]]) {
      const result = await call({ method: "POST", cookie, query: { action: "redeem" }, body: { code: code.value }, ip });
      assert.equal(result.status, 400); assert.equal(result.body.error, "This code is invalid, unavailable, or expired");
    }
  });

  await t.test("already-owned package preserves unused code and avoids duplicate entitlement", async () => {
    const code = await insertCode(pool, { packageId: packageOne.id, schoolId: schoolA, adminId: adminA, value: `OWNED-${randomUUID()}` });
    const result = await call({ method: "POST", cookie: cookies.studentA1, query: { action: "redeem" }, body: { code: code.value }, ip: "127.0.0.88" });
    assert.equal(result.status, 409);
    assert.equal((await pool.query("select status from activation_codes where id=$1", [code.id])).rows[0].status, "unused");
    assert.equal(Number((await pool.query("select count(*) count from book_access where user_id=$1 and book_package_id=$2", [studentA1, packageOne.id])).rows[0].count), 1);
  });

  await t.test("cross-school batch and code IDs remain inaccessible", async () => {
    assert.equal((await call({ cookie: cookies.adminB, query: { action: "batch", batchId: generated.body.batch.id } })).status, 404);
    const codeId = (await pool.query("select id from activation_codes where batch_id=$1 limit 1", [generated.body.batch.id])).rows[0].id;
    assert.equal((await call({ method: "POST", cookie: cookies.adminB, query: { action: "reset-code" }, body: { codeId } })).status, 404);
    const overview = await call({ cookie: cookies.adminB, query: { action: "overview" } });
    assert.equal(overview.status, 200); assert.equal(overview.body.batches.some((batch) => batch.id === generated.body.batch.id), false);
  });
});
