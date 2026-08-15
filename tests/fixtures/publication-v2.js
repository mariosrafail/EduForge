import repositoryHotspots from "../../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { resolveNativeActivityKind } from "../../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { createNativeOpenResponseQuestion } from "../../src/data/native-activities/nativeOpenResponse.js";
import { nativeChildIdFromUuid } from "../../src/data/native-activities/nativeChildIdentity.js";

export const publicationV2Fixture = Object.freeze({
  pageId: "ub2-sb-unit-1-part-1",
  openResponseId: "ultimate-b2-sb-u1-p1-o99",
  imageId: "ultimate-b2-sb-u1-p1-o98",
  teacherSentinel: "PHASE_5_PRIVATE_TEACHER_SENTINEL",
  assetChecksum: "a".repeat(64),
  assetId: "10000000-0000-4000-8000-000000000004",
});

const questionId = nativeChildIdFromUuid("q", "10000000-0000-4000-8000-000000000001");
const firstImageId = nativeChildIdFromUuid("img", "10000000-0000-4000-8000-000000000002");
const secondImageId = nativeChildIdFromUuid("img", "10000000-0000-4000-8000-000000000003");
const assetReference = Object.freeze({
  assetId: publicationV2Fixture.assetId,
  checksumSha256: publicationV2Fixture.assetChecksum,
  role: "activity_artwork",
  slot: "composition-artwork",
});

function source(payload, revision = 1) {
  return { payload, revision, sha256: builderDocumentSha256(payload) };
}

export function createPublicationV2FixtureSources({ prompt = "Why is an immutable release useful?", teacherAnswer = publicationV2Fixture.teacherSentinel } = {}) {
  const openKind = resolveNativeActivityKind("open-response");
  const openPublic = openKind.createBlankPublic({ activityId: publicationV2Fixture.openResponseId, title: "Native Open Response", placement: { pageId: publicationV2Fixture.pageId } });
  openPublic.metadata.visibleInstructionText = "Write a complete multiline answer.";
  openPublic.parts[0].interaction.questions = [{ ...createNativeOpenResponseQuestion(questionId), prompt }];
  const openTeacher = openKind.createBlankTeacher({ activityId: publicationV2Fixture.openResponseId });
  openTeacher.parts[0].solution.modelAnswers = [{ questionId, text: teacherAnswer }];

  const imageKind = resolveNativeActivityKind("image");
  const imagePublic = imageKind.createBlankPublic({ activityId: publicationV2Fixture.imageId, title: "Native Image Composition", placement: { pageId: publicationV2Fixture.pageId } });
  imagePublic.metadata.visibleInstructionText = "Inspect both composed image layers.";
  imagePublic.assets = [assetReference];
  imagePublic.parts[0].interaction.images = [
    { id: firstImageId, assetSlot: assetReference.slot, area: { x: 40, y: 50, width: 430, height: 300 }, order: 0, altText: "First composed publication layer", decorative: false, fit: "contain", locked: true },
    { id: secondImageId, assetSlot: assetReference.slot, area: { x: 540, y: 190, width: 400, height: 300 }, order: 1, altText: "Second composed publication layer", decorative: false, fit: "cover", locked: true },
  ];
  const imageTeacher = imageKind.createBlankTeacher({ activityId: publicationV2Fixture.imageId });

  const entries = [
    { activityId: publicationV2Fixture.openResponseId, kind: "open-response", placement: { pageId: publicationV2Fixture.pageId }, sortOrder: 1 },
    { activityId: publicationV2Fixture.imageId, kind: "image", placement: { pageId: publicationV2Fixture.pageId }, sortOrder: 2 },
  ];
  const hotspots = structuredClone(repositoryHotspots);
  hotspots.pages[publicationV2Fixture.pageId].push(
    { id: "hotspot-native-open-response", unitNumber: 1, pageId: publicationV2Fixture.pageId, pageNumber: 5, left: 4, top: 4, width: 12, height: 12, label: "Native Open Response", actionType: "normalized_activity", activityKey: publicationV2Fixture.openResponseId },
    { id: "hotspot-native-image", unitNumber: 1, pageId: publicationV2Fixture.pageId, pageNumber: 5, left: 20, top: 4, width: 12, height: 12, label: "Native Image Composition", actionType: "normalized_activity", activityKey: publicationV2Fixture.imageId },
  );
  return {
    documents: { hotspots: source(hotspots, 7), openResponse: {} },
    imports: {},
    native: {
      index: source({ schemaVersion: "1.0", activities: entries }, 2),
      activities: {
        [publicationV2Fixture.openResponseId]: { index: entries[0], public: source(openPublic, 3), teacher: source(openTeacher, 3) },
        [publicationV2Fixture.imageId]: { index: entries[1], public: source(imagePublic, 2), teacher: source(imageTeacher, 2) },
      },
      assetRows: [{
        id: assetReference.assetId,
        checksum_sha256: assetReference.checksumSha256,
        asset_role: assetReference.role,
        object_key: "builder-native-assets/source.png",
        storage_profile: "private",
        storage_bucket: "private",
        mime_type: "image/png",
        byte_size: 68,
        width: 1,
        height: 1,
        publication_status: "draft",
        access_level: "internal",
        source_metadata: { native_activity_id: publicationV2Fixture.imageId, asset_slot: assetReference.slot },
      }],
    },
  };
}

export function compilePublicationV2Fixture(options) {
  return compileUltimateB2ComponentReleaseV2(createPublicationV2FixtureSources(options));
}
