import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { createBuilderNativeActivitiesHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { inspectManagedMp3 } from "../lib/book-assets/audio-inspection.js";
import { inspectManagedRaster } from "../lib/book-assets/raster-inspection.js";
import { inspectManagedMp4, MANAGED_MP4_MAXIMUM_BYTES } from "../lib/book-assets/video-inspection.js";
import { inspectManagedPdf } from "../lib/book-assets/pdf-inspection.js";

const actor = "10000000-0000-4000-8000-000000000001";
const activityId = "ultimate-b2-sb-u1-p1-o99";
const uploadId = "10000000-0000-4000-8000-000000000010";
const assetId = "10000000-0000-4000-8000-000000000011";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const mp3 = Buffer.from([0xff, 0xfb, 0x90, 0x64, ...new Array(500).fill(0)]);
const mp4 = await readFile(new URL("../src/assets/books/ultimate-b2/teacher-offline-media/ultimate-b2-startup-intro.mp4", import.meta.url));
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const base = `/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/assets`;
const request = (path, body, overrides = {}) => ({ httpMethod: overrides.method || "POST", path, headers: { host: "builder.example", origin: "https://builder.example", cookie: "live", "content-type": "application/json", ...overrides.headers }, body: JSON.stringify(body || {}) });

function harness({ bytes = png, contentType = "image/png", inspectRaster = inspectManagedRaster, inspectAudio = inspectManagedMp3, inspectVideo = inspectManagedMp4, resolvedSlot = "asset-one" } = {}) {
  let prepared = null; let completed = null; let failed = null;
  const storage = {
    signedPutUrl: async () => ({ url: "https://storage.example/signed-put", headers: { "Content-Type": contentType }, expiresIn: 900 }),
    signedGetUrl: async () => "https://storage.example/signed-get",
    head: async () => ({ byteSize: bytes.length, contentType }),
    download: async () => bytes,
    upload: async (input) => ({ ...input, reused: false }),
    delete: async () => {},
    bucket: () => "private-assets",
  };
  const handler = createBuilderNativeActivitiesHandler({
    getDatabase: () => ({}),
    authorize: async (event) => event.headers.cookie === "live" ? { builderUser: { id: actor } } : { error: json(401, { error: "Unauthorized" }) },
    loadDocument: async (_sql, resource) => resource.documentType === "native_activity_index" ? { revision: 1, source: "database", document: { schemaVersion: "1.0", activities: [{ activityId }] } } : null,
    randomUuid: () => uploadId,
    storage: () => storage,
    inspectRaster,
    inspectAudio,
    inspectVideo,
    prepareAsset: async (_sql, input) => { prepared = input; return { outcome: "prepared", uploadId, state: "prepared", fileDescriptor: input.fileDescriptor, stagingObjectKey: input.stagingObjectKey }; },
    claimAsset: async (_sql, input) => ({ outcome: "claimed", activityId, assetSlot: prepared.assetSlot, fileDescriptor: prepared.fileDescriptor, stagingObjectKey: prepared.stagingObjectKey }),
    completeAsset: async (_sql, input) => { completed = input; return assetId; },
    failAsset: async (_sql, input) => { failed = input; },
    loadAsset: async (_sql, input) => input.activityId === activityId && input.assetId === assetId ? { id: assetId, checksum_sha256: completed?.checksumSha256 || "a".repeat(64), asset_role: "activity_artwork", object_key: completed?.objectKey || "builder-native-assets/object.png", storage_profile: "private", storage_bucket: "private-assets", mime_type: completed?.mimeType || contentType, byte_size: completed?.byteSize || bytes.length, width: completed?.width ?? (contentType.startsWith("image/") ? 1 : null), height: completed?.height ?? (contentType.startsWith("image/") ? 1 : null), publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: activityId, asset_slot: resolvedSlot } } : null,
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

test("native finalize returns the persisted canonical slot instead of the newly requested slot", async () => {
  const { handler } = harness({ resolvedSlot: "asset-canonical" });
  const clientMutationId = randomUUID();
  await handler(request(`${base}/prepare`, { name: "diagram.png", size: png.length, type: "image/png", assetSlot: "asset-new-request", clientMutationId }));
  const finalized = await handler(request(`${base}/finalize`, { uploadId, clientMutationId }));
  assert.equal(finalized.statusCode, 200);
  assert.equal(JSON.parse(finalized.body).reference.slot, "asset-canonical");
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

test("native MP3 prepare/finalize inspects bytes and persists dimensionless private managed audio", async () => {
  const { handler, getCompleted } = harness({ bytes: mp3, contentType: "audio/mpeg", resolvedSlot: "audio-one" });
  const clientMutationId = randomUUID();
  const prepared = await handler(request(`${base}/prepare`, { name: "excerpt.mp3", size: mp3.length, type: "audio/mpeg", assetSlot: "audio-one", clientMutationId }));
  assert.equal(prepared.statusCode, 200);
  const finalized = await handler(request(`${base}/finalize`, { uploadId, clientMutationId }));
  assert.equal(finalized.statusCode, 200);
  const payload = JSON.parse(finalized.body);
  assert.deepEqual(payload.reference, { assetId, checksumSha256: getCompleted().checksumSha256, role: "activity_artwork", slot: "audio-one" });
  assert.deepEqual(payload.metadata, { mimeType: "audio/mpeg", byteSize: mp3.length, width: null, height: null });
  assert.match(getCompleted().objectKey, /\/audio-one\/[0-9a-f]{64}\.mp3$/);
});

test("native MP3 finalization rejects malformed audio with a safe failure code", async () => {
  const bytes = Buffer.from("not an mp3");
  const current = harness({ bytes, contentType: "audio/mpeg" });
  const clientMutationId = randomUUID();
  await current.handler(request(`${base}/prepare`, { name: "excerpt.mp3", size: bytes.length, type: "audio/mpeg", assetSlot: "audio-one", clientMutationId }));
  const response = await current.handler(request(`${base}/finalize`, { uploadId, clientMutationId }));
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, "invalid_audio");
  assert.equal(current.getFailed().failureCode, "invalid_audio");
});

test("native MP4 prepare/finalize inspects real bytes and returns canonical duration metadata", async () => {
  const current = harness({ bytes: mp4, contentType: "video/mp4", resolvedSlot: "video-one" });
  const clientMutationId = randomUUID();
  const prepared = await current.handler(request(`${base}/prepare`, { name: "companion.mp4", size: mp4.length, type: "video/mp4", assetSlot: "video-one", clientMutationId }));
  assert.equal(prepared.statusCode, 200);
  const finalized = await current.handler(request(`${base}/finalize`, { uploadId, clientMutationId }));
  assert.equal(finalized.statusCode, 200);
  const payload = JSON.parse(finalized.body);
  assert.deepEqual(payload.reference, { assetId, checksumSha256: current.getCompleted().checksumSha256, role: "activity_artwork", slot: "video-one" });
  assert.deepEqual(payload.metadata, { mimeType: "video/mp4", byteSize: mp4.length, width: null, height: null, durationMs: 5_840 });
  assert.match(current.getCompleted().objectKey, /\/video-one\/[0-9a-f]{64}\.mp4$/);
});

test("native MP4 rejects unsafe descriptors, malformed bytes, and MIME spoofing", async () => {
  const valid = { name: "companion.mp4", size: mp4.length, type: "video/mp4", assetSlot: "video-one", clientMutationId: randomUUID() };
  for (const descriptor of [
    { ...valid, name: "companion.webm" },
    { ...valid, type: "video/webm" },
    { ...valid, size: MANAGED_MP4_MAXIMUM_BYTES + 1 },
  ]) assert.equal((await harness({ bytes: mp4, contentType: descriptor.type }).handler(request(`${base}/prepare`, descriptor))).statusCode, 400);
  for (const scenario of [
    { bytes: Buffer.from("not an mp4"), inspectVideo: inspectManagedMp4, expected: "invalid_video" },
    { bytes: mp4, inspectVideo: (value) => ({ bytes: value, checksumSha256: "b".repeat(64), mimeType: "video/webm", extension: ".webm", byteSize: value.length, width: null, height: null, durationMs: 5_840 }), expected: "actual_mime_mismatch" },
  ]) {
    const current = harness({ ...scenario, contentType: "video/mp4" }); const clientMutationId = randomUUID();
    await current.handler(request(`${base}/prepare`, { name: "companion.mp4", size: scenario.bytes.length, type: "video/mp4", assetSlot: "video-one", clientMutationId }));
    const response = await current.handler(request(`${base}/finalize`, { uploadId, clientMutationId }));
    assert.equal(response.statusCode, 400); assert.equal(JSON.parse(response.body).error, scenario.expected); assert.equal(current.getFailed().failureCode, scenario.expected);
  }
});

test("Video Worksheet PDF prepare is purpose-scoped and finalize validates real PDF bytes", async () => {
  const current = harness({ bytes: pdf, contentType: "application/pdf", resolvedSlot: "worksheet-one" });
  const clientMutationId = randomUUID();
  const descriptor = { name: "Unit 1 Worksheet.pdf", size: pdf.length, type: "application/pdf", assetSlot: "worksheet-one", purpose: "video-worksheet", clientMutationId };
  assert.equal((await current.handler(request(`${base}/prepare`, descriptor))).statusCode, 200);
  const finalized = await current.handler(request(`${base}/finalize`, { uploadId, clientMutationId }));
  assert.equal(finalized.statusCode, 200);
  assert.equal(JSON.parse(finalized.body).metadata.mimeType, "application/pdf");
  assert.match(current.getCompleted().objectKey, /[0-9a-f]{64}\.pdf$/);
  assert.equal((await harness({ bytes: pdf, contentType: "application/pdf" }).handler(request(`${base}/prepare`, { ...descriptor, purpose: "native-asset" }))).statusCode, 400);
  assert.equal((await harness({ bytes: pdf, contentType: "application/pdf" }).handler(request(`${base}/prepare`, { ...descriptor, name: "worksheet.html", type: "text/html" }))).statusCode, 400);

  const malformed = Buffer.from("%PDF-1.4\nmissing eof");
  const rejected = harness({ bytes: malformed, contentType: "application/pdf" });
  const rejectedMutation = randomUUID();
  await rejected.handler(request(`${base}/prepare`, { name: "worksheet.pdf", size: malformed.length, type: "application/pdf", assetSlot: "worksheet-one", purpose: "video-worksheet", clientMutationId: rejectedMutation }));
  const response = await rejected.handler(request(`${base}/finalize`, { uploadId, clientMutationId: rejectedMutation }));
  assert.equal(response.statusCode, 400); assert.equal(JSON.parse(response.body).error, "invalid_pdf");
  assert.throws(() => inspectManagedPdf(Buffer.from("<html>not pdf</html>")), /invalid_pdf/);
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
