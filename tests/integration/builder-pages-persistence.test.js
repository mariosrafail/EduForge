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

function uploadInput({ componentSlug, pageId, mode, expectedRevision, builderUserId = actor }) {
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
    pageMetadata: { label: `Label ${pageId}`, printedLabel: "2-3", sortOrder: 10, ...(componentSlug.endsWith("students-book") ? { baselineWidth: 581, baselineHeight: 794 } : {}) },
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

test("isolated PostgreSQL persists scoped Students overrides and Workbook page CRUD", { skip: !enabled }, async (t) => {
  const schema = `builder_pages_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "046_builder_component_pages_finalize_fix.sql");
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Page Actor','page-actor@example.test','hash'),($2,'Other Page Actor','page-other@example.test','hash')", [actor, otherActor]);
  const sql = tag(pool);

  const studentPageId = "ub2-sb-unit-1-part-1";
  const student = uploadInput({ componentSlug: "ultimate-b2-students-book", pageId: studentPageId, mode: "replace", expectedRevision: 0 });
  assert.equal((await prepareBuilderPageUpload(sql, { ...student, uploadId: randomUUID(), clientMutationId: randomUUID(), requestSha256: digest(), mode: "create" })).outcome, "operation_not_allowed");
  assert.equal((await prepareBuilderPageUpload(sql, { ...student, uploadId: randomUUID(), clientMutationId: randomUUID(), requestSha256: digest(), componentSlug: "ultimate-b2-grammar-book", pageKey: "ultimate-b2-grammar-book/pages/private" })).outcome, "resource_not_found");
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

  const workbookPageId = `wb-page-${randomUUID().replaceAll("-", "")}`;
  const workbook = uploadInput({ componentSlug: "ultimate-b2-workbook", pageId: workbookPageId, mode: "create", expectedRevision: 0 });
  const workbookResult = await finish(sql, workbook);
  assert.equal(workbookResult.revision, 1);
  const metadataMutation = randomUUID();
  const edited = await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "metadata", expectedRevision: 1, clientMutationId: metadataMutation, pageMetadata: { label: "Workbook page 2", printedLabel: "2", sortOrder: 20 }, builderUserId: actor });
  assert.equal(edited.current_revision, 2);
  assert.equal((await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "metadata", expectedRevision: 1, clientMutationId: metadataMutation, pageMetadata: { label: "Workbook page 2", printedLabel: "2", sortOrder: 20 }, builderUserId: actor })).outcome, "idempotent");
  await pool.query("insert into book_activities(package_slug,component_slug,page_id,title,type,content,correct_answers) values('ultimate-b2','ultimate-b2-workbook',$1,'Referenced page','multiple_choice','{}','{}')", [workbookPageId]);
  const referenced = await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "delete", expectedRevision: 2, clientMutationId: randomUUID(), pageMetadata: {}, builderUserId: actor });
  assert.equal(referenced.outcome, "page_referenced");
  await pool.query("delete from book_activities where package_slug='ultimate-b2' and component_slug='ultimate-b2-workbook' and page_id=$1", [workbookPageId]);
  const removed = await mutateBuilderPage(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", pageKey: workbook.pageKey, action: "delete", expectedRevision: 2, clientMutationId: randomUUID(), pageMetadata: {}, builderUserId: actor });
  assert.equal(removed.current_revision, 3);
  const workbookRows = await loadBuilderPages(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" });
  assert.equal(workbookRows.rows[0].source_metadata.is_active, false);
  assert.equal(workbookRows.rows[0].asset_id, null);
});
