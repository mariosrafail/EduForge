import assert from "node:assert/strict";
import test from "node:test";

import repositoryHotspots from "../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2, NativePublicationError } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { createNativeOpenResponseQuestion } from "../src/data/native-activities/nativeOpenResponse.js";
import { nativeChildIdFromUuid } from "../src/data/native-activities/nativeChildIdentity.js";

const pageId = "ub2-sb-unit-1-part-1";
const openId = "ultimate-b2-sb-u1-p1-o99";
const imageId = "ultimate-b2-sb-u1-p1-o98";
const q1 = nativeChildIdFromUuid("q", "10000000-0000-4000-8000-000000000001");
const assetReference = { assetId: "10000000-0000-4000-8000-000000000004", checksumSha256: "a".repeat(64), role: "activity_artwork", slot: "asset-image" };

function source(payload, revision = 1) { return { payload, revision, sha256: builderDocumentSha256(payload) }; }

function openPair() {
  const kind = resolveNativeActivityKind("open-response");
  const publicDocument = kind.createBlankPublic({ activityId: openId, title: "Published native response", placement: { pageId } });
  publicDocument.metadata.visibleInstructionText = "Write a complete answer.";
  publicDocument.parts[0].interaction.questions = [{ ...createNativeOpenResponseQuestion(q1), prompt: "Why is publication immutable?" }];
  const teacherDocument = kind.createBlankTeacher({ activityId: openId });
  teacherDocument.parts[0].solution.modelAnswers = [{ questionId: q1, text: "TEACHER_SENTINEL_5_PRIVATE" }];
  return { publicDocument, teacherDocument };
}

function imagePair() {
  const kind = resolveNativeActivityKind("image");
  const publicDocument = kind.createBlankPublic({ activityId: imageId, title: "Published image composition", placement: { pageId } });
  publicDocument.assets = [assetReference];
  publicDocument.parts[0].interaction.contentText = "Public learner notice\nSecond line";
  publicDocument.parts[0].interaction.images = [{ id: `img-${"a".repeat(32)}`, assetSlot: assetReference.slot, area: { x: 20, y: 30, width: 400, height: 260 }, order: 0, altText: "A publication diagram", decorative: false, fit: "contain", locked: true }];
  return { publicDocument, teacherDocument: kind.createBlankTeacher({ activityId: imageId }) };
}

function manifest(ids = [openId, imageId]) {
  const value = structuredClone(repositoryHotspots);
  value.pages[pageId] ||= [];
  ids.forEach((activityId, index) => value.pages[pageId].push({ id: `hotspot-native-${index}`, unitNumber: 1, pageId, pageNumber: 5, left: 2 + index * 12, top: 2, width: 10, height: 10, label: `Native ${index + 1}`, actionType: "normalized_activity", activityKey: activityId }));
  return value;
}

function sources({ ids = [openId, imageId], incompleteUnreferenced = false } = {}) {
  const open = openPair();
  const image = imagePair();
  const entries = [
    { activityId: openId, kind: "open-response", placement: { pageId }, sortOrder: 1 },
    { activityId: imageId, kind: "image", placement: { pageId }, sortOrder: 2 },
  ];
  const indexPayload = { schemaVersion: "1.0", activities: entries };
  const activities = {
    [openId]: { index: entries[0], public: source(open.publicDocument, 3), teacher: source(open.teacherDocument, 3) },
    [imageId]: { index: entries[1], public: source(image.publicDocument, 2), teacher: source(image.teacherDocument, 2) },
  };
  if (incompleteUnreferenced) {
    activities[imageId].public.payload.parts[0].interaction.images = [];
    activities[imageId].public.payload.assets = [];
    activities[imageId].public.sha256 = builderDocumentSha256(activities[imageId].public.payload);
  }
  return {
    documents: { hotspots: source(manifest(ids), 7), openResponse: {} },
    imports: {},
    native: {
      index: source(indexPayload, 2),
      activities,
      assetRows: [{ id: assetReference.assetId, checksum_sha256: assetReference.checksumSha256, asset_role: assetReference.role, object_key: "builder-native-assets/source.png", storage_profile: "private", storage_bucket: "private", mime_type: "image/png", byte_size: 100, width: 20, height: 20, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: imageId, asset_slot: assetReference.slot } }],
    },
  };
}

test("v2 compiles only hotspot-reachable native pairs into strict public and Teacher projections", () => {
  const compiled = compileUltimateB2ComponentReleaseV2(sources());
  assert.equal(compiled.compilerId, "ultimate-b2-students-book-v2");
  assert.equal(compiled.releaseSchemaVersion, "2.0");
  assert.deepEqual(Object.keys(compiled.publicProjection.nativeActivities), [imageId, openId].sort());
  assert.deepEqual(Object.keys(compiled.teacherProjection.nativeActivities), [imageId, openId].sort());
  assert.equal(compiled.sourceSnapshot.nativeActivities[openId].public.revision, 3);
  assert.equal(compiled.assetManifest.filter((asset) => asset.role === "activity_artwork").length, 1);
  assert.equal(compiled.publicProjection.nativeActivities[imageId].document.parts[0].interaction.contentText, "Public learner notice\nSecond line");
  assert.doesNotMatch(JSON.stringify(compiled.teacherProjection.nativeActivities[imageId]), /Public learner notice/);
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection), /TEACHER_SENTINEL_5_PRIVATE/);
  assert.match(JSON.stringify(compiled.teacherProjection), /TEACHER_SENTINEL_5_PRIVATE/);
});

test("v2 validates and materializes a public Readable Text image without Builder preview URLs", () => {
  const input = sources({ ids: [openId] });
  const publicDocument = input.native.activities[openId].public.payload;
  const readableAsset = { assetId: "10000000-0000-4000-8000-000000000044", checksumSha256: "c".repeat(64), role: "activity_artwork", slot: "readable-text" };
  const audioAsset = { assetId: "10000000-0000-4000-8000-000000000045", checksumSha256: "d".repeat(64), role: "activity_artwork", slot: "audio-one" };
  const videoAsset = { assetId: "10000000-0000-4000-8000-000000000046", checksumSha256: "e".repeat(64), role: "activity_artwork", slot: "video-one" };
  const worksheetAsset = { assetId: "10000000-0000-4000-8000-000000000047", checksumSha256: "f".repeat(64), role: "activity_artwork", slot: "worksheet-one" };
  publicDocument.assets = [readableAsset, audioAsset, videoAsset, worksheetAsset];
  publicDocument.readableText = { kind: "image", assetSlot: readableAsset.slot, sourceWidth: 1000, sourceHeight: 1800, altText: "Public reading passage" };
  publicDocument.audioTextHotspots = { hotspots: [{ id: `aud-${"1".repeat(32)}`, panelId: null, activityArea: { x: 20, y: 20, width: 48, height: 48 }, readableFocusArea: { x: 50, y: 100, width: 800, height: 400 }, audioAssetSlot: audioAsset.slot, label: "Listen to paragraph one", highlightColor: "green" }] };
  publicDocument.video = { kind: "managed-mp4", assetSlot: videoAsset.slot, fileName: "companion.mp4", byteSize: 136_517, durationMs: 5_840, cues: [{ id: `cue-${"2".repeat(32)}`, startMs: 0, endMs: 5_000, text: "Public subtitle" }], worksheet: { assetSlot: worksheetAsset.slot, fileName: "video-worksheet.pdf", byteSize: 412 } };
  input.native.activities[openId].public.sha256 = builderDocumentSha256(publicDocument);
  input.native.assetRows.push({ id: readableAsset.assetId, checksum_sha256: readableAsset.checksumSha256, asset_role: readableAsset.role, object_key: "builder-native-assets/readable.png", storage_profile: "private", storage_bucket: "private", mime_type: "image/png", byte_size: 200, width: 1000, height: 1800, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: openId, asset_slot: readableAsset.slot } });
  input.native.assetRows.push({ id: audioAsset.assetId, checksum_sha256: audioAsset.checksumSha256, asset_role: audioAsset.role, object_key: "builder-native-assets/audio.mp3", storage_profile: "private", storage_bucket: "private", mime_type: "audio/mpeg", byte_size: 300, width: null, height: null, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: openId, asset_slot: audioAsset.slot } });
  input.native.assetRows.push({ id: videoAsset.assetId, checksum_sha256: videoAsset.checksumSha256, asset_role: videoAsset.role, object_key: "builder-native-assets/video.mp4", storage_profile: "private", storage_bucket: "private", mime_type: "video/mp4", byte_size: 136_517, width: null, height: null, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: openId, asset_slot: videoAsset.slot } });
  input.native.assetRows.push({ id: worksheetAsset.assetId, checksum_sha256: worksheetAsset.checksumSha256, asset_role: worksheetAsset.role, object_key: "builder-native-assets/video-worksheet.pdf", storage_profile: "private", storage_bucket: "private", mime_type: "application/pdf", byte_size: 412, width: null, height: null, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: openId, asset_slot: worksheetAsset.slot } });

  const compiled = compileUltimateB2ComponentReleaseV2(input);
  assert.deepEqual(compiled.publicProjection.nativeActivities[openId].document.readableText, publicDocument.readableText);
  assert.deepEqual(compiled.publicProjection.nativeActivities[openId].document.audioTextHotspots, publicDocument.audioTextHotspots);
  assert.deepEqual(compiled.publicProjection.nativeActivities[openId].document.video, publicDocument.video);
  assert.equal(compiled.nativeAssetSources.some((asset) => asset.row.object_key.endsWith("readable.png")), true);
  assert.equal(compiled.nativeAssetSources.some((asset) => asset.descriptor.extension === "mp3" && asset.descriptor.mediaType === "audio/mpeg"), true);
  assert.equal(compiled.nativeAssetSources.some((asset) => asset.descriptor.extension === "mp4" && asset.descriptor.mediaType === "video/mp4"), true);
  assert.equal(compiled.nativeAssetSources.some((asset) => asset.descriptor.extension === "pdf" && asset.descriptor.mediaType === "application/pdf"), true);
  assert.equal(compiled.assetManifest.filter((asset) => asset.sha256 === worksheetAsset.checksumSha256).length, 1);
  assert.equal(compiled.assetManifest.some((asset) => asset.sha256 === readableAsset.checksumSha256 && asset.role === "activity_artwork"), true);
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection), /builder\/api|TEACHER_SENTINEL_5_PRIVATE/);

  const mismatch = structuredClone(input);
  mismatch.native.assetRows.find((row) => row.id === readableAsset.assetId).height = 1799;
  assert.throws(() => compileUltimateB2ComponentReleaseV2(mismatch), (error) => error.code === "native_activity_asset_invalid" && error.issues.includes("Readable Text dimensions do not match the managed asset."));

  const audioMismatch = structuredClone(input);
  audioMismatch.native.assetRows.find((row) => row.id === audioAsset.assetId).mime_type = "image/png";
  assert.throws(() => compileUltimateB2ComponentReleaseV2(audioMismatch), (error) => error.code === "native_activity_asset_invalid" && error.issues.some((issue) => issue.includes("media type")));

  const videoMismatch = structuredClone(input);
  videoMismatch.native.assetRows.find((row) => row.id === videoAsset.assetId).byte_size += 1;
  assert.throws(() => compileUltimateB2ComponentReleaseV2(videoMismatch), (error) => error.code === "native_activity_asset_invalid" && error.issues.some((issue) => issue.includes("byte size")));

  const worksheetMismatch = structuredClone(input);
  worksheetMismatch.native.assetRows.find((row) => row.id === worksheetAsset.assetId).mime_type = "text/html";
  assert.throws(() => compileUltimateB2ComponentReleaseV2(worksheetMismatch), (error) => error.code === "native_activity_asset_invalid" && !JSON.stringify(error).includes("TEACHER_SENTINEL"));
});

test("unreferenced incomplete native drafts do not block v2 publication", () => {
  const compiled = compileUltimateB2ComponentReleaseV2(sources({ ids: [openId], incompleteUnreferenced: true }));
  assert.deepEqual(Object.keys(compiled.publicProjection.nativeActivities), [openId]);
  assert.equal(compiled.assetManifest.some((asset) => asset.role === "activity_artwork"), false);
});

test("referenced readiness, pair, target, and asset failures are safe and deterministic", () => {
  const incomplete = sources({ ids: [openId] });
  incomplete.native.activities[openId].public.payload.parts[0].interaction.questions = [];
  incomplete.native.activities[openId].teacher.payload.parts[0].solution.modelAnswers = [];
  assert.throws(() => compileUltimateB2ComponentReleaseV2(incomplete), (error) => error instanceof NativePublicationError && error.code === "native_activity_not_ready" && !JSON.stringify(error).includes("TEACHER_SENTINEL"));

  const wrongAsset = sources({ ids: [imageId] });
  wrongAsset.native.assetRows[0].source_metadata.native_activity_id = openId;
  assert.throws(() => compileUltimateB2ComponentReleaseV2(wrongAsset), (error) => error.code === "native_activity_asset_invalid");

  const ambiguous = sources({ ids: ["ultimate-b2-sb-u1-p1-o1"] });
  const pair = openPair(); pair.publicDocument.activityId = "ultimate-b2-sb-u1-p1-o1"; pair.teacherDocument.activityId = "ultimate-b2-sb-u1-p1-o1";
  ambiguous.native.index.payload.activities = [{ activityId: "ultimate-b2-sb-u1-p1-o1", kind: "open-response", placement: { pageId }, sortOrder: 1 }];
  ambiguous.native.activities = { "ultimate-b2-sb-u1-p1-o1": { index: ambiguous.native.index.payload.activities[0], public: source(pair.publicDocument), teacher: source(pair.teacherDocument) } };
  assert.throws(() => compileUltimateB2ComponentReleaseV2(ambiguous), (error) => error.code === "native_activity_pair_invalid");
});

test("v2 publication rejects a future native kind at its frozen capability boundary", () => {
  const future = sources({ ids: [openId] });
  future.native.index.payload.activities[0].kind = "future-native-kind";
  future.native.activities[openId].index.kind = "future-native-kind";
  future.native.index.sha256 = builderDocumentSha256(future.native.index.payload);
  assert.throws(
    () => compileUltimateB2ComponentReleaseV2(future),
    (error) => error instanceof NativePublicationError
      && error.code === "native_activity_pair_invalid"
      && error.issues.every((issue) => !issue.includes("TEACHER_SENTINEL")),
  );
});
