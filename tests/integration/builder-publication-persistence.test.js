import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentRelease } from "../../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler.js";
import { collectUltimateB2PublicationSources, createComponentRelease, publishComponentRelease } from "../../netlify-sites/ultimate-b2-builder/server/_builder-publication-store.js";
import { resolveBuilderContentResource } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { saveBuilderComponentDocument } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-store.js";
import { ULTIMATE_B2_COMPONENT_RELEASE_SCHEMA_VERSION } from "../../src/data/ultimate-b2/componentPublication.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl) && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
const actor = "10000000-0000-4000-8000-000000000001";

function scoped(base, schema) { const url = new URL(base); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function tag(pool) { return async (strings, ...values) => { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return (await pool.query(text, values)).rows; }; }
function releaseInput(compiled, mutationId = randomUUID(), requestSha256 = compiled.releaseSha256) { return { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseSchemaVersion: ULTIMATE_B2_COMPONENT_RELEASE_SCHEMA_VERSION, ...compiled, requestSha256, releaseNote: "", clientMutationId: mutationId, builderUserId: actor }; }

test("isolated PostgreSQL preserves immutable release history and stale-safe atomic heads", { skip: !enabled }, async (t) => {
  const schema = `builder_publication_${randomBytes(8).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scoped(databaseUrl, schema), max: 4 });
  t.after(async () => { await pool.end(); await admin.query(`drop schema if exists "${schema}" cascade`); await admin.end(); });
  const migrations = await applyCanonicalProductionMigrations(pool);
  assert.equal(migrations.at(-1).filename, "035_builder_component_publication.sql");
  await pool.query(`insert into builder_users(id,full_name,email,password_hash) values($1,'Publication Integration','publication@example.test','not-a-real-login-hash')`, [actor]);
  const sql = tag(pool);

  const baseline = compileUltimateB2ComponentRelease(await collectUltimateB2PublicationSources(sql));
  const mutation = randomUUID();
  const created1 = await createComponentRelease(sql, releaseInput(baseline, mutation));
  assert.equal(created1.outcome, "created");
  assert.equal(created1.releaseNumber, 1);
  assert.equal((await createComponentRelease(sql, releaseInput(baseline, mutation))).outcome, "idempotent");
  assert.equal((await createComponentRelease(sql, releaseInput(baseline, mutation, "f".repeat(64)))).outcome, "mutation_id_conflict");
  await assert.rejects(pool.query(`update book_component_releases set public_projection='{}'::jsonb where id=$1`, [created1.releaseId]), /immutable/);
  await assert.rejects(pool.query(`delete from book_component_releases where id=$1`, [created1.releaseId]), /immutable/);

  const published1 = await publishComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: created1.releaseId, expectedHeadRevision: 0, requestSha256: "a".repeat(64), builderUserId: actor, clientMutationId: randomUUID() });
  assert.equal(published1.outcome, "published");
  assert.equal(published1.headRevision, 1);
  const staleCandidate = await createComponentRelease(sql, releaseInput(baseline));

  const hotspotResource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "hotspots");
  const changed = structuredClone(hotspotResource.baseline());
  const pageId = Object.keys(changed.pages)[0];
  changed.pages[pageId][0].label = "Unpublished hotspot change";
  assert.equal((await saveBuilderComponentDocument(sql, { resource: hotspotResource, expectedRevision: 0, clientMutationId: randomUUID(), document: changed, payloadSha256: builderDocumentSha256(changed), builderUserId: actor })).outcome, "saved");
  const stale = await publishComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: staleCandidate.releaseId, expectedHeadRevision: 1, requestSha256: "b".repeat(64), builderUserId: actor, clientMutationId: randomUUID() });
  assert.equal(stale.outcome, "stale_release_preview");

  const current = compileUltimateB2ComponentRelease(await collectUltimateB2PublicationSources(sql));
  const created2 = await createComponentRelease(sql, releaseInput(current));
  assert.equal(created2.releaseNumber, 3);
  const published2 = await publishComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: created2.releaseId, expectedHeadRevision: 1, requestSha256: "c".repeat(64), builderUserId: actor, clientMutationId: randomUUID() });
  assert.equal(published2.outcome, "published");
  assert.equal(published2.previousReleaseId, created1.releaseId);
  const created3 = await createComponentRelease(sql, releaseInput(current));
  const created4 = await createComponentRelease(sql, releaseInput(current));
  const mutation3 = randomUUID(); const mutation4 = randomUUID();
  const attempts = await Promise.all([
    publishComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: created3.releaseId, expectedHeadRevision: 2, requestSha256: "d".repeat(64), builderUserId: actor, clientMutationId: mutation3 }),
    publishComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: created4.releaseId, expectedHeadRevision: 2, requestSha256: "e".repeat(64), builderUserId: actor, clientMutationId: mutation4 }),
  ]);
  assert.deepEqual(attempts.map((item) => item.outcome).sort(), ["head_conflict", "published"]);
  const winner = attempts.find((item) => item.outcome === "published");
  const winnerMutation = winner.releaseId === created3.releaseId ? mutation3 : mutation4;
  const winnerRequest = winner.releaseId === created3.releaseId ? "d".repeat(64) : "e".repeat(64);
  assert.equal((await publishComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: winner.releaseId, expectedHeadRevision: 2, requestSha256: winnerRequest, builderUserId: actor, clientMutationId: winnerMutation })).outcome, "idempotent");
  const otherReleaseId = winner.releaseId === created3.releaseId ? created4.releaseId : created3.releaseId;
  assert.equal((await publishComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: otherReleaseId, expectedHeadRevision: 2, requestSha256: winnerRequest, builderUserId: actor, clientMutationId: winnerMutation })).outcome, "mutation_id_conflict");
  const alreadyActive = await publishComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: winner.releaseId, expectedHeadRevision: 3, requestSha256: "9".repeat(64), builderUserId: actor, clientMutationId: randomUUID() });
  assert.equal(alreadyActive.outcome, "already_active");
  assert.equal(alreadyActive.headRevision, 3);
  const state = await pool.query(`select (select count(*)::int from book_component_releases) releases,(select count(*)::int from book_component_publication_heads) heads,(select count(*)::int from book_component_publication_events) events,(select count(*)::int from book_component_publication_mutations) mutations,(select release_id from book_component_publication_heads limit 1) active`);
  assert.deepEqual(state.rows[0], { releases: 5, heads: 1, events: 3, mutations: 4, active: winner.releaseId });

  const raceCompiled = compileUltimateB2ComponentRelease(await collectUltimateB2PublicationSources(sql));
  const raceCandidate = await createComponentRelease(sql, releaseInput(raceCompiled));
  const changedAgain = structuredClone(changed);
  changedAgain.pages[pageId][0].label = "Concurrent unpublished hotspot change";
  const [raceSave, racePublish] = await Promise.all([
    saveBuilderComponentDocument(sql, { resource: hotspotResource, expectedRevision: 1, clientMutationId: randomUUID(), document: changedAgain, payloadSha256: builderDocumentSha256(changedAgain), builderUserId: actor }),
    publishComponentRelease(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: raceCandidate.releaseId, expectedHeadRevision: 3, requestSha256: "8".repeat(64), builderUserId: actor, clientMutationId: randomUUID() }),
  ]);
  assert.equal(raceSave.outcome, "saved");
  assert.ok(["published", "stale_release_preview"].includes(racePublish.outcome));
  const raceState = await pool.query(`select release_id,head_revision from book_component_publication_heads limit 1`);
  assert.equal(raceState.rows[0].release_id, racePublish.outcome === "published" ? raceCandidate.releaseId : winner.releaseId);
  assert.equal(Number(raceState.rows[0].head_revision), racePublish.outcome === "published" ? 4 : 3);
  assert.notEqual((await collectUltimateB2PublicationSources(sql)).documents.hotspots.sha256, raceCompiled.sourceSnapshot.hotspots.sha256);
  const preserved = await pool.query(`select public_projection_sha256 from book_component_releases where id=$1`, [raceCandidate.releaseId]);
  assert.equal(preserved.rows[0].public_projection_sha256, raceCompiled.publicProjectionSha256);
  const audits = await pool.query(`select action from builder_audit_log where action in ('preview_release_created','release_published') order by id`);
  assert.deepEqual(audits.rows.map((row) => row.action), ["preview_release_created", "release_published", "preview_release_created", "preview_release_created", "release_published", "preview_release_created", "preview_release_created", "release_published", "preview_release_created", ...(racePublish.outcome === "published" ? ["release_published"] : [])]);
});
