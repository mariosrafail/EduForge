import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { ComponentPublicationAssetError } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-assets.js";
import { createBuilderProductPublicationHandler, parseBuilderProductPublicationRoute } from "../netlify-sites/ultimate-b2-builder/server/_builder-product-publication.js";

const base = "/builder/api/publication/books/ultimate-b2";
const actor = "10000000-0000-4000-8000-000000000001";
const components = [
  ["ultimate-b2-students-book", "ultimate-b2-students-book-v2", "2.0", "a"],
  ["ultimate-b2-workbook", "ultimate-b2-workbook-v1", "1.0", "b"],
  ["ultimate-b2-grammar-book", "ultimate-b2-grammar-book-v1", "1.0", "c"],
];

function event(path = base, method = "GET", value = null, headers = {}) {
  return { path, httpMethod: method, headers: { host: "builder.example", origin: "https://builder.example", cookie: "hh_builder_session=live", "content-type": "application/json", ...headers }, body: value ? JSON.stringify(value) : "" };
}

const parsed = (response) => JSON.parse(response.body);
const digest = (character) => character.repeat(64);

function compiledMembers(sourceOverride = new Map()) {
  return components.map(([componentSlug, compilerId, releaseSchemaVersion, marker]) => ({
    componentSlug,
    compiler: { compilerId, releaseSchemaVersion },
    compiled: {
      compilerId,
      releaseSchemaVersion,
      compatibility: digest(marker),
      sourceSnapshot: { marker },
      sourceSnapshotSha256: sourceOverride.get(componentSlug) || digest(marker),
      publicProjection: { marker },
      publicProjectionSha256: digest(marker),
      teacherProjection: { marker },
      teacherProjectionSha256: digest(marker),
      assetManifest: [],
      nativeAssetSources: [],
      releaseSha256: digest(marker),
    },
  }));
}

function candidate(overrides = {}) {
  return {
    id: overrides.id || randomUUID(),
    number: 1,
    bookSlug: "ultimate-b2",
    compilerId: "ultimate-b2-product-v1",
    releaseSchemaVersion: "1.0",
    sourceSnapshotSha256: digest("d"),
    releaseSha256: digest("e"),
    releaseNote: "Atomic",
    createdAt: "2026-08-28T00:00:00.000Z",
    current: overrides.current === true,
    members: components.map(([componentSlug, compilerId, releaseSchemaVersion, marker], index) => ({
      componentSlug,
      order: index + 1,
      status: "included",
      componentReleaseId: randomUUID(),
      compilerId,
      releaseSchemaVersion,
      releaseSha256: digest(marker),
      compatibility: digest(marker),
      memberSha256: digest(marker),
      unavailableReason: null,
      sourceSnapshotSha256: overrides.sourceOverride?.get(componentSlug) || digest(marker),
    })),
  };
}

function harness(overrides = {}) {
  let compiled = overrides.compiled || compiledMembers();
  let createdInput;
  let publishInput;
  let materialized = [];
  const release = overrides.release || candidate();
  const handler = createBuilderProductPublicationHandler({
    getDatabase: () => ({}),
    authorize: async (request) => request.headers.cookie === "hh_builder_session=live" ? { builderUser: { id: actor } } : { error: json(401, { error: "Unauthorized" }) },
    ready: overrides.ready || (async () => true),
    compileProduct: async () => compiled,
    status: async () => ({ headRevision: 0, published: null, releases: [] }),
    materialize: async (storage, input) => { materialized.push(input.componentSlug); return overrides.materialize?.(storage, input); },
    verifyAssets: overrides.verifyAssets || (async () => {}),
    storage: () => ({}),
    randomUuid: randomUUID,
    create: async (sql, input) => { createdInput = input; return overrides.create ? overrides.create(sql, input) : { outcome: "created", productReleaseId: release.id, releaseNumber: 1, releaseSha256: release.releaseSha256, sourceSnapshotSha256: release.sourceSnapshotSha256, members: release.members }; },
    loadRelease: async () => release,
    verifyCandidate: async () => true,
    loadMutation: async () => overrides.replay || null,
    publish: async (sql, input) => { publishInput = input; return overrides.publish ? overrides.publish(sql, input) : { outcome: "published", productReleaseId: input.productReleaseId, releaseNumber: 1, headRevision: 1 }; },
    logger: overrides.logger || { error() {} },
  });
  return { handler, release, get createdInput() { return createdInput; }, get publishInput() { return publishInput; }, get materialized() { return materialized; }, setCompiled(value) { compiled = value; } };
}

test("product route is distinct from component routes and requires auth, schema, and same origin", async () => {
  assert.deepEqual(parseBuilderProductPublicationRoute(event(base)), { bookSlug: "ultimate-b2", action: "status" });
  assert.equal(parseBuilderProductPublicationRoute(event(`${base}/components/ultimate-b2-students-book`)), null);
  const { handler } = harness();
  assert.equal((await handler(event(base, "GET", null, { cookie: "" }))).statusCode, 401);
  assert.equal((await handler(event(`${base}/prepare`, "POST", { clientMutationId: randomUUID(), releaseNote: "" }, { origin: "https://attacker.example" }))).statusCode, 403);
  assert.equal((await harness({ ready: async () => false }).handler(event(base))).statusCode, 409);
  assert.equal((await handler(event("/builder/api/publication/books/ultimate-b1"))).statusCode, 404);
});

test("Prepare compiles, materializes, and creates Students, Workbook, and Grammar as one ordered family", async () => {
  const run = harness();
  const response = await run.handler(event(`${base}/prepare`, "POST", { clientMutationId: randomUUID(), releaseNote: "Atomic" }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(run.materialized, components.map(([componentSlug]) => componentSlug));
  assert.deepEqual(run.createdInput.members.map((member) => member.componentSlug), components.map(([componentSlug]) => componentSlug));
  assert.equal(run.createdInput.members.length, 3);
  assert.equal(run.createdInput.members.some((member) => member.componentSlug.includes("test-book")), false);
  assert.ok(run.createdInput.members.every((member) => /^[0-9a-f-]{36}$/.test(member.releaseId)));
  assert.equal(parsed(response).productReleaseId, run.release.id);
});

test("managed page CopyObject failures keep product Prepare atomic, safely logged, and retryable", async () => {
  for (const failingComponent of ["ultimate-b2-workbook", "ultimate-b2-grammar-book"]) {
    let failOnce = true;
    let createCalls = 0;
    let publishCalls = 0;
    let reused = 0;
    const materializedObjects = new Set();
    const diagnostics = [];
    const run = harness({
      async materialize(_storage, input) {
        if (failOnce && input.componentSlug === failingComponent) {
          failOnce = false;
          throw Object.assign(new ComponentPublicationAssetError({
            assetId: randomUUID(),
            role: "managed_page_image",
            stage: "materialize",
            failureClass: "copy_invalid_request",
            providerStatus: 400,
            providerCode: "InvalidArgument",
          }), {
            bucket: "private-secret-bucket",
            sourceObjectKey: "builder-pages/private/source.png",
            destinationObjectKey: "builder-release-assets/private/destination.png",
            copySource: "/private-secret-bucket/source.png",
            etag: '"private-etag"',
            authorization: "secret Authorization",
            cookie: "secret Cookie",
          });
        }
        if (materializedObjects.has(input.componentSlug)) reused += 1;
        materializedObjects.add(input.componentSlug);
      },
      async create() { createCalls += 1; return { outcome: "created", productReleaseId: run.release.id, releaseNumber: 1, releaseSha256: run.release.releaseSha256, sourceSnapshotSha256: run.release.sourceSnapshotSha256, members: run.release.members }; },
      async publish() { publishCalls += 1; return { outcome: "published" }; },
      logger: { error(_message, diagnostic) { diagnostics.push(diagnostic); } },
    });
    const first = await run.handler(event(`${base}/prepare`, "POST", { clientMutationId: randomUUID(), releaseNote: `Fail ${failingComponent}` }));
    assert.equal(first.statusCode, 409, failingComponent);
    assert.deepEqual(parsed(first), { error: "release_asset_unavailable" }, failingComponent);
    assert.equal(createCalls, 0, failingComponent);
    assert.equal(publishCalls, 0, failingComponent);
    assert.deepEqual(diagnostics[0], {
      code: "release_asset_unavailable",
      assetId: diagnostics[0].assetId,
      assetRole: "managed_page_image",
      assetStage: "materialize",
      failureClass: "copy_invalid_request",
      providerStatus: 400,
      providerCode: "InvalidArgument",
    }, failingComponent);
    assert.match(diagnostics[0].assetId, /^[0-9a-f-]{36}$/i, failingComponent);
    assert.doesNotMatch(JSON.stringify(diagnostics), /bucket|sourceObjectKey|destinationObjectKey|CopySource|ETag|Authorization|Cookie|private/i, failingComponent);

    const retry = await run.handler(event(`${base}/prepare`, "POST", { clientMutationId: randomUUID(), releaseNote: `Retry ${failingComponent}` }));
    assert.equal(retry.statusCode, 200, failingComponent);
    assert.equal(createCalls, 1, failingComponent);
    assert.equal(publishCalls, 0, failingComponent);
    assert.ok(reused >= 1, `${failingComponent} retry must reuse earlier verified component materialization`);
  }
});

test("Publish rejects family staleness before the atomic head move and permits exact mutation replay", async () => {
  const staleSource = new Map([["ultimate-b2-workbook", digest("f")]]);
  const run = harness();
  run.setCompiled(compiledMembers(staleSource));
  const request = { productReleaseId: run.release.id, expectedHeadRevision: 0, clientMutationId: randomUUID() };
  const stale = await run.handler(event(`${base}/publish`, "POST", request));
  assert.equal(stale.statusCode, 409);
  assert.equal(parsed(stale).error, "stale_release_preview");
  assert.equal(run.publishInput, undefined);

  const replay = harness({ replay: { product_release_id: run.release.id } });
  replay.setCompiled(compiledMembers(staleSource));
  const response = await replay.handler(event(`${base}/publish`, "POST", { ...request, productReleaseId: replay.release.id }));
  assert.equal(response.statusCode, 200);
  assert.equal(replay.publishInput.productReleaseId, replay.release.id);
});
