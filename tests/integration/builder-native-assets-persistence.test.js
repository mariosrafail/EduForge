import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { createBuilderNativeActivitiesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { claimBuilderNativeAssetUpload, completeBuilderNativeAssetUpload, loadBuilderNativeAsset, prepareBuilderNativeAssetUpload, validateBuilderNativeAssetReferences } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activity-store.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000001";
function scoped(base, schema) { const url = new URL(base); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function tag(pool) { return async (strings, ...values) => { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return (await pool.query(text, values)).rows; }; }

test("isolated PostgreSQL reuses canonical native assets safely under repeated and concurrent finalization", { skip: !enabled }, async (t) => {
  const schema = `builder_native_assets_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 }); await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 5 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await applyCanonicalProductionMigrations(pool);
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Asset Actor','native-assets@example.test','hash')", [actor]);
  const sql = tag(pool);
  const create = createBuilderNativeActivitiesHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });
  const createActivity = async (title, kind = "image") => {
    const response = await create({ httpMethod: "POST", path: "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/create", headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ kind, pageId: "ub2-sb-unit-1-part-1", title, clientMutationId: randomUUID() }) });
    assert.equal(response.statusCode, 200);
    return JSON.parse(response.body).activityId;
  };
  const activityId = await createActivity("Asset activity");
  const prepareAndClaim = async ({ targetActivityId = activityId, slot, expiresAt = new Date(Date.now() + 600_000).toISOString() }) => {
    const uploadId = randomUUID(); const clientMutationId = randomUUID();
    const input = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: targetActivityId, assetSlot: slot, clientMutationId, uploadId, requestSha256: randomBytes(32).toString("hex"), fileDescriptor: { name: "diagram.png", size: 68, type: "image/png", assetSlot: slot }, stagingObjectKey: `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${targetActivityId}/${uploadId}/staging/asset`, builderUserId: actor, expiresAt };
    assert.equal((await prepareBuilderNativeAssetUpload(sql, input)).outcome, "prepared");
    const claimed = await claimBuilderNativeAssetUpload(sql, { uploadId, clientMutationId, builderUserId: actor });
    assert.equal(claimed.outcome, new Date(expiresAt).getTime() <= Date.now() ? "expired_session" : "claimed");
    return { uploadId, clientMutationId };
  };
  const finalize = ({ uploadId, targetActivityId = activityId, checksumSha256, byteSize = 68, width = 1, height = 1 }) => completeBuilderNativeAssetUpload(sql, { uploadId, builderUserId: actor, objectKey: `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${targetActivityId}/assets/${checksumSha256}.png`, storageBucket: "private-assets", mimeType: "image/png", byteSize, checksumSha256, width, height });

  const first = await prepareAndClaim({ slot: "asset-one" });
  const checksumSha256 = "c".repeat(64);
  const assetId = await finalize({ uploadId: first.uploadId, checksumSha256 });
  assert.match(assetId, /^[0-9a-f-]{36}$/);
  const replay = await claimBuilderNativeAssetUpload(sql, { uploadId: first.uploadId, clientMutationId: first.clientMutationId, builderUserId: actor });
  assert.equal(replay.outcome, "idempotent"); assert.equal(replay.resultingAssetId, assetId);

  const second = await prepareAndClaim({ slot: "asset-two" });
  const secondAssetId = await finalize({ uploadId: second.uploadId, checksumSha256 });
  assert.equal(secondAssetId, assetId);
  const canonicalKey = `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${activityId}/assets/${checksumSha256}.png`;
  assert.equal((await pool.query("select count(*)::int count from book_assets where storage_bucket='private-assets' and object_key=$1", [canonicalKey])).rows[0].count, 1);
  const sessions = await pool.query("select state,resulting_asset_id from builder_native_asset_upload_sessions where id=any($1::uuid[])", [[first.uploadId, second.uploadId]]);
  assert.equal(sessions.rows.every((row) => row.state === "completed" && row.resulting_asset_id === assetId), true);
  const asset = await loadBuilderNativeAsset(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId, assetId });
  assert.equal(asset.source_metadata.asset_slot, "asset-one");
  assert.equal(asset.publication_status, "draft"); assert.equal(asset.storage_profile, "private"); assert.equal(asset.access_level, "internal"); assert.equal(asset.asset_role, "activity_artwork");

  const publicRow = (await pool.query("select revision,payload from builder_component_documents where document_type='native_activity_public' and document_key=$1", [activityId])).rows[0];
  const teacherRow = (await pool.query("select revision,payload from builder_component_documents where document_type='native_activity_teacher' and document_key=$1", [activityId])).rows[0];
  publicRow.payload.assets = [{ assetId, checksumSha256, role: "activity_artwork", slot: "asset-one" }];
  publicRow.payload.parts[0].interaction.images = [
    { id: `img-${"a".repeat(32)}`, assetSlot: "asset-one", area: { x: 10, y: 20, width: 320, height: 220 }, order: 0, altText: "Diagram", decorative: false, fit: "contain", locked: false },
    { id: `img-${"b".repeat(32)}`, assetSlot: "asset-one", area: { x: 50, y: 60, width: 320, height: 220 }, order: 1, altText: "Second use", decorative: false, fit: "cover", locked: true },
  ];
  const saveResponse = await create({ httpMethod: "POST", path: `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/save`, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ expectedPublicRevision: Number(publicRow.revision), expectedTeacherRevision: Number(teacherRow.revision), clientMutationId: randomUUID(), publicDocument: publicRow.payload, teacherDocument: teacherRow.payload }) });
  assert.equal(saveResponse.statusCode, 200);
  const composed = JSON.parse(saveResponse.body); assert.equal(composed.publicDocument.parts[0].interaction.images.length, 2); assert.equal(composed.publicDocument.assets.length, 1);
  const oneUse = structuredClone(composed.publicDocument); oneUse.parts[0].interaction.images = [oneUse.parts[0].interaction.images[0]];
  const oneUseResponse = await create({ httpMethod: "POST", path: `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/save`, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ expectedPublicRevision: 2, expectedTeacherRevision: 2, clientMutationId: randomUUID(), publicDocument: oneUse, teacherDocument: composed.teacherDocument }) });
  assert.equal(oneUseResponse.statusCode, 200); assert.equal(JSON.parse(oneUseResponse.body).publicDocument.assets.length, 1);
  const blankAgain = structuredClone(JSON.parse(oneUseResponse.body).publicDocument); blankAgain.parts[0].interaction.images = []; blankAgain.assets = [];
  const blankResponse = await create({ httpMethod: "POST", path: `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/save`, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ expectedPublicRevision: 3, expectedTeacherRevision: 3, clientMutationId: randomUUID(), publicDocument: blankAgain, teacherDocument: JSON.parse(oneUseResponse.body).teacherDocument }) });
  assert.equal(blankResponse.statusCode, 200); assert.equal(JSON.parse(blankResponse.body).publicDocument.assets.length, 0);
  const afterDelete = await prepareAndClaim({ slot: "asset-after-delete" }); const afterDeleteAssetId = await finalize({ uploadId: afterDelete.uploadId, checksumSha256 }); assert.equal(afterDeleteAssetId, assetId);
  const restored = structuredClone(JSON.parse(blankResponse.body).publicDocument); restored.assets = [{ assetId, checksumSha256, role: "activity_artwork", slot: "asset-one" }]; restored.parts[0].interaction.images = [{ id: `img-${"c".repeat(32)}`, assetSlot: "asset-one", area: { x: 20, y: 30, width: 320, height: 220 }, order: 0, altText: "Restored", decorative: false, fit: "contain", locked: false }];
  const restoredResponse = await create({ httpMethod: "POST", path: `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/save`, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ expectedPublicRevision: 4, expectedTeacherRevision: 4, clientMutationId: randomUUID(), publicDocument: restored, teacherDocument: JSON.parse(blankResponse.body).teacherDocument }) });
  assert.equal(restoredResponse.statusCode, 200); assert.equal((await pool.query("select count(*)::int count from book_assets where storage_bucket='private-assets' and object_key=$1", [canonicalKey])).rows[0].count, 1);

  const different = await prepareAndClaim({ slot: "asset-different" });
  const differentChecksum = "d".repeat(64);
  const differentAssetId = await finalize({ uploadId: different.uploadId, checksumSha256: differentChecksum });
  assert.notEqual(differentAssetId, assetId);

  const otherActivityId = await createActivity("Other activity");
  const other = await prepareAndClaim({ targetActivityId: otherActivityId, slot: "asset-other-activity" });
  const otherAssetId = await finalize({ uploadId: other.uploadId, targetActivityId: otherActivityId, checksumSha256 });
  assert.notEqual(otherAssetId, assetId);
  await assert.rejects(validateBuilderNativeAssetReferences(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: otherActivityId, assets: [{ assetId, checksumSha256, role: "activity_artwork", slot: "asset-one" }] }));

  const concurrentChecksum = "e".repeat(64);
  const concurrentA = await prepareAndClaim({ slot: "asset-concurrent-a" });
  const concurrentB = await prepareAndClaim({ slot: "asset-concurrent-b" });
  const [concurrentAssetA, concurrentAssetB] = await Promise.all([
    finalize({ uploadId: concurrentA.uploadId, checksumSha256: concurrentChecksum }),
    finalize({ uploadId: concurrentB.uploadId, checksumSha256: concurrentChecksum }),
  ]);
  assert.equal(concurrentAssetA, concurrentAssetB);
  const concurrentKey = `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${activityId}/assets/${concurrentChecksum}.png`;
  assert.equal((await pool.query("select count(*)::int count from book_assets where storage_bucket='private-assets' and object_key=$1", [concurrentKey])).rows[0].count, 1);
  const concurrentSessions = await pool.query("select state,resulting_asset_id from builder_native_asset_upload_sessions where id=any($1::uuid[])", [[concurrentA.uploadId, concurrentB.uploadId]]);
  assert.equal(concurrentSessions.rows.every((row) => row.state === "completed" && row.resulting_asset_id === concurrentAssetA), true);

  const incompatibleChecksum = "f".repeat(64);
  const incompatible = await prepareAndClaim({ slot: "asset-incompatible-root" });
  const incompatibleAssetId = await finalize({ uploadId: incompatible.uploadId, checksumSha256: incompatibleChecksum });
  for (const [column, wrongValue, expectedValue] of [
    ["asset_role", "background", "activity_artwork"],
    ["storage_profile", "archive", "private"],
    ["access_level", "entitled", "internal"],
    ["publication_status", "processing", "draft"],
  ]) {
    await pool.query(`update book_assets set ${column}=$1 where id=$2`, [wrongValue, incompatibleAssetId]);
    const attempted = await prepareAndClaim({ slot: `asset-wrong-${column.replaceAll("_", "-")}` });
    await assert.rejects(finalize({ uploadId: attempted.uploadId, checksumSha256: incompatibleChecksum }), /identity conflicts/);
    await pool.query(`update book_assets set ${column}=$1 where id=$2`, [expectedValue, incompatibleAssetId]);
  }

  const reference = { assetId, checksumSha256, role: "activity_artwork", slot: "asset-one" };
  await assert.doesNotReject(validateBuilderNativeAssetReferences(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId, assets: [reference] }));
  await assert.rejects(validateBuilderNativeAssetReferences(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId, assets: [{ ...reference, checksumSha256: "0".repeat(64) }] }));
  const audits = await pool.query("select metadata from builder_audit_log where action='native_activity_asset_finalized' and metadata->>'native_activity_id'=$1", [activityId]);
  assert.equal(audits.rows.some((row) => row.metadata.requested_asset_slot === "asset-two" && row.metadata.resolved_asset_slot === "asset-one" && row.metadata.reused_existing_asset === true), true);
  assert.doesNotMatch(JSON.stringify(audits.rows), /diagram|checksum|payload|answer|token|secret/i);

  const expired = await prepareAndClaim({ slot: "asset-expired", expiresAt: new Date(Date.now() - 1_000).toISOString() });
  assert.equal((await claimBuilderNativeAssetUpload(sql, { uploadId: first.uploadId, clientMutationId: first.clientMutationId, builderUserId: "10000000-0000-4000-8000-000000000099" })).outcome, "session_not_found");
  assert.ok(expired.uploadId);
});
