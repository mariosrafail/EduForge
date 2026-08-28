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
  updateHomework,
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

function editRequest(homework, overrides = {}) {
  return {
    homeworkId: homework.id,
    expectedUpdatedAt: homework.updatedAt instanceof Date ? homework.updatedAt.toISOString() : homework.updatedAt,
    title: homework.title,
    teacherNotes: homework.teacherNotes,
    worksheetLinks: homework.worksheetLinks,
    dueAt: homework.dueAt instanceof Date ? homework.dueAt.toISOString() : homework.dueAt,
    classIds: homework.classes.map((item) => item.id),
    items: homework.items.map((item) => item.targetKind === "published_native" ? {
      kind: "published_native",
      releaseId: item.nativeReleaseId,
      nativeActivityId: item.nativeActivityId,
    } : { kind: "legacy_activity", activityId: item.activityId }),
    ...overrides,
  };
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
  assert.equal(migrations.at(-1).filename, "048_ultimate_b2_product_publication.sql");

  const teacher = (await pool.query("select id,school_id from app_users where role='teacher' and school_id is not null limit 1")).rows[0];
  const student = (await pool.query("select id from app_users where role='student' and school_id=$1 limit 1", [teacher.school_id])).rows[0];
  const scope = (await pool.query(`
    select package.id package_id,component.id component_id
    from book_packages package join book_components component on component.book_package_id=package.id
    where package.slug='ultimate-b2' and component.slug='ultimate-b2-students-book'
  `)).rows[0];
  const legacyActivity = (await pool.query(`
    select activity.id, activity.lesson_id
    from activities activity
    join lessons lesson on lesson.id=activity.lesson_id
    join units unit_record on unit_record.id=lesson.unit_id
    join book_components component on component.id=unit_record.book_component_id
    where component.book_package_id=$1 and component.id=$2 and activity.is_assignable=true
    order by activity.id
    limit 1
  `, [scope.package_id, scope.component_id])).rows[0];
  assert.ok(teacher && student && scope && legacyActivity);
  const secondLegacyActivity = (await pool.query(`
    insert into activities(lesson_id,title,slug,type,activity_type,content,content_json,settings_json,is_assignable)
    values($1,'Homework edit fixture',$2,'multiple_choice','multiple_choice','{}','{}','{}',true)
    returning id
  `, [legacyActivity.lesson_id, `homework-edit-${randomUUID()}`])).rows[0];
  await pool.query("update app_users set status='active' where id=$1", [student.id]);
  await pool.query(`insert into book_access(user_id,book_package_id,role_scope) values($1,$2,'teacher'),($3,$2,'student') on conflict do nothing`, [teacher.id, scope.package_id, student.id]);

  const classRows = [];
  for (const label of ["A", "B", "C"]) {
    classRows.push((await pool.query(`
      insert into classes(school_id,name,slug,teacher_id,book_package_id,status,invite_code)
      values($1,$2,$3,$4,$5,'active',$6) returning id,name
    `, [teacher.school_id, `Homework ${label}`, `homework-${label.toLowerCase()}-${randomUUID()}`, teacher.id, scope.package_id, randomBytes(5).toString("hex")])).rows[0]);
  }
  await pool.query("insert into class_students(class_id,student_id,status) values($1,$4,'active'),($2,$4,'active'),($3,$4,'active')", [classRows[0].id, classRows[1].id, classRows[2].id, student.id]);

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
  sql.homeworkMutationTransaction = async (homeworkId, callback) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`homework:${homeworkId}`]);
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
    classIds: classRows.slice(0, 2).map((row) => row.id),
    items: [
      { kind: "legacy_activity", activityId: legacyActivity.id },
      { kind: "published_native", releaseId, nativeActivityId: publicationV2Fixture.openResponseId },
    ],
  };

  const created = parse(await createHomework(sql, request, teacherUser));
  assert.equal(created.status, 201, JSON.stringify(created.body));
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

  const initialItemIds = new Map(initialTeacherView.items.map((item) => [item.targetKind, item.id]));
  const initialAssignmentIds = new Set(initialTeacherView.items.flatMap((item) => item.assignments.map((assignment) => assignment.id)));
  const initialKeys = (await pool.query("select idempotency_key from activity_assignments where homework_id=$1", [homeworkId])).rows;
  assert.equal(initialKeys.every((row) => row.idempotency_key.includes(":item:")), true);
  const historicalAssignment = initialTeacherView.items[0].assignments[0];
  const historicalPositionKey = `homework:${homeworkId}:1:class:${historicalAssignment.classId}`;
  await pool.query("update activity_assignments set idempotency_key=$1 where id=$2", [historicalPositionKey, historicalAssignment.id]);

  let currentHomework = parse(await updateHomework(sql, editRequest(initialTeacherView, {
    title: "Edited Homework metadata",
    teacherNotes: "Updated instructions",
    worksheetLinks: ["https://example.test/updated"],
    dueAt: "2099-02-02T23:59:00Z",
  }), teacherUser));
  assert.equal(currentHomework.status, 200, JSON.stringify(currentHomework.body));
  currentHomework = currentHomework.body.homework;
  assert.equal(currentHomework.id, homeworkId);
  assert.deepEqual(new Set(currentHomework.items.map((item) => item.id)), new Set(initialItemIds.values()));
  assert.deepEqual(new Set(currentHomework.items.flatMap((item) => item.assignments.map((assignment) => assignment.id))), initialAssignmentIds);
  const synchronized = (await pool.query("select distinct title,teacher_notes,worksheet_links,due_at from activity_assignments where homework_id=$1", [homeworkId])).rows;
  assert.equal(synchronized.length, 1);
  assert.equal(synchronized[0].title, "Edited Homework metadata");
  assert.equal(synchronized[0].teacher_notes, "Updated instructions");
  assert.deepEqual(synchronized[0].worksheet_links, ["https://example.test/updated"]);

  const stale = parse(await updateHomework(sql, editRequest(initialTeacherView, { title: "Stale overwrite" }), teacherUser));
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body.conflict, "homework-stale-edit");
  assert.equal((await pool.query("select title from homeworks where id=$1", [homeworkId])).rows[0].title, "Edited Homework metadata");

  const reversedItems = [...editRequest(currentHomework).items].reverse();
  let edited = parse(await updateHomework(sql, editRequest(currentHomework, { items: reversedItems }), teacherUser));
  assert.equal(edited.status, 200);
  currentHomework = edited.body.homework;
  assert.deepEqual(currentHomework.items.map((item) => item.targetKind), ["published_native", "legacy_activity"]);
  assert.equal(currentHomework.items.find((item) => item.targetKind === "legacy_activity").id, initialItemIds.get("legacy_activity"));
  assert.deepEqual(new Set(currentHomework.items.flatMap((item) => item.assignments.map((assignment) => assignment.id))), initialAssignmentIds);
  assert.deepEqual((await listStudentHomeworks(sql, student.id, studentUser))[0].items.map((item) => item.targetKind), ["published_native", "legacy_activity"]);

  const addedTarget = { kind: "legacy_activity", activityId: secondLegacyActivity.id };
  edited = parse(await updateHomework(sql, editRequest(currentHomework, { items: [...editRequest(currentHomework).items, addedTarget] }), teacherUser));
  assert.equal(edited.status, 200);
  const withAddedActivity = edited.body.homework;
  assert.equal(withAddedActivity.itemCount, 3);
  assert.equal(withAddedActivity.items.find((item) => item.activityId === legacyActivity.id).id, initialItemIds.get("legacy_activity"));
  assert.equal(withAddedActivity.items.find((item) => item.targetKind === "published_native").id, initialItemIds.get("published_native"));
  const addedItem = withAddedActivity.items.find((item) => item.activityId === secondLegacyActivity.id);
  assert.equal(addedItem.assignments.length, 2);
  assert.equal(addedItem.assignments.every((assignment) => !initialAssignmentIds.has(assignment.id)), true);
  const addedKeys = (await pool.query("select idempotency_key from activity_assignments where homework_item_id=$1", [addedItem.id])).rows;
  assert.equal(addedKeys.every((row) => row.idempotency_key.includes(`:item:${addedItem.id}:class:`)), true);
  assert.equal((await pool.query("select idempotency_key from activity_assignments where id=$1", [historicalAssignment.id])).rows[0].idempotency_key, historicalPositionKey);

  edited = parse(await updateHomework(sql, editRequest(withAddedActivity, {
    items: editRequest(withAddedActivity).items.filter((item) => item.activityId !== secondLegacyActivity.id),
  }), teacherUser));
  assert.equal(edited.status, 200);
  currentHomework = edited.body.homework;
  assert.equal(Number((await pool.query("select count(*) from homework_items where id=$1", [addedItem.id])).rows[0].count), 0);
  assert.equal(Number((await pool.query("select count(*) from activity_assignments where homework_item_id=$1", [addedItem.id])).rows[0].count), 0);

  const classAIdsBefore = new Set(currentHomework.items.flatMap((item) => item.assignments.filter((assignment) => assignment.classId === classRows[0].id).map((assignment) => assignment.id)));
  edited = parse(await updateHomework(sql, editRequest(currentHomework, { classIds: [classRows[0].id] }), teacherUser));
  assert.equal(edited.status, 200);
  const oneClassHomework = edited.body.homework;
  assert.deepEqual(oneClassHomework.classes.map((item) => item.id), [classRows[0].id]);
  assert.deepEqual(new Set(oneClassHomework.items.flatMap((item) => item.assignments.map((assignment) => assignment.id))), classAIdsBefore);
  edited = parse(await updateHomework(sql, editRequest(oneClassHomework, { classIds: [classRows[0].id, classRows[1].id] }), teacherUser));
  assert.equal(edited.status, 200);
  currentHomework = edited.body.homework;
  assert.equal(currentHomework.items.every((item) => item.assignments.length === 2), true);
  assert.deepEqual(new Set(currentHomework.items.flatMap((item) => item.assignments.filter((assignment) => assignment.classId === classRows[0].id).map((assignment) => assignment.id))), classAIdsBefore);

  const retainedLegacyId = currentHomework.items.find((item) => item.activityId === legacyActivity.id).id;
  const retainedClassBId = currentHomework.items.find((item) => item.activityId === legacyActivity.id).assignments.find((assignment) => assignment.classId === classRows[1].id).id;
  edited = parse(await updateHomework(sql, editRequest(currentHomework, {
    classIds: [classRows[1].id, classRows[2].id],
    items: [addedTarget, { kind: "legacy_activity", activityId: legacyActivity.id }],
  }), teacherUser));
  assert.equal(edited.status, 200);
  const combinedHomework = edited.body.homework;
  assert.deepEqual(combinedHomework.items.map((item) => item.position), [1, 2]);
  assert.deepEqual(new Set(combinedHomework.classes.map((item) => item.id)), new Set([classRows[1].id, classRows[2].id]));
  assert.equal(combinedHomework.items.find((item) => item.activityId === legacyActivity.id).id, retainedLegacyId);
  assert.equal(combinedHomework.items.find((item) => item.activityId === legacyActivity.id).assignments.find((assignment) => assignment.classId === classRows[1].id).id, retainedClassBId);
  assert.equal(Number((await pool.query("select count(*) from activity_assignments where homework_id=$1", [homeworkId])).rows[0].count), 4);
  assert.equal(Number((await pool.query("select count(*) from activity_assignments where homework_id=$1 group by homework_item_id,class_id having count(*)>1", [homeworkId])).rowCount), 0);

  edited = parse(await updateHomework(sql, editRequest(combinedHomework, {
    classIds: [classRows[0].id, classRows[1].id],
    items: [request.items[0], request.items[1]],
  }), teacherUser));
  assert.equal(edited.status, 200);
  currentHomework = edited.body.homework;

  const rollbackBefore = (await pool.query("select title,updated_at::text from homeworks where id=$1", [homeworkId])).rows[0];
  await pool.query(`
    create function reject_homework_edit_class_b() returns trigger language plpgsql as $$
    begin
      if new.homework_id = '${homeworkId}'::uuid and new.class_id = '${classRows[1].id}'::uuid then
        raise exception 'forced Homework edit recipient failure';
      end if;
      return new;
    end $$
  `);
  await pool.query("create trigger reject_homework_edit_class_b before insert on activity_assignments for each row execute function reject_homework_edit_class_b()");
  await assert.rejects(
    updateHomework(sql, editRequest(currentHomework, { title: "Must roll back edit", items: [...editRequest(currentHomework).items, addedTarget] }), teacherUser),
    /forced Homework edit recipient failure/,
  );
  await pool.query("drop trigger reject_homework_edit_class_b on activity_assignments");
  await pool.query("drop function reject_homework_edit_class_b()");
  const rollbackAfter = (await pool.query("select title,updated_at::text from homeworks where id=$1", [homeworkId])).rows[0];
  assert.deepEqual(rollbackAfter, rollbackBefore);
  assert.equal(Number((await pool.query("select count(*) from homework_items where homework_id=$1", [homeworkId])).rows[0].count), 2);

  await pool.query("update activities set is_assignable=false where id=$1", [secondLegacyActivity.id]);
  const invalidEditTarget = parse(await updateHomework(sql, editRequest(currentHomework, { title: "Must not partially update", items: [...editRequest(currentHomework).items, addedTarget] }), teacherUser));
  assert.equal(invalidEditTarget.status, 403);
  assert.equal((await pool.query("select title from homeworks where id=$1", [homeworkId])).rows[0].title, currentHomework.title);
  await pool.query("update activities set is_assignable=true where id=$1", [secondLegacyActivity.id]);
  const missingLegacyTarget = parse(await updateHomework(sql, editRequest(currentHomework, {
    items: [...editRequest(currentHomework).items, { kind: "legacy_activity", activityId: randomUUID() }],
  }), teacherUser));
  assert.equal(missingLegacyTarget.status, 404);
  const missingNativeTarget = parse(await updateHomework(sql, editRequest(currentHomework, {
    items: [...editRequest(currentHomework).items, { kind: "published_native", releaseId: randomUUID(), nativeActivityId: "missing-native" }],
  }), teacherUser));
  assert.equal(missingNativeTarget.status, 404);
  assert.equal((await pool.query("select title from homeworks where id=$1", [homeworkId])).rows[0].title, currentHomework.title);

  await pool.query("delete from book_access where user_id=$1 and book_package_id=$2 and role_scope='student'", [student.id, scope.package_id]);
  assert.deepEqual(await listStudentHomeworks(sql, student.id, studentUser), []);
  assert.deepEqual((await listTeacherHomeworks(sql, teacher.id, teacherUser))[0].progress, {
    expected: 0, submitted: 0, missing: 0, awaitingReview: 0, reviewed: 0, autoScored: 0, completionPercent: null,
  });
  await pool.query("insert into book_access(user_id,book_package_id,role_scope) values($1,$2,'student')", [student.id, scope.package_id]);

  const nativeItem = (await listStudentHomeworks(sql, student.id, studentUser))[0].items.find((item) => item.targetKind === "published_native");
  await pool.query(`
    insert into activity_submissions(
      school_id,activity_assignment_id,student_id,answers,status,submission_slot
    ) values($1,$2,$3,'{}'::jsonb,'awaiting_review',1)
  `, [teacher.school_id, nativeItem.assignmentId, student.id]);
  const progressedTeacherView = (await listTeacherHomeworks(sql, teacher.id, teacherUser))[0];
  assert.deepEqual(progressedTeacherView.progress, { expected: 2, submitted: 1, missing: 1, awaitingReview: 1, reviewed: 0, autoScored: 0, completionPercent: 50 });
  assert.equal(progressedTeacherView.structureLocked, true);
  assert.equal(progressedTeacherView.canEditStructure, false);
  const progressedStudentView = (await listStudentHomeworks(sql, student.id, studentUser))[0];
  assert.equal(progressedStudentView.progress.submitted, 1);
  assert.equal(progressedStudentView.items.find((item) => item.id === nativeItem.id).assignmentId, nativeItem.assignmentId);

  const lockedSnapshot = {
    itemIds: (await pool.query("select id,position from homework_items where homework_id=$1 order by position", [homeworkId])).rows,
    assignmentIds: (await pool.query("select id,homework_item_id,class_id from activity_assignments where homework_id=$1 order by id", [homeworkId])).rows,
  };
  const lockedStructure = parse(await updateHomework(sql, editRequest(progressedTeacherView, {
    items: [...editRequest(progressedTeacherView).items].reverse(),
  }), teacherUser));
  assert.equal(lockedStructure.status, 409);
  assert.equal(lockedStructure.body.conflict, "homework-structure-locked");
  assert.deepEqual((await pool.query("select id,position from homework_items where homework_id=$1 order by position", [homeworkId])).rows, lockedSnapshot.itemIds);
  assert.deepEqual((await pool.query("select id,homework_item_id,class_id from activity_assignments where homework_id=$1 order by id", [homeworkId])).rows, lockedSnapshot.assignmentIds);

  const submissionBeforeMetadata = (await pool.query("select id,status,score,score_percent from activity_submissions where activity_assignment_id=$1", [nativeItem.assignmentId])).rows[0];
  const metadataAfterSubmission = parse(await updateHomework(sql, editRequest(progressedTeacherView, {
    title: "Metadata after learner work",
    teacherNotes: "Results stay intact",
  }), teacherUser));
  assert.equal(metadataAfterSubmission.status, 200);
  assert.equal(metadataAfterSubmission.body.homework.structureLocked, true);
  assert.deepEqual((await pool.query("select id,status,score,score_percent from activity_submissions where activity_assignment_id=$1", [nativeItem.assignmentId])).rows[0], submissionBeforeMetadata);
  assert.equal(Number((await pool.query("select count(distinct title) from activity_assignments where homework_id=$1 and title='Metadata after learner work'", [homeworkId])).rows[0].count), 1);

  const sameSchoolTeacher = (await pool.query(`
    insert into app_users(school_id,full_name,email,role,status)
    values($1,'Other Homework Teacher',$2,'teacher','active') returning id,school_id
  `, [teacher.school_id, `other-homework-${randomUUID()}@example.test`])).rows[0];
  const ownershipDenied = parse(await updateHomework(sql, editRequest(metadataAfterSubmission.body.homework), { ...sameSchoolTeacher, role: "teacher" }));
  assert.equal(ownershipDenied.status, 403);
  const studentDenied = parse(await updateHomework(sql, editRequest(metadataAfterSubmission.body.homework), studentUser));
  assert.equal(studentDenied.status, 403);

  const sameSchoolAdmin = { id: randomUUID(), school_id: teacher.school_id, role: "admin" };
  const adminEdit = parse(await updateHomework(sql, editRequest(metadataAfterSubmission.body.homework, { title: "Same-school admin metadata" }), sameSchoolAdmin));
  assert.equal(adminEdit.status, 200);
  assert.equal(adminEdit.body.homework.teacherId, teacher.id);

  const answerInjection = parse(await updateHomework(sql, {
    ...editRequest(adminEdit.body.homework),
    modelAnswers: { correctAnswers: ["must never persist"] },
  }, teacherUser));
  assert.equal(answerInjection.status, 400);
  assert.doesNotMatch(JSON.stringify(answerInjection.body), /must never persist/);

  const groupedLegacyAssignment = metadataAfterSubmission.body.homework.items.find((item) => item.targetKind === "legacy_activity").assignments[0];
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
  const crossSchoolEdit = parse(await updateHomework(sql, editRequest(metadataAfterSubmission.body.homework), foreignUser));
  assert.equal(crossSchoolEdit.status, 403);
  const crossSchoolAdminEdit = parse(await updateHomework(sql, editRequest(metadataAfterSubmission.body.homework), { ...foreignUser, role: "admin" }));
  assert.equal(crossSchoolAdminEdit.status, 403);
  await assert.rejects(
    pool.query("update activity_assignments set school_id=$1 where homework_id=$2", [foreignSchool.id, homeworkId]),
    /activity_assignments_homework_scope_fk/,
  );
  const crossSchoolCreate = parse(await createHomework(sql, { ...request, idempotencyKey: "homework-cross-school", classIds: [foreignClass.id] }, teacherUser));
  assert.equal(crossSchoolCreate.status, 403);

  await pool.query("update homeworks set status='closed' where id=$1", [homeworkId]);
  const closedHomework = await getTeacherHomework(sql, homeworkId, teacher.id, teacherUser);
  const closedBefore = (await pool.query("select title,updated_at::text from homeworks where id=$1", [homeworkId])).rows[0];
  const closedEdit = parse(await updateHomework(sql, editRequest(closedHomework, { title: "Must remain closed" }), teacherUser));
  assert.equal(closedEdit.status, 409);
  assert.equal(closedEdit.body.conflict, "homework-closed");
  assert.deepEqual((await pool.query("select title,updated_at::text from homeworks where id=$1", [homeworkId])).rows[0], closedBefore);

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
