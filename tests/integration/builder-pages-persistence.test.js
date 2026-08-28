import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import {
  claimBuilderPageUpload,
  completeBuilderPageUpload,
  loadBuilderPageAsset,
  loadBuilderPages,
  mutateBuilderPage,
  prepareBuilderPageUpload,
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
  assert.equal(migrations.at(-1).filename, "048_ultimate_b2_product_publication.sql");
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
  await pool.query("insert into book_activities(package_slug,component_slug,page_id,title,type,content,correct_answers) values('ultimate-b2','ultimate-b2-workbook',$1,'Referenced page','multiple_choice','{}','{}')", [workbookPageId]);
  const referenced = await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "delete", expectedRevision: 5, clientMutationId: randomUUID(), pageMetadata: {}, builderUserId: actor });
  assert.equal(referenced.outcome, "page_referenced");
  await pool.query("delete from book_activities where package_slug='ultimate-b2' and component_slug='ultimate-b2-workbook' and page_id=$1", [workbookPageId]);
  const removed = await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "delete", expectedRevision: 5, clientMutationId: randomUUID(), pageMetadata: {}, builderUserId: actor });
  assert.equal(removed.current_revision, 6);
  workbookRows = await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" });
  const removedRow = workbookRows.rows.find((row) => row.stable_key === workbook.pageKey);
  assert.equal(removedRow.source_metadata.is_active, false);
  assert.equal(removedRow.asset_id, null);
  assert.equal(workbookRows.rows.find((row) => row.stable_key === legacy.pageKey).unit_id, null);
});
