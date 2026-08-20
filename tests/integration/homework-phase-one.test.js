import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { deleteAssignment, listAssignmentsForStudent } from "../../netlify/functions/_book-content/assignment-actions.js";
import {
  createHomework,
  getTeacherHomework,
  listStudentHomeworks,
  listTeacherHomeworks,
} from "../../netlify/functions/_book-content/homework-actions.js";
import { compilePublicationV2Fixture, publicationV2Fixture } from "../fixtures/publication-v2.js";
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
  return async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await executor.query(text, values)).rows;
  };
}

async function publishFixture(pool, { packageId, componentId, builderId }) {
  const compiled = compilePublicationV2Fixture({ prompt: "Homework public prompt", teacherAnswer: "Homework private answer" });
  const releaseId = randomUUID();
  await pool.query(`
    insert into book_component_releases(
      id,book_package_id,book_component_id,release_number,release_schema_version,compiler_id,
      runtime_compatibility_sha256,source_snapshot,source_snapshot_sha256,
      public_projection,public_projection_sha256,teacher_projection,teacher_projection_sha256,
      asset_manifest,release_sha256,request_sha256,client_mutation_id,created_by_builder_user_id
    ) values($1,$2,$3,501,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11::jsonb,$12,$13::jsonb,$14,$15,$16,$17)
  `, [
    releaseId, packageId, componentId, compiled.releaseSchemaVersion, compiled.compilerId,
    compiled.compatibility, JSON.stringify(compiled.sourceSnapshot), compiled.sourceSnapshotSha256,
    JSON.stringify(compiled.publicProjection), compiled.publicProjectionSha256,
    JSON.stringify(compiled.teacherProjection), compiled.teacherProjectionSha256,
    JSON.stringify(compiled.assetManifest), compiled.releaseSha256, randomBytes(32).toString("hex"), randomUUID(), builderId,
  ]);
  await pool.query(`
    insert into book_component_publication_events(
      book_package_id,book_component_id,previous_release_id,release_id,expected_head_revision,
      resulting_head_revision,request_sha256,client_mutation_id,published_by_builder_user_id
    ) values($1,$2,null,$3,0,1,$4,$5,$6)
  `, [packageId, componentId, releaseId, randomBytes(32).toString("hex"), randomUUID(), builderId]);
  await pool.query(`
    insert into book_component_publication_heads(
      book_component_id,book_package_id,release_id,head_revision,published_by_builder_user_id
    ) values($1,$2,$3,1,$4)
    on conflict(book_component_id) do update set release_id=excluded.release_id,head_revision=excluded.head_revision,published_by_builder_user_id=excluded.published_by_builder_user_id,published_at=now()
  `, [componentId, packageId, releaseId, builderId]);
  return releaseId;
}

function parse(response) {
  return { status: response.statusCode, body: JSON.parse(response.body || "{}") };
}

test("Homework persists mixed ordered targets atomically and idempotently with tenant-safe aggregate/student views", { skip: !enabled, timeout: 180_000 }, async (t) => {
  const schema = `homework_phase_one_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  t.after(async () => {
    await pool.end();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "041_homework_phase_one.sql");

  const teacher = (await pool.query("select id,school_id from app_users where role='teacher' and school_id is not null limit 1")).rows[0];
  const student = (await pool.query("select id from app_users where role='student' and school_id=$1 limit 1", [teacher.school_id])).rows[0];
  const scope = (await pool.query(`
    select package.id package_id,component.id component_id
    from book_packages package join book_components component on component.book_package_id=package.id
    where package.slug='ultimate-b2' and component.slug='ultimate-b2-students-book'
  `)).rows[0];
  const legacyActivity = (await pool.query(`
    select activity.id
    from activities activity
    join lessons lesson on lesson.id=activity.lesson_id
    join units unit_record on unit_record.id=lesson.unit_id
    join book_components component on component.id=unit_record.book_component_id
    where component.book_package_id=$1 and activity.is_assignable=true
    limit 1
  `, [scope.package_id])).rows[0];
  assert.ok(teacher && student && scope && legacyActivity);
  await pool.query("update app_users set status='active' where id=$1", [student.id]);
  await pool.query(`insert into book_access(user_id,book_package_id,role_scope) values($1,$2,'teacher'),($3,$2,'student') on conflict do nothing`, [teacher.id, scope.package_id, student.id]);

  const classRows = [];
  for (const label of ["A", "B"]) {
    classRows.push((await pool.query(`
      insert into classes(school_id,name,slug,teacher_id,book_package_id,status,invite_code)
      values($1,$2,$3,$4,$5,'active',$6) returning id,name
    `, [teacher.school_id, `Homework ${label}`, `homework-${label.toLowerCase()}-${randomUUID()}`, teacher.id, scope.package_id, randomBytes(5).toString("hex")])).rows[0]);
  }
  await pool.query("insert into class_students(class_id,student_id,status) values($1,$3,'active'),($2,$3,'active')", [classRows[0].id, classRows[1].id, student.id]);

  const builderId = randomUUID();
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Homework Builder',$2,'not-a-login-hash')", [builderId, `homework-${randomUUID()}@example.test`]);
  const releaseId = await publishFixture(pool, { packageId: scope.package_id, componentId: scope.component_id, builderId });

  const sql = tagged(pool);
  sql.assignmentLifecycleTransaction = async (assignmentId, callback) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`activity-assignment:${assignmentId}`]);
      const result = await callback(tagged(client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  const teacherUser = { ...teacher, role: "teacher" };
  const studentUser = { ...student, school_id: teacher.school_id, role: "student" };
  const request = {
    idempotencyKey: "homework-integration-request",
    title: "Mixed Homework",
    teacherNotes: "Complete both activities.",
    worksheetLinks: ["https://example.test/homework"],
    dueAt: "2099-01-01T23:59:00Z",
    classIds: classRows.map((row) => row.id),
    items: [
      { kind: "legacy_activity", activityId: legacyActivity.id },
      { kind: "published_native", releaseId, nativeActivityId: publicationV2Fixture.openResponseId },
    ],
  };

  const created = parse(await createHomework(sql, request, teacherUser));
  assert.equal(created.status, 201);
  assert.equal(created.body.homework.itemCount, 2);
  assert.deepEqual(created.body.homework.items.map((item) => item.targetKind), ["legacy_activity", "published_native"]);
  assert.equal(created.body.homework.items.every((item) => item.assignments.length === 2), true);
  const homeworkId = created.body.homework.id;
  assert.equal(Number((await pool.query("select count(*) from homeworks where id=$1", [homeworkId])).rows[0].count), 1);
  assert.equal(Number((await pool.query("select count(*) from homework_items where homework_id=$1", [homeworkId])).rows[0].count), 2);
  assert.equal(Number((await pool.query("select count(*) from activity_assignments where homework_id=$1", [homeworkId])).rows[0].count), 4);

  const replay = parse(await createHomework(sql, request, teacherUser));
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent, true);
  assert.equal(replay.body.homework.id, homeworkId);
  assert.equal(Number((await pool.query("select count(*) from activity_assignments where homework_id=$1", [homeworkId])).rows[0].count), 4);
  const changedReplay = parse(await createHomework(sql, { ...request, title: "Changed title" }, teacherUser));
  assert.equal(changedReplay.status, 409);
  assert.equal(changedReplay.body.conflict, "idempotency-key-reuse");

  const initialTeacherView = (await listTeacherHomeworks(sql, teacher.id, teacherUser))[0];
  assert.deepEqual(initialTeacherView.progress, { expected: 2, submitted: 0, missing: 2, awaitingReview: 0, reviewed: 0, autoScored: 0, completionPercent: 0 });
  assert.equal(initialTeacherView.classes.length, 2);
  const initialStudentView = (await listStudentHomeworks(sql, student.id, studentUser))[0];
  assert.equal(initialStudentView.itemCount, 2);
  assert.deepEqual(initialStudentView.items.map((item) => item.position), [1, 2]);
  assert.doesNotMatch(JSON.stringify(initialStudentView), /Homework private answer|teacherProjection|modelAnswers|correctAnswers/);

  await pool.query("delete from book_access where user_id=$1 and book_package_id=$2 and role_scope='student'", [student.id, scope.package_id]);
  assert.deepEqual(await listStudentHomeworks(sql, student.id, studentUser), []);
  assert.deepEqual((await listTeacherHomeworks(sql, teacher.id, teacherUser))[0].progress, {
    expected: 0, submitted: 0, missing: 0, awaitingReview: 0, reviewed: 0, autoScored: 0, completionPercent: null,
  });
  await pool.query("insert into book_access(user_id,book_package_id,role_scope) values($1,$2,'student')", [student.id, scope.package_id]);

  const nativeItem = initialStudentView.items.find((item) => item.targetKind === "published_native");
  await pool.query(`
    insert into activity_submissions(
      school_id,activity_assignment_id,student_id,answers,status,submission_slot
    ) values($1,$2,$3,'{}'::jsonb,'awaiting_review',1)
  `, [teacher.school_id, nativeItem.assignmentId, student.id]);
  const progressedTeacherView = (await listTeacherHomeworks(sql, teacher.id, teacherUser))[0];
  assert.deepEqual(progressedTeacherView.progress, { expected: 2, submitted: 1, missing: 1, awaitingReview: 1, reviewed: 0, autoScored: 0, completionPercent: 50 });
  const progressedStudentView = (await listStudentHomeworks(sql, student.id, studentUser))[0];
  assert.equal(progressedStudentView.progress.submitted, 1);
  assert.equal(progressedStudentView.items.find((item) => item.id === nativeItem.id).assignmentId, nativeItem.assignmentId);

  const groupedLegacyAssignment = created.body.homework.items.find((item) => item.targetKind === "legacy_activity").assignments[0];
  const blockedLifecycle = parse(await deleteAssignment(sql, { assignmentId: groupedLegacyAssignment.id }, teacherUser));
  assert.equal(blockedLifecycle.status, 409);
  assert.equal(blockedLifecycle.body.conflict, "homework-managed-assignment");
  assert.equal(Number((await pool.query("select count(*) from activity_assignments where id=$1", [groupedLegacyAssignment.id])).rows[0].count), 1);

  const standalone = (await pool.query(`
    insert into activity_assignments(school_id,activity_id,teacher_id,class_id,status,title)
    values($1,$2,$3,$4,'assigned','Standalone compatibility') returning id
  `, [teacher.school_id, legacyActivity.id, teacher.id, classRows[0].id])).rows[0];
  const allStudentAssignments = await listAssignmentsForStudent(sql, student.id, studentUser);
  assert.ok(allStudentAssignments.find((assignment) => assignment.id === standalone.id && !assignment.homeworkId));
  assert.equal(allStudentAssignments.filter((assignment) => assignment.homeworkId === homeworkId).length, 4);

  const foreignSchool = (await pool.query("insert into schools(name,status) values($1,'active') returning id", [`Foreign ${randomUUID()}`])).rows[0];
  const foreignTeacher = (await pool.query(`
    insert into app_users(school_id,full_name,email,role,status)
    values($1,'Foreign Teacher',$2,'teacher','active') returning id,school_id
  `, [foreignSchool.id, `foreign-${randomUUID()}@example.test`])).rows[0];
  const foreignClass = (await pool.query(`
    insert into classes(school_id,name,slug,teacher_id,status,invite_code)
    values($1,'Foreign class',$2,$3,'active',$4) returning id
  `, [foreignSchool.id, `foreign-${randomUUID()}`, foreignTeacher.id, randomBytes(5).toString("hex")])).rows[0];
  const foreignUser = { ...foreignTeacher, role: "teacher" };
  assert.deepEqual(await listTeacherHomeworks(sql, foreignTeacher.id, foreignUser), []);
  assert.equal(await getTeacherHomework(sql, homeworkId, foreignTeacher.id, foreignUser), null);
  await assert.rejects(
    pool.query("update activity_assignments set school_id=$1 where homework_id=$2", [foreignSchool.id, homeworkId]),
    /activity_assignments_homework_scope_fk/,
  );
  const crossSchoolCreate = parse(await createHomework(sql, { ...request, idempotencyKey: "homework-cross-school", classIds: [foreignClass.id] }, teacherUser));
  assert.equal(crossSchoolCreate.status, 403);

  const duplicateInput = parse(await createHomework(sql, {
    ...request,
    idempotencyKey: "homework-duplicate-input",
    items: [request.items[0], request.items[0]],
  }, teacherUser));
  assert.equal(duplicateInput.status, 400);
  assert.equal(Number((await pool.query("select count(*) from homeworks where idempotency_key='homework-duplicate-input'")).rows[0].count), 0);

  const teacherMaterial = parse(await createHomework(sql, {
    ...request,
    idempotencyKey: "homework-answer-injection",
    teacherProjection: { answers: ["must never persist"] },
  }, teacherUser));
  assert.equal(teacherMaterial.status, 400);
  assert.equal(Number((await pool.query("select count(*) from homeworks where idempotency_key='homework-answer-injection'")).rows[0].count), 0);

  await pool.query(`
    create function reject_homework_class_b() returns trigger language plpgsql as $$
    begin
      if new.homework_id is not null and new.class_id = '${classRows[1].id}'::uuid then
        raise exception 'forced Homework recipient failure';
      end if;
      return new;
    end $$
  `);
  await pool.query("create trigger reject_homework_class_b before insert on activity_assignments for each row execute function reject_homework_class_b()");
  await assert.rejects(
    createHomework(sql, { ...request, idempotencyKey: "homework-rollback-proof", title: "Must roll back" }, teacherUser),
    /forced Homework recipient failure/,
  );
  assert.equal(Number((await pool.query("select count(*) from homeworks where idempotency_key='homework-rollback-proof'")).rows[0].count), 0);
  assert.equal(Number((await pool.query("select count(*) from homework_items item join homeworks homework on homework.id=item.homework_id where homework.idempotency_key='homework-rollback-proof'")).rows[0].count), 0);
  await pool.query("drop trigger reject_homework_class_b on activity_assignments");
  await pool.query("drop function reject_homework_class_b()");

  await pool.query("update activities set is_assignable=false where id=$1", [legacyActivity.id]);
  const invalidTarget = parse(await createHomework(sql, { ...request, idempotencyKey: "homework-invalid-target" }, teacherUser));
  assert.equal(invalidTarget.status, 403);
  assert.equal(Number((await pool.query("select count(*) from homeworks where idempotency_key='homework-invalid-target'")).rows[0].count), 0);

  await pool.query("update activities set is_assignable=true where id=$1", [legacyActivity.id]);
  const singleClass = parse(await createHomework(sql, {
    ...request,
    idempotencyKey: "homework-single-class",
    title: "Single class Homework",
    classIds: [classRows[0].id],
  }, teacherUser));
  assert.equal(singleClass.status, 201);
  assert.equal(singleClass.body.homework.classes.length, 1);
  assert.equal(singleClass.body.homework.items.every((item) => item.assignments.length === 1), true);
});
