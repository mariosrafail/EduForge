import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { createBuilderNativeActivitiesHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { createBuilderNativePreviewHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-preview.js";
import { inspectManagedTtf, MANAGED_TTF_MAXIMUM_BYTES } from "../lib/book-assets/font-inspection.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const actor = "10000000-0000-4000-8000-000000000001";
const assetId = "20000000-0000-4000-8000-000000000096";
const bookSlug = "ultimate-b2";
const componentSlug = "ultimate-b2-students-book";
const root = `/builder/api/native-activities/books/${bookSlug}/components/${componentSlug}/fonts`;
const headers = { host: "builder.example", origin: "https://builder.example", cookie: "hh_builder_session=live", "content-type": "application/json" };
const request = (path, { method = "GET", body = null, cookie = headers.cookie } = {}) => ({ httpMethod: method, path, headers: { ...headers, cookie }, body: body ? JSON.stringify(body) : "" });
const fixtureBytes = async () => Buffer.from((await readFile(new URL("./fixtures/fonts/Ahem.ttf.base64", import.meta.url), "utf8")).trim(), "base64");

function record(checksumSha256, overrides = {}) {
  return {
    id: assetId, checksum_sha256: checksumSha256, asset_role: "activity_font",
    object_key: `builder-font-library/${bookSlug}/${componentSlug}/assets/${checksumSha256}.ttf`,
    storage_profile: "private", storage_bucket: "private-test", mime_type: "font/ttf", byte_size: 21768,
    publication_status: "draft", access_level: "internal",
    source_metadata: { font_library_scope: "component", display_label: "Ahem", original_filename: "Ahem.ttf" },
    ...overrides,
  };
}

function apiHarness({ bytes, fontRecord, authorize, storageUploadError = null } = {}) {
  const uploadId = "30000000-0000-4000-8000-000000000096";
  const events = { prepared: [], completed: [], failed: [], uploaded: [], deleted: [] };
  let descriptor;
  let stagingObjectKey;
  let completedRecord = fontRecord || null;
  const storage = {
    bucket: () => "private-test",
    signedPutUrl: async ({ objectKey, contentType }) => ({ url: "https://private-upload.example/font", headers: { "Content-Type": contentType }, objectKey }),
    signedGetUrl: async () => "https://private-assets.example/font?signature=opaque",
    head: async () => ({ byteSize: bytes.length, contentType: "font/ttf" }),
    download: async () => bytes,
    upload: async (input) => { events.uploaded.push(input); if (storageUploadError) throw new Error(storageUploadError); },
    delete: async (input) => { events.deleted.push(input); },
  };
  const handler = createBuilderNativeActivitiesHandler({
    getDatabase: () => ({}),
    authorize: authorize || (async (event) => event.headers.cookie ? { builderUser: { id: actor } } : { error: json(401, { error: "Unauthorized" }) }),
    randomUuid: () => uploadId,
    now: () => Date.parse("2026-08-31T12:00:00Z"),
    storage: () => storage,
    prepareFont: async (_sql, input) => { events.prepared.push(input); descriptor = input.fileDescriptor; stagingObjectKey = input.stagingObjectKey; return { outcome: "prepared", uploadId, state: "prepared", fileDescriptor: descriptor, stagingObjectKey }; },
    loadFontUploadScope: async () => ({ bookSlug, componentSlug }),
    claimFont: async () => ({ outcome: "claimed", fileDescriptor: descriptor, stagingObjectKey }),
    completeFont: async (_sql, input) => { events.completed.push(input); completedRecord = record(input.checksumSha256, { byte_size: input.byteSize, object_key: input.objectKey }); return assetId; },
    failFont: async (_sql, input) => { events.failed.push(input); },
    listFonts: async (_sql, scope) => { assert.deepEqual({ bookSlug: scope.bookSlug, componentSlug: scope.componentSlug }, { bookSlug, componentSlug }); return completedRecord ? [completedRecord] : []; },
    loadFont: async (_sql, scope) => scope.bookSlug === bookSlug && scope.componentSlug === componentSlug && scope.assetId === assetId ? completedRecord : null,
    logger: { error() {} },
  });
  return { handler, events, uploadId, storage };
}

test("TTF inspection accepts the documented public-domain fixture and rejects empty, malformed, truncated, and oversized bytes", async () => {
  const bytes = await fixtureBytes();
  const inspected = inspectManagedTtf(bytes);
  assert.equal(inspected.byteSize, 21768);
  assert.equal(inspected.mimeType, "font/ttf");
  assert.equal(inspected.checksumSha256, "b719ecb31c5b21fc573c03f6421c74ac63c271a5a3ff841e34f9705fb94b8448");
  assert.throws(() => inspectManagedTtf(Buffer.alloc(0)), /empty_font/);
  assert.throws(() => inspectManagedTtf(Buffer.from("not-a-font")), /truncated_font|unsupported_font_signature/);
  assert.throws(() => inspectManagedTtf(bytes.subarray(0, 40)), /truncated_font/);
  assert.throws(() => inspectManagedTtf(Buffer.alloc(MANAGED_TTF_MAXIMUM_BYTES + 1)), /actual_file_too_large/);
});

test("authorized component font list and preview expose safe metadata only and fail closed across scope", async () => {
  const bytes = await fixtureBytes();
  const checksum = inspectManagedTtf(bytes).checksumSha256;
  const fixture = apiHarness({ bytes, fontRecord: record(checksum) });
  assert.equal((await fixture.handler(request(root, { cookie: "" }))).statusCode, 401);
  const listed = await fixture.handler(request(root));
  assert.equal(listed.statusCode, 200);
  const font = JSON.parse(listed.body).fonts[0];
  assert.deepEqual(Object.keys(font).sort(), ["assetId", "byteSize", "checksumSha256", "displayLabel", "familyAlias", "previewUrl", "role", "slot"].sort());
  assert.equal(font.familyAlias, "hh-native-font-20000000000040008000000000000096");
  assert.doesNotMatch(listed.body, /object_key|private-test|builder-font-library/);
  const preview = await fixture.handler(request(`${root}/${assetId}/preview`));
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.headers["Content-Type"], "font/ttf");
  assert.equal(preview.headers["Cross-Origin-Resource-Policy"], "same-origin");
  assert.deepEqual(Buffer.from(preview.body, "base64"), bytes);
  const headed = await fixture.handler(request(`${root}/${assetId}/preview`, { method: "HEAD" }));
  assert.equal(headed.statusCode, 200);
  assert.equal(headed.body, "");
  assert.equal(headed.headers["Content-Length"], String(bytes.length));
  assert.equal((await fixture.handler(request(`/builder/api/native-activities/books/${bookSlug}/components/ultimate-b2-workbook/fonts/${assetId}/preview`))).statusCode, 404);
  assert.equal((await fixture.handler(request(`${root}/${randomUUID()}/preview`))).statusCode, 404);
});

test("valid prepare/finalize canonicalizes MIME, verifies real bytes, writes immutable identity, and returns no private key", async () => {
  const bytes = await fixtureBytes();
  const fixture = apiHarness({ bytes });
  const clientMutationId = randomUUID();
  const prepared = await fixture.handler(request(`${root}/prepare`, { method: "POST", body: { name: "Ahem.ttf", size: bytes.length, type: "application/octet-stream", clientMutationId } }));
  assert.equal(prepared.statusCode, 200, prepared.body);
  assert.equal(fixture.events.prepared[0].fileDescriptor.type, "font/ttf");
  assert.match(fixture.events.prepared[0].stagingObjectKey, new RegExp(`^builder-font-library/${bookSlug}/${componentSlug}/`));
  const finalized = await fixture.handler(request(`${root}/finalize`, { method: "POST", body: { uploadId: fixture.uploadId, clientMutationId } }));
  assert.equal(finalized.statusCode, 200, finalized.body);
  const payload = JSON.parse(finalized.body);
  assert.equal(payload.font.displayLabel, "Ahem");
  assert.equal(payload.font.checksumSha256, inspectManagedTtf(bytes).checksumSha256);
  assert.equal(fixture.events.completed.length, 1);
  assert.match(fixture.events.completed[0].objectKey, new RegExp(`/assets/${payload.font.checksumSha256}\\.ttf$`));
  assert.equal(fixture.events.uploaded[0].contentType, "font/ttf");
  assert.equal(fixture.events.deleted.length, 1);
  assert.doesNotMatch(finalized.body, /objectKey|object_key|private-test/);
});

test("font prepare rejects unsafe descriptors before storage authorization", async () => {
  const bytes = await fixtureBytes();
  const fixture = apiHarness({ bytes });
  const invalid = [
    { name: "Ahem.otf", size: bytes.length, type: "font/ttf" },
    { name: "Ahem.ttf", size: bytes.length, type: "text/plain" },
    { name: "../Ahem.ttf", size: bytes.length, type: "font/ttf" },
    { name: "Ahem.ttf", size: 0, type: "font/ttf" },
    { name: "Ahem.ttf", size: MANAGED_TTF_MAXIMUM_BYTES + 1, type: "font/ttf" },
  ];
  for (const descriptor of invalid) {
    const response = await fixture.handler(request(`${root}/prepare`, { method: "POST", body: { ...descriptor, clientMutationId: randomUUID() } }));
    assert.equal(response.statusCode, 400, response.body);
  }
  assert.equal(fixture.events.prepared.length, 0);
});

test("finalize rejects invalid real signatures and storage/checksum failures without false success", async () => {
  for (const variant of [
    { bytes: Buffer.alloc(64), expected: /unsupported_font_signature/ },
    { bytes: Buffer.alloc(0), expected: /actual_object_size_mismatch|empty_font/ },
    { bytes: await fixtureBytes(), storageUploadError: "object_checksum_mismatch", expected: /object_checksum_mismatch/ },
  ]) {
    const declaredBytes = variant.bytes.length || 1;
    const fixture = apiHarness({ bytes: variant.bytes, storageUploadError: variant.storageUploadError });
    const clientMutationId = randomUUID();
    const prepared = await fixture.handler(request(`${root}/prepare`, { method: "POST", body: { name: "Ahem.ttf", size: declaredBytes, type: "font/ttf", clientMutationId } }));
    assert.equal(prepared.statusCode, 200);
    const response = await fixture.handler(request(`${root}/finalize`, { method: "POST", body: { uploadId: fixture.uploadId, clientMutationId } }));
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.body, variant.expected);
    assert.equal(fixture.events.completed.length, 0);
    assert.equal(fixture.events.failed.length, 1);
    assert.equal(fixture.events.deleted.length, 1);
  }
});

test("saved-draft preview resolves a referenced component font without accepting a foreign font", async () => {
  const bytes = await fixtureBytes();
  const checksum = inspectManagedTtf(bytes).checksumSha256;
  const reference = { assetId, checksumSha256: checksum, role: "activity_font", slot: "font-20000000000040008000000000000096" };
  const sources = createPublicationV2FixtureSources();
  const activityId = publicationV2Fixture.imageId;
  const publicDocument = structuredClone(sources.native.activities[activityId].public.payload);
  publicDocument.assets.push(reference);
  const handler = createBuilderNativePreviewHandler({
    getDatabase: () => ({}), resolveResource: async (_book, _component, type) => ({ documentType: type }),
    loadDocument: async (_sql, resource) => resource.documentType === "native-activity-index"
      ? { revision: sources.native.index.revision, document: sources.native.index.payload }
      : { revision: 1, document: publicDocument },
    inspectAuthorization: () => ({ authorized: true, scope: { version: 2, releaseId: null, view: "activity", pageId: null, activityId } }),
    loadFont: async () => record(checksum),
    loadAsset: async () => { throw new Error("activity loader must not be used for component fonts"); },
    storage: () => ({ download: async () => bytes }), logger: { error() {} },
  });
  const response = await handler({ httpMethod: "GET", path: `/builder/preview/native-activities/books/${bookSlug}/components/${componentSlug}/activities/${activityId}/assets/${assetId}`, headers: {} });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "font/ttf");
  assert.deepEqual(Buffer.from(response.body, "base64"), bytes);
  const foreignHandler = createBuilderNativePreviewHandler({
    getDatabase: () => ({}), resolveResource: async (_book, _component, type) => ({ documentType: type }),
    loadDocument: async (_sql, resource) => resource.documentType === "native-activity-index"
      ? { revision: sources.native.index.revision, document: sources.native.index.payload }
      : { revision: 1, document: publicDocument },
    inspectAuthorization: () => ({ authorized: true, scope: { version: 2, releaseId: null, view: "activity", pageId: null, activityId } }),
    loadFont: async () => record(checksum, { source_metadata: { font_library_scope: "another-component" } }),
    storage: () => ({ signedGetUrl: async () => "must-not-resolve" }), logger: { error() {} },
  });
  assert.equal((await foreignHandler({ httpMethod: "GET", path: `/builder/preview/native-activities/books/${bookSlug}/components/${componentSlug}/activities/${activityId}/assets/${assetId}`, headers: {} })).statusCode, 404);
});
