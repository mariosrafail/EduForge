import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import repositoryHotspots from "../../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import { canonicalStudentsBookPagesById } from "../../netlify-sites/ultimate-b2-builder/server/_builder-page-catalog.js";
import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { createBuilderNativeActivitiesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";

import {
  claimBuilderPageUpload,
  completeBuilderPageUpload,
  deleteBuilderPageLifecycle,
  loadBuilderPageAsset,
  loadBuilderPages,
  mutateBuilderPage,
  prepareBuilderPageUpload,
  restoreBuilderStudentsPage,
} from "../../netlify-sites/ultimate-b2-builder/server/_builder-pages-store.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000001";
const otherActor = "10000000-0000-4000-8000-000000000002";

function scoped(base, schema) { const url = new URL(base); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function tag(pool) { return async (strings, ...values) => { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return (await pool.query(text, values)).rows; }; }
const digest = () => randomBytes(32).toString("hex");

function uploadInput({ componentSlug, pageId, mode, expectedRevision, builderUserId = actor, unitId = null, sortOrder = 10 }) {
  const uploadId = randomUUID();
  return {
    bookSlug: "ultimate-b2",
    componentSlug,
    pageKey: `${componentSlug}/pages/${pageId}`,
    mode,
    expectedRevision,
    clientMutationId: randomUUID(),
    uploadId,
    requestSha256: digest(),
    pageMetadata: { label: `Label ${pageId}`, printedLabel: "2-3", sortOrder, ...(unitId ? { unitId } : {}), ...(componentSlug.endsWith("students-book") ? { baselineWidth: 581, baselineHeight: 794 } : {}) },
    fileDescriptor: { name: `${pageId}.png`, size: 1024, type: "image/png" },
    stagingObjectKey: `builder-page-assets/ultimate-b2/${componentSlug}/${pageId}/${uploadId}/staging/page-image`,
    builderUserId,
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}

async function finish(sql, input, checksum = digest()) {
  assert.equal((await prepareBuilderPageUpload(sql, input)).outcome, "prepared");
  assert.equal((await claimBuilderPageUpload(sql, { uploadId: input.uploadId, expectedRevision: input.expectedRevision, clientMutationId: input.clientMutationId, builderUserId: input.builderUserId })).outcome, "claimed");
  const pageId = input.pageKey.split("/").at(-1);
  return completeBuilderPageUpload(sql, {
    uploadId: input.uploadId,
    builderUserId: input.builderUserId,
    objectKey: `builder-page-assets/ultimate-b2/${input.componentSlug}/${pageId}/assets/${checksum}.png`,
    storageBucket: "private-assets",
    mimeType: "image/png",
    byteSize: 1024,
    checksumSha256: checksum,
    width: 581,
    height: 794,
  });
}

test("isolated PostgreSQL persists Students overrides and relational Workbook/Grammar Unit page libraries", { skip: !enabled }, async (t) => {
  const schema = `builder_pages_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.ok(migrations.some(({ filename }) => filename === "051_builder_page_deletion_lifecycle.sql"));
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Page Actor','page-actor@example.test','hash'),($2,'Other Page Actor','page-other@example.test','hash')", [actor, otherActor]);
  const sql = tag(pool);
  const unitRows = await pool.query(`select component.slug component_slug,unit.id,unit.unit_number from units unit join book_components component on component.id=unit.book_component_id join book_packages package on package.id=component.book_package_id where package.slug='ultimate-b2' and component.slug in ('ultimate-b2-workbook','ultimate-b2-grammar-book') order by component.slug,unit.unit_number`);
  const byComponent = Object.groupBy(unitRows.rows, (row) => row.component_slug);
  assert.deepEqual(byComponent["ultimate-b2-workbook"].map((unit) => unit.unit_number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(byComponent["ultimate-b2-grammar-book"].map((unit) => unit.unit_number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const workbookUnit1 = byComponent["ultimate-b2-workbook"][0].id;
  const workbookUnit2 = byComponent["ultimate-b2-workbook"][1].id;
  const grammarUnit1 = byComponent["ultimate-b2-grammar-book"][0].id;
  const grammarUnit10 = byComponent["ultimate-b2-grammar-book"][9].id;

  const studentPageId = "ub2-sb-unit-1-part-1";
  const student = uploadInput({ componentSlug: "ultimate-b2-students-book", pageId: studentPageId, mode: "replace", expectedRevision: 0 });
  assert.equal((await prepareBuilderPageUpload(sql, { ...student, uploadId: randomUUID(), clientMutationId: randomUUID(), requestSha256: digest(), mode: "create" })).outcome, "operation_not_allowed");
  assert.equal((await prepareBuilderPageUpload(sql, { ...student, uploadId: randomUUID(), clientMutationId: randomUUID(), requestSha256: digest(), componentSlug: "ultimate-b2-test-book", pageKey: "ultimate-b2-test-book/pages/private" })).outcome, "resource_not_found");
  assert.equal((await prepareBuilderPageUpload(sql, student)).outcome, "prepared");
  assert.equal((await claimBuilderPageUpload(sql, { uploadId: student.uploadId, expectedRevision: 0, clientMutationId: student.clientMutationId, builderUserId: otherActor })).outcome, "session_not_found");
  assert.equal((await claimBuilderPageUpload(sql, { uploadId: student.uploadId, expectedRevision: 0, clientMutationId: student.clientMutationId, builderUserId: actor })).outcome, "claimed");
  const studentChecksum = digest();
  const studentResult = await completeBuilderPageUpload(sql, { uploadId: student.uploadId, builderUserId: actor, objectKey: `builder-page-assets/ultimate-b2/ultimate-b2-students-book/${studentPageId}/assets/${studentChecksum}.png`, storageBucket: "private-assets", mimeType: "image/png", byteSize: 1024, checksumSha256: studentChecksum, width: 581, height: 794 });
  assert.equal(studentResult.revision, 1);
  const studentRows = await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" });
  assert.equal(studentRows.rows[0].source_metadata.is_override, true);
  assert.equal(studentRows.rows[0].asset_id, studentResult.asset_id);
  assert.equal(await loadBuilderPageAsset(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: `ultimate-b2-workbook/pages/${studentPageId}`, assetId: studentResult.asset_id }), null);
  assert.equal((await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", pageKey: student.pageKey, action: "restore", expectedRevision: 1, clientMutationId: randomUUID(), pageMetadata: {}, builderUserId: actor })).outcome, "saved");
  assert.equal((await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" })).rows[0].source_metadata.is_override, false);

  const legacyPageId = `wb-page-${randomUUID().replaceAll("-", "")}`;
  const legacy = uploadInput({ componentSlug: "ultimate-b2-workbook", pageId: legacyPageId, mode: "create", expectedRevision: 0 });
  assert.equal((await finish(sql, legacy)).revision, 1);
  let workbookRows = await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" });
  assert.equal(workbookRows.rows.find((row) => row.stable_key === legacy.pageKey).unit_id, null);

  const workbookPageId = `wb-page-${randomUUID().replaceAll("-", "")}`;
  const workbook = uploadInput({ componentSlug: "ultimate-b2-workbook", pageId: workbookPageId, mode: "create", expectedRevision: 1, unitId: workbookUnit1 });
  const workbookResult = await finish(sql, workbook);
  assert.equal(workbookResult.revision, 2);
  workbookRows = await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" });
  assert.equal(workbookRows.rows.find((row) => row.stable_key === workbook.pageKey).unit_id, workbookUnit1);
  const metadataMutation = randomUUID();
  const movedMetadata = { label: "Workbook page 2", printedLabel: "2", sortOrder: 20, unitId: workbookUnit2 };
  const edited = await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "metadata", expectedRevision: 2, clientMutationId: metadataMutation, pageMetadata: movedMetadata, builderUserId: actor });
  assert.equal(edited.current_revision, 3);
  assert.equal((await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "metadata", expectedRevision: 2, clientMutationId: metadataMutation, pageMetadata: movedMetadata, builderUserId: actor })).outcome, "idempotent");
  const moved = await pool.query("select page.unit_id page_unit_id,asset.unit_id asset_unit_id from book_pages page join book_assets asset on asset.page_id=page.id and asset.publication_status='draft' where page.stable_key=$1", [workbook.pageKey]);
  assert.deepEqual(moved.rows[0], { page_unit_id: workbookUnit2, asset_unit_id: workbookUnit2 });
  const reordered = await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "reorder", expectedRevision: 3, clientMutationId: randomUUID(), pageMetadata: { ...movedMetadata, sortOrder: 1 }, builderUserId: actor });
  assert.equal(reordered.current_revision, 4);
  const secondPageId = `wb-page-${randomUUID().replaceAll("-", "")}`;
  const second = uploadInput({ componentSlug: "ultimate-b2-workbook", pageId: secondPageId, mode: "create", expectedRevision: 4, unitId: workbookUnit2, sortOrder: 2 });
  assert.equal((await finish(sql, second)).revision, 5);
  workbookRows = await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" });
  assert.deepEqual(workbookRows.rows.filter((row) => row.unit_id === workbookUnit2).map((row) => row.stable_key), [workbook.pageKey, second.pageKey]);
  assert.equal((await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "metadata", expectedRevision: 5, clientMutationId: randomUUID(), pageMetadata: { ...movedMetadata, unitId: grammarUnit1 }, builderUserId: actor })).outcome, "invalid_unit");
  const grammarPageId = `gb-page-${randomUUID().replaceAll("-", "")}`;
  const grammar = uploadInput({ componentSlug: "ultimate-b2-grammar-book", pageId: grammarPageId, mode: "create", expectedRevision: 0, unitId: grammarUnit10 });
  assert.equal((await finish(sql, grammar)).revision, 1);
  assert.equal((await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-grammar-book" })).rows[0].unit_id, grammarUnit10);
  const wrongGrammar = uploadInput({ componentSlug: "ultimate-b2-grammar-book", pageId: `gb-page-${randomUUID().replaceAll("-", "")}`, mode: "create", expectedRevision: 1, unitId: workbookUnit1 });
  assert.equal((await prepareBuilderPageUpload(sql, wrongGrammar)).outcome, "invalid_unit");
  const nativeHandler = createBuilderNativeActivitiesHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });
  const nativeResponse = await nativeHandler({ httpMethod: "POST", path: "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-workbook/create", headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ kind: "open-response", pageId: workbookPageId, title: "Preserved Workbook activity", clientMutationId: randomUUID() }) });
  assert.equal(nativeResponse.statusCode, 200, nativeResponse.body);
  const nativeActivityId = JSON.parse(nativeResponse.body).activityId;
  const nativeBefore = (await pool.query("select document_type,document_key,revision,payload_sha256 from builder_component_documents where document_type like 'native_activity_%' order by document_type,document_key")).rows;
  const workbookIdentity = (await pool.query("select package.id package_id,component.id component_id from book_packages package join book_components component on component.book_package_id=package.id where package.slug='ultimate-b2' and component.slug='ultimate-b2-workbook'")).rows[0];
  const activeHotspots = { schemaVersion: "1.0", packageSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pages: { [workbookPageId]: [{ id: `hotspot-${randomUUID()}`, unitNumber: 2, pageId: workbookPageId, left: 10, top: 10, width: 20, height: 20, label: "Preserved activity", actionType: "normalized_activity", activityKey: nativeActivityId }] } };
  await pool.query("insert into builder_component_documents(book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,created_by_builder_user_id,updated_by_builder_user_id) values($1,$2,'hotspots','default','1.0',1,$3,$4,$5,$5)", [workbookIdentity.package_id, workbookIdentity.component_id, activeHotspots, builderDocumentSha256(activeHotspots), actor]);
  const managedEditionId = (await pool.query("insert into book_editions(book_package_id,edition_identifier,title,status) values($1,'managed-lifecycle','Managed lifecycle','draft') returning id", [workbookIdentity.package_id])).rows[0].id;
  const managedActivityAssetId = (await pool.query("insert into book_assets(book_package_id,edition_id,book_component_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,edition_identifier,version,publication_status,access_level,source_metadata) values($1,$2,$3,$4,'activity_artwork',$5,'private','lifecycle-test','image/png',4,$6,'managed-lifecycle','v1','draft','internal',$7) returning id", [workbookIdentity.package_id, managedEditionId, workbookIdentity.component_id, `ultimate-b2.managed.${nativeActivityId}`, `managed-lifecycle/${nativeActivityId}.png`, "b".repeat(64), { native_activity_id: nativeActivityId }])).rows[0].id;
  await pool.query("insert into book_activities(package_slug,component_slug,page_id,title,type,content,correct_answers) values('ultimate-b2','ultimate-b2-workbook',$1,'Preserved legacy activity','multiple_choice','{}','{}')", [workbookPageId]);
  const emptyHotspots = { ...activeHotspots, pages: {} };
  const removed = await deleteBuilderPageLifecycle(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, expectedRevision: 5, expectedHotspotRevision: 1, clientMutationId: randomUUID(), pageMetadata: movedMetadata, hotspotSchemaVersion: "1.0", hotspotDocument: emptyHotspots, hotspotSha256: builderDocumentSha256(emptyHotspots), removedHotspotCount: 1, preservedActivityCount: 1, builderUserId: actor });
  assert.deepEqual({ outcome: removed.outcome, pageRevision: removed.current_revision, hotspotRevision: removed.hotspot_revision, removed: removed.removed_hotspot_count, preserved: removed.preserved_activity_count }, { outcome: "saved", pageRevision: 6, hotspotRevision: 2, removed: 1, preserved: 1 });
  workbookRows = await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" });
  const removedRow = workbookRows.rows.find((row) => row.stable_key === workbook.pageKey);
  assert.equal(removedRow.source_metadata.is_active, false);
  assert.equal(removedRow.asset_id, null);
  assert.deepEqual((await pool.query("select document_type,document_key,revision,payload_sha256 from builder_component_documents where document_type like 'native_activity_%' order by document_type,document_key")).rows, nativeBefore);
  assert.equal((await pool.query("select publication_status from book_assets where id=$1", [managedActivityAssetId])).rows[0].publication_status, "draft");
  assert.equal((await pool.query("select count(*)::int count from book_activities where component_slug='ultimate-b2-workbook' and page_id=$1", [workbookPageId])).rows[0].count, 1);
  assert.deepEqual((await pool.query("select revision,payload from builder_component_documents where book_component_id=$1 and document_type='hotspots'", [workbookIdentity.component_id])).rows[0], { revision: "2", payload: emptyHotspots });
  assert.equal(workbookRows.rows.find((row) => row.stable_key === legacy.pageKey).unit_id, null);
  const concurrentBase = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: second.pageKey, expectedRevision: 6, expectedHotspotRevision: 2, pageMetadata: { label: `Label ${secondPageId}`, printedLabel: "2-3", sortOrder: 2, unitId: workbookUnit2 }, hotspotSchemaVersion: "1.0", hotspotDocument: emptyHotspots, hotspotSha256: builderDocumentSha256(emptyHotspots), removedHotspotCount: 0, preservedActivityCount: 0, builderUserId: actor };
  const concurrentDeletes = await Promise.all([
    deleteBuilderPageLifecycle(sql, { ...concurrentBase, clientMutationId: randomUUID() }),
    deleteBuilderPageLifecycle(sql, { ...concurrentBase, clientMutationId: randomUUID() }),
  ]);
  assert.deepEqual(concurrentDeletes.map(({ outcome }) => outcome).sort(), ["revision_conflict", "saved"]);
  assert.equal((await pool.query("select count(*)::int count from builder_audit_log where action='component_page_deleted' and metadata->>'page_key'=$1", [second.pageKey])).rows[0].count, 1);
});

test("isolated PostgreSQL atomically tombstones and restores a canonical Student page while pruning only its effective hotspots", { skip: !enabled }, async (t) => {
  const schema = `builder_page_lifecycle_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.ok(migrations.some(({ filename }) => filename === "051_builder_page_deletion_lifecycle.sql"));
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Lifecycle Actor','lifecycle@example.test','hash')", [actor]);
  const sql = tag(pool);
  const componentSlug = "ultimate-b2-students-book";
  const pageId = "ub2-sb-unit-1-part-1";
  const page = canonicalStudentsBookPagesById.get(pageId);
  const hotspotDocument = structuredClone(repositoryHotspots);
  const removed = hotspotDocument.pages[pageId];
  delete hotspotDocument.pages[pageId];
  const input = {
    bookSlug: "ultimate-b2", componentSlug, pageKey: `${componentSlug}/pages/${pageId}`,
    expectedRevision: 0, expectedHotspotRevision: 0, clientMutationId: randomUUID(),
    pageMetadata: { label: page.label, printedLabel: page.printedLabel, sortOrder: page.sortOrder, unitNumber: page.unitNumber },
    hotspotSchemaVersion: hotspotDocument.schemaVersion, hotspotDocument, hotspotSha256: builderDocumentSha256(hotspotDocument),
    removedHotspotCount: removed.length, preservedActivityCount: new Set(removed.map(({ activityKey }) => activityKey)).size, builderUserId: actor,
  };

  const nativeHandler = createBuilderNativeActivitiesHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });
  const nativeResponse = await nativeHandler({
    httpMethod: "POST",
    path: "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/create",
    headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" },
    body: JSON.stringify({ kind: "open-response", pageId, title: "Preserved on deleted page", clientMutationId: randomUUID() }),
  });
  assert.equal(nativeResponse.statusCode, 200, nativeResponse.body);
  const nativeActivityId = JSON.parse(nativeResponse.body).activityId;
  const nativeBefore = (await pool.query("select document_type,document_key,revision,payload_sha256 from builder_component_documents where document_type like 'native_activity_%' order by document_type,document_key")).rows;
  const componentIdentity = (await pool.query("select package.id package_id,component.id component_id from book_packages package join book_components component on component.book_package_id=package.id where package.slug='ultimate-b2' and component.slug=$1", [componentSlug])).rows[0];
  const editionId = (await pool.query("insert into book_editions(book_package_id,edition_identifier,title,status) values($1,'lifecycle-test','Lifecycle test','draft') returning id", [componentIdentity.package_id])).rows[0].id;
  const activityAssetId = (await pool.query("insert into book_assets(book_package_id,edition_id,book_component_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,edition_identifier,version,publication_status,access_level,source_metadata) values($1,$2,$3,$4,'activity_artwork',$5,'private','lifecycle-test','image/png',4,$6,'lifecycle-test','v1','draft','internal',$7) returning id", [componentIdentity.package_id, editionId, componentIdentity.component_id, `ultimate-b2.lifecycle.${nativeActivityId}`, `lifecycle/${nativeActivityId}.png`, "a".repeat(64), { native_activity_id: nativeActivityId }])).rows[0].id;

  const deleted = await deleteBuilderPageLifecycle(sql, input);
  assert.deepEqual({ outcome: deleted.outcome, pageRevision: deleted.current_revision, hotspotRevision: deleted.hotspot_revision, removed: deleted.removed_hotspot_count, preserved: deleted.preserved_activity_count }, { outcome: "saved", pageRevision: 1, hotspotRevision: 1, removed: 2, preserved: 2 });
  const stored = await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug });
  assert.equal(stored.revision, 1);
  assert.equal(stored.hotspotRevision, 1);
  assert.equal(stored.rows.find(({ stable_key }) => stable_key === input.pageKey).source_metadata.is_deleted, true);
  const storedHotspots = await pool.query("select revision,payload from builder_component_documents where document_type='hotspots'");
  assert.equal(storedHotspots.rows[0].revision, "1");
  assert.equal(Object.hasOwn(storedHotspots.rows[0].payload.pages, pageId), false);
  assert.deepEqual((await pool.query("select document_type,document_key,revision,payload_sha256 from builder_component_documents where document_type like 'native_activity_%' order by document_type,document_key")).rows, nativeBefore);
  assert.deepEqual((await pool.query("select publication_status,source_metadata->>'native_activity_id' native_activity_id from book_assets where id=$1", [activityAssetId])).rows[0], { publication_status: "draft", native_activity_id: nativeActivityId });
  assert.equal((await pool.query("select count(*)::int count from builder_audit_log where action='component_page_deleted'")).rows[0].count, 1);

  const replay = await deleteBuilderPageLifecycle(sql, input);
  assert.deepEqual({ outcome: replay.outcome, pageRevision: replay.current_revision, hotspotRevision: replay.hotspot_revision }, { outcome: "idempotent", pageRevision: 1, hotspotRevision: 1 });
  assert.equal((await pool.query("select count(*)::int count from builder_audit_log where action='component_page_deleted'")).rows[0].count, 1);
  assert.equal((await deleteBuilderPageLifecycle(sql, { ...input, expectedRevision: 1 })).outcome, "mutation_id_conflict");

  const secondPage = canonicalStudentsBookPagesById.get("ub2-sb-unit-1-part-2");
  const secondHotspotDocument = structuredClone(hotspotDocument);
  const secondRemoved = secondHotspotDocument.pages[secondPage.id] || [];
  delete secondHotspotDocument.pages[secondPage.id];
  const secondInput = { ...input, pageKey: secondPage.stableKey, pageMetadata: { label: secondPage.label, printedLabel: secondPage.printedLabel, sortOrder: secondPage.sortOrder, unitNumber: secondPage.unitNumber }, clientMutationId: randomUUID(), hotspotDocument: secondHotspotDocument, hotspotSha256: builderDocumentSha256(secondHotspotDocument), removedHotspotCount: secondRemoved.length, preservedActivityCount: new Set(secondRemoved.map(({ activityKey }) => activityKey)).size };
  assert.equal((await deleteBuilderPageLifecycle(sql, secondInput)).outcome, "revision_conflict");
  assert.equal((await deleteBuilderPageLifecycle(sql, { ...secondInput, expectedRevision: 1, expectedHotspotRevision: 0, clientMutationId: randomUUID() })).outcome, "hotspot_revision_conflict");
  assert.equal((await deleteBuilderPageLifecycle(sql, { ...secondInput, expectedRevision: 1, expectedHotspotRevision: 1, clientMutationId: randomUUID(), hotspotDocument: { ...hotspotDocument, packageSlug: "wrong" } })).outcome, "invalid_hotspot_projection");

  await pool.query("insert into book_media_assets(package_slug,component_slug,page_id,file_name,mime_type,public_url,kind) values('ultimate-b2',$1,$2,'unsupported.pdf','application/pdf','https://example.invalid/unsupported.pdf','document')", [componentSlug, secondPage.id]);
  assert.equal((await deleteBuilderPageLifecycle(sql, { ...secondInput, expectedRevision: 1, expectedHotspotRevision: 1, clientMutationId: randomUUID() })).outcome, "unsupported_page_reference");
  assert.equal((await pool.query("select count(*)::int count from book_pages where stable_key=$1", [secondPage.stableKey])).rows[0].count, 0);
  assert.equal((await pool.query("select revision from builder_component_page_revisions revision join book_components component on component.id=revision.book_component_id where component.slug=$1", [componentSlug])).rows[0].revision, "1");
  assert.equal((await pool.query("select revision from builder_component_documents where document_type='hotspots'")).rows[0].revision, "1");

  const restored = await restoreBuilderStudentsPage(sql, { bookSlug: "ultimate-b2", componentSlug, pageKey: input.pageKey, expectedRevision: 1, clientMutationId: randomUUID(), builderUserId: actor });
  assert.deepEqual({ outcome: restored.outcome, revision: restored.current_revision }, { outcome: "saved", revision: 2 });
  const restoredPage = (await pool.query("select source_metadata from book_pages where stable_key=$1", [input.pageKey])).rows[0];
  assert.equal(restoredPage.source_metadata.is_deleted, false);
  assert.equal((await pool.query("select revision,payload from builder_component_documents where document_type='hotspots'")).rows[0].revision, "1");
  assert.equal(Object.hasOwn((await pool.query("select payload from builder_component_documents where document_type='hotspots'")).rows[0].payload.pages, pageId), false);
  const repeatedRestore = await restoreBuilderStudentsPage(sql, { bookSlug: "ultimate-b2", componentSlug, pageKey: input.pageKey, expectedRevision: 2, clientMutationId: randomUUID(), builderUserId: actor });
  assert.deepEqual({ outcome: repeatedRestore.outcome, revision: repeatedRestore.current_revision }, { outcome: "page_state_conflict", revision: 2 });
  assert.equal((await pool.query("select revision from builder_component_page_revisions revision join book_components component on component.id=revision.book_component_id where component.slug=$1", [componentSlug])).rows[0].revision, "2");
});
