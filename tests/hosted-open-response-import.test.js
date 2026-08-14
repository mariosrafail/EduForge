import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { createBuilderOpenResponseImportHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-open-response-import.js";
import { importUltimateB2HostedOpenResponseBundle } from "../scripts/ultimate-b2/open-response-hosted-import.mjs";
import { applyUltimateB2HostedOpenResponseDraft, createUltimateB2HostedOpenResponseSeed } from "../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { applyUltimateB2HostedOpenResponseImport } from "../src/data/ultimate-b2/hostedOpenResponseImport.js";
import { findStudentsBookImplementation } from "../src/data/ultimate-b2/studentsBookCatalog.js";
import { task6SourceBundle } from "./fixtures/open-response-task6.js";

const activityId = "ultimate-b2-sb-u2-p1-o1";
const actorId = "10000000-0000-4000-8000-000000000001";
const originHeaders = { host: "builder.example", origin: "https://builder.example", "content-type": "application/json" };
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

class MemoryStorage {
  objects = new Map();
  signed = [];
  uploads = [];
  key(profile, objectKey) { return `${profile}:${objectKey}`; }
  async signedPutUrl(input) { this.signed.push(input); return { url: `https://uploads.invalid/${encodeURIComponent(input.objectKey)}`, headers: { "Content-Type": input.contentType }, expiresIn: input.ttlSeconds }; }
  async head({ profile, objectKey }) { const item = this.objects.get(this.key(profile, objectKey)); if (!item) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } }); return { byteSize: item.body.length, contentType: item.contentType, checksumSha256: item.checksumSha256 || null }; }
  async download({ profile, objectKey }) { return Buffer.from(this.objects.get(this.key(profile, objectKey)).body); }
  async upload(input) { const key = this.key(input.profile, input.objectKey); const current = this.objects.get(key); if (current) return { ...(await this.head(input)), reused: true }; this.objects.set(key, { body: Buffer.from(input.body), contentType: input.contentType, checksumSha256: input.checksumSha256 }); this.uploads.push(input); return { ...(await this.head(input)), reused: false }; }
  async delete({ profile, objectKey }) { this.objects.delete(this.key(profile, objectKey)); }
  publicUrl(objectKey) { return `https://books.invalid/${objectKey}`; }
}

function event(path, body, httpMethod = "POST", headers = originHeaders) {
  return { httpMethod, path, headers, body: body === undefined ? "" : JSON.stringify(body) };
}

test("hosted projection reuses the authoritative importer and recursively excludes private/source fields", async () => {
  const files = await task6SourceBundle();
  const ids = [1, 2, 3].map((number) => `${activityId}-q${number}`);
  const imported = await importUltimateB2HostedOpenResponseBundle({ activityId, files, expectedQuestionIds: ids, assetPathFor: (sha, extension) => `/preview/open-response-assets/${sha}${extension}` });
  assert.equal(imported.publicProjection.questions.length, 3);
  assert.equal(imported.teacherProjection.answers[0].text, "Imported model 1.1\nImported model 1.2");
  assert.match(imported.publicProjection.artworkLayers[0].assetPath, /^\/preview\/open-response-assets\/[a-f0-9]{64}\.png$/);
  const publicText = JSON.stringify(imported.publicProjection);
  for (const forbidden of ["modelAnswer", "acceptedAnswers", "teacherAuthoring", "sourceFile", "repositoryPath", "obj_params", "archive", "protected", "Nextcloud", "C:\\\\"]) assert.doesNotMatch(publicText, new RegExp(forbidden, "i"));
  assert.doesNotMatch(JSON.stringify(imported.teacherProjection), /source|archive|objectKey|credential|repositoryPath/i);
  const repeat = await importUltimateB2HostedOpenResponseBundle({ activityId, files, expectedQuestionIds: ids, assetPathFor: (sha, extension) => `/preview/open-response-assets/${sha}${extension}` });
  assert.equal(repeat.fingerprint, imported.fingerprint);
});

test("composition is canonical then imported source then saved Task 5 text", async () => {
  const canonical = findStudentsBookImplementation(activityId);
  const ids = canonical.runtime.questions.map((question) => question.id);
  const imported = await importUltimateB2HostedOpenResponseBundle({ activityId, files: await task6SourceBundle(), expectedQuestionIds: ids, assetPathFor: (sha, extension) => `/preview/open-response-assets/${sha}${extension}` });
  const importedActivity = applyUltimateB2HostedOpenResponseImport(canonical, imported.publicProjection);
  assert.equal(importedActivity.runtime.questions[0].prompt, "Imported question 1?");
  const textDraft = structuredClone(createUltimateB2HostedOpenResponseSeed(canonical));
  textDraft.questions[0] = { ...textDraft.questions[0], prompt: "Saved Task 5 override" };
  const composed = applyUltimateB2HostedOpenResponseDraft(importedActivity, textDraft);
  assert.equal(composed.runtime.questions[0].prompt, "Saved Task 5 override");
  assert.equal(imported.publicProjection.artworkLayers.length, 1);
});

test("authenticated prepare creates exact opaque private keys and scoped upload authorizations", async () => {
  const storage = new MemoryStorage();
  let stored;
  const handler = createBuilderOpenResponseImportHandler({
    getDatabase: () => ({}), authorize: async () => ({ builderUser: { id: actorId } }), storage: () => storage,
    prepare: async (_sql, input) => { stored = input; return { outcome: "prepared", uploadId: input.uploadId, currentRevision: 0, state: "prepared", fileDescriptors: input.fileDescriptors }; },
    logger: { error() {} },
  });
  const files = await task6SourceBundle();
  const response = await handler(event("/builder/api/open-response-import/prepare", { activityId, expectedRevision: 0, clientMutationId: randomUUID(), files: files.map((file) => ({ name: file.name, size: file.bytes.length, type: file.name.endsWith(".xml") ? "application/xml" : "image/png" })) }));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.uploads.length, 3);
  assert.equal(storage.signed.every((item) => item.profile === "private"), true);
  assert.equal(stored.fileDescriptors.every((item) => item.objectKey.includes(stored.uploadId) && !item.objectKey.includes(item.name)), true);
  assert.doesNotMatch(response.body, /accessKey|secret|objectKey|bucket/i);
});

test("prepare rejects unauthenticated, unsupported, traversal, duplicate, missing XML, and oversized metadata", async () => {
  const storage = new MemoryStorage();
  const handler = createBuilderOpenResponseImportHandler({ getDatabase: () => ({}), authorize: async () => ({ builderUser: { id: actorId } }), storage: () => storage, logger: { error() {} } });
  const mutation = randomUUID();
  const valid = [{ name: "obj_params.xml", size: 100, type: "application/xml" }, { name: "ebook_obj_params.xml", size: 100, type: "application/xml" }, { name: "image_1.png", size: 100, type: "image/png" }];
  for (const [files, error] of [
    [[...valid.slice(0, 2), { name: "../image.png", size: 1, type: "image/png" }], "invalid_filename"],
    [[...valid, { ...valid[2], name: "IMAGE_1.PNG" }], "duplicate_filename"],
    [[valid[0], valid[2]], "required_xml_missing_or_duplicate"],
    [[...valid.slice(0, 2), { name: "image_1.png", size: 13 * 1024 * 1024, type: "image/png" }], "declared_file_too_large"],
  ]) {
    const response = await handler(event("/builder/api/open-response-import/prepare", { activityId, expectedRevision: 0, clientMutationId: mutation, files }));
    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).error, error);
  }
  assert.equal((await handler(event("/builder/api/open-response-import/prepare", { activityId: "ultimate-b2-sb-u1-p1-o2", expectedRevision: 0, clientMutationId: mutation, files: valid }))).statusCode, 404);
  const unauthorized = createBuilderOpenResponseImportHandler({ getDatabase: () => ({}), authorize: async () => ({ error: { statusCode: 401, headers: {}, body: "" } }), logger: { error() {} } });
  assert.equal((await unauthorized(event("/builder/api/open-response-import/prepare", {}))).statusCode, 401);
});

test("finalize reads exact private bytes, promotes public rasters, archives source, commits once, and cleans staging", async () => {
  const storage = new MemoryStorage();
  const files = await task6SourceBundle();
  const uploadId = randomUUID();
  const mutation = randomUUID();
  const descriptors = files.map((file) => ({ name: file.name, size: file.bytes.length, type: file.name.endsWith(".xml") ? "application/xml" : "image/png", role: file.name === "obj_params.xml" ? "obj_params" : file.name === "ebook_obj_params.xml" ? "ebook_obj_params" : "raster", fileId: randomUUID(), objectKey: `builder-imports/ultimate-b2/ultimate-b2-students-book/${activityId}/${uploadId}/staging/${randomUUID()}` }));
  files.forEach((file, index) => storage.objects.set(storage.key("private", descriptors[index].objectKey), { body: file.bytes, contentType: descriptors[index].type }));
  let committed;
  const handler = createBuilderOpenResponseImportHandler({
    getDatabase: () => ({}), authorize: async () => ({ builderUser: { id: actorId } }), storage: () => storage,
    claim: async () => ({ outcome: "claimed", currentRevision: 0, state: "finalizing", activityId, fileDescriptors: descriptors }),
    commit: async (_sql, input) => { committed = input; return { outcome: "saved", revision: 1, currentRevision: 1, fingerprint: input.fingerprint }; },
    logger: { error() {} },
  });
  const response = await handler(event("/builder/api/open-response-import/finalize", { uploadId, expectedRevision: 0, clientMutationId: mutation }));
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(committed.publicProjection.questions.length, 3);
  assert.equal(committed.teacherProjection.answers.length, 3);
  assert.equal(storage.uploads.filter((item) => item.profile === "public").length, 1);
  assert.equal(storage.uploads.filter((item) => item.profile === "archive").length, 3);
  assert.equal(descriptors.every((item) => !storage.objects.has(storage.key("private", item.objectKey))), true);
  assert.equal(committed.archiveManifest.files.every((item) => item.objectKey && item.checksumSha256), true);
});

test("finalize rejects missing/corrupt/oversized actual objects without committing a replacement", async () => {
  for (const mode of ["missing", "corrupt", "oversized"]) {
    const storage = new MemoryStorage();
    const files = await task6SourceBundle();
    const uploadId = randomUUID();
    const descriptors = files.map((file) => ({ name: file.name, size: file.bytes.length, type: file.name.endsWith(".xml") ? "application/xml" : "image/png", role: file.name.endsWith(".png") ? "raster" : file.name.startsWith("ebook") ? "ebook_obj_params" : "obj_params", fileId: randomUUID(), objectKey: `builder-imports/${randomUUID()}` }));
    files.forEach((file, index) => storage.objects.set(storage.key("private", descriptors[index].objectKey), { body: file.bytes, contentType: descriptors[index].type }));
    if (mode === "missing") storage.objects.delete(storage.key("private", descriptors[2].objectKey));
    if (mode === "corrupt") storage.objects.set(storage.key("private", descriptors[2].objectKey), { body: Buffer.alloc(descriptors[2].size), contentType: "image/png" });
    if (mode === "oversized") storage.objects.set(storage.key("private", descriptors[2].objectKey), { body: Buffer.alloc(descriptors[2].size + 1), contentType: "image/png" });
    let commits = 0; let failures = 0;
    const handler = createBuilderOpenResponseImportHandler({ getDatabase: () => ({}), authorize: async () => ({ builderUser: { id: actorId } }), storage: () => storage, claim: async () => ({ outcome: "claimed", activityId, fileDescriptors: descriptors }), commit: async () => { commits += 1; }, fail: async () => { failures += 1; }, logger: { error() {} } });
    const response = await handler(event("/builder/api/open-response-import/finalize", { uploadId, expectedRevision: 0, clientMutationId: randomUUID() }));
    assert.equal(response.statusCode, 400);
    assert.equal(commits, 0);
    assert.equal(failures, 1);
  }
});

test("public and Teacher preview endpoints are exact, no-store, minimal, and separate", async () => {
  const files = await task6SourceBundle();
  const ids = [1, 2, 3].map((number) => `${activityId}-q${number}`);
  const imported = await importUltimateB2HostedOpenResponseBundle({ activityId, files, expectedQuestionIds: ids, assetPathFor: (sha, extension) => `/preview/open-response-assets/${sha}${extension}` });
  const handler = createBuilderOpenResponseImportHandler({ getDatabase: () => ({}), loadCurrent: async () => ({ revision: 2, fingerprint: imported.fingerprint, publicProjection: imported.publicProjection, teacherProjection: imported.teacherProjection }), logger: { error() {} } });
  const publicResponse = await handler(event(`/preview/open-response-import/${activityId}`, undefined, "GET", {}));
  const teacherResponse = await handler(event(`/preview/open-response-teacher/${activityId}`, undefined, "GET", {}));
  assert.equal(publicResponse.statusCode, 200);
  assert.equal(publicResponse.headers["Cache-Control"], "no-store");
  assert.doesNotMatch(publicResponse.body, /Imported model|teacher|archive|objectKey/i);
  assert.match(teacherResponse.body, /Imported model 1\.1/);
  assert.doesNotMatch(teacherResponse.body, /archive|objectKey|obj_params/i);
  assert.equal((await handler(event(`/preview/open-response-import/ultimate-b2-sb-u1-p1-o2`, undefined, "GET", {}))).statusCode, 404);
  assert.equal(digest(files[2].bytes), imported.publicProjection.artworkLayers[0].sha256);
});
