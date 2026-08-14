import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { createBuilderNativeActivitiesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { createBuilderNativeActivity } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activity-store.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(testDatabaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000001";

function scoped(base, schema) { const url = new URL(base); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function tag(pool) { return async (strings, ...values) => { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return (await pool.query(text, values)).rows; }; }
function event({ kind = "open-response", title = "Integration native", mutationId = randomUUID() } = {}) { return { httpMethod: "POST", path: "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/create", headers: { host: "localhost:8888", origin: "http://localhost:8888", "content-type": "application/json" }, body: JSON.stringify({ kind, pageId: "ub2-sb-unit-1-part-1", title, clientMutationId: mutationId }) }; }

test("isolated PostgreSQL creates native index/public/Teacher drafts atomically, idempotently, and without identity races", { skip: !enabled }, async (t) => {
  const schema = `builder_native_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(testDatabaseUrl, schema), max: 5 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "036_builder_native_activity_foundation.sql");
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

  const concurrent = await Promise.all([handler(event({ title: "Concurrent A" })), handler(event({ title: "Concurrent B" }))]);
  assert.deepEqual(concurrent.map((response) => response.statusCode), [200, 200]);
  const concurrentIds = concurrent.map((response) => JSON.parse(response.body).activityId);
  assert.equal(new Set(concurrentIds).size, 2);

  const rows = await pool.query("select document_type,document_key,revision from builder_component_documents where document_type like 'native_activity_%' order by document_type,document_key");
  assert.equal(rows.rows.filter((row) => row.document_type === "native_activity_index").length, 1);
  assert.equal(rows.rows.filter((row) => row.document_type === "native_activity_public").length, 3);
  assert.equal(rows.rows.filter((row) => row.document_type === "native_activity_teacher").length, 3);
  const index = await pool.query("select revision,payload from builder_component_documents where document_type='native_activity_index'");
  assert.equal(Number(index.rows[0].revision), 3);
  assert.equal(index.rows[0].payload.activities.length, 3);
  const histories = await pool.query("select count(*)::int count from builder_component_document_revisions revision join builder_component_documents document on document.id=revision.document_id where document.document_type like 'native_activity_%'");
  assert.equal(histories.rows[0].count, 9);
  const audits = await pool.query("select metadata from builder_audit_log where action='native_activity_created'");
  assert.equal(audits.rows.length, 3);
  assert.doesNotMatch(JSON.stringify(audits.rows), /payload|answer|solution|token|secret/i);

  const beforeFailure = await pool.query("select count(*)::int count from builder_component_documents where document_type like 'native_activity_%'");
  const publicDocument = (await pool.query("select payload from builder_component_documents where document_type='native_activity_public' order by created_at limit 1")).rows[0].payload;
  const teacherDocument = (await pool.query("select payload from builder_component_documents where document_type='native_activity_teacher' order by created_at limit 1")).rows[0].payload;
  const failedId = "ultimate-b2-sb-u1-p1-o999";
  const failedIndex = structuredClone(index.rows[0].payload); failedIndex.activities.push({ activityId: failedId, kind: "open-response", placement: { pageId: "ub2-sb-unit-1-part-1" }, sortOrder: 9999 });
  await assert.rejects(createBuilderNativeActivity(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: failedId, kind: "open-response", expectedIndexRevision: 3, indexDocument: failedIndex, indexSha256: "a".repeat(64), publicDocument: { ...publicDocument, activityId: failedId }, publicSha256: "b".repeat(64), teacherDocument: { ...teacherDocument, activityId: failedId }, teacherSha256: "invalid", schemaVersion: "1.0", requestSha256: "c".repeat(64), builderUserId: actor, clientMutationId: randomUUID() }));
  assert.equal((await pool.query("select count(*)::int count from builder_component_documents where document_type like 'native_activity_%'")).rows[0].count, beforeFailure.rows[0].count);

  const unauthorized = await createBuilderNativeActivity(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: failedId, kind: "open-response", expectedIndexRevision: 3, indexDocument: failedIndex, indexSha256: "a".repeat(64), publicDocument: { ...publicDocument, activityId: failedId }, publicSha256: "b".repeat(64), teacherDocument: { ...teacherDocument, activityId: failedId }, teacherSha256: "d".repeat(64), schemaVersion: "1.0", requestSha256: "c".repeat(64), builderUserId: "10000000-0000-4000-8000-000000000099", clientMutationId: randomUUID() });
  assert.equal(unauthorized.outcome, "unauthorized_actor");
});
