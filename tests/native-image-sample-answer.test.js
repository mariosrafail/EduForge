import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";
import { normalizeNativeImageSolution } from "../src/data/native-activities/nativeImage.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { compileUltimateB2ComponentReleaseV2, ULTIMATE_B2_PUBLICATION_V2_COMPATIBILITY_VARIANTS } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { verifyImmutableComponentRelease } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compilers.js";
import { selectComponentReleaseAsset } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication.js";
import { createBuilderNativePreviewHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-preview.js";
import { serveProtectedNativeAnswer } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-teacher-assets.js";
import { deliverNativeTeacherAnswer } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-answer-delivery.js";
import { classifyAssetAccess } from "../lib/book-assets/access.js";
import { inspectBuilderPreviewAuthorizationScope, issueBuilderPreviewAuthorization } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization.js";

const bytes = Buffer.from("synthetic verified raster fixture bytes");
const checksum = createHash("sha256").update(bytes).digest("hex");
const reference = { assetId: "20000000-0000-4000-8000-000000000001", checksumSha256: checksum, role: "native_teacher_answer", slot: "teacher-answer" };
const sample = { enabled: true, image: { reference, mediaType: "image/png", sourceWidth: 600, sourceHeight: 2400, altText: "PRIVATE_IMAGE_DESCRIPTION" } };
const activityId = publicationV2Fixture.imageId;
const row = { id: reference.assetId, checksum_sha256: checksum, asset_role: reference.role, object_key: `builder-native-assets/ultimate-b2/ultimate-b2-students-book/${activityId}/assets/teacher-answers/${checksum}.png`, storage_profile: "private", storage_bucket: "private", mime_type: "image/png", byte_size: bytes.length, width: 600, height: 2400, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: activityId, asset_slot: reference.slot } };
function fixture() {
  const sources = createPublicationV2FixtureSources();
  const teacher = sources.native.activities[activityId].teacher;
  teacher.payload.parts[0].solution.sampleAnswer = structuredClone(sample);
  teacher.sha256 = builderDocumentSha256(teacher.payload);
  sources.native.assetRows.push(structuredClone(row));
  return sources;
}
function releaseRow(compiled) {
  return { id: "30000000-0000-4000-8000-000000000001", release_number: 1, compiler_id: compiled.compilerId, release_schema_version: "2.0", runtime_compatibility_sha256: compiled.compatibility, source_snapshot: compiled.sourceSnapshot, source_snapshot_sha256: compiled.sourceSnapshotSha256, public_projection: compiled.publicProjection, public_projection_sha256: compiled.publicProjectionSha256, teacher_projection: compiled.teacherProjection, teacher_projection_sha256: compiled.teacherProjectionSha256, asset_manifest: compiled.assetManifest, release_sha256: compiled.releaseSha256 };
}
test("Image Sample answer is strict private metadata; legacy Image normalizes unchanged", () => {
  assert.deepEqual(normalizeNativeImageSolution({ kind: "image" }), { kind: "image" });
  assert.deepEqual(normalizeNativeImageSolution({ kind: "image", sampleAnswer: sample }).sampleAnswer, sample);
  for (const mutate of [(value) => { value.image.url = "https://example.invalid/answer.png"; }, (value) => { value.image.reference.role = "activity_artwork"; }, (value) => { value.image.mediaType = "image/svg+xml"; }, (value) => { value.image.sourceWidth = 9000; }, (value) => { value.image.altText = ""; }]) {
    const value = structuredClone(sample); mutate(value); assert.throws(() => normalizeNativeImageSolution({ kind: "image", sampleAnswer: value }));
  }
  const pub = fixture().native.activities[activityId].public.payload; pub.assets.push(reference);
  assert.throws(() => resolveNativeActivityKind("image").normalizePublic(pub), /Teacher answer assets/);
  assert.equal(classifyAssetAccess({ asset_role: reference.role, publication_status: "published", access_level: "public" }), "denied");
});
test("private answer manifests verify without entering public projections or ordinary release asset selectors", () => {
  const compiled = compileUltimateB2ComponentReleaseV2(fixture());
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection), /native_teacher_answer|PRIVATE_IMAGE_DESCRIPTION|teacher-answer/);
  assert.equal(compiled.assetManifest.filter((asset) => asset.role === reference.role).length, 1);
  assert.equal(selectComponentReleaseAsset(compiled.assetManifest, checksum, "png"), null);
  const release = releaseRow(compiled); assert.doesNotThrow(() => verifyImmutableComponentRelease(release));
  const forgedLegacy = structuredClone(release);
  forgedLegacy.runtime_compatibility_sha256 = ULTIMATE_B2_PUBLICATION_V2_COMPATIBILITY_VARIANTS.find((variant) => variant.name === "mark-words-expanded").compatibility;
  forgedLegacy.public_projection.compatibility = forgedLegacy.runtime_compatibility_sha256;
  forgedLegacy.public_projection_sha256 = builderDocumentSha256(forgedLegacy.public_projection);
  forgedLegacy.release_sha256 = builderDocumentSha256({ compatibility: forgedLegacy.runtime_compatibility_sha256, sourceSnapshot: forgedLegacy.source_snapshot, publicProjection: forgedLegacy.public_projection, teacherProjection: forgedLegacy.teacher_projection });
  assert.throws(() => verifyImmutableComponentRelease(forgedLegacy), /integrity/);
  release.asset_manifest = release.asset_manifest.filter((asset) => asset.role !== reference.role);
  assert.throws(() => verifyImmutableComponentRelease(release), /integrity/);
  const foreign = fixture(); foreign.native.assetRows.at(-1).source_metadata.native_activity_id = "foreign";
  assert.throws(() => compileUltimateB2ComponentReleaseV2(foreign), /native_activity_asset_invalid/);
});
test("protected raster delivery returns verified bytes and no-store GET/HEAD without redirects", async () => {
  let downloads = 0; const storage = { download: async () => { downloads++; return bytes; } };
  const result = await serveProtectedNativeAnswer({ storage, asset: row });
  assert.equal(result.statusCode, 200); assert.deepEqual(Buffer.from(result.body, "base64"), bytes);
  assert.equal(result.headers["Cache-Control"], "private, no-store"); assert.equal(result.headers.Location, undefined);
  const head = await serveProtectedNativeAnswer({ storage, asset: row, method: "HEAD" }); assert.equal(head.body, ""); assert.equal(downloads, 1);
  await assert.rejects(serveProtectedNativeAnswer({ storage: { download: async () => Buffer.from("tampered") }, asset: row }), /integrity/);
  await assert.rejects(serveProtectedNativeAnswer({ storage, asset: { ...row, asset_role: "activity_artwork" } }), /denied/);
});
test("draft protected bytes require Teacher authorization, exact activity ownership and a private document reference", async () => {
  const sources = fixture(); const scope = { version: 2, view: "activity", releaseId: null, activityId, pageId: null };
  const handler = createBuilderNativePreviewHandler({ getDatabase: () => ({}), inspectAuthorization: (event, request) => ({ authorized: event.headers.teacher === "yes" && request.action === "native-draft-teacher", scope }), loadDocument: async (_, resource) => resource.documentType === "native_activity_index" ? { document: sources.native.index.payload, revision: 1 } : { document: sources.native.activities[activityId][resource.documentType === "native_activity_teacher" ? "teacher" : "public"].payload, revision: 1 }, loadAsset: async () => row, storage: () => ({ download: async () => bytes }), logger: { error() {} } });
  const event = { httpMethod: "GET", headers: { teacher: "yes" }, path: `/builder/preview/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/teacher-assets/${reference.assetId}` };
  assert.equal((await handler(event)).statusCode, 200);
  assert.equal((await handler({ ...event, httpMethod: "HEAD" })).statusCode, 200);
  assert.equal((await handler({ ...event, headers: {} })).statusCode, 401);
  assert.equal((await handler({ ...event, path: event.path.replace("teacher-assets", "assets") })).statusCode, 401);
  row.source_metadata.native_activity_id = "foreign"; assert.equal((await handler(event)).statusCode, 404); row.source_metadata.native_activity_id = activityId;
});
test("pinned answer delivery binds the exact release and frozen protected owner, including after source changes", async () => {
  const release = releaseRow(compileUltimateB2ComponentReleaseV2(fixture())); release.asset_storage_mode = "pinned-source-v1";
  const verified = verifyImmutableComponentRelease(release);
  const pin = { component_release_id: release.id, book_asset_id: row.id, asset_role: row.asset_role, source_asset_role: row.asset_role, checksum_sha256: checksum, extension: "png", media_type: row.mime_type, byte_size: row.byte_size, storage_profile: "private", object_key: row.object_key, source_owner_key: activityId, source_asset_slot: reference.slot };
  const request = { release, verified, activityId, method: "GET", loadPin: async () => pin, storage: { download: async () => bytes } };
  assert.equal((await deliverNativeTeacherAnswer(request)).statusCode, 200);
  await assert.rejects(deliverNativeTeacherAnswer({ ...request, activityId: "foreign" }));
  await assert.rejects(deliverNativeTeacherAnswer({ ...request, sectionId: "foreign" }));
  pin.component_release_id = "foreign"; await assert.rejects(deliverNativeTeacherAnswer(request));
});

test("real signed draft tokens deny anonymous, expired, foreign scope and ordinary asset GET/HEAD", async () => {
  const sources = fixture(); const now = Date.parse("2026-09-06T12:00:00Z");
  const environment = { BUILDER_PREVIEW_AUTH_SECRET: "synthetic-preview-secret-at-least-thirty-two-bytes" };
  let clock = now + 1000;
  const token = (scope = {}) => issueBuilderPreviewAuthorization({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", view: "activity", activityId, pageId: null, releaseId: null, ...scope }, { environment, now, nonce: "abcdefghijklmnopQRSTUV" }).token;
  const handler = createBuilderNativePreviewHandler({ environment, getDatabase: () => ({}), inspectAuthorization: (event, request) => inspectBuilderPreviewAuthorizationScope(event, request, { environment, now: clock }), loadDocument: async (_, resource) => resource.documentType === "native_activity_index" ? { document: sources.native.index.payload, revision: 1 } : { document: sources.native.activities[activityId][resource.documentType === "native_activity_teacher" ? "teacher" : "public"].payload, revision: 1 }, loadAsset: async () => row, storage: () => ({ download: async () => bytes }), logger: { error() {} } });
  for (const method of ["GET", "HEAD"]) {
    const event = { httpMethod: method, path: `/builder/preview/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/activities/${activityId}/teacher-assets/${reference.assetId}`, headers: {}, queryStringParameters: { previewAuthorization: token() } };
    assert.equal((await handler(event)).statusCode, 200);
    for (const authorization of ["", token({ activityId: "ultimate-b2-sb-u1-p1-o997" }), token({ componentSlug: "ultimate-b2-workbook" }), `${token()}tampered`]) assert.equal((await handler({ ...event, queryStringParameters: { previewAuthorization: authorization } })).statusCode, 401);
    assert.equal((await handler({ ...event, path: event.path.replace("teacher-assets", "assets") })).statusCode, 404);
    clock = now + 86400000; assert.equal((await handler(event)).statusCode, 401); clock = now + 1000;
  }
});
