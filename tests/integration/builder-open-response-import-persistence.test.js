import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import {
  claimOpenResponseImportSession,
  commitOpenResponseImport,
  loadCurrentOpenResponseImport,
  prepareOpenResponseImportSession,
} from "../../netlify-sites/ultimate-b2-builder/server/_builder-open-response-import-store.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000001";
const activityId = "ultimate-b2-sb-u2-p1-o1";

function scoped(base, schema) { const url = new URL(base); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function tag(pool) { return async (strings, ...values) => { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return (await pool.query(text, values)).rows; }; }

test("isolated PostgreSQL import sessions enforce revision, actor, idempotency, and atomic current history", { skip: !enabled }, async (t) => {
  const schema = `builder_import_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 2 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  await applyCanonicalProductionMigrations(pool);
  await pool.query("insert into builder_users(id,full_name,email,password_hash) values($1,'Import Builder','import-builder@example.test','not-a-login-hash')", [actor]);
  const sql = tag(pool);
  const uploadId = randomUUID();
  const mutationId = randomUUID();
  const descriptors = [{ name: "obj_params.xml", size: 10, type: "application/xml", role: "obj_params", fileId: randomUUID(), objectKey: `builder-imports/${uploadId}/staging/${randomUUID()}` }];
  const input = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId, expectedRevision: 0, clientMutationId: mutationId, uploadId, requestSha256: "a".repeat(64), fileDescriptors: descriptors, builderUserId: actor, expiresAt: new Date(Date.now() + 60_000).toISOString() };
  assert.equal((await prepareOpenResponseImportSession(sql, input)).outcome, "prepared");
  assert.equal((await prepareOpenResponseImportSession(sql, { ...input, uploadId: randomUUID() })).outcome, "idempotent");
  assert.equal((await prepareOpenResponseImportSession(sql, { ...input, uploadId: randomUUID(), requestSha256: "b".repeat(64) })).outcome, "mutation_id_conflict");
  assert.equal((await claimOpenResponseImportSession(sql, { uploadId, expectedRevision: 0, clientMutationId: mutationId, builderUserId: actor })).outcome, "claimed");
  const publicProjection = { schemaVersion: "1.0", activityId, public: true };
  const teacherProjection = { schemaVersion: "1.0", activityId, answers: [] };
  const archiveManifest = { schemaVersion: "1.0", files: [] };
  const committed = await commitOpenResponseImport(sql, { uploadId, expectedRevision: 0, clientMutationId: mutationId, fingerprint: "c".repeat(64), publicProjection, teacherProjection, archiveManifest, builderUserId: actor });
  assert.equal(committed.outcome, "saved");
  assert.equal(committed.revision, 1);
  const replay = await commitOpenResponseImport(sql, { uploadId, expectedRevision: 0, clientMutationId: mutationId, fingerprint: "c".repeat(64), publicProjection, teacherProjection, archiveManifest, builderUserId: actor });
  assert.equal(replay.outcome, "idempotent");
  const current = await loadCurrentOpenResponseImport(sql, activityId);
  assert.equal(current.revision, 1);
  assert.deepEqual(current.publicProjection, publicProjection);
  const stale = await prepareOpenResponseImportSession(sql, { ...input, uploadId: randomUUID(), clientMutationId: randomUUID(), expectedRevision: 0, requestSha256: "d".repeat(64) });
  assert.equal(stale.outcome, "revision_conflict");
  const counts = await pool.query("select (select count(*)::int from builder_open_response_imports) imports,(select count(*)::int from builder_open_response_import_revisions) revisions,(select count(*)::int from builder_open_response_import_sessions where state='succeeded') succeeded");
  assert.deepEqual(counts.rows[0], { imports: 1, revisions: 1, succeeded: 1 });
  await assert.rejects(pool.query("update builder_open_response_import_revisions set revision=2"), /append-only/);
});
