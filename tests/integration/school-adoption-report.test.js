import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import bcrypt from "bcryptjs";
import pg from "pg";
import {
  hashToken,
  sessionCookieName,
  setSqlForTests,
} from "../../netlify/functions/_auth-utils.js";
import { handler } from "../../netlify/functions/school-adoption-report.js";

const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const { Pool } = pg;

function scoped(base, schema) {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function postgresTemplate(pool) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await pool.query(text, values)).rows;
  };
}

async function session(pool, userId) {
  const token = randomBytes(24).toString("hex");
  await pool.query(
    "insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')",
    [userId, hashToken(token)],
  );
  return `${sessionCookieName}=${token}`;
}

async function call(cookie, method, action) {
  const response = await handler({
    httpMethod: method,
    headers: { host: "localhost:8888", cookie, origin: "http://localhost:8888" },
    queryStringParameters: { action },
    rawQuery: `action=${action}`,
    body: method === "POST" ? "{}" : "",
  });
  return {
    status: response.statusCode,
    headers: response.headers || {},
    body: response.headers?.["Content-Type"]?.startsWith("text/csv") ? response.body : JSON.parse(response.body || "{}"),
  };
}

async function addUser(pool, schoolId, role, label, status = "active") {
  const passwordHash = await bcrypt.hash("Adoption-Integration-2026!", 4);
  return (await pool.query(
    `insert into app_users(school_id,full_name,email,role,status,password_hash,auth_provider)
     values($1,$2,$3,$4,$5,$6,'password') returning id`,
    [schoolId, `${label} Person`, `${label}@adoption.invalid`, role, status, passwordHash],
  )).rows[0].id;
}

async function addPackage(pool, publisherId, label, status = "active") {
  const suffix = randomBytes(4).toString("hex");
  const packageRow = (await pool.query(
    "insert into book_packages(publisher_id,title,slug,level,status) values($1,$2,$3,'B2',$4) returning id,title,slug",
    [publisherId, `${label} Package`, `${label}-${suffix}`, status],
  )).rows[0];
  const component = (await pool.query(
    "insert into book_components(book_package_id,title,slug,component_type) values($1,$2,$3,'students_book') returning id",
    [packageRow.id, `${label} Component`, `component-${suffix}`],
  )).rows[0];
  const unit = (await pool.query(
    "insert into units(book_component_id,title,slug) values($1,$2,$3) returning id",
    [component.id, `${label} Unit`, `unit-${suffix}`],
  )).rows[0];
  const lesson = (await pool.query(
    `insert into lessons(unit_id,title,slug,lesson_type,position,sort_order,instructions,status)
     values($1,$2,$3,'practice',1,1,'Fictional integration lesson','published') returning id`,
    [unit.id, `${label} Lesson`, `lesson-${suffix}`],
  )).rows[0];
  const activity = (await pool.query(
    `insert into activities(lesson_id,title,slug,type,activity_type,content,content_json,settings_json,is_assignable)
     values($1,$2,$3,'multiple_choice','multiple_choice','{}','{}','{}',true) returning id`,
    [lesson.id, `${label} Activity`, `activity-${suffix}`],
  )).rows[0];
  return { ...packageRow, activityId: activity.id };
}

async function addCode(pool, schoolId, packageId, status, redeemedBy = null) {
  const value = `PRIVATE-${randomUUID()}`;
  const hash = createHash("sha256").update(value).digest("hex");
  const redeemed = status === "redeemed";
  const revoked = status === "revoked";
  await pool.query(
    `insert into activation_codes(
      code_hash,code_mask,book_package_id,school_id,max_uses,used_count,status,expires_at,
      redeemed_at,redeemed_by,revoked_at,revocation_reason
    ) values($1,'••••-TEST',$2,$3,1,$4,$5,$6,$7,$8,$9,$10)`,
    [
      hash,
      packageId,
      schoolId,
      redeemed ? 1 : 0,
      status,
      status === "expired" ? new Date(Date.now() - 86_400_000) : new Date(Date.now() + 86_400_000),
      redeemed ? new Date() : null,
      redeemed ? redeemedBy : null,
      revoked ? new Date() : null,
      revoked ? "Fictional integration revocation" : null,
    ],
  );
  return value;
}

async function addAssignment(pool, schoolId, activityId, teacherId, status) {
  return (await pool.query(
    `insert into activity_assignments(school_id,activity_id,teacher_id,status,title)
     values($1,$2,$3,$4,'Fictional adoption assignment') returning id`,
    [schoolId, activityId, teacherId, status],
  )).rows[0].id;
}

async function addSubmission(pool, schoolId, activityId, assignmentId, studentId, scorePercent, submittedAt, marker) {
  await pool.query(
    `insert into activity_submissions(
      school_id,activity_id,activity_assignment_id,student_id,answers,score_percent,status,submitted_at
    ) values($1,$2,$3,$4,$5,$6,'submitted',$7)`,
    [schoolId, activityId, assignmentId, studentId, { marker }, scorePercent, submittedAt],
  );
}

test("School adoption summary and CSV are exact, latest-only, private, audited, immutable, and tenant-scoped", { skip: !enabled, timeout: 180_000 }, async (t) => {
  assert.notEqual(databaseUrl, process.env.DATABASE_URL);
  const schema = `adoption_${randomBytes(6).toString("hex")}`;
  const adminPool = new Pool({ connectionString: databaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema) });
  setSqlForTests(postgresTemplate(pool));
  t.after(async () => {
    setSqlForTests(null);
    await pool.end();
    await adminPool.query(`drop schema if exists "${schema}" cascade`);
    await adminPool.end();
  });

  const migrations = (await readdir("database"))
    .filter((name) => /^\d+.*\.sql$/.test(name) && name !== "012_demo_login_passwords.sql")
    .sort((left, right) => left.localeCompare(right));
  for (const migration of migrations) await pool.query(await readFile(`database/${migration}`, "utf8"));

  const schools = (await pool.query(
    "insert into schools(name) values('Adoption School A'),('Adoption School B'),('Empty Adoption School') returning id,name",
  )).rows;
  const schoolA = schools.find((row) => row.name.endsWith("A"));
  const schoolB = schools.find((row) => row.name.endsWith("B"));
  const emptySchool = schools.find((row) => row.name.startsWith("Empty"));
  const adminA = await addUser(pool, schoolA.id, "admin", "admin-a");
  const adminB = await addUser(pool, schoolB.id, "admin", "admin-b");
  const emptyAdmin = await addUser(pool, emptySchool.id, "admin", "admin-empty");
  const teacherA = await addUser(pool, schoolA.id, "teacher", "teacher-a");
  const studentA1 = await addUser(pool, schoolA.id, "student", "student-a1");
  const studentA2 = await addUser(pool, schoolA.id, "student", "student-a2");
  const pausedStudent = await addUser(pool, schoolA.id, "student", "student-paused", "paused");
  const teacherB = await addUser(pool, schoolB.id, "teacher", "teacher-b");
  const studentB = await addUser(pool, schoolB.id, "student", "student-b");
  const cookies = {
    adminA: await session(pool, adminA),
    adminB: await session(pool, adminB),
    empty: await session(pool, emptyAdmin),
  };

  const publisher = (await pool.query(
    "insert into publishers(name,slug) values('Adoption Publisher',$1) returning id",
    [`adoption-${schema}`],
  )).rows[0];
  const packageOne = await addPackage(pool, publisher.id, "First");
  const packageTwo = await addPackage(pool, publisher.id, "Second");
  const inactivePackage = await addPackage(pool, publisher.id, "Inactive", "archived");

  await pool.query(
    `insert into book_access(user_id,book_package_id,role_scope) values
      ($1,$4,'student'),($1,$5,'student'),($2,$4,'student'),($3,$4,'student'),($6,$4,'teacher'),($7,$4,'student')`,
    [studentA1, studentA2, pausedStudent, packageOne.id, packageTwo.id, teacherA, studentB],
  );
  const privateCodes = [];
  for (const status of ["unused", "redeemed", "expired", "revoked"]) {
    privateCodes.push(await addCode(pool, schoolA.id, packageOne.id, status, studentA1));
  }
  privateCodes.push(await addCode(pool, schoolA.id, packageTwo.id, "unused"));
  privateCodes.push(await addCode(pool, schoolA.id, inactivePackage.id, "unused"));
  const schoolBCode = await addCode(pool, schoolB.id, packageOne.id, "unused");

  const assignedOne = await addAssignment(pool, schoolA.id, packageOne.activityId, teacherA, "assigned");
  const closedOne = await addAssignment(pool, schoolA.id, packageOne.activityId, teacherA, "closed");
  const assignedTwo = await addAssignment(pool, schoolA.id, packageTwo.activityId, teacherA, "assigned");
  const assignedB = await addAssignment(pool, schoolB.id, packageOne.activityId, teacherB, "assigned");
  await addSubmission(pool, schoolA.id, packageOne.activityId, assignedOne, studentA1, 40, "2026-07-29T10:00:00.000Z", "OLD_PERSONAL_ANSWER");
  await addSubmission(pool, schoolA.id, packageOne.activityId, assignedOne, studentA1, 0, "2026-07-30T10:00:00.000Z", "LATEST_ZERO_ANSWER");
  await addSubmission(pool, schoolA.id, packageOne.activityId, assignedOne, studentA2, null, "2026-07-30T11:00:00.000Z", "UNSCORED_ANSWER");
  await addSubmission(pool, schoolA.id, packageOne.activityId, closedOne, studentA1, 80, "2026-07-30T12:00:00.000Z", "CLOSED_ASSIGNMENT_ANSWER");
  await addSubmission(pool, schoolA.id, packageTwo.activityId, assignedTwo, studentA1, 76, "2026-07-30T13:00:00.000Z", "SECOND_PACKAGE_ANSWER");
  await addSubmission(pool, schoolB.id, packageOne.activityId, assignedB, studentB, 99, "2026-07-30T14:00:00.000Z", "SCHOOL_B_SECRET_ANSWER");

  const before = {};
  for (const table of ["activation_codes", "book_access", "activity_assignments", "activity_submissions"]) {
    before[table] = (await pool.query(`select count(*)::int count from ${table}`)).rows[0].count;
  }

  const summaryA = await call(cookies.adminA, "GET", "summary");
  assert.equal(summaryA.status, 200);
  assert.deepEqual(summaryA.body.school, { name: "Adoption School A" });
  assert.deepEqual(summaryA.body.summary, {
    packageCount: 2,
    generatedCodes: 6,
    redeemedCodes: 1,
    unusedCodes: 3,
    expiredCodes: 1,
    revokedCodes: 1,
    activeStudentEntitlements: 3,
    activeTeacherEntitlements: 1,
    activeAssignments: 2,
    uniqueSubmittedAssignments: 4,
    uniqueStudentsSubmitted: 2,
    scoredSubmissions: 3,
    averageScorePercent: 52,
    lastSubmissionAt: "2026-07-30T13:00:00.000Z",
    hasExportableData: true,
  });

  const summaryB = await call(cookies.adminB, "GET", "summary");
  assert.equal(summaryB.body.summary.generatedCodes, 1);
  assert.equal(summaryB.body.summary.uniqueSubmittedAssignments, 1);
  assert.equal(summaryB.body.summary.averageScorePercent, 99);
  assert.notDeepEqual(summaryA.body.summary, summaryB.body.summary);

  const emptySummary = await call(cookies.empty, "GET", "summary");
  assert.equal(emptySummary.body.summary.packageCount, 0);
  assert.equal(emptySummary.body.summary.averageScorePercent, null);
  assert.equal(emptySummary.body.summary.lastSubmissionAt, null);
  assert.equal(emptySummary.body.summary.hasExportableData, false);
  assert.equal((await call(cookies.empty, "POST", "export")).status, 409);

  const exportA = await call(cookies.adminA, "POST", "export");
  assert.equal(exportA.status, 200);
  assert.equal(exportA.headers["Content-Type"], "text/csv; charset=utf-8");
  assert.match(exportA.body, /Adoption School A/);
  assert.doesNotMatch(exportA.body, /Adoption School B|Empty Adoption School|SCHOOL_B_SECRET_ANSWER/);
  assert.ok(exportA.body.indexOf("First Package") < exportA.body.indexOf("Second Package"));
  assert.match(exportA.body, /First Package,[^,\r\n]+,B2,4,1,1,1,1,2,1,1,3,2,2,40,2026-07-30T12:00:00\.000Z/);
  assert.match(exportA.body, /Second Package,[^,\r\n]+,B2,1,0,1,0,0,1,0,1,1,1,1,76,2026-07-30T13:00:00\.000Z/);
  for (const forbidden of [
    "student-a1@adoption.invalid",
    "teacher-a@adoption.invalid",
    studentA1,
    teacherA,
    schoolA.id,
    "ANSWER",
    "••••-TEST",
    ...privateCodes,
    schoolBCode,
  ]) assert.equal(exportA.body.includes(forbidden), false);

  const exportB = await call(cookies.adminB, "POST", "export");
  assert.equal(exportB.status, 200);
  assert.match(exportB.body, /Adoption School B/);
  assert.doesNotMatch(exportB.body, /Adoption School A/);

  assert.equal((await pool.query(
    "select count(*)::int count from account_security_events where event_type='school_adoption_exported' and school_id=$1",
    [schoolA.id],
  )).rows[0].count, 1);
  const audit = (await pool.query(
    "select metadata from account_security_events where event_type='school_adoption_exported' and school_id=$1",
    [schoolA.id],
  )).rows[0].metadata;
  assert.deepEqual(audit, {
    package_count: 2,
    exported_row_count: 2,
    generated_code_count: 5,
    active_assignment_count: 2,
    latest_submission_pair_count: 4,
  });
  assert.equal((await pool.query(
    "select count(*)::int count from account_security_events where event_type='school_adoption_exported' and school_id=$1",
    [emptySchool.id],
  )).rows[0].count, 0);
  assert.equal((await pool.query(
    "select count(*)::int count from account_security_events where event_type='school_adoption_exported' and school_id=$1",
    [schoolB.id],
  )).rows[0].count, 1);

  for (const table of Object.keys(before)) {
    assert.equal((await pool.query(`select count(*)::int count from ${table}`)).rows[0].count, before[table]);
  }
});
