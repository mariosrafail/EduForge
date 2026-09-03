import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import bcrypt from "bcryptjs";
import pg from "pg";

import { hashToken, sessionCookieName, setSqlForTests } from "../../netlify/functions/_auth-utils.js";
import { handler } from "../../netlify/functions/book-content.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";

function scoped(base, schema) {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function tagged(executor) {
  const sql = async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await executor.query(text, values)).rows;
  };
  return sql;
}

async function insertUser(pool, { schoolId, name, email, role }) {
  const passwordHash = await bcrypt.hash("analytics-integration", 4);
  return (await pool.query(
    `insert into app_users(school_id,full_name,email,role,status,password_hash,auth_provider)
     values($1,$2,$3,$4,'active',$5,'password') returning id`,
    [schoolId, name, email, role, passwordHash],
  )).rows[0].id;
}

async function session(pool, userId) {
  const token = randomBytes(24).toString("hex");
  await pool.query("insert into auth_sessions(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 day')", [userId, hashToken(token)]);
  return `${sessionCookieName}=${token}`;
}

async function call(cookie, query = {}) {
  const parameters = { action: "teacher-grade-analytics", ...query };
  const response = await handler({
    httpMethod: "GET",
    headers: { cookie, host: "localhost:8888" },
    queryStringParameters: parameters,
    rawQuery: new URLSearchParams(parameters).toString(),
    body: "",
  });
  return { status: response.statusCode, body: JSON.parse(response.body || "{}") };
}

test("teacher grade analytics is tenant-safe and computes authoritative denominators", { skip: !enabled, timeout: 120_000 }, async (t) => {
  assert.notEqual(databaseUrl, process.env.DATABASE_URL, "TEST_DATABASE_URL must not equal DATABASE_URL");
  const schema = `teacher_analytics_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = scoped(databaseUrl, schema);
  setSqlForTests(tagged(pool));
  t.after(async () => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    setSqlForTests(null);
    await pool.end();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  });

  await applyCanonicalProductionMigrations(pool);
  const schools = (await pool.query("insert into schools(name) values('Analytics A'),('Analytics B') returning id,name")).rows;
  const schoolA = schools.find((row) => row.name.endsWith("A")).id;
  const schoolB = schools.find((row) => row.name.endsWith("B")).id;
  const teacherA = await insertUser(pool, { schoolId: schoolA, name: "Teacher A", email: `teacher-a-${schema}@test.invalid`, role: "teacher" });
  const teacherB = await insertUser(pool, { schoolId: schoolB, name: "Teacher B", email: `teacher-b-${schema}@test.invalid`, role: "teacher" });
  const studentA1 = await insertUser(pool, { schoolId: schoolA, name: "Student A1", email: `student-a1-${schema}@test.invalid`, role: "student" });
  const studentA2 = await insertUser(pool, { schoolId: schoolA, name: "Student A2", email: `student-a2-${schema}@test.invalid`, role: "student" });
  const studentB = await insertUser(pool, { schoolId: schoolB, name: "Student B", email: `student-b-${schema}@test.invalid`, role: "student" });
  const activity = (await pool.query("select id from activities order by id limit 1")).rows[0];
  assert.ok(activity);

  const classA = (await pool.query("insert into classes(school_id,teacher_id,name,slug,invite_code,status) values($1,$2,'Class A',$3,$4,'active') returning id", [schoolA, teacherA, `class-a-${schema}`, randomBytes(5).toString("hex")])).rows[0].id;
  const classB = (await pool.query("insert into classes(school_id,teacher_id,name,slug,invite_code,status) values($1,$2,'Class B',$3,$4,'active') returning id", [schoolB, teacherB, `class-b-${schema}`, randomBytes(5).toString("hex")])).rows[0].id;
  await pool.query("insert into class_students(class_id,student_id,status) values($1,$2,'active'),($1,$3,'active'),($4,$5,'active')", [classA, studentA1, studentA2, classB, studentB]);
  const assignments = (await pool.query(
    `insert into activity_assignments(school_id,activity_id,teacher_id,class_id,title,due_at,status)
     values($1,$2,$3,$4,'Auto score',now()+interval '7 days','assigned'),
           ($1,$2,$3,$4,'Teacher review',now()-interval '1 day','closed') returning id,title`,
    [schoolA, activity.id, teacherA, classA],
  )).rows;
  const auto = assignments.find((row) => row.title === "Auto score").id;
  const review = assignments.find((row) => row.title === "Teacher review").id;
  const foreignAssignment = (await pool.query("insert into activity_assignments(school_id,activity_id,teacher_id,class_id,title,status) values($1,$2,$3,$4,'Foreign','assigned') returning id", [schoolB, activity.id, teacherB, classB])).rows[0].id;
  await pool.query(
    `insert into activity_submissions(activity_assignment_id,school_id,activity_id,student_id,answers,score,score_percent,status,submission_slot,submitted_at)
     values($1,$2,$3,$4,'{}',100,100,'submitted',1,now()-interval '8 days'),
           ($5,$2,$3,$4,'{}',null,null,'awaiting_review',1,now()-interval '2 days'),
           ($5,$2,$3,$6,'{}',60,60,'reviewed',1,now()-interval '1 day'),
           ($7,$8,$3,$9,'{}',5,5,'submitted',1,now())`,
    [auto, schoolA, activity.id, studentA1, review, studentA2, foreignAssignment, schoolB, studentB],
  );

  const teacherCookie = await session(pool, teacherA);
  const studentCookie = await session(pool, studentA1);
  const teacherPayload = await call(teacherCookie);
  assert.equal(teacherPayload.status, 200);
  assert.deepEqual(teacherPayload.body.overview, {
    assignedSlots: 4,
    submitted: 3,
    missing: 1,
    completionRate: 75,
    scoredCount: 2,
    averageScore: 80,
    medianScore: 80,
    highestScore: 100,
    lowestScore: 60,
    awaitingReview: 1,
    reviewed: 1,
    autoScored: 1,
    completed: 0,
    unscoredCount: 1,
    recentGradedCount: 2,
  });
  assert.equal(teacherPayload.body.students.length, 2);
  assert.equal(teacherPayload.body.recentAssignments.some((item) => item.assignmentId === foreignAssignment), false);
  assert.doesNotMatch(JSON.stringify(teacherPayload.body), /teacherProject|correctAnswer|answerKey|responsePayload|answers/);

  assert.equal((await call(studentCookie)).status, 403);
  assert.equal((await call(teacherCookie, { classId: classB })).status, 404);
  assert.equal((await call(teacherCookie, { assignmentId: foreignAssignment })).status, 404);
  assert.equal((await call(teacherCookie, { teacherId: teacherB })).status, 400);

  const filtered = await call(teacherCookie, { assignmentId: auto });
  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.overview.assignedSlots, 2);
  assert.equal(filtered.body.overview.averageScore, 100);
  assert.equal(filtered.body.overview.medianScore, 100);
});
