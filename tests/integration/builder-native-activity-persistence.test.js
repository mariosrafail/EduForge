import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { createBuilderContentHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content.js";
import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { createBuilderNativeActivitiesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { createBuilderNativeActivity } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activity-store.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000001";

function scoped(base, schema) { const url = new URL(base); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function tag(pool) { return async (strings, ...values) => { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return (await pool.query(text, values)).rows; }; }
function event({ kind = "open-response", title = "Integration native", mutationId = randomUUID() } = {}) { return { httpMethod: "POST", path: "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/create", headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ kind, pageId: "ub2-sb-unit-1-part-1", title, clientMutationId: mutationId }) }; }
function pairEvent(activityId, body) { return { httpMethod: "POST", path: `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/save`, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify(body) }; }

test("isolated PostgreSQL creates native index/public/Teacher drafts atomically, idempotently, and without identity races", { skip: !enabled }, async (t) => {
  const schema = `builder_native_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 5 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "037_builder_native_open_response_authoring.sql");
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Native Actor','native@example.test','hash')", [actor]);
  const sql = tag(pool);
  const handler = createBuilderNativeActivitiesHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });

  const mutationId = randomUUID();
  const first = await handler(event({ mutationId }));
  assert.equal(first.statusCode, 200);
  const created = JSON.parse(first.body);
  const replay = JSON.parse((await handler(event({ mutationId }))).body);
  assert.equal(replay.activityId, created.activityId);
  assert.equal(replay.idempotent, true);
  const changedReuse = await handler(event({ mutationId, kind: "image", title: "Different request" }));
  assert.equal(changedReuse.statusCode, 409);
  assert.equal(JSON.parse(changedReuse.body).error, "mutation_id_conflict");

  const currentPublic = (await pool.query("select payload from builder_component_documents where document_type='native_activity_public' and document_key=$1", [created.activityId])).rows[0].payload;
  const currentTeacher = (await pool.query("select payload from builder_component_documents where document_type='native_activity_teacher' and document_key=$1", [created.activityId])).rows[0].payload;
  const questionId = `q-${"a".repeat(32)}`;
  currentPublic.parts[0].interaction.questions.push({ id: questionId, prompt: "Integration prompt", promptArea: { x: 20, y: 20, width: 400, height: 50 }, promptStyle: { fontFamily: "Arial", fontSize: 20, color: "#111827", align: "left" }, responseRegion: { id: `${questionId}-response`, ariaLabel: "Response for question 1", area: { x: 40, y: 100, width: 500, height: 120 }, presentation: { paddingX: 10, paddingY: 8, lineCount: 3, lineSpacing: 32, linePositions: [40,72,104], lineWidth: 480, answerFontFamily: "Arial", answerFontSizeMin: 12, answerFontSizeMax: 22, color: "#111827", align: "left" } } });
  currentTeacher.parts[0].solution.modelAnswers.push({ questionId, text: "Private integration answer" });
  const pairMutationId = randomUUID();
  const pairBody = { expectedPublicRevision: 1, expectedTeacherRevision: 1, clientMutationId: pairMutationId, publicDocument: currentPublic, teacherDocument: currentTeacher };
  const paired = await handler(pairEvent(created.activityId, pairBody)); assert.equal(paired.statusCode, 200);
  assert.deepEqual([JSON.parse(paired.body).publicRevision, JSON.parse(paired.body).teacherRevision], [2, 2]);
  assert.equal(JSON.parse((await handler(pairEvent(created.activityId, pairBody))).body).idempotent, true);
  const changedPair = structuredClone(pairBody); changedPair.publicDocument.metadata.title = "Changed replay";
  assert.equal((await handler(pairEvent(created.activityId, changedPair))).statusCode, 409);
  assert.equal((await handler(pairEvent(created.activityId, { ...pairBody, clientMutationId: randomUUID(), expectedTeacherRevision: 1 }))).statusCode, 409);
  const invalidPair = structuredClone(pairBody); invalidPair.clientMutationId = randomUUID(); invalidPair.expectedPublicRevision = 2; invalidPair.expectedTeacherRevision = 2; invalidPair.teacherDocument.parts[0].solution.modelAnswers = [];
  const beforeInvalid = await pool.query("select revision from builder_component_documents where document_key=$1 and document_type in ('native_activity_public','native_activity_teacher') order by document_type", [created.activityId]);
  assert.equal((await handler(pairEvent(created.activityId, invalidPair))).statusCode, 400);
  assert.deepEqual((await pool.query("select revision from builder_component_documents where document_key=$1 and document_type in ('native_activity_public','native_activity_teacher') order by document_type", [created.activityId])).rows, beforeInvalid.rows);
  const concurrentPairA = structuredClone(pairBody); concurrentPairA.clientMutationId = randomUUID(); concurrentPairA.expectedPublicRevision = 2; concurrentPairA.expectedTeacherRevision = 2; concurrentPairA.publicDocument.metadata.title = "Concurrent pair A";
  const concurrentPairB = structuredClone(pairBody); concurrentPairB.clientMutationId = randomUUID(); concurrentPairB.expectedPublicRevision = 2; concurrentPairB.expectedTeacherRevision = 2; concurrentPairB.publicDocument.metadata.title = "Concurrent pair B";
  const concurrentPairResponses = await Promise.all([handler(pairEvent(created.activityId, concurrentPairA)), handler(pairEvent(created.activityId, concurrentPairB))]);
  assert.deepEqual(concurrentPairResponses.map((response) => response.statusCode).sort(), [200, 409]);
  const pairedRows = await pool.query("select document_type,revision,payload from builder_component_documents where document_key=$1 and document_type in ('native_activity_public','native_activity_teacher') order by document_type", [created.activityId]);
  assert.deepEqual(pairedRows.rows.map((row) => Number(row.revision)), [3, 3]);
  assert.equal(pairedRows.rows[0].payload.parts[0].interaction.questions[0].id, pairedRows.rows[1].payload.parts[0].solution.modelAnswers[0].questionId);

  const imageCreated = JSON.parse((await handler(event({ kind: "image", title: "Integration image" }))).body);
  const imagePublic = (await pool.query("select payload from builder_component_documents where document_type='native_activity_public' and document_key=$1", [imageCreated.activityId])).rows[0].payload;
  const imageTeacher = (await pool.query("select payload from builder_component_documents where document_type='native_activity_teacher' and document_key=$1", [imageCreated.activityId])).rows[0].payload;
  imagePublic.metadata.title = "Paired Integration image"; imagePublic.metadata.visibleInstructionText = "Inspect the image.";
  const imagePaired = await handler(pairEvent(imageCreated.activityId, { expectedPublicRevision: 1, expectedTeacherRevision: 1, clientMutationId: randomUUID(), publicDocument: imagePublic, teacherDocument: imageTeacher }));
  assert.equal(imagePaired.statusCode, 200);
  assert.deepEqual([JSON.parse(imagePaired.body).publicRevision, JSON.parse(imagePaired.body).teacherRevision], [2, 2]);

  const concurrent = await Promise.all([handler(event({ title: "Concurrent A" })), handler(event({ title: "Concurrent B" }))]);
  assert.deepEqual(concurrent.map((response) => response.statusCode), [200, 200]);
  const concurrentIds = concurrent.map((response) => JSON.parse(response.body).activityId);
  assert.equal(new Set(concurrentIds).size, 2);

  const rows = await pool.query("select document_type,document_key,revision from builder_component_documents where document_type like 'native_activity_%' order by document_type,document_key");
  assert.equal(rows.rows.filter((row) => row.document_type === "native_activity_index").length, 1);
  assert.equal(rows.rows.filter((row) => row.document_type === "native_activity_public").length, 4);
  assert.equal(rows.rows.filter((row) => row.document_type === "native_activity_teacher").length, 4);
  const index = await pool.query("select revision,payload from builder_component_documents where document_type='native_activity_index'");
  assert.equal(Number(index.rows[0].revision), 4);
  assert.equal(index.rows[0].payload.activities.length, 4);
  const histories = await pool.query("select count(*)::int count from builder_component_document_revisions revision join builder_component_documents document on document.id=revision.document_id where document.document_type like 'native_activity_%'");
  assert.equal(histories.rows[0].count, 18);
  const audits = await pool.query("select metadata from builder_audit_log where action='native_activity_created'");
  assert.equal(audits.rows.length, 4);
  assert.doesNotMatch(JSON.stringify(audits.rows), /payload|answer|solution|token|secret/i);
  const pairAudits = await pool.query("select metadata from builder_audit_log where action='native_activity_pair_saved'");
  assert.equal(pairAudits.rows.length, 3);
  assert.doesNotMatch(JSON.stringify(pairAudits.rows), /integration answer|payload|solution|token|secret/i);

  const beforeFailure = await pool.query("select count(*)::int count from builder_component_documents where document_type like 'native_activity_%'");
  const publicDocument = (await pool.query("select payload from builder_component_documents where document_type='native_activity_public' order by created_at limit 1")).rows[0].payload;
  const teacherDocument = (await pool.query("select payload from builder_component_documents where document_type='native_activity_teacher' order by created_at limit 1")).rows[0].payload;
  const failedId = "ultimate-b2-sb-u1-p1-o999";
  const failedIndex = structuredClone(index.rows[0].payload); failedIndex.activities.push({ activityId: failedId, kind: "open-response", placement: { pageId: "ub2-sb-unit-1-part-1" }, sortOrder: 9999 });
  await assert.rejects(createBuilderNativeActivity(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: failedId, kind: "open-response", expectedIndexRevision: 4, indexDocument: failedIndex, indexSha256: "a".repeat(64), publicDocument: { ...publicDocument, activityId: failedId }, publicSha256: "b".repeat(64), teacherDocument: { ...teacherDocument, activityId: failedId }, teacherSha256: "invalid", schemaVersion: "1.0", requestSha256: "c".repeat(64), builderUserId: actor, clientMutationId: randomUUID() }));
  assert.equal((await pool.query("select count(*)::int count from builder_component_documents where document_type like 'native_activity_%'")).rows[0].count, beforeFailure.rows[0].count);

  const unauthorized = await createBuilderNativeActivity(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: failedId, kind: "open-response", expectedIndexRevision: 4, indexDocument: failedIndex, indexSha256: "a".repeat(64), publicDocument: { ...publicDocument, activityId: failedId }, publicSha256: "b".repeat(64), teacherDocument: { ...teacherDocument, activityId: failedId }, teacherSha256: "d".repeat(64), schemaVersion: "1.0", requestSha256: "c".repeat(64), builderUserId: "10000000-0000-4000-8000-000000000099", clientMutationId: randomUUID() });
  assert.equal(unauthorized.outcome, "unauthorized_actor");
});

test("isolated PostgreSQL reads a legacy native payload by its persisted checksum without mutating it", { skip: !enabled }, async (t) => {
  const schema = `builder_native_checksum_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 2 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "037_builder_native_open_response_authoring.sql");
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Checksum Actor','checksum@example.test','hash')", [actor]);

  const sql = tag(pool);
  const nativeHandler = createBuilderNativeActivitiesHandler({
    getDatabase: () => sql,
    authorize: async () => ({ builderUser: { id: actor } }),
    logger: { error() {} },
  });
  const created = JSON.parse((await nativeHandler(event({ title: "Legacy checksum fixture" }))).body);
  const stored = (await pool.query(
    "select payload from builder_component_documents where document_type='native_activity_public' and document_key=$1",
    [created.activityId],
  )).rows[0].payload;
  const legacyPayload = structuredClone(stored);
  const assetId = "10000000-0000-4000-8000-000000000088";
  legacyPayload.assets = [{ assetId, checksumSha256: "8".repeat(64), role: "activity_artwork", slot: "legacy-background" }];
  legacyPayload.parts[0].interaction.artwork = [{
    id: `art-${"8".repeat(32)}`,
    assetSlot: "legacy-background",
    area: { x: 0, y: 0, width: 1024, height: 582 },
    order: 0,
    altText: "Legacy background",
    decorative: false,
    fit: "cover",
  }];
  assert.equal("locked" in legacyPayload.parts[0].interaction.artwork[0], false);
  const legacyChecksum = builderDocumentSha256(legacyPayload);
  await pool.query(
    "update builder_component_documents set payload=$1::jsonb,payload_sha256=$2 where document_type='native_activity_public' and document_key=$3",
    [JSON.stringify(legacyPayload), legacyChecksum, created.activityId],
  );

  const snapshotSql = "select revision,payload,payload_sha256,updated_at::text updated_at from builder_component_documents where document_type='native_activity_public' and document_key=$1";
  const beforeRead = (await pool.query(snapshotSql, [created.activityId])).rows[0];
  const contentHandler = createBuilderContentHandler({
    getDatabase: () => sql,
    authorize: async () => ({ builderUser: { id: actor } }),
    logger: { error() {} },
  });
  const response = await contentHandler({
    httpMethod: "GET",
    path: `/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/native-activity-public/${created.activityId}`,
    headers: { host: "localhost:8888" },
    body: "",
  });
  assert.equal(response.statusCode, 200);
  const loaded = JSON.parse(response.body);
  assert.equal(loaded.revision, 1);
  assert.equal(loaded.document.parts[0].interaction.artwork[0].locked, false);

  const afterRead = (await pool.query(snapshotSql, [created.activityId])).rows[0];
  assert.deepEqual(afterRead, beforeRead);
  assert.equal("locked" in afterRead.payload.parts[0].interaction.artwork[0], false);
  assert.equal(afterRead.payload_sha256, legacyChecksum);
});
