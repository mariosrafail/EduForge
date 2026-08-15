import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { createBuilderPublicationHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { compilePublicationV2Fixture, publicationV2Fixture } from "./fixtures/publication-v2.js";

const base = "/builder/api/publication/books/ultimate-b2/components/ultimate-b2-students-book";
const actor = "10000000-0000-4000-8000-000000000001";

function event(path = base, method = "GET", body, headers = {}) { return { path, httpMethod: method, headers: { host: "builder.example", origin: "https://builder.example", "content-type": "application/json", cookie: "hh_builder_session=live", ...headers }, body: body ? JSON.stringify(body) : "" }; }
const parsed = (response) => JSON.parse(response.body);

function harness(overrides = {}) {
  const release = overrides.release || compileUltimateB2ComponentReleaseV2({ documents: {}, imports: {}, native: { activities: {}, assetRows: [] } });
  let currentRelease = release;
  let mutation = null;
  const id = randomUUID();
  let published = false;
  const handler = createBuilderPublicationHandler({
    getDatabase: () => ({}), authorize: async (request) => request.headers.cookie === "hh_builder_session=live" ? { builderUser: { id: actor } } : { error: json(401, { error: "Unauthorized" }) },
    authorizePreview: async (request) => request.headers["x-preview-authorized"] === "yes",
    collect: async () => ({}), compile: () => currentRelease, storage: () => ({ head: async () => ({ byteSize: 1, checksumSha256: "a".repeat(64) }), publicUrl: () => "https://assets.example/object" }),
    materialize: overrides.materialize,
    create: overrides.create || (async (_sql, input) => ({ outcome: "created", releaseId: id, releaseNumber: 1, releaseSha256: input.releaseSha256 })),
    status: async () => ({ headRevision: published ? 1 : 0, published: published ? { id, number: 1, sourceSnapshotSha256: release.sourceSnapshotSha256 } : null, releases: [{ id, number: 1, releaseSha256: release.releaseSha256, sourceSnapshotSha256: release.sourceSnapshotSha256, createdAt: "2026-01-01T00:00:00Z" }] }),
    publish: async (_sql, input) => { published = true; return { outcome: "published", releaseId: input.releaseId, releaseNumber: 1, headRevision: 1 }; },
    loadMutation: async () => mutation,
    loadRelease: async () => ({ id, release_number: 1, release_schema_version: release.releaseSchemaVersion, compiler_id: release.compilerId, release_sha256: release.releaseSha256, runtime_compatibility_sha256: release.compatibility, source_snapshot: release.sourceSnapshot, source_snapshot_sha256: release.sourceSnapshotSha256, public_projection: release.publicProjection, public_projection_sha256: release.publicProjectionSha256, teacher_projection: release.teacherProjection, teacher_projection_sha256: release.teacherProjectionSha256, asset_manifest: release.assetManifest }), logger: { error() {} },
  });
  return { handler, id, release, setCurrentRelease(value) { currentRelease = value; }, setMutation(value) { mutation = value; } };
}

test("publication mutations require Builder auth, same origin, JSON, and explicit supported component", async () => {
  const { handler } = harness();
  assert.equal((await handler(event(base, "GET", null, { cookie: "" }))).statusCode, 401);
  assert.equal((await handler(event(`${base}/prepare`, "POST", { clientMutationId: randomUUID(), releaseNote: "" }, { origin: "https://attacker.example" }))).statusCode, 403);
  assert.equal((await handler(event("/builder/api/publication/books/ultimate-b2/components/ultimate-b2-workbook", "GET"))).statusCode, 404);
});

test("prepare returns an immutable release identity and publish accepts only that ID plus expected head", async () => {
  const { handler, id, release } = harness();
  const prepared = await handler(event(`${base}/prepare`, "POST", { clientMutationId: randomUUID(), releaseNote: "" }));
  assert.equal(prepared.statusCode, 200);
  assert.equal(parsed(prepared).releaseId, id);
  assert.equal(parsed(prepared).releaseSha256, release.releaseSha256);
  const published = await handler(event(`${base}/publish`, "POST", { releaseId: id, expectedHeadRevision: 0, clientMutationId: randomUUID() }));
  assert.equal(published.statusCode, 200);
  assert.equal(parsed(published).headRevision, 1);
});

test("publish rechecks the current compiled source identity before the transactional head move", async () => {
  const { handler, id, release, setCurrentRelease } = harness();
  setCurrentRelease({ ...release, sourceSnapshotSha256: "f".repeat(64) });
  const response = await handler(event(`${base}/publish`, "POST", { releaseId: id, expectedHeadRevision: 0, clientMutationId: randomUUID() }));
  assert.equal(response.statusCode, 409);
  assert.equal(parsed(response).error, "stale_release_preview");
});

test("a successful publish mutation retry remains idempotent after later draft changes", async () => {
  const { handler, id, release, setCurrentRelease, setMutation } = harness();
  setCurrentRelease({ ...release, sourceSnapshotSha256: "f".repeat(64) });
  setMutation({ release_id: id, outcome: "published" });
  const response = await handler(event(`${base}/publish`, "POST", { releaseId: id, expectedHeadRevision: 0, clientMutationId: randomUUID() }));
  assert.equal(response.statusCode, 200);
});

test("release preview is pinned by strict component-owned UUID and exposes projections separately", async () => {
  const { handler, id } = harness();
  const prefix = `/builder/preview/releases/books/ultimate-b2/components/ultimate-b2-students-book/${id}`;
  const publicResponse = await handler(event(`${prefix}/public`, "GET", null, { cookie: "", "x-preview-authorized": "yes" }));
  assert.equal(publicResponse.statusCode, 200);
  assert.ok(parsed(publicResponse).projection.activities);
  assert.equal("teacherProjection" in parsed(publicResponse), false);
  assert.equal((await handler(event(`${prefix}/teacher-ui`, "GET", null, { cookie: "" }))).statusCode, 401);
  assert.equal((await handler(event(`${prefix}/teacher-ui`, "GET", null, { cookie: "", "x-preview-authorized": "yes" }))).statusCode, 200);
  assert.equal((await handler(event(`${prefix}/teacher-solution/ultimate-b2-sb-u1-p1-o1`, "GET", null, { cookie: "" }))).statusCode, 401);
  assert.equal((await handler(event(`${prefix}/assets/${"a".repeat(64)}.png`, "HEAD", null, { cookie: "", "x-preview-authorized": "yes" }))).statusCode, 404);
  assert.equal((await handler(event(`${prefix}/assets/${"a".repeat(64)}.png`, "POST", null, { cookie: "" }))).statusCode, 405);
  assert.equal((await handler(event(`/builder/preview/releases/books/ultimate-b2/components/ultimate-b2-workbook/${id}/public`, "GET", null, { cookie: "" }))).statusCode, 404);
});

test("release preview rejects an asset manifest that is not exactly derived from its projections", async () => {
  const { handler, id, release } = harness();
  release.assetManifest.push({ sha256: "a".repeat(64), extension: "png", mediaType: "image/png", role: "open_response_artwork" });
  const response = await handler(event(`/builder/preview/releases/books/ultimate-b2/components/ultimate-b2-students-book/${id}/public`, "GET", null, { cookie: "", "x-preview-authorized": "yes" }));
  assert.equal(response.statusCode, 409);
  assert.equal(parsed(response).error, "release_integrity_failed");
});

test("native asset materialization failure creates no release row", async () => {
  let createCalls = 0;
  const { handler } = harness({
    release: compilePublicationV2Fixture(),
    materialize: async () => { throw new Error("release_asset_unavailable"); },
    create: async () => { createCalls += 1; return { outcome: "created" }; },
  });
  const response = await handler(event(`${base}/prepare`, "POST", { clientMutationId: randomUUID(), releaseNote: "" }));
  assert.equal(response.statusCode, 409);
  assert.equal(parsed(response).error, "release_asset_unavailable");
  assert.equal(createCalls, 0);
});

test("prepared native Teacher projection is separately authorized and release-member checked", async () => {
  const { handler, id } = harness({ release: compilePublicationV2Fixture() });
  const prefix = `/builder/preview/releases/books/ultimate-b2/components/ultimate-b2-students-book/${id}/native-teacher`;
  assert.equal((await handler(event(`${prefix}/${publicationV2Fixture.openResponseId}`, "GET", null, { cookie: "" }))).statusCode, 401);
  const allowed = await handler(event(`${prefix}/${publicationV2Fixture.openResponseId}`, "GET", null, { cookie: "", "x-preview-authorized": "yes" }));
  assert.equal(allowed.statusCode, 200);
  assert.match(allowed.body, new RegExp(publicationV2Fixture.teacherSentinel));
  assert.equal((await handler(event(`${prefix}/ultimate-b2-sb-u1-p1-o97`, "GET", null, { cookie: "", "x-preview-authorized": "yes" }))).statusCode, 404);
});
