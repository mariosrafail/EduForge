import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { createBuilderNativeActivitiesHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { inspectManagedRaster } from "../lib/book-assets/raster-inspection.js";

const actor = "10000000-0000-4000-8000-000000000001";
const activityId = "ultimate-b2-sb-u1-p1-o99";
const uploadId = "10000000-0000-4000-8000-000000000010";
const assetId = "10000000-0000-4000-8000-000000000011";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==", "base64");
const base = `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/assets`;
const request = (path, body, overrides = {}) => ({ httpMethod: overrides.method || "POST", path, headers: { host: "builder.example", origin: "https://builder.example", cookie: "live", "content-type": "application/json", ...overrides.headers }, body: JSON.stringify(body || {}) });

function harness({ bytes = png, inspectRaster = inspectManagedRaster } = {}) {
  let prepared = null; let completed = null; let failed = null;
  const storage = {
    signedPutUrl: async () => ({ url: "https://storage.example/signed-put", headers: { "Content-Type": "image/png" }, expiresIn: 900 }),
    signedGetUrl: async () => "https://storage.example/signed-get",
    head: async () => ({ byteSize: bytes.length, contentType: "image/png" }),
    download: async () => bytes,
    upload: async (input) => ({ ...input, reused: false }),
    delete: async () => {},
    bucket: () => "private-assets",
  };
  const handler = createBuilderNativeActivitiesHandler({
    getDatabase: () => ({}),
    authorize: async (event) => event.headers.cookie === "live" ? { builderUser: { id: actor } } : { error: json(401, { error: "Unauthorized" }) },
    randomUuid: () => uploadId,
    storage: () => storage,
    inspectRaster,
    prepareAsset: async (_sql, input) => { prepared = input; return { outcome: "prepared", uploadId, state: "prepared", fileDescriptor: input.fileDescriptor, stagingObjectKey: input.stagingObjectKey }; },
    claimAsset: async (_sql, input) => ({ outcome: "claimed", activityId, assetSlot: prepared.assetSlot, fileDescriptor: prepared.fileDescriptor, stagingObjectKey: prepared.stagingObjectKey }),
    completeAsset: async (_sql, input) => { completed = input; return assetId; },
    failAsset: async (_sql, input) => { failed = input; },
    loadAsset: async (_sql, input) => input.activityId === activityId && input.assetId === assetId ? { id: assetId, checksum_sha256: completed?.checksumSha256 || "a".repeat(64), asset_role: "activity_artwork", object_key: completed?.objectKey || "builder-native-assets/object.png", storage_profile: "private", storage_bucket: "private-assets", mime_type: "image/png", byte_size: png.length, width: 1, height: 1, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: activityId, asset_slot: "asset-one" } } : null,
    logger: { error() {} },
  });
  return { handler, getPrepared: () => prepared, getCompleted: () => completed, getFailed: () => failed };
}

test("native raster prepare requires auth/origin and rejects unsafe descriptors", async () => {
  const { handler } = harness(); const mutation = randomUUID();
  const valid = { name: "diagram.png", size: png.length, type: "image/png", assetSlot: "asset-one", clientMutationId: mutation };
  assert.equal((await handler(request(`${base}/prepare`, valid, { headers: { cookie: "" } }))).statusCode, 401);
  assert.equal((await handler(request(`${base}/prepare`, valid, { headers: { origin: "https://attacker.example" } }))).statusCode, 403);
  for (const invalid of [
    { ...valid, name: "../diagram.png" }, { ...valid, name: "diagram.svg", type: "image/svg+xml" },
    { ...valid, name: "diagram.jpg" }, { ...valid, size: 10 * 1024 * 1024 + 1 }, { ...valid, type: "text/html" },
  ]) assert.equal((await handler(request(`${base}/prepare`, invalid))).statusCode, 400);
  const accepted = await handler(request(`${base}/prepare`, valid));
  assert.equal(accepted.statusCode, 200);
  const payload = JSON.parse(accepted.body);
  assert.equal(payload.uploadId, uploadId); assert.match(payload.authorization.url, /^https:\/\/storage\.example/);
  assert.equal(JSON.stringify(payload).includes("stagingObjectKey"), false);
});

test("native raster finalize inspects real bytes, creates a private book asset reference, and supports authenticated preview", async () => {
  const { handler, getCompleted } = harness(); const clientMutationId = randomUUID();
  await handler(request(`${base}/prepare`, { name: "diagram.png", size: png.length, type: "image/png", assetSlot: "asset-one", clientMutationId }));
  const finalized = await handler(request(`${base}/finalize`, { uploadId, clientMutationId }));
  assert.equal(finalized.statusCode, 200);
  const payload = JSON.parse(finalized.body);
  assert.deepEqual(payload.reference, { assetId, checksumSha256: getCompleted().checksumSha256, role: "activity_artwork", slot: "asset-one" });
  assert.equal(payload.metadata.width, 1); assert.equal(payload.metadata.height, 1);
  assert.equal(JSON.stringify(payload).includes("object_key"), false);
  assert.equal(getCompleted().storageBucket, "private-assets");
  const preview = await handler(request(`${base}/${assetId}/preview`, null, { method: "GET" }));
  assert.equal(preview.statusCode, 302); assert.equal(preview.headers.Location, "https://storage.example/signed-get"); assert.equal(preview.headers["Cache-Control"], "private, no-store");
  assert.equal((await handler(request(`${base}/${assetId}/preview`, null, { method: "GET", headers: { cookie: "" } }))).statusCode, 401);
});

test("native finalize rejects malformed and MIME-spoofed rasters and records safe failure codes", async () => {
  for (const scenario of [
    { bytes: Buffer.from("not an image"), inspectRaster: inspectManagedRaster, expected: "invalid_raster" },
    { bytes: Buffer.concat([png, Buffer.from("<script>")]), inspectRaster: inspectManagedRaster, expected: "invalid_raster" },
    { bytes: png, inspectRaster: async (value) => ({ bytes: value, checksumSha256: "b".repeat(64), mimeType: "image/jpeg", extension: ".jpg", byteSize: value.length, width: 1, height: 1 }), expected: "actual_mime_mismatch" },
  ]) {
    const current = harness(scenario); const clientMutationId = randomUUID();
    await current.handler(request(`${base}/prepare`, { name: "diagram.png", size: scenario.bytes.length, type: "image/png", assetSlot: "asset-one", clientMutationId }));
    const response = await current.handler(request(`${base}/finalize`, { uploadId, clientMutationId }));
    assert.equal(response.statusCode, 400); assert.equal(JSON.parse(response.body).error, scenario.expected); assert.equal(current.getFailed().failureCode, scenario.expected);
  }
});
