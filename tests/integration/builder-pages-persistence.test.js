import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import repositoryHotspots from "../../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import { canonicalStudentsBookPages, canonicalStudentsBookPagesById } from "../../netlify-sites/ultimate-b2-builder/server/_builder-page-catalog.js";
import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { createBuilderNativeActivitiesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { createBuilderPagesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-pages.js";
import { createEmptyUltimateB2ActivityLifecycle } from "../../src/data/ultimate-b2/activityLifecycle.js";
import { normalizeUltimateB2UnitExtrasDocument } from "../../src/data/ultimate-b2/unitExtras.js";

import {
  claimBuilderPageUpload,
  completeBuilderPageUpload,
  deleteBuilderPageLifecycle,
  loadBuilderPageAsset,
  loadBuilderPages,
  mutateBuilderPage,
  prepareBuilderPageUpload,
  purgeBuilderPage,
  restoreBuilderPage,
  restoreBuilderStudentsPage,
} from "../../netlify-sites/ultimate-b2-builder/server/_builder-pages-store.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000001";
const otherActor = "10000000-0000-4000-8000-000000000002";

function scoped(base, schema) { const url = new URL(base); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function queryText(strings, values) { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return text; }
function tag(pool) {
  const sql = async (strings, ...values) => (await pool.query(queryText(strings, values), values)).rows;
  sql.transaction = async (build) => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const transaction = (strings, ...values) => ({ strings, values });
      const queries = build(transaction);
      const results = [];
      for (const query of queries) results.push((await client.query(queryText(query.strings, query.values), query.values)).rows);
      await client.query("commit");
      return results;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  };
  return sql;
}
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
  assert.ok(migrations.some(({ filename }) => filename === "052_builder_page_unit_extras_preservation.sql"));
  assert.ok(migrations.some(({ filename }) => filename === "053_builder_page_lifecycle_completion.sql"));
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
  assert.equal((await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", pageKey: student.pageKey, action: "restore-image", expectedRevision: 1, clientMutationId: randomUUID(), pageMetadata: {}, builderUserId: actor })).outcome, "saved");
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

test("isolated PostgreSQL materializes canonical Students metadata and reorder first writes exactly once", { skip: !enabled }, async (t) => {
  const schema = `builder_page_first_write_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 6 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await applyCanonicalProductionMigrations(pool);
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Page Actor','page-first-write@example.test','hash')", [actor]);
  const sql = tag(pool);
  const handler = createBuilderPagesHandler({
    getDatabase: () => sql,
    authorize: async () => ({ builderUser: { id: actor } }),
    logger: { error() {} },
  });
  const root = "/builder/api/pages/books/ultimate-b2/components/ultimate-b2-students-book";
  const call = (path, body) => handler({
    httpMethod: body ? "POST" : "GET", path,
    headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const mutationBody = (page, clientMutationId, expectedRevision, overrides = {}) => ({
    expectedRevision, clientMutationId,
    metadata: { label: `Edited ${page.label}`, printedLabel: page.printedLabel, sortOrder: page.sortOrder + 7, ...overrides },
  });

  const [first, second, third] = canonicalStudentsBookPages;
  const initial = await call(root);
  assert.equal(initial.statusCode, 200, initial.body);
  assert.equal(JSON.parse(initial.body).pages.find((page) => page.id === first.id).capabilities.editMetadata, true);
  assert.equal((await pool.query("select count(*)::int count from book_pages")).rows[0].count, 0);

  const mutationId = randomUUID();
  const firstBody = mutationBody(first, mutationId, 0);
  const saved = await call(`${root}/pages/${first.id}/metadata`, firstBody);
  assert.equal(saved.statusCode, 200, saved.body);
  const savedPage = JSON.parse(saved.body).pages.find((page) => page.id === first.id);
  assert.equal(savedPage.label, firstBody.metadata.label);
  assert.equal(savedPage.image.source, "repository-baseline");
  assert.equal(JSON.parse(saved.body).revision, 1);
  const materialized = (await pool.query("select page.*,unit.unit_number from book_pages page join units unit on unit.id=page.unit_id where page.stable_key=$1", [first.stableKey])).rows[0];
  assert.equal(materialized.unit_number, first.unitNumber);
  assert.equal(materialized.source_metadata.has_metadata_override, true);
  assert.equal(materialized.source_metadata.has_image_override, false);
  assert.equal(materialized.source_metadata.canonical_image_checksum_sha256, first.image.checksumSha256);
  assert.equal(materialized.source_metadata.canonical_image_mime_type, first.image.mimeType);

  const replay = await call(`${root}/pages/${first.id}/metadata`, firstBody);
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(JSON.parse(replay.body).idempotent, true);
  assert.equal(JSON.parse(replay.body).revision, 1);
  const conflictingReplay = await call(`${root}/pages/${first.id}/metadata`, mutationBody(first, mutationId, 0, { label: "Different replay" }));
  assert.equal(conflictingReplay.statusCode, 409, conflictingReplay.body);
  assert.equal(JSON.parse(conflictingReplay.body).error, "mutation_id_conflict");

  const stale = await call(`${root}/pages/${second.id}/metadata`, mutationBody(second, randomUUID(), 0));
  assert.equal(stale.statusCode, 409, stale.body);
  assert.equal(JSON.parse(stale.body).error, "revision_conflict");
  assert.equal((await pool.query("select count(*)::int count from book_pages where stable_key=$1", [second.stableKey])).rows[0].count, 0);

  const concurrent = await Promise.all([
    call(`${root}/pages/${second.id}/metadata`, mutationBody(second, randomUUID(), 1, { label: "Concurrent A" })),
    call(`${root}/pages/${second.id}/metadata`, mutationBody(second, randomUUID(), 1, { label: "Concurrent B" })),
  ]);
  assert.deepEqual(concurrent.map((response) => response.statusCode).sort(), [200, 409]);
  assert.equal((await pool.query("select count(*)::int count from book_pages where stable_key=$1", [second.stableKey])).rows[0].count, 1);
  assert.equal((await pool.query("select revision from builder_component_page_revisions revision join book_components component on component.id=revision.book_component_id where component.slug='ultimate-b2-students-book'")).rows[0].revision, "2");

  const reordered = await call(`${root}/pages/${third.id}/reorder`, mutationBody(third, randomUUID(), 2, { sortOrder: 0 }));
  assert.equal(reordered.statusCode, 200, reordered.body);
  assert.equal(JSON.parse(reordered.body).revision, 3);
  assert.equal((await pool.query("select sort_order from book_pages where stable_key=$1", [third.stableKey])).rows[0].sort_order, 0);
  const unknown = await call(`${root}/pages/not-canonical/metadata`, mutationBody(first, randomUUID(), 3));
  assert.equal(unknown.statusCode, 404, unknown.body);
  assert.equal((await pool.query("select count(*)::int count from book_assets")).rows[0].count, 0);
  assert.equal((await pool.query("select count(*)::int count from builder_audit_log where action in ('component_page_metadata','component_page_reorder')")).rows[0].count, 3);
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
  const componentIdentity = (await pool.query("select package.id package_id,component.id component_id from book_packages package join book_components component on component.book_package_id=package.id where package.slug='ultimate-b2' and component.slug=$1", [componentSlug])).rows[0];
  const lifecycleDocument = createEmptyUltimateB2ActivityLifecycle();
  await pool.query(`insert into builder_component_documents(book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,created_by_builder_user_id,updated_by_builder_user_id)
    values($1,$2,'activity_lifecycle','default','1.0',1,$3,$4,$5,$5)
    on conflict(book_component_id,document_type,document_key) do nothing`, [componentIdentity.package_id, componentIdentity.component_id, lifecycleDocument, builderDocumentSha256(lifecycleDocument), actor]);
  const nativeBefore = (await pool.query("select id,document_type,document_key,schema_version,revision,payload,payload_sha256,updated_at from builder_component_documents where book_component_id=$1 and document_type in ('native_activity_index','native_activity_public','native_activity_teacher','activity_lifecycle','open_response') order by document_type,document_key", [componentIdentity.component_id])).rows;
  const editionId = (await pool.query("insert into book_editions(book_package_id,edition_identifier,title,status) values($1,'lifecycle-test','Lifecycle test','draft') returning id", [componentIdentity.package_id])).rows[0].id;
  const activityAssetId = (await pool.query("insert into book_assets(book_package_id,edition_id,book_component_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,edition_identifier,version,publication_status,access_level,source_metadata) values($1,$2,$3,$4,'activity_artwork',$5,'private','lifecycle-test','image/png',4,$6,'lifecycle-test','v1','draft','internal',$7) returning id", [componentIdentity.package_id, editionId, componentIdentity.component_id, `ultimate-b2.lifecycle.${nativeActivityId}`, `lifecycle/${nativeActivityId}.png`, "a".repeat(64), { native_activity_id: nativeActivityId }])).rows[0].id;
  const activityAssetBefore = (await pool.query("select id,unit_id,page_id,activity_id,asset_role,object_key,checksum_sha256,publication_status,access_level,source_metadata,updated_at from book_assets where id=$1", [activityAssetId])).rows[0];
  await pool.query("insert into book_activities(package_slug,component_slug,page_id,title,type,content,correct_answers) values('ultimate-b2',$1,$2,'Preserved legacy activity','multiple_choice','{}','{}')", [componentSlug, pageId]);

  const unitId = (await pool.query("select id from units where book_component_id=$1 and unit_number=1", [componentIdentity.component_id])).rows[0].id;
  const unitExtraEditionId = (await pool.query(`insert into book_editions(book_package_id,edition_identifier,title,status,source_metadata)
    values($1,'builder-draft','Builder Unit Extra draft assets','draft','{"source":"unit-extras-builder"}'::jsonb)
    on conflict(book_package_id,edition_identifier) do update set updated_at=now() returning id`, [componentIdentity.package_id])).rows[0].id;
  const unitExtraItemId = `video-${"1".repeat(32)}`;
  const unitExtraChecksum = "c".repeat(64);
  const unitExtraAssetId = (await pool.query(`insert into book_assets(
      book_package_id,edition_id,book_component_id,unit_id,page_id,activity_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,
      byte_size,checksum_sha256,duration_seconds,edition_identifier,version,publication_status,access_level,source_metadata
    ) values($1,$2,$3,$4,null,null,$5,'unit_extra_video',$6,'private','lifecycle-test','video/mp4',4096,$7,5.84,'builder-draft','unit-extra-draft','draft','internal',$8) returning id`, [
    componentIdentity.package_id, unitExtraEditionId, componentIdentity.component_id, unitId,
    `ultimate-b2.builder-unit-extras.unit-1.${unitExtraItemId}.${unitExtraChecksum.slice(0, 12)}`,
    `builder-unit-extras/ultimate-b2/ultimate-b2-students-book/unit-1/${unitExtraItemId}/${unitExtraChecksum}.mp4`, unitExtraChecksum,
    { unit_extra_item_id: unitExtraItemId, asset_slot: unitExtraItemId, unit_slug: "unit-1" },
  ])).rows[0].id;
  const unitExtrasDocument = normalizeUltimateB2UnitExtrasDocument({
    schemaVersion: "1.0",
    units: [{ unitId: "unit-1", unitNumber: 1, categories: { videos: [{ id: unitExtraItemId, title: "Preserved Unit video", assetSlot: unitExtraItemId, asset: { assetId: unitExtraAssetId, checksumSha256: unitExtraChecksum, role: "unit_extra_video", slot: unitExtraItemId }, fileName: "preserved.mp4", byteSize: 4096, durationMs: 5840, cues: [] }] } }],
    pages: [{ pageId, unitId: "unit-1", extrasVisibility: { videos: true } }],
  });
  const unitExtrasSha256 = builderDocumentSha256(unitExtrasDocument);
  const unitExtrasId = (await pool.query(`insert into builder_component_documents(book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,created_by_builder_user_id,updated_by_builder_user_id)
    values($1,$2,'unit_extras','default','1.0',3,$3,$4,$5,$5) returning id`, [componentIdentity.package_id, componentIdentity.component_id, unitExtrasDocument, unitExtrasSha256, actor])).rows[0].id;
  await pool.query("insert into builder_component_document_revisions(document_id,revision,payload,payload_sha256,changed_by_builder_user_id,client_mutation_id) values($1,3,$2,$3,$4,$5)", [unitExtrasId, unitExtrasDocument, unitExtrasSha256, actor, randomUUID()]);
  const loadUnitExtrasState = async () => ({
    document: (await pool.query("select id,schema_version,revision,payload,payload_sha256,updated_at from builder_component_documents where id=$1", [unitExtrasId])).rows[0],
    revisionCount: (await pool.query("select count(*)::int count from builder_component_document_revisions where document_id=$1", [unitExtrasId])).rows[0].count,
    asset: (await pool.query("select id,unit_id,page_id,activity_id,asset_role,object_key,checksum_sha256,publication_status,access_level,updated_at from book_assets where id=$1", [unitExtraAssetId])).rows[0],
  });
  const unitExtrasBefore = await loadUnitExtrasState();

  const deleted = await deleteBuilderPageLifecycle(sql, input);
  assert.deepEqual({ outcome: deleted.outcome, pageRevision: deleted.current_revision, hotspotRevision: deleted.hotspot_revision, removed: deleted.removed_hotspot_count, preserved: deleted.preserved_activity_count }, { outcome: "saved", pageRevision: 1, hotspotRevision: 1, removed: 2, preserved: 2 });
  const stored = await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug });
  assert.equal(stored.revision, 1);
  assert.equal(stored.hotspotRevision, 1);
  assert.equal(stored.rows.find(({ stable_key }) => stable_key === input.pageKey).source_metadata.is_deleted, true);
  const storedHotspots = await pool.query("select revision,payload from builder_component_documents where document_type='hotspots'");
  assert.equal(storedHotspots.rows[0].revision, "1");
  assert.equal(Object.hasOwn(storedHotspots.rows[0].payload.pages, pageId), false);
  assert.deepEqual((await pool.query("select id,document_type,document_key,schema_version,revision,payload,payload_sha256,updated_at from builder_component_documents where book_component_id=$1 and document_type in ('native_activity_index','native_activity_public','native_activity_teacher','activity_lifecycle','open_response') order by document_type,document_key", [componentIdentity.component_id])).rows, nativeBefore);
  assert.deepEqual((await pool.query("select id,unit_id,page_id,activity_id,asset_role,object_key,checksum_sha256,publication_status,access_level,source_metadata,updated_at from book_assets where id=$1", [activityAssetId])).rows[0], activityAssetBefore);
  assert.equal((await pool.query("select count(*)::int count from book_activities where package_slug='ultimate-b2' and component_slug=$1 and page_id=$2", [componentSlug, pageId])).rows[0].count, 1);
  assert.deepEqual(await loadUnitExtrasState(), unitExtrasBefore);
  assert.equal((await pool.query("select count(*)::int count from builder_audit_log where action='component_page_deleted' and metadata->>'page_key'=$1", [input.pageKey])).rows[0].count, 1);

  const replay = await deleteBuilderPageLifecycle(sql, input);
  assert.deepEqual({ outcome: replay.outcome, pageRevision: replay.current_revision, hotspotRevision: replay.hotspot_revision }, { outcome: "idempotent", pageRevision: 1, hotspotRevision: 1 });
  assert.equal((await pool.query("select count(*)::int count from builder_audit_log where action='component_page_deleted' and metadata->>'page_key'=$1", [input.pageKey])).rows[0].count, 1);
  assert.deepEqual(await loadUnitExtrasState(), unitExtrasBefore);
  assert.equal((await deleteBuilderPageLifecycle(sql, { ...input, expectedRevision: 1 })).outcome, "mutation_id_conflict");

  const secondPage = canonicalStudentsBookPagesById.get("ub2-sb-unit-1-part-2");
  const secondHotspotDocument = structuredClone(hotspotDocument);
  const secondRemoved = secondHotspotDocument.pages[secondPage.id] || [];
  delete secondHotspotDocument.pages[secondPage.id];
  const secondInput = { ...input, pageKey: secondPage.stableKey, pageMetadata: { label: secondPage.label, printedLabel: secondPage.printedLabel, sortOrder: secondPage.sortOrder, unitNumber: secondPage.unitNumber }, clientMutationId: randomUUID(), hotspotDocument: secondHotspotDocument, hotspotSha256: builderDocumentSha256(secondHotspotDocument), removedHotspotCount: secondRemoved.length, preservedActivityCount: new Set(secondRemoved.map(({ activityKey }) => activityKey)).size };
  const inputForPage = (target) => {
    const projectedHotspots = structuredClone(hotspotDocument);
    const projectedRemoved = projectedHotspots.pages[target.id] || [];
    delete projectedHotspots.pages[target.id];
    return { ...input, pageKey: target.stableKey, expectedRevision: 1, expectedHotspotRevision: 1, pageMetadata: { label: target.label, printedLabel: target.printedLabel, sortOrder: target.sortOrder, unitNumber: target.unitNumber }, clientMutationId: randomUUID(), hotspotDocument: projectedHotspots, hotspotSha256: builderDocumentSha256(projectedHotspots), removedHotspotCount: projectedRemoved.length, preservedActivityCount: new Set(projectedRemoved.map(({ activityKey }) => activityKey)).size };
  };
  assert.equal((await deleteBuilderPageLifecycle(sql, secondInput)).outcome, "revision_conflict");
  assert.equal((await deleteBuilderPageLifecycle(sql, { ...secondInput, expectedRevision: 1, expectedHotspotRevision: 0, clientMutationId: randomUUID() })).outcome, "hotspot_revision_conflict");
  assert.equal((await deleteBuilderPageLifecycle(sql, { ...secondInput, expectedRevision: 1, expectedHotspotRevision: 1, clientMutationId: randomUUID(), hotspotDocument: { ...hotspotDocument, packageSlug: "wrong" } })).outcome, "invalid_hotspot_projection");

  const unknownReference = { schemaVersion: "1.0", pageId: secondPage.id };
  await pool.query(`insert into builder_component_documents(book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,created_by_builder_user_id,updated_by_builder_user_id)
    values($1,$2,'future_page_reference','default','1.0',1,$3,$4,$5,$5)`, [componentIdentity.package_id, componentIdentity.component_id, unknownReference, builderDocumentSha256(unknownReference), actor]);
  assert.equal((await deleteBuilderPageLifecycle(sql, { ...secondInput, expectedRevision: 1, expectedHotspotRevision: 1, clientMutationId: randomUUID() })).outcome, "unsupported_page_reference");
  assert.equal((await pool.query("select count(*)::int count from book_pages where stable_key=$1", [secondPage.stableKey])).rows[0].count, 0);
  assert.equal((await pool.query("select revision from builder_component_page_revisions revision join book_components component on component.id=revision.book_component_id where component.slug=$1", [componentSlug])).rows[0].revision, "1");
  assert.equal((await pool.query("select revision from builder_component_documents where document_type='hotspots'")).rows[0].revision, "1");
  assert.deepEqual(await loadUnitExtrasState(), unitExtrasBefore);

  const nonCanonicalPage = canonicalStudentsBookPagesById.get("ub2-sb-unit-1-part-3");
  const nonCanonicalDocument = { schemaVersion: "1.0", pages: [{ pageId: nonCanonicalPage.id }] };
  await pool.query(`insert into builder_component_documents(book_package_id,book_component_id,document_type,document_key,schema_version,revision,payload,payload_sha256,created_by_builder_user_id,updated_by_builder_user_id)
    values($1,$2,'unit_extras','alternate','1.0',1,$3,$4,$5,$5)`, [componentIdentity.package_id, componentIdentity.component_id, nonCanonicalDocument, builderDocumentSha256(nonCanonicalDocument), actor]);
  const nonCanonicalInput = inputForPage(nonCanonicalPage);
  assert.equal((await deleteBuilderPageLifecycle(sql, nonCanonicalInput)).outcome, "unsupported_page_reference");
  assert.equal((await pool.query("select count(*)::int count from book_pages where stable_key=$1", [nonCanonicalPage.stableKey])).rows[0].count, 0);

  const mediaPage = canonicalStudentsBookPagesById.get("ub2-sb-unit-1-part-4");
  await pool.query("insert into book_media_assets(package_slug,component_slug,page_id,file_name,mime_type,public_url,kind) values('ultimate-b2',$1,$2,'unsupported.pdf','application/pdf','https://example.invalid/unsupported.pdf','document')", [componentSlug, mediaPage.id]);
  const mediaInput = inputForPage(mediaPage);
  assert.equal((await deleteBuilderPageLifecycle(sql, mediaInput)).outcome, "unsupported_page_reference");
  assert.equal((await pool.query("select count(*)::int count from book_pages where stable_key=$1", [mediaPage.stableKey])).rows[0].count, 0);

  const assetPage = canonicalStudentsBookPagesById.get("ub2-sb-unit-1-part-5");
  const assetPageRowId = (await pool.query(`insert into book_pages(book_package_id,book_component_id,unit_id,stable_key,label,sort_order,source_metadata)
    values($1,$2,$3,$4,$5,$6,'{"source":"builder-pages","is_override":false,"is_active":true,"is_deleted":false}'::jsonb) returning id`, [componentIdentity.package_id, componentIdentity.component_id, unitId, assetPage.stableKey, assetPage.label, assetPage.sortOrder])).rows[0].id;
  const pageOwnedAssetId = (await pool.query(`insert into book_assets(book_package_id,edition_id,book_component_id,unit_id,page_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,edition_identifier,version,publication_status,access_level,source_metadata)
    values($1,$2,$3,$4,$5,$6,'activity_artwork',$7,'private','lifecycle-test','image/png',4,$8,'lifecycle-test','page-owned','draft','internal','{}'::jsonb) returning id`, [componentIdentity.package_id, editionId, componentIdentity.component_id, unitId, assetPageRowId, `ultimate-b2.lifecycle.page-owned.${assetPage.id}`, `lifecycle/page-owned/${assetPage.id}.png`, "d".repeat(64)])).rows[0].id;
  assert.equal((await deleteBuilderPageLifecycle(sql, inputForPage(assetPage))).outcome, "unsupported_page_reference");
  assert.deepEqual((await pool.query("select source_metadata->>'is_deleted' is_deleted from book_pages where id=$1", [assetPageRowId])).rows[0], { is_deleted: "false" });
  assert.equal((await pool.query("select publication_status from book_assets where id=$1", [pageOwnedAssetId])).rows[0].publication_status, "draft");
  assert.deepEqual(await loadUnitExtrasState(), unitExtrasBefore);

  const restored = await restoreBuilderStudentsPage(sql, { bookSlug: "ultimate-b2", componentSlug, pageKey: input.pageKey, expectedRevision: 1, clientMutationId: randomUUID(), builderUserId: actor });
  assert.deepEqual({ outcome: restored.outcome, revision: restored.current_revision }, { outcome: "saved", revision: 2 });
  const restoredPage = (await pool.query("select source_metadata from book_pages where stable_key=$1", [input.pageKey])).rows[0];
  assert.equal(restoredPage.source_metadata.is_deleted, false);
  assert.equal((await pool.query("select revision,payload from builder_component_documents where document_type='hotspots'")).rows[0].revision, "1");
  assert.equal(Object.hasOwn((await pool.query("select payload from builder_component_documents where document_type='hotspots'")).rows[0].payload.pages, pageId), false);
  assert.deepEqual((await pool.query("select id,document_type,document_key,schema_version,revision,payload,payload_sha256,updated_at from builder_component_documents where book_component_id=$1 and document_type in ('native_activity_index','native_activity_public','native_activity_teacher','activity_lifecycle','open_response') order by document_type,document_key", [componentIdentity.component_id])).rows, nativeBefore);
  assert.deepEqual((await pool.query("select id,unit_id,page_id,activity_id,asset_role,object_key,checksum_sha256,publication_status,access_level,source_metadata,updated_at from book_assets where id=$1", [activityAssetId])).rows[0], activityAssetBefore);
  assert.deepEqual(await loadUnitExtrasState(), unitExtrasBefore);
  const repeatedRestore = await restoreBuilderStudentsPage(sql, { bookSlug: "ultimate-b2", componentSlug, pageKey: input.pageKey, expectedRevision: 2, clientMutationId: randomUUID(), builderUserId: actor });
  assert.deepEqual({ outcome: repeatedRestore.outcome, revision: repeatedRestore.current_revision }, { outcome: "page_state_conflict", revision: 2 });
  assert.equal((await pool.query("select revision from builder_component_page_revisions revision join book_components component on component.id=revision.book_component_id where component.slug=$1", [componentSlug])).rows[0].revision, "2");
});

test("isolated PostgreSQL restores exact managed assets, supports pre-053 tombstones, and permanently tombstones only the editable page", { skip: !enabled }, async (t) => {
  const schema = `builder_pages_lifecycle_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await applyCanonicalProductionMigrations(pool);
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Managed Lifecycle Actor','managed-lifecycle@example.test','hash')", [actor]);
  const sql = tag(pool);
  const identities = (await pool.query(`select component.slug,component.id component_id,package.id package_id,unit.id unit_id
    from book_packages package join book_components component on component.book_package_id=package.id join units unit on unit.book_component_id=component.id and unit.unit_number=1
    where package.slug='ultimate-b2' and component.slug in ('ultimate-b2-workbook','ultimate-b2-grammar-book')`)).rows;
  const workbook = identities.find((row) => row.slug === "ultimate-b2-workbook");
  const pageId = `wb-page-${randomUUID().replaceAll("-", "")}`;
  const upload = uploadInput({ componentSlug: workbook.slug, pageId, mode: "create", expectedRevision: 0, unitId: workbook.unit_id });
  const created = await finish(sql, upload);
  await pool.query("insert into book_activities(package_slug,component_slug,page_id,title,type,content,correct_answers) values('ultimate-b2',$1,$2,'Preserved without hotspot','multiple_choice','{}','{}')", [workbook.slug, pageId]);
  const emptyHotspots = { schemaVersion: "1.0", packageSlug: "ultimate-b2", componentSlug: workbook.slug, pages: {} };
  const deleteInput = (expectedRevision) => ({ bookSlug: "ultimate-b2", componentSlug: workbook.slug, pageKey: upload.pageKey,
    expectedRevision, expectedHotspotRevision: 0, clientMutationId: randomUUID(), pageMetadata: {}, hotspotSchemaVersion: "1.0",
    hotspotDocument: emptyHotspots, hotspotSha256: builderDocumentSha256(emptyHotspots), removedHotspotCount: 0, preservedActivityCount: 1, builderUserId: actor });

  const deleted = await deleteBuilderPageLifecycle(sql, deleteInput(1));
  assert.equal(deleted.outcome, "saved");
  const tombstone = (await pool.query("select source_metadata from book_pages where stable_key=$1", [upload.pageKey])).rows[0].source_metadata;
  assert.equal(tombstone.restorable_asset_id, created.asset_id);
  assert.equal((await pool.query("select publication_status from book_assets where id=$1", [created.asset_id])).rows[0].publication_status, "archived");
  const restored = await restoreBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: workbook.slug, pageKey: upload.pageKey, expectedRevision: 2, clientMutationId: randomUUID(), builderUserId: actor });
  assert.equal(restored.outcome, "saved");
  assert.equal((await pool.query("select publication_status from book_assets where id=$1", [created.asset_id])).rows[0].publication_status, "draft");
  assert.equal((await deleteBuilderPageLifecycle(sql, deleteInput(3))).outcome, "saved");
  const purged = await purgeBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: workbook.slug, pageKey: upload.pageKey, expectedRevision: 4, clientMutationId: randomUUID(), builderUserId: actor });
  assert.equal(purged.outcome, "saved");
  assert.equal((await restoreBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: workbook.slug, pageKey: upload.pageKey, expectedRevision: 5, clientMutationId: randomUUID(), builderUserId: actor })).outcome, "page_permanently_deleted");
  assert.equal((await pool.query("select count(*)::int count from book_activities where component_slug=$1 and page_id=$2", [workbook.slug, pageId])).rows[0].count, 1);
  assert.equal((await pool.query("select count(*)::int count from builder_audit_log where target_id=(select id::text from book_pages where stable_key=$1) and action='component_page_permanently_deleted'", [upload.pageKey])).rows[0].count, 1);

  const grammar = identities.find((row) => row.slug === "ultimate-b2-grammar-book");
  const legacyPageId = `gb-page-${randomUUID().replaceAll("-", "")}`;
  const legacyUpload = uploadInput({ componentSlug: grammar.slug, pageId: legacyPageId, mode: "create", expectedRevision: 0, unitId: grammar.unit_id });
  const legacyCreated = await finish(sql, legacyUpload);
  await pool.query("update book_assets set publication_status='archived',updated_at=now() where id=$1", [legacyCreated.asset_id]);
  await pool.query("update book_pages set source_metadata=(source_metadata-'restorable_asset_id')||jsonb_build_object('is_active',false,'is_deleted',true,'deleted_at',now()),updated_at=now() where stable_key=$1", [legacyUpload.pageKey]);
  const compatibilityRestore = await restoreBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: grammar.slug, pageKey: legacyUpload.pageKey, expectedRevision: 1, clientMutationId: randomUUID(), builderUserId: actor });
  assert.equal(compatibilityRestore.outcome, "saved");
  assert.equal((await pool.query("select publication_status from book_assets where id=$1", [legacyCreated.asset_id])).rows[0].publication_status, "draft");
});
