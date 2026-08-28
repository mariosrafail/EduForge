import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { createBuilderContentHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content.js";
import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { createBuilderNativeActivitiesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { claimBuilderNativeAssetUpload, completeBuilderNativeAssetUpload, createBuilderNativeActivity, prepareBuilderNativeAssetUpload } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activity-store.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000001";

function scoped(base, schema) { const url = new URL(base); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function tag(pool) { return async (strings, ...values) => { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return (await pool.query(text, values)).rows; }; }
function event({ kind = "open-response", title = "Integration native", mutationId = randomUUID() } = {}) { return { httpMethod: "POST", path: "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/create", headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ kind, pageId: "ub2-sb-unit-1-part-1", title, clientMutationId: mutationId }) }; }
function pairEvent(activityId, body) { return { httpMethod: "POST", path: `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/save`, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify(body) }; }
function deleteEvent(activityId, mutationId = randomUUID()) { return { httpMethod: "POST", path: `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/delete`, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ clientMutationId: mutationId }) }; }
function lifecycleEvent(activityId, action, sourcePageId, destinationPageId = null, mutationId = randomUUID()) { return { httpMethod: "POST", path: `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/${action}`, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ sourcePageId, ...(destinationPageId ? { destinationPageId } : {}), clientMutationId: mutationId }) }; }
function hotspotEvent(method, body = null) { return { httpMethod: method, path: "/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots", headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: body ? JSON.stringify(body) : "" }; }

test("isolated PostgreSQL creates native index/public/Teacher drafts atomically, idempotently, and without identity races", { skip: !enabled }, async (t) => {
  const schema = `builder_native_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 5 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "050_builder_publication_role_scoped_asset_pins.sql");
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

test("isolated PostgreSQL derives managed native placement from active same-component pages and returns to empty", { skip: !enabled }, async (t) => {
  const schema = `builder_managed_native_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 3 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await applyCanonicalProductionMigrations(pool);
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Managed Native Actor','managed-native@example.test','hash')", [actor]);
  const units = (await pool.query(`select component.slug component_slug,unit.id,unit.unit_number from units unit join book_components component on component.id=unit.book_component_id join book_packages package on package.id=component.book_package_id where package.slug='ultimate-b2' and component.slug in ('ultimate-b2-workbook','ultimate-b2-grammar-book') and unit.unit_number in (1,2) order by component.slug,unit.unit_number`)).rows;
  const unit = (component, number) => units.find((row) => row.component_slug === component && row.unit_number === number).id;
  const workbookPage1 = `wb-page-${randomUUID().replaceAll("-", "")}`;
  const workbookPage2 = `wb-page-${randomUUID().replaceAll("-", "")}`;
  const grammarPage = `gb-page-${randomUUID().replaceAll("-", "")}`;
  for (const [componentSlug, pageId, unitId, sortOrder] of [
    ["ultimate-b2-workbook", workbookPage1, unit("ultimate-b2-workbook", 1), 1],
    ["ultimate-b2-workbook", workbookPage2, unit("ultimate-b2-workbook", 2), 1],
    ["ultimate-b2-grammar-book", grammarPage, unit("ultimate-b2-grammar-book", 1), 1],
  ]) {
    await pool.query(`insert into book_pages(book_package_id,book_component_id,unit_id,stable_key,label,sort_order,source_metadata) select package.id,component.id,$1,$2,$3,$4,'{"source":"builder-pages","is_active":true}'::jsonb from book_packages package join book_components component on component.book_package_id=package.id where package.slug='ultimate-b2' and component.slug=$5`, [unitId, `${componentSlug}/pages/${pageId}`, pageId, sortOrder, componentSlug]);
  }
  const sql = tag(pool);
  const handler = createBuilderNativeActivitiesHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });
  const managedEvent = (componentSlug, action, body) => ({ httpMethod: "POST", path: `/builder/api/native-activities/books/ultimate-b2/components/${componentSlug}/${action}`, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify(body) });
  const workbookCreate = await handler(managedEvent("ultimate-b2-workbook", "create", { kind: "open-response", pageId: workbookPage1, title: "First Workbook activity", clientMutationId: randomUUID() }));
  assert.equal(workbookCreate.statusCode, 200);
  const workbook = JSON.parse(workbookCreate.body);
  assert.match(workbook.activityId, /^ultimate-b2-wb-/);
  assert.deepEqual(workbook.placement, { pageId: workbookPage1 });
  const createdWorkbookPublic = (await pool.query("select payload from builder_component_documents document join book_components component on component.id=document.book_component_id where component.slug='ultimate-b2-workbook' and document.document_type='native_activity_public' and document.document_key=$1", [workbook.activityId])).rows[0].payload;
  assert.deepEqual(createdWorkbookPublic.placement, { pageId: workbookPage1 });
  assert.equal((await handler(managedEvent("ultimate-b2-workbook", "create", { kind: "open-response", pageId: grammarPage, title: "Foreign", clientMutationId: randomUUID() }))).statusCode, 400);
  const grammarCreate = await handler(managedEvent("ultimate-b2-grammar-book", "create", { kind: "single-choice", pageId: grammarPage, title: "First Grammar activity", clientMutationId: randomUUID() }));
  assert.equal(grammarCreate.statusCode, 200);
  assert.match(JSON.parse(grammarCreate.body).activityId, /^ultimate-b2-gb-/);
  assert.equal((await handler(managedEvent("ultimate-b2-workbook", `activities/${workbook.activityId}/move`, { sourcePageId: workbookPage1, destinationPageId: grammarPage, clientMutationId: randomUUID() }))).statusCode, 400);
  const moved = await handler(managedEvent("ultimate-b2-workbook", `activities/${workbook.activityId}/move`, { sourcePageId: workbookPage1, destinationPageId: workbookPage2, clientMutationId: randomUUID() }));
  assert.equal(moved.statusCode, 200);
  assert.equal(JSON.parse(moved.body).destinationPageId, workbookPage2);
  const movedPublic = (await pool.query("select payload from builder_component_documents document join book_components component on component.id=document.book_component_id where component.slug='ultimate-b2-workbook' and document.document_type='native_activity_public' and document.document_key=$1", [workbook.activityId])).rows[0].payload;
  assert.equal(movedPublic.placement.pageId, workbookPage2);
  await pool.query("update book_pages set source_metadata=source_metadata||'{\"is_active\":false}'::jsonb where stable_key=$1", [`ultimate-b2-workbook/pages/${workbookPage1}`]);
  assert.equal((await handler(managedEvent("ultimate-b2-workbook", "create", { kind: "image", pageId: workbookPage1, title: "Inactive", clientMutationId: randomUUID() }))).statusCode, 400);
  const index = (await pool.query("select payload from builder_component_documents document join book_components component on component.id=document.book_component_id where component.slug='ultimate-b2-workbook' and document.document_type='native_activity_index'")).rows[0].payload;
  const deleted = await handler(managedEvent("ultimate-b2-workbook", `activities/${workbook.activityId}/delete`, { clientMutationId: randomUUID() }));
  assert.equal(deleted.statusCode, 200);
  const after = (await pool.query("select payload from builder_component_documents document join book_components component on component.id=document.book_component_id where component.slug='ultimate-b2-workbook' and document.document_type='native_activity_index'")).rows[0].payload;
  assert.equal(index.activities.length, 1);
  assert.deepEqual(after.activities, []);
});

test("isolated PostgreSQL logically deletes native activity membership and hotspots while retaining immutable history", { skip: !enabled }, async (t) => {
  const schema = `builder_native_delete_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 5 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await applyCanonicalProductionMigrations(pool);
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Delete Actor','delete@example.test','hash')", [actor]);
  const sql = tag(pool);
  const native = createBuilderNativeActivitiesHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });
  const content = createBuilderContentHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });
  const created = JSON.parse((await native(event({ title: "Delete integration" }))).body);

  const baseline = JSON.parse((await content(hotspotEvent("GET"))).body);
  const offPlacement = structuredClone(baseline.document);
  offPlacement.pages["ub2-sb-unit-1-part-2"] ||= [];
  offPlacement.pages["ub2-sb-unit-1-part-2"].push({ id: "delete-integration-off-placement", unitNumber: 1, pageId: "ub2-sb-unit-1-part-2", pageNumber: 6, left: 1, top: 1, width: 10, height: 10, label: "Invalid placement", actionType: "normalized_activity", activityKey: created.activityId });
  assert.equal((await content(hotspotEvent("PUT", { expectedRevision: baseline.revision, clientMutationId: randomUUID(), document: offPlacement }))).statusCode, 500);
  assert.equal(JSON.parse((await content(hotspotEvent("GET"))).body).revision, baseline.revision);

  const candidate = structuredClone(baseline.document);
  candidate.pages["ub2-sb-unit-1-part-1"] ||= [];
  candidate.pages["ub2-sb-unit-1-part-1"].push({ id: "delete-integration-one", unitNumber: 1, pageId: "ub2-sb-unit-1-part-1", pageNumber: 5, left: 1, top: 1, width: 10, height: 10, label: "Delete one", actionType: "normalized_activity", activityKey: created.activityId });
  candidate.pages["ub2-sb-unit-1-part-1"].push({ id: "delete-integration-two", unitNumber: 1, pageId: "ub2-sb-unit-1-part-1", pageNumber: 5, left: 12, top: 12, width: 10, height: 10, label: "Delete two", actionType: "normalized_activity", activityKey: created.activityId });
  const savedHotspots = await content(hotspotEvent("PUT", { expectedRevision: 0, clientMutationId: randomUUID(), document: candidate }));
  assert.equal(savedHotspots.statusCode, 200);

  const completedUploadId = randomUUID();
  const completedMutationId = randomUUID();
  const uploadInput = (uploadId, clientMutationId, slot) => ({
    bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: created.activityId, assetSlot: slot,
    clientMutationId, uploadId, requestSha256: randomBytes(32).toString("hex"),
    fileDescriptor: { name: `${slot}.png`, size: 68, type: "image/png", assetSlot: slot },
    stagingObjectKey: `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${created.activityId}/${uploadId}/staging/asset`,
    builderUserId: actor, expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  assert.equal((await prepareBuilderNativeAssetUpload(sql, uploadInput(completedUploadId, completedMutationId, "retained-asset"))).outcome, "prepared");
  assert.equal((await claimBuilderNativeAssetUpload(sql, { uploadId: completedUploadId, clientMutationId: completedMutationId, builderUserId: actor })).outcome, "claimed");
  const retainedAssetId = await completeBuilderNativeAssetUpload(sql, {
    uploadId: completedUploadId, builderUserId: actor,
    objectKey: `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${created.activityId}/assets/${"a".repeat(64)}.png`,
    storageBucket: "private-assets", mimeType: "image/png", byteSize: 68, checksumSha256: "a".repeat(64), width: 1, height: 1,
  });
  const pendingUploadId = randomUUID();
  const pendingMutationId = randomUUID();
  assert.equal((await prepareBuilderNativeAssetUpload(sql, uploadInput(pendingUploadId, pendingMutationId, "pending-asset"))).outcome, "prepared");

  const beforeDocuments = await pool.query("select document_type,revision from builder_component_documents where document_key=$1 and document_type in ('native_activity_public','native_activity_teacher') order by document_type", [created.activityId]);
  const deletionMutationId = randomUUID();
  const deleted = await native(deleteEvent(created.activityId, deletionMutationId));
  assert.equal(deleted.statusCode, 200);
  assert.equal(JSON.parse(deleted.body).removedHotspotCount, 2);
  assert.equal(JSON.parse(deleted.body).hotspotRevision, 2);
  assert.equal(JSON.parse((await native(deleteEvent(created.activityId, deletionMutationId))).body).idempotent, true);
  assert.equal((await native(deleteEvent(created.activityId))).statusCode, 404);

  const activeIndex = (await pool.query("select payload from builder_component_documents where document_type='native_activity_index' and document_key='default'")).rows[0].payload;
  assert.equal(activeIndex.activities.some((entry) => entry.activityId === created.activityId), false);
  const activeHotspots = (await pool.query("select revision,payload from builder_component_documents where document_type='hotspots' and document_key='default'")).rows[0];
  assert.equal(Number(activeHotspots.revision), 2);
  assert.equal(Object.values(activeHotspots.payload.pages).flat().some((entry) => entry.activityKey === created.activityId), false);
  assert.deepEqual((await pool.query("select document_type,revision from builder_component_documents where document_key=$1 and document_type in ('native_activity_public','native_activity_teacher') order by document_type", [created.activityId])).rows, beforeDocuments.rows);
  assert.equal((await pool.query("select count(*)::int count from book_assets where id=$1", [retainedAssetId])).rows[0].count, 1);
  assert.ok((await pool.query("select count(*)::int count from builder_component_document_revisions revision join builder_component_documents document on document.id=revision.document_id where document.document_key=$1 and document.document_type in ('native_activity_public','native_activity_teacher')", [created.activityId])).rows[0].count >= 2);

  const stalePublic = (await pool.query("select payload from builder_component_documents where document_type='native_activity_public' and document_key=$1", [created.activityId])).rows[0].payload;
  const staleTeacher = (await pool.query("select payload from builder_component_documents where document_type='native_activity_teacher' and document_key=$1", [created.activityId])).rows[0].payload;
  assert.equal((await native(pairEvent(created.activityId, { expectedPublicRevision: 1, expectedTeacherRevision: 1, clientMutationId: randomUUID(), publicDocument: stalePublic, teacherDocument: staleTeacher }))).statusCode, 404);
  await assert.rejects(claimBuilderNativeAssetUpload(sql, { uploadId: pendingUploadId, clientMutationId: pendingMutationId, builderUserId: actor }), /native activity is not active/);

  const staleHotspotSave = await content(hotspotEvent("PUT", { expectedRevision: 1, clientMutationId: randomUUID(), document: candidate }));
  assert.ok([400, 409].includes(staleHotspotSave.statusCode));
  const resurrection = structuredClone(activeHotspots.payload);
  resurrection.pages["ub2-sb-unit-1-part-1"] ||= [];
  resurrection.pages["ub2-sb-unit-1-part-1"].push(candidate.pages["ub2-sb-unit-1-part-1"].at(-1));
  assert.equal((await content(hotspotEvent("PUT", { expectedRevision: 2, clientMutationId: randomUUID(), document: resurrection }))).statusCode, 400);

  const replacement = JSON.parse((await native(event({ title: "Replacement integration" }))).body);
  assert.notEqual(replacement.activityId, created.activityId);
  assert.ok(Number(replacement.activityId.match(/-o(\d+)$/)?.[1]) > Number(created.activityId.match(/-o(\d+)$/)?.[1]));
  const hotspotRevisionBeforeZeroDelete = Number((await pool.query("select revision from builder_component_documents where document_type='hotspots' and document_key='default'")).rows[0].revision);
  const zeroDelete = JSON.parse((await native(deleteEvent(replacement.activityId))).body);
  assert.equal(zeroDelete.removedHotspotCount, 0);
  assert.equal(zeroDelete.hotspotRevision, hotspotRevisionBeforeZeroDelete);

  const audit = (await pool.query("select metadata from builder_audit_log where action='native_activity_deleted' order by id")).rows;
  assert.equal(audit.length, 2);
  assert.doesNotMatch(JSON.stringify(audit), /payload|document|answer|solution|token|secret|checksum/i);
});

test("isolated PostgreSQL atomically relocates native and canonical identities and logically retires canonical activity membership", { skip: !enabled }, async (t) => {
  const schema = `builder_lifecycle_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 5 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await applyCanonicalProductionMigrations(pool);
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Lifecycle Actor','lifecycle@example.test','hash')", [actor]);
  const sql = tag(pool);
  const native = createBuilderNativeActivitiesHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });
  const content = createBuilderContentHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });
  const sourcePage = "ub2-sb-unit-1-part-1";
  const destinationPage = "reading-19";

  const created = JSON.parse((await native(event({ title: "Move integration" }))).body);
  const nativeBefore = (await pool.query("select document_type,revision,payload from builder_component_documents where document_key=$1 and document_type in ('native_activity_public','native_activity_teacher') order by document_type", [created.activityId])).rows;
  const nativeMutationId = randomUUID();
  const nativeMoved = await native(lifecycleEvent(created.activityId, "move", sourcePage, destinationPage, nativeMutationId));
  assert.equal(nativeMoved.statusCode, 200);
  assert.equal(JSON.parse(nativeMoved.body).outcome, "moved");
  assert.equal(JSON.parse((await native(lifecycleEvent(created.activityId, "move", sourcePage, destinationPage, nativeMutationId))).body).idempotent, true);
  assert.equal((await native(lifecycleEvent(created.activityId, "move", sourcePage, destinationPage))).statusCode, 409);
  const nativeAfter = (await pool.query("select document_type,revision,payload from builder_component_documents where document_key=$1 and document_type in ('native_activity_public','native_activity_teacher') order by document_type", [created.activityId])).rows;
  assert.equal(nativeAfter.find((row) => row.document_type === "native_activity_public").payload.placement.pageId, destinationPage);
  assert.deepEqual(nativeAfter.find((row) => row.document_type === "native_activity_teacher").payload, nativeBefore.find((row) => row.document_type === "native_activity_teacher").payload);
  assert.equal(Number(nativeAfter.find((row) => row.document_type === "native_activity_teacher").revision), Number(nativeBefore.find((row) => row.document_type === "native_activity_teacher").revision));

  const canonicalId = "ultimate-b2-sb-u1-p1-o1";
  assert.equal((await native(lifecycleEvent(canonicalId, "move", "reading-16", destinationPage))).statusCode, 409);
  const canonicalMutationId = randomUUID();
  const canonicalMoved = await native(lifecycleEvent(canonicalId, "move", sourcePage, destinationPage, canonicalMutationId));
  assert.equal(canonicalMoved.statusCode, 200);
  assert.equal(JSON.parse((await native(lifecycleEvent(canonicalId, "move", sourcePage, destinationPage, canonicalMutationId))).body).idempotent, true);
  assert.equal((await native(lifecycleEvent(canonicalId, "move", sourcePage, destinationPage))).statusCode, 409);
  let lifecycle = (await pool.query("select revision,payload from builder_component_documents where document_type='activity_lifecycle' and document_key='default'")).rows[0];
  assert.deepEqual(lifecycle.payload.activities[canonicalId], { status: "active", pageId: destinationPage });

  const currentHotspots = JSON.parse((await content(hotspotEvent("GET"))).body);
  const destinationHotspots = structuredClone(currentHotspots.document);
  destinationHotspots.pages[destinationPage] ||= [];
  destinationHotspots.pages[destinationPage].push({ id: "moved-canonical-launch", unitNumber: 2, pageId: destinationPage, pageNumber: 19, left: 1, top: 1, width: 10, height: 10, label: "Moved canonical", actionType: "normalized_activity", activityKey: canonicalId });
  assert.equal((await content(hotspotEvent("PUT", { expectedRevision: currentHotspots.revision, clientMutationId: randomUUID(), document: destinationHotspots }))).statusCode, 200);

  const retireMutationId = randomUUID();
  const retired = await native(lifecycleEvent(canonicalId, "retire", destinationPage, null, retireMutationId));
  assert.equal(retired.statusCode, 200);
  assert.equal(JSON.parse(retired.body).removedHotspotCount, 1);
  assert.equal(JSON.parse((await native(lifecycleEvent(canonicalId, "retire", destinationPage, null, retireMutationId))).body).idempotent, true);
  assert.equal((await native(lifecycleEvent(canonicalId, "retire", destinationPage))).statusCode, 404);
  assert.equal((await native(lifecycleEvent(canonicalId, "move", destinationPage, sourcePage))).statusCode, 404);
  lifecycle = (await pool.query("select revision,payload from builder_component_documents where document_type='activity_lifecycle' and document_key='default'")).rows[0];
  assert.deepEqual(lifecycle.payload.activities[canonicalId], { status: "retired", pageId: destinationPage });
  const hotspots = (await pool.query("select payload from builder_component_documents where document_type='hotspots' and document_key='default'")).rows[0].payload;
  assert.equal(Object.values(hotspots.pages).flat().some((entry) => entry.activityKey === canonicalId), false);
  assert.equal((await pool.query("select count(*)::int count from builder_activity_lifecycle_mutations where activity_id in ($1,$2)", [created.activityId, canonicalId])).rows[0].count, 3);
  const audit = (await pool.query("select metadata from builder_audit_log where action in ('activity_moved','activity_retired') order by id")).rows;
  assert.equal(audit.length, 3);
  assert.doesNotMatch(JSON.stringify(audit), /payload|document|answer|solution|token|secret|checksum/i);
});

test("isolated PostgreSQL reads a legacy native payload by its persisted checksum without mutating it", { skip: !enabled }, async (t) => {
  const schema = `builder_native_checksum_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 2 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "050_builder_publication_role_scoped_asset_pins.sql");
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
