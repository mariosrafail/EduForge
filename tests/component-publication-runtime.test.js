import assert from "node:assert/strict";
import test from "node:test";

import { compileUltimateB2ComponentRelease } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler.js";
import { getActiveComponentRelease, getPublishedReleaseAsset, getPublishedTeacherSolutionOverride } from "../netlify/functions/_book-content/publication-actions.js";
import { readQuery } from "../netlify/functions/_book-content-utils.js";
import { getActiveComponentPublication } from "../src/services/componentPublicationApi.js";
import { createUltimateB2HostedOpenResponseSeed } from "../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { findStudentsBookImplementation } from "../src/data/ultimate-b2/studentsBookCatalog.js";
import { importUltimateB2HostedOpenResponseBundle } from "../scripts/ultimate-b2/open-response-hosted-import.js";
import { task6SourceBundle } from "./fixtures/open-response-task6.js";

function row(compiled = compileUltimateB2ComponentRelease()) {
  return { id: "10000000-0000-4000-8000-000000000099", release_number: 4, release_sha256: compiled.releaseSha256, runtime_compatibility_sha256: compiled.compatibility, source_snapshot: compiled.sourceSnapshot, source_snapshot_sha256: compiled.sourceSnapshotSha256, public_projection: compiled.publicProjection, public_projection_sha256: compiled.publicProjectionSha256, teacher_projection: compiled.teacherProjection, teacher_projection_sha256: compiled.teacherProjectionSha256 };
}
const sqlWith = (value) => async () => value ? [value] : [];
const body = (response) => JSON.parse(response.body);

test("normal LMS query parsing carries only the explicit publication identities", () => {
  const query = readQuery({ queryStringParameters: { action: "published-release-asset", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: "10000000-0000-4000-8000-000000000099", sha256: "a".repeat(64), extension: "png" } });
  assert.deepEqual({ action: query.action, bookSlug: query.bookSlug, componentSlug: query.componentSlug, releaseId: query.releaseId, sha256: query.sha256, extension: query.extension }, { action: "published-release-asset", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: "10000000-0000-4000-8000-000000000099", sha256: "a".repeat(64), extension: "png" });
});

test("normal LMS active release is component-scoped, Student-safe, and distinguishes no publication", async () => {
  const none = await getActiveComponentRelease(sqlWith(null), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" });
  assert.equal(none.statusCode, 404);
  assert.equal(body(none).error, "no_publication");
  assert.equal(none.headers["Cache-Control"], "private, no-store");
  assert.equal((await getActiveComponentRelease(sqlWith(row()), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" })).statusCode, 404);
  const active = await getActiveComponentRelease(sqlWith(row()), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" });
  assert.equal(active.statusCode, 200);
  assert.equal(active.headers["Cache-Control"], "private, no-store");
  const payload = body(active);
  assert.equal(payload.releaseNumber, 4);
  assert.equal("teacherProjection" in payload, false);
  for (const forbidden of ["acceptedAnswers", "teacherSolutions", "modelAnswer", "rawXml", "archiveManifest", "privateObjectKey", "signedUrl"]) assert.doesNotMatch(JSON.stringify(payload), new RegExp(forbidden, "i"));
});

test("published asset delivery proves active release membership and allows only GET-owned identities", async () => {
  const compiled = compileUltimateB2ComponentRelease();
  const asset = { sha256: "a".repeat(64), extension: "png", mediaType: "image/png", role: "open_response_artwork" };
  const releaseId = "10000000-0000-4000-8000-000000000099";
  compiled.publicProjection.assets.push(asset);
  const activeRow = row(compiled);
  activeRow.public_projection_sha256 = "invalid";
  await assert.rejects(getPublishedReleaseAsset(sqlWith(activeRow), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId, sha256: asset.sha256, extension: asset.extension }, { storage: { publicUrl: () => "https://assets.example/item" } }), /manifest is inconsistent|checksum mismatch/);
  const missing = await getPublishedReleaseAsset(sqlWith(row()), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId, sha256: asset.sha256, extension: asset.extension }, { storage: { publicUrl: () => "https://assets.example/item" } });
  assert.equal(missing.statusCode, 404);
  assert.equal((await getPublishedReleaseAsset(sqlWith(row()), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId, sha256: "../secret", extension: "xml" }, { storage: {} })).statusCode, 404);
});

test("Teacher runtime resolves only the requested active published import override", async () => {
  const activityId = "ultimate-b2-sb-u2-p1-o1";
  const seed = createUltimateB2HostedOpenResponseSeed(findStudentsBookImplementation(activityId));
  const imported = await importUltimateB2HostedOpenResponseBundle({ activityId, files: await task6SourceBundle(), expectedQuestionIds: seed.questions.map((question) => question.id), assetPathFor: (sha, extension) => `/preview/open-response-assets/${sha}${extension}` });
  const compiled = compileUltimateB2ComponentRelease({ imports: { [activityId]: { revision: 2, fingerprint: imported.fingerprint, publicProjection: imported.publicProjection, teacherProjection: imported.teacherProjection } } });
  const publicAsset = compiled.publicProjection.assets[0];
  const assetResponse = await getPublishedReleaseAsset(sqlWith(row(compiled)), { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", releaseId: row(compiled).id, sha256: publicAsset.sha256, extension: publicAsset.extension }, { storage: { publicUrl: () => "https://assets.example/immutable" } });
  assert.equal(assetResponse.statusCode, 302);
  assert.equal(assetResponse.headers["Cache-Control"], "public, max-age=31536000, immutable");
  const solution = await getPublishedTeacherSolutionOverride(sqlWith(row(compiled)), activityId);
  assert.equal(solution.solutionAvailability, "verified");
  assert.deepEqual(Object.keys(solution.questions), seed.questions.map((question) => question.id));
  assert.match(solution.questions[seed.questions[0].id].acceptedAnswers[0], /Imported model/);
  assert.equal(await getPublishedTeacherSolutionOverride(sqlWith(row(compiled)), "ultimate-b2-sb-u2-p99-o99"), null);
});

test("web client falls back only for explicit no_publication and fails closed on service errors", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "no_publication" }), { status: 404, headers: { "Content-Type": "application/json" } });
  assert.deepEqual(await getActiveComponentPublication(), { kind: "none" });
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "database_unavailable" }), { status: 503, headers: { "Content-Type": "application/json" } });
  await assert.rejects(getActiveComponentPublication(), (error) => error.code === "publication_unavailable");
  globalThis.fetch = async () => new Response("malformed", { status: 200 });
  await assert.rejects(getActiveComponentPublication());
});
