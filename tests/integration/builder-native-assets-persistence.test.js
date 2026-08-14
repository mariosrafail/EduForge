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

test("isolated PostgreSQL binds completed native uploads to private draft book_assets and activity ownership", { skip: !enabled }, async (t) => {
  const schema = `builder_native_assets_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 }); await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 3 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await applyCanonicalProductionMigrations(pool); await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Asset Actor','native-assets@example.test','hash')", [actor]);
  const sql = tag(pool);
  const create = createBuilderNativeActivitiesHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actor } }), logger: { error() {} } });
  const createdResponse = await create({ httpMethod: "POST", path: "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/create", headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ kind: "open-response", pageId: "ub2-sb-unit-1-part-1", title: "Asset activity", clientMutationId: randomUUID() }) });
  const activityId = JSON.parse(createdResponse.body).activityId;
  const uploadId = randomUUID(); const clientMutationId = randomUUID();
  const input = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId, assetSlot: "asset-one", clientMutationId, uploadId, requestSha256: "a".repeat(64), fileDescriptor: { name: "diagram.png", size: 68, type: "image/png", assetSlot: "asset-one" }, stagingObjectKey: `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${activityId}/${uploadId}/staging/asset`, builderUserId: actor, expiresAt: new Date(Date.now() + 600_000).toISOString() };
  assert.equal((await prepareBuilderNativeAssetUpload(sql, input)).outcome, "prepared");
  assert.equal((await prepareBuilderNativeAssetUpload(sql, input)).outcome, "idempotent");
  assert.equal((await prepareBuilderNativeAssetUpload(sql, { ...input, requestSha256: "b".repeat(64) })).outcome, "mutation_id_conflict");
  const claimed = await claimBuilderNativeAssetUpload(sql, { uploadId, clientMutationId, builderUserId: actor }); assert.equal(claimed.outcome, "claimed");
  const checksumSha256 = "c".repeat(64);
  const assetId = await completeBuilderNativeAssetUpload(sql, { uploadId, builderUserId: actor, objectKey: `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${activityId}/assets/${checksumSha256}.png`, storageBucket: "private-assets", mimeType: "image/png", byteSize: 68, checksumSha256, width: 1, height: 1 });
  assert.match(assetId, /^[0-9a-f-]{36}$/);
  const replay = await claimBuilderNativeAssetUpload(sql, { uploadId, clientMutationId, builderUserId: actor }); assert.equal(replay.outcome, "idempotent"); assert.equal(replay.resultingAssetId, assetId);
  const duplicateUploadId = randomUUID(); const duplicateMutationId = randomUUID();
  await prepareBuilderNativeAssetUpload(sql, { ...input, uploadId: duplicateUploadId, clientMutationId: duplicateMutationId, requestSha256: "f".repeat(64) });
  assert.equal((await claimBuilderNativeAssetUpload(sql, { uploadId: duplicateUploadId, clientMutationId: duplicateMutationId, builderUserId: actor })).outcome, "claimed");
  const duplicateAssetId = await completeBuilderNativeAssetUpload(sql, { uploadId: duplicateUploadId, builderUserId: actor, objectKey: `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${activityId}/assets/${checksumSha256}.png`, storageBucket: "private-assets", mimeType: "image/png", byteSize: 68, checksumSha256, width: 1, height: 1 });
  assert.equal(duplicateAssetId, assetId);
  assert.equal((await pool.query("select count(*)::int count from book_assets where id=$1", [assetId])).rows[0].count, 1);
  const asset = await loadBuilderNativeAsset(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId, assetId });
  assert.equal(asset.publication_status, "draft"); assert.equal(asset.storage_profile, "private"); assert.equal(asset.access_level, "internal"); assert.equal(asset.asset_role, "activity_artwork");
  const reference = { assetId, checksumSha256, role: "activity_artwork", slot: "asset-one" };
  await assert.doesNotReject(validateBuilderNativeAssetReferences(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId, assets: [reference] }));
  await assert.rejects(validateBuilderNativeAssetReferences(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId, assets: [{ ...reference, checksumSha256: "d".repeat(64) }] }));
  await assert.rejects(validateBuilderNativeAssetReferences(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: `${activityId}-other`, assets: [reference] }));
  const audits = await pool.query("select metadata from builder_audit_log where metadata::text like '%asset-one%'");
  assert.equal(audits.rows.length, 2);
  assert.doesNotMatch(JSON.stringify(audits.rows), /diagram|checksum|payload|answer|token|secret/i);

  const expiredId = randomUUID(); const expiredMutation = randomUUID();
  await prepareBuilderNativeAssetUpload(sql, { ...input, uploadId: expiredId, clientMutationId: expiredMutation, requestSha256: "e".repeat(64), assetSlot: "asset-expired", expiresAt: new Date(Date.now() - 1_000).toISOString() });
  assert.equal((await claimBuilderNativeAssetUpload(sql, { uploadId: expiredId, clientMutationId: expiredMutation, builderUserId: actor })).outcome, "expired_session");
  assert.equal((await claimBuilderNativeAssetUpload(sql, { uploadId, clientMutationId, builderUserId: "10000000-0000-4000-8000-000000000099" })).outcome, "session_not_found");
});
