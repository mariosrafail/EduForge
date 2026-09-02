import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { collectUltimateB2PublicationV2Sources, createComponentRelease } from "../../netlify-sites/ultimate-b2-builder/server/_builder-publication-store.js";
import { resolveBuilderContentResource } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { saveBuilderComponentDocument } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-store.js";
import {
  archiveUnreferencedBuilderUnitExtraAssets,
  claimBuilderUnitExtraAssetUpload,
  completeBuilderUnitExtraAssetUpload,
  failBuilderUnitExtraAssetUpload,
  loadBuilderUnitExtraAsset,
  prepareBuilderUnitExtraAssetUpload,
  validateBuilderUnitExtraAssetReferences,
} from "../../netlify-sites/ultimate-b2-builder/server/_builder-unit-extra-assets-store.js";
import { nativeChildIdFromUuid } from "../../src/data/native-activities/nativeChildIdentity.js";
import { normalizeUltimateB2UnitExtrasDocument } from "../../src/data/ultimate-b2/unitExtras.js";
import { ultimateB2StudentsBookAuthoringPages } from "../../src/data/ultimate-b2/studentsBookAuthoringCatalog.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000001";
const otherActor = "10000000-0000-4000-8000-000000000002";
const itemId = nativeChildIdFromUuid("video", "10000000-0000-4000-8000-000000000003");
const audioItemId = nativeChildIdFromUuid("audio", "10000000-0000-4000-8000-000000000004");
const pageId = ultimateB2StudentsBookAuthoringPages.find((page) => page.unitNumber === 1).id;

function scoped(base, schema) { const url = new URL(base); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function tag(pool) { return async (strings, ...values) => { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return (await pool.query(text, values)).rows; }; }

function draft(asset = null, title = "Welcome") {
  return normalizeUltimateB2UnitExtrasDocument({
    schemaVersion: "1.0",
    units: [{ unitId: "unit-1", unitNumber: 1, categories: { videos: [{
      id: itemId, title, assetSlot: itemId, asset,
      fileName: asset ? "welcome.mp4" : "", byteSize: asset ? 123_456 : null,
      durationMs: asset ? 5_840 : null, cues: [],
    }] } }],
    pages: [{ pageId, unitId: "unit-1", extrasVisibility: { videos: true } }],
  });
}

function audioDraft(asset = null) {
  return normalizeUltimateB2UnitExtrasDocument({
    schemaVersion: "1.0",
    units: [{ unitId: "unit-1", unitNumber: 1, categories: { videos: [], audios: [{ id: audioItemId, title: "Pronunciation", assetSlot: audioItemId, asset, fileName: asset ? "pronunciation.mp3" : "", byteSize: asset ? 4_096 : null }] } }],
    pages: [{ pageId, unitId: "unit-1", extrasVisibility: { videos: false, audios: true } }],
  });
}

test("isolated PostgreSQL persists and compiles a standalone managed Unit Extra MP3", { skip: !enabled }, async (t) => {
  const schema = `builder_unit_extra_audio_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 3 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await applyCanonicalProductionMigrations(pool);
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Audio Actor','unit-extra-audio@example.test','hash')", [actor]);
  const sql = tag(pool);
  const resource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "unit-extras");
  const placeholder = audioDraft();
  await saveBuilderComponentDocument(sql, { resource, expectedRevision: 0, clientMutationId: randomUUID(), document: placeholder, payloadSha256: builderDocumentSha256(placeholder), builderUserId: actor });
  const uploadId = randomUUID(); const clientMutationId = randomUUID();
  const prepared = await prepareBuilderUnitExtraAssetUpload(sql, {
    bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", unitSlug: "unit-1", itemId: audioItemId, assetSlot: audioItemId,
    expectedRevision: 1, clientMutationId, uploadId, requestSha256: randomBytes(32).toString("hex"),
    fileDescriptor: { name: "pronunciation.mp3", size: 4_096, type: "audio/mpeg", assetSlot: audioItemId },
    stagingObjectKey: `builder-unit-extra-assets/ultimate-b2/ultimate-b2-students-book/unit-1/${audioItemId}/${uploadId}/staging/audio`,
    builderUserId: actor, expiresAt: new Date(Date.now() + 600_000).toISOString(),
  });
  assert.equal(prepared.outcome, "prepared");
  assert.equal((await claimBuilderUnitExtraAssetUpload(sql, { uploadId, expectedRevision: 1, clientMutationId, builderUserId: actor })).outcome, "claimed");
  const checksumSha256 = "d".repeat(64);
  const objectKey = `builder-unit-extra-assets/ultimate-b2/ultimate-b2-students-book/unit-1/${audioItemId}/assets/${checksumSha256}.mp3`;
  const assetId = await completeBuilderUnitExtraAssetUpload(sql, { uploadId, builderUserId: actor, objectKey, storageBucket: "private-assets", mimeType: "audio/mpeg", byteSize: 4_096, checksumSha256, durationMs: null });
  const reference = { assetId, checksumSha256, role: "unit_extra_audio", slot: audioItemId };
  const attached = audioDraft(reference);
  await assert.doesNotReject(validateBuilderUnitExtraAssetReferences(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", document: attached }));
  await saveBuilderComponentDocument(sql, { resource, expectedRevision: 1, clientMutationId: randomUUID(), document: attached, payloadSha256: builderDocumentSha256(attached), builderUserId: actor });
  const row = await loadBuilderUnitExtraAsset(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", unitSlug: "unit-1", mediaKind: "audios", itemId: audioItemId, assetId });
  assert.deepEqual({ role: row.asset_role, mime: row.mime_type, duration: row.duration_seconds }, { role: "unit_extra_audio", mime: "audio/mpeg", duration: null });
  const compiled = compileUltimateB2ComponentReleaseV2(await collectUltimateB2PublicationV2Sources(sql));
  assert.equal(compiled.publicProjection.unitExtras.units[0].categories.audios[0].audio.asset.assetId, assetId);
  assert.equal(compiled.assetManifest.some((entry) => entry.role === "unit_extra_audio" && entry.mediaType === "audio/mpeg" && entry.extension === "mp3"), true);
});

test("isolated PostgreSQL enforces Unit Extra upload ownership, lifecycle, reuse, cleanup, and publication freshness", { skip: !enabled }, async (t) => {
  const schema = `builder_unit_extras_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.ok(migrations.some(({ filename }) => filename === "044_builder_unit_extra_asset_uploads.sql"));
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Unit Extra Actor','unit-extra@example.test','hash'),($2,'Other Actor','unit-extra-other@example.test','hash')", [actor, otherActor]);
  const sql = tag(pool);
  const resource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "unit-extras");
  const initial = draft();
  const initialSave = await saveBuilderComponentDocument(sql, { resource, expectedRevision: 0, clientMutationId: randomUUID(), document: initial, payloadSha256: builderDocumentSha256(initial), builderUserId: actor });
  assert.equal(initialSave.outcome, "saved");
  assert.equal((await pool.query("select to_regclass('builder_unit_extra_asset_upload_sessions')::text as relation")).rows[0].relation, "builder_unit_extra_asset_upload_sessions");
  assert.equal((await pool.query("select to_regprocedure('prepare_builder_unit_extra_asset_upload(text,text,text,text,text,bigint,uuid,uuid,text,jsonb,text,uuid,timestamptz)')::text as function")).rows[0].function.startsWith("prepare_builder_unit_extra_asset_upload"), true);

  const uploadId = randomUUID(); const mutationId = randomUUID(); const requestSha256 = randomBytes(32).toString("hex");
  const prepareInput = {
    bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", unitSlug: "unit-1", itemId, assetSlot: itemId,
    expectedRevision: 1, clientMutationId: mutationId, uploadId, requestSha256,
    fileDescriptor: { name: "welcome.mp4", size: 123_456, type: "video/mp4", assetSlot: itemId },
    stagingObjectKey: `builder-unit-extras/ultimate-b2/ultimate-b2-students-book/unit-1/${itemId}/${uploadId}/staging/video.mp4`,
    builderUserId: actor, expiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
  const distinctPrepare = (overrides = {}) => ({
    ...prepareInput,
    uploadId: randomUUID(), clientMutationId: randomUUID(), requestSha256: randomBytes(32).toString("hex"),
    ...overrides,
  });
  const ordinaryActors = (await pool.query("select id,role from app_users where role in ('teacher','student') order by role")).rows;
  assert.deepEqual(ordinaryActors.map(({ role }) => role), ["student", "teacher"]);
  for (const ordinaryActor of ordinaryActors) {
    assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, distinctPrepare({ builderUserId: ordinaryActor.id }))).outcome, "unauthorized_actor", `${ordinaryActor.role} must not prepare a Builder upload`);
  }
  assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, distinctPrepare({ componentSlug: "ultimate-b2-workbook" }))).outcome, "resource_not_found");
  assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, distinctPrepare({ unitSlug: "unit-2" }))).outcome, "unit_extra_item_mismatch");
  assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, distinctPrepare({ expectedRevision: 99 }))).outcome, "revision_conflict");
  assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, prepareInput)).outcome, "prepared");
  assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, prepareInput)).outcome, "idempotent");
  assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, { ...prepareInput, requestSha256: "f".repeat(64) })).outcome, "mutation_id_conflict");
  assert.equal((await claimBuilderUnitExtraAssetUpload(sql, { uploadId, expectedRevision: 1, clientMutationId: mutationId, builderUserId: otherActor })).outcome, "session_not_found");
  assert.equal((await claimBuilderUnitExtraAssetUpload(sql, { uploadId, expectedRevision: 1, clientMutationId: mutationId, builderUserId: actor })).outcome, "claimed");

  const checksumSha256 = "a".repeat(64);
  const objectKey = `builder-unit-extras/ultimate-b2/ultimate-b2-students-book/unit-1/${itemId}/${checksumSha256}.mp4`;
  await assert.rejects(completeBuilderUnitExtraAssetUpload(sql, { uploadId, builderUserId: otherActor, objectKey, storageBucket: "private-assets", mimeType: "video/mp4", byteSize: 123_456, checksumSha256, durationMs: 5_840 }), /cannot be completed/);
  const assetId = await completeBuilderUnitExtraAssetUpload(sql, { uploadId, builderUserId: actor, objectKey, storageBucket: "private-assets", mimeType: "video/mp4", byteSize: 123_456, checksumSha256, durationMs: 5_840 });
  const replay = await claimBuilderUnitExtraAssetUpload(sql, { uploadId, expectedRevision: 1, clientMutationId: mutationId, builderUserId: actor });
  assert.equal(replay.outcome, "idempotent");
  assert.equal(replay.resultingAssetId, assetId);

  const asset = await loadBuilderUnitExtraAsset(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", unitSlug: "unit-1", itemId, assetId });
  assert.equal(asset.activity_id, null);
  assert.equal(asset.page_id, null);
  assert.equal(asset.asset_role, "unit_extra_video");
  assert.equal(asset.storage_profile, "private");
  assert.equal(asset.source_metadata.unit_extra_item_id, itemId);
  const persistedAsset = (await pool.query("select unit_record.slug,asset.byte_size,asset.checksum_sha256,asset.duration_seconds,asset.mime_type,asset.storage_bucket,asset.access_level from book_assets asset join units unit_record on unit_record.id=asset.unit_id where asset.id=$1", [assetId])).rows[0];
  assert.equal(persistedAsset.slug, "unit-1");
  assert.deepEqual({ byteSize: Number(persistedAsset.byte_size), checksum: persistedAsset.checksum_sha256, durationMs: Math.round(Number(persistedAsset.duration_seconds) * 1_000), mimeType: persistedAsset.mime_type, bucket: persistedAsset.storage_bucket, access: persistedAsset.access_level }, { byteSize: 123_456, checksum: checksumSha256, durationMs: 5_840, mimeType: "video/mp4", bucket: "private-assets", access: "internal" });

  const failedInput = distinctPrepare();
  assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, failedInput)).outcome, "prepared");
  assert.equal(await failBuilderUnitExtraAssetUpload(sql, { uploadId: failedInput.uploadId, builderUserId: actor, failureCode: "cancelled_by_test" }), true);
  assert.equal(await failBuilderUnitExtraAssetUpload(sql, { uploadId: failedInput.uploadId, builderUserId: actor, failureCode: "cancelled_by_test" }), true);
  assert.equal((await claimBuilderUnitExtraAssetUpload(sql, { uploadId: failedInput.uploadId, expectedRevision: 1, clientMutationId: failedInput.clientMutationId, builderUserId: actor })).outcome, "invalid_session_state");

  const reference = { assetId, checksumSha256, role: "unit_extra_video", slot: itemId };
  const attached = draft(reference);
  await assert.doesNotReject(validateBuilderUnitExtraAssetReferences(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", document: attached }));
  const wrongUnit = structuredClone(attached); wrongUnit.units[0].unitId = "unit-2"; wrongUnit.units[0].unitNumber = 2;
  await assert.rejects(validateBuilderUnitExtraAssetReferences(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", document: wrongUnit }), /unit_extra_asset_invalid/);
  const attachedSave = await saveBuilderComponentDocument(sql, { resource, expectedRevision: 1, clientMutationId: randomUUID(), document: attached, payloadSha256: builderDocumentSha256(attached), builderUserId: actor });
  assert.equal(attachedSave.revision, 2);

  const sources = await collectUltimateB2PublicationV2Sources(sql);
  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  assert.equal(compiled.publicProjection.unitExtras.units[0].categories.videos[0].video.asset.assetId, assetId);
  assert.equal(JSON.stringify(compiled.publicProjection).includes(objectKey), false);
  assert.equal(JSON.stringify(compiled.publicProjection).includes(prepareInput.stagingObjectKey), false);
  const created = await createComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", ...compiled, requestSha256: compiled.releaseSha256, releaseNote: "", clientMutationId: randomUUID(), builderUserId: actor });
  assert.equal(created.outcome, "created");
  const current = async () => (await pool.query("select builder_release_sources_are_current($1) current", [created.releaseId])).rows[0].current;
  assert.equal(await current(), true);
  const legacySnapshot = structuredClone(compiled.sourceSnapshot);
  delete legacySnapshot.unitExtras;
  const legacyReleaseSha256 = randomBytes(32).toString("hex");
  const legacy = await createComponentRelease(sql, {
    bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", ...compiled,
    sourceSnapshot: legacySnapshot, sourceSnapshotSha256: randomBytes(32).toString("hex"),
    releaseSha256: legacyReleaseSha256, requestSha256: legacyReleaseSha256,
    releaseNote: "Legacy source compatibility proof", clientMutationId: randomUUID(), builderUserId: actor,
  });
  assert.equal(legacy.outcome, "created");

  const renamed = draft(reference, "Renamed after compilation");
  const renamedSave = await saveBuilderComponentDocument(sql, { resource, expectedRevision: 2, clientMutationId: randomUUID(), document: renamed, payloadSha256: builderDocumentSha256(renamed), builderUserId: actor });
  assert.equal(renamedSave.revision, 3);
  assert.equal(await current(), false);
  assert.equal((await pool.query("select builder_release_sources_are_current($1) current", [legacy.releaseId])).rows[0].current, true, "a legacy source snapshot without Unit Extras remains current");
  const recompiled = compileUltimateB2ComponentReleaseV2(await collectUltimateB2PublicationV2Sources(sql));
  assert.notEqual(recompiled.sourceSnapshot.unitExtras.sha256, compiled.sourceSnapshot.unitExtras.sha256);
  const recreated = await createComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", ...recompiled, requestSha256: recompiled.releaseSha256, releaseNote: "", clientMutationId: randomUUID(), builderUserId: actor });
  assert.equal(recreated.outcome, "created");
  assert.equal((await pool.query("select builder_release_sources_are_current($1) current", [recreated.releaseId])).rows[0].current, true);

  const empty = { schemaVersion: "1.0", units: [], pages: [] };
  await saveBuilderComponentDocument(sql, { resource, expectedRevision: 3, clientMutationId: randomUUID(), document: empty, payloadSha256: builderDocumentSha256(empty), builderUserId: actor });
  const archived = await archiveUnreferencedBuilderUnitExtraAssets(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", builderUserId: actor });
  assert.deepEqual(archived, [{ assetId, objectKey }]);
  assert.equal((await pool.query("select publication_status from book_assets where id=$1", [assetId])).rows[0].publication_status, "archived");

  const expiredId = randomUUID(); const expiredMutation = randomUUID();
  const placeholderAgain = await saveBuilderComponentDocument(sql, { resource, expectedRevision: 4, clientMutationId: randomUUID(), document: initial, payloadSha256: builderDocumentSha256(initial), builderUserId: actor });
  assert.equal(placeholderAgain.revision, 5);
  const reuseUploadId = randomUUID(); const reuseMutation = randomUUID();
  const reusePrepare = { ...prepareInput, uploadId: reuseUploadId, clientMutationId: reuseMutation, requestSha256: "c".repeat(64), expectedRevision: 5 };
  assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, reusePrepare)).outcome, "prepared");
  assert.equal((await claimBuilderUnitExtraAssetUpload(sql, { uploadId: reuseUploadId, expectedRevision: 5, clientMutationId: reuseMutation, builderUserId: actor })).outcome, "claimed");
  assert.equal(await completeBuilderUnitExtraAssetUpload(sql, { uploadId: reuseUploadId, builderUserId: actor, objectKey, storageBucket: "private-assets", mimeType: "video/mp4", byteSize: 123_456, checksumSha256, durationMs: 5_840 }), assetId);
  assert.equal((await pool.query("select publication_status from book_assets where id=$1", [assetId])).rows[0].publication_status, "draft");
  const expiredPrepare = { ...prepareInput, uploadId: expiredId, clientMutationId: expiredMutation, requestSha256: "b".repeat(64), expectedRevision: 5, expiresAt: new Date(Date.now() - 1_000).toISOString() };
  assert.equal((await prepareBuilderUnitExtraAssetUpload(sql, expiredPrepare)).outcome, "prepared");
  assert.equal((await claimBuilderUnitExtraAssetUpload(sql, { uploadId: expiredId, expectedRevision: 5, clientMutationId: expiredMutation, builderUserId: actor })).outcome, "expired_session");
});
