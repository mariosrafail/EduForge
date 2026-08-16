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
  singleChoiceId: "ultimate-b2-sb-u1-p1-o97",
  teacherSentinel: "PHASE_5_PRIVATE_TEACHER_SENTINEL",
  assetChecksum: "a".repeat(64),
  assetId: "10000000-0000-4000-8000-000000000004",
});

const questionId = nativeChildIdFromUuid("q", "10000000-0000-4000-8000-000000000001");
const firstImageId = nativeChildIdFromUuid("img", "10000000-0000-4000-8000-000000000002");
const secondImageId = nativeChildIdFromUuid("img", "10000000-0000-4000-8000-000000000003");
const singleQuestionIds = [nativeChildIdFromUuid("q", "10000000-0000-4000-8000-000000000011"), nativeChildIdFromUuid("q", "10000000-0000-4000-8000-000000000012")];
const singleOptionIds = [
  [nativeChildIdFromUuid("opt", "10000000-0000-4000-8000-000000000021"), nativeChildIdFromUuid("opt", "10000000-0000-4000-8000-000000000022"), nativeChildIdFromUuid("opt", "10000000-0000-4000-8000-000000000023")],
  [nativeChildIdFromUuid("opt", "10000000-0000-4000-8000-000000000024"), nativeChildIdFromUuid("opt", "10000000-0000-4000-8000-000000000025"), nativeChildIdFromUuid("opt", "10000000-0000-4000-8000-000000000026")],
];
const assetReference = Object.freeze({
  assetId: publicationV2Fixture.assetId,
  checksumSha256: publicationV2Fixture.assetChecksum,
  role: "activity_artwork",
  slot: "composition-artwork",
});

function source(payload, revision = 1) {
  return { payload, revision, sha256: builderDocumentSha256(payload) };
}

export function createPublicationV2FixtureSources({ prompt = "Why is an immutable release useful?", teacherAnswer = publicationV2Fixture.teacherSentinel, singleChoiceCorrectOptionIndexes = [1, 2] } = {}) {
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

  const choiceKind = resolveNativeActivityKind("single-choice");
  const choicePublic = choiceKind.createBlankPublic({ activityId: publicationV2Fixture.singleChoiceId, title: "Native Multiple Choice", placement: { pageId: publicationV2Fixture.pageId } });
  choicePublic.metadata.visibleInstructionText = "Choose one answer for each question.";
  choicePublic.parts[0].interaction.questions = [
    { id: singleQuestionIds[0], prompt: "Which release is assigned?", options: singleOptionIds[0].map((id, index) => ({ id, text: ["Latest mutable head", "Pinned immutable release", "Client-selected release"][index] })) },
    { id: singleQuestionIds[1], prompt: "Who owns scoring?", options: singleOptionIds[1].map((id, index) => ({ id, text: ["The browser", "The student", "The server"][index] })) },
  ];
  const choiceTeacher = choiceKind.createBlankTeacher({ activityId: publicationV2Fixture.singleChoiceId });
  choiceTeacher.parts[0].solution.correctAnswers = [
    { questionId: singleQuestionIds[0], correctOptionId: singleOptionIds[0][singleChoiceCorrectOptionIndexes[0]] },
    { questionId: singleQuestionIds[1], correctOptionId: singleOptionIds[1][singleChoiceCorrectOptionIndexes[1]] },
  ];

  const entries = [
    { activityId: publicationV2Fixture.openResponseId, kind: "open-response", placement: { pageId: publicationV2Fixture.pageId }, sortOrder: 1 },
    { activityId: publicationV2Fixture.imageId, kind: "image", placement: { pageId: publicationV2Fixture.pageId }, sortOrder: 2 },
    { activityId: publicationV2Fixture.singleChoiceId, kind: "single-choice", placement: { pageId: publicationV2Fixture.pageId }, sortOrder: 3 },
  ];
  const hotspots = structuredClone(repositoryHotspots);
  hotspots.pages[publicationV2Fixture.pageId].push(
    { id: "hotspot-native-open-response", unitNumber: 1, pageId: publicationV2Fixture.pageId, pageNumber: 5, left: 4, top: 4, width: 12, height: 12, label: "Native Open Response", actionType: "normalized_activity", activityKey: publicationV2Fixture.openResponseId },
    { id: "hotspot-native-image", unitNumber: 1, pageId: publicationV2Fixture.pageId, pageNumber: 5, left: 20, top: 4, width: 12, height: 12, label: "Native Image Composition", actionType: "normalized_activity", activityKey: publicationV2Fixture.imageId },
    { id: "hotspot-native-single-choice", unitNumber: 1, pageId: publicationV2Fixture.pageId, pageNumber: 5, left: 36, top: 4, width: 12, height: 12, label: "Native Multiple Choice", actionType: "normalized_activity", activityKey: publicationV2Fixture.singleChoiceId },
  );
  return {
    documents: { hotspots: source(hotspots, 7), openResponse: {} },
    imports: {},
    native: {
      index: source({ schemaVersion: "1.0", activities: entries }, 2),
      activities: {
        [publicationV2Fixture.openResponseId]: { index: entries[0], public: source(openPublic, 3), teacher: source(openTeacher, 3) },
        [publicationV2Fixture.imageId]: { index: entries[1], public: source(imagePublic, 2), teacher: source(imageTeacher, 2) },
        [publicationV2Fixture.singleChoiceId]: { index: entries[2], public: source(choicePublic, 1), teacher: source(choiceTeacher, 1) },
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
