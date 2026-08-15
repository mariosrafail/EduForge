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
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection), /TEACHER_SENTINEL_5_PRIVATE/);
  assert.match(JSON.stringify(compiled.teacherProjection), /TEACHER_SENTINEL_5_PRIVATE/);
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
