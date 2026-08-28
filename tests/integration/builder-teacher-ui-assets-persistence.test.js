import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { createBuilderTeacherUiAssetsHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-teacher-ui-assets.js";
import {
  claimTeacherUiAssetUploadSession,
  completeTeacherUiAssetUploadSession,
  prepareTeacherUiAssetUploadSession,
} from "../../netlify-sites/ultimate-b2-builder/server/_builder-teacher-ui-assets-store.js";
import { createEmptyHostedTeacherUiDocument } from "../../src/data/ultimate-b2/hostedTeacherUiDocument.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actorId = "10000000-0000-4000-8000-000000000001";
const otherActorId = "10000000-0000-4000-8000-000000000002";

function scoped(base, schema) {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function tag(pool) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await pool.query(text, values)).rows;
  };
}

function event(path, body) {
  return { httpMethod: "POST", path, headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify(body) };
}

const asset = Object.freeze({ sha256: createHash("sha256").update("integration-ui").digest("hex"), extension: "png", mediaType: "image/png", sizeBytes: 123, width: 4, height: 3, originalFilename: "integration.png" });

test("isolated PostgreSQL preserves Teacher UI upload ownership, expiry, candidates, revision history, idempotency, and conflict", { skip: !enabled }, async (t) => {
  const schema = `builder_teacher_ui_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 2 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "049_builder_publication_asset_pins.sql");
  await pool.query(`insert into builder_users(id,full_name,email,password_hash) values($1,'UI Actor','ui-actor@example.test','hash'),($2,'Other UI Actor','other-ui-actor@example.test','hash')`, [actorId, otherActorId]);
  const sql = tag(pool);
  const uploadId = randomUUID();
  const mutationId = randomUUID();
  const descriptor = [{ bindingId: "background.main", name: "integration.png", size: 123, type: "image/png", mediaFamily: "raster", fileId: randomUUID(), objectKey: `builder-ui-assets/ultimate-b2/ultimate-b2-students-book/${uploadId}/staging/${randomUUID()}` }];
  const prepareInput = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", expectedRevision: 0, clientMutationId: mutationId, uploadId, requestSha256: createHash("sha256").update("request").digest("hex"), fileDescriptors: descriptor, builderUserId: actorId, expiresAt: new Date(Date.now() + 600_000).toISOString() };
  assert.equal((await prepareTeacherUiAssetUploadSession(sql, prepareInput)).outcome, "prepared");
  assert.equal((await prepareTeacherUiAssetUploadSession(sql, prepareInput)).outcome, "idempotent");
  assert.equal((await claimTeacherUiAssetUploadSession(sql, { uploadId, expectedRevision: 0, clientMutationId: mutationId, builderUserId: otherActorId })).outcome, "session_not_found");
  assert.equal((await claimTeacherUiAssetUploadSession(sql, { uploadId, expectedRevision: 0, clientMutationId: mutationId, builderUserId: actorId })).outcome, "claimed");
  await completeTeacherUiAssetUploadSession(sql, { uploadId, builderUserId: actorId, validatedAssets: { "background.main": asset } });

  const handler = createBuilderTeacherUiAssetsHandler({ getDatabase: () => sql, authorize: async () => ({ builderUser: { id: actorId } }), logger: { error() {} } });
  const crossBinding = await handler(event("/builder/api/ui-assets/save", {
    expectedRevision: 0,
    clientMutationId: randomUUID(),
    document: { ...createEmptyHostedTeacherUiDocument(), assets: { "navigation.home": asset } },
    candidateUploadIds: [uploadId],
  }));
  assert.equal(crossBinding.statusCode, 400);
  assert.equal(JSON.parse(crossBinding.body).error, "unverified_candidate");
  assert.equal((await pool.query(`select count(*)::int count from builder_component_documents where document_type='teacher_ui'`)).rows[0].count, 0);

  const document = { ...createEmptyHostedTeacherUiDocument(), assets: { "background.main": asset } };
  const saveMutation = randomUUID();
  const saveBody = { expectedRevision: 0, clientMutationId: saveMutation, document, candidateUploadIds: [uploadId] };
  const saved = await handler(event("/builder/api/ui-assets/save", saveBody));
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(JSON.parse(saved.body).revision, 1);
  const replay = await handler(event("/builder/api/ui-assets/save", saveBody));
  assert.equal(replay.statusCode, 200, replay.body);
  assert.equal(JSON.parse(replay.body).idempotent, true);

  const stale = await handler(event("/builder/api/ui-assets/save", { expectedRevision: 0, clientMutationId: randomUUID(), document: createEmptyHostedTeacherUiDocument(), candidateUploadIds: [] }));
  assert.equal(stale.statusCode, 409);
  assert.equal(JSON.parse(stale.body).currentRevision, 1);

  const state = await pool.query(`select state,resulting_document_revision,validated_assets from builder_teacher_ui_asset_upload_sessions where id=$1`, [uploadId]);
  assert.equal(state.rows[0].state, "saved");
  assert.equal(Number(state.rows[0].resulting_document_revision), 1);
  assert.equal(state.rows[0].validated_assets["background.main"].sha256, asset.sha256);
  const history = await pool.query(`select count(*)::int count from builder_component_document_revisions revision join builder_component_documents document on document.id=revision.document_id where document.document_type='teacher_ui'`);
  assert.equal(history.rows[0].count, 1);

  const expiredId = randomUUID();
  const expiredMutation = randomUUID();
  await prepareTeacherUiAssetUploadSession(sql, { ...prepareInput, uploadId: expiredId, clientMutationId: expiredMutation, requestSha256: createHash("sha256").update("expired").digest("hex"), expectedRevision: 1, expiresAt: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await claimTeacherUiAssetUploadSession(sql, { uploadId: expiredId, expectedRevision: 1, clientMutationId: expiredMutation, builderUserId: actorId })).outcome, "expired_session");
});
