import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertPublicBuilderDocument, builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { nativeChildIdFromUuid } from "../src/data/native-activities/nativeChildIdentity.js";
import {
  assessNativeDragDropReadiness,
  nativeDragDropAssetRequirements,
  normalizeNativeDragDropResponses,
  placeNativeDragDropWord,
  removeNativeDragDropImage,
  removeNativeDragDropPanel,
  removeNativeDragDropResponse,
  removeNativeDragDropWord,
  updateNativeDragDropRevealState,
} from "../src/data/native-activities/nativeDragDrop.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const id = (prefix, suffix) => nativeChildIdFromUuid(prefix, `20000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`);
const activityId = "ultimate-b2-sb-u1-p1-o95";
const wordIds = [id("word", 1), id("word", 2), id("word", 3)];
const panelIds = [id("panel", 11), id("panel", 12)];
const imageIds = [id("img", 21), id("img", 22), id("img", 23)];
const targetIds = [id("target", 31), id("target", 32)];
const assets = [
  { assetId: "20000000-0000-4000-8000-000000000041", checksumSha256: "b".repeat(64), role: "activity_artwork", slot: "drag-panel-shared" },
  { assetId: "20000000-0000-4000-8000-000000000042", checksumSha256: "c".repeat(64), role: "activity_artwork", slot: "drag-panel-overlay" },
];

function pair() {
  const kind = resolveNativeActivityKind("drag-drop");
  const publicDocument = kind.createBlankPublic({ activityId, title: "Drag the words", placement: { pageId: publicationV2Fixture.pageId } });
  const teacherDocument = kind.createBlankTeacher({ activityId });
  publicDocument.assets = structuredClone(assets);
  publicDocument.parts[0].interaction.words = [
    { id: wordIds[0], text: "repeated" },
    { id: wordIds[1], text: "repeated" },
    { id: wordIds[2], text: "distractor" },
  ];
  publicDocument.parts[0].interaction.panels = [
    {
      id: panelIds[0], surface: { width: 1000, height: 600 },
      images: [
        { id: imageIds[0], assetSlot: assets[0].slot, area: { x: 0, y: 0, width: 1000, height: 600 }, order: 0, altText: "First scene", decorative: false, fit: "cover", locked: true },
        { id: imageIds[1], assetSlot: assets[1].slot, area: { x: 100, y: 80, width: 300, height: 200 }, order: 1, altText: "Overlay", decorative: false, fit: "contain", locked: false },
      ],
      dropTargets: [{ id: targetIds[0], area: { x: 80, y: 420, width: 220, height: 80 }, accessibleLabel: "First sentence blank" }],
    },
    {
      id: panelIds[1], surface: { width: 1000, height: 600 },
      images: [{ id: imageIds[2], assetSlot: assets[0].slot, area: { x: 0, y: 0, width: 1000, height: 600 }, order: 0, altText: "Second scene", decorative: false, fit: "contain", locked: false }],
      dropTargets: [{ id: targetIds[1], area: { x: 600, y: 350, width: 250, height: 90 }, accessibleLabel: "Second sentence blank" }],
    },
  ];
  teacherDocument.parts[0].solution.mappings = [{ targetId: targetIds[0], wordId: wordIds[1] }, { targetId: targetIds[1], wordId: wordIds[0] }];
  return { kind, publicDocument, teacherDocument };
}

test("Drag & Drop blank pair and complete pair normalize strictly with Teacher-only mappings", () => {
  const kind = resolveNativeActivityKind("drag-drop");
  const blankPublic = kind.createBlankPublic({ activityId, title: "Blank", placement: { pageId: publicationV2Fixture.pageId } });
  const blankTeacher = kind.createBlankTeacher({ activityId });
  assert.equal(kind.validatePair(blankPublic, blankTeacher), true);
  assert.deepEqual(kind.assessReadiness(blankPublic, blankTeacher), { ready: false, issues: ["Add at least one draggable word.", "Add at least one visual panel."] });

  const current = pair();
  const publicDocument = current.kind.normalizePublic(current.publicDocument, activityId);
  const teacherDocument = current.kind.normalizeTeacher(current.teacherDocument, activityId);
  assert.equal(current.kind.validatePair(publicDocument, teacherDocument), true);
  assert.deepEqual(assessNativeDragDropReadiness(publicDocument, teacherDocument), { ready: true, issues: [] });
  assert.doesNotThrow(() => assertPublicBuilderDocument(publicDocument));
  assert.doesNotMatch(JSON.stringify(publicDocument), /mappings|correctWordId|answerKey|solution|isCorrect/i);
  assert.match(JSON.stringify(teacherDocument), /mappings/);
  assert.equal(publicDocument.parts[0].interaction.words[0].text, publicDocument.parts[0].interaction.words[1].text, "duplicate visible text is legal for distinct instances");
  assert.equal(teacherDocument.parts[0].solution.mappings.some((mapping) => mapping.wordId === wordIds[2]), false, "extra bank words are legal distractors");
});

test("public word and target ordering cannot encode the private stable-ID answer", () => {
  const current = pair();
  current.publicDocument.parts[0].interaction.words.reverse();
  current.publicDocument.parts[0].interaction.panels.reverse();
  current.publicDocument.parts[0].interaction.panels.forEach((panel) => panel.dropTargets.reverse());
  assert.equal(current.kind.validatePair(current.publicDocument, current.teacherDocument), true);
  assert.deepEqual(new Map(current.teacherDocument.parts[0].solution.mappings.map((mapping) => [mapping.targetId, mapping.wordId])), new Map([[targetIds[0], wordIds[1]], [targetIds[1], wordIds[0]]]));
});

test("Drag & Drop rejects unknown fields, invalid geometry, duplicate identities, and invalid mapping topology", () => {
  const extra = pair(); extra.publicDocument.parts[0].interaction.answerKey = [];
  assert.throws(() => extra.kind.normalizePublic(extra.publicDocument), /unknown fields/);
  const outside = pair(); outside.publicDocument.parts[0].interaction.panels[0].dropTargets[0].area.x = 900;
  assert.throws(() => outside.kind.normalizePublic(outside.publicDocument), /inside/);
  const duplicate = pair(); duplicate.publicDocument.parts[0].interaction.panels[1].dropTargets[0].id = targetIds[0];
  assert.throws(() => duplicate.kind.normalizePublic(duplicate.publicDocument), /duplicate/);
  const dangling = pair(); dangling.teacherDocument.parts[0].solution.mappings[0].wordId = id("word", 999);
  assert.throws(() => dangling.kind.validatePair(dangling.publicDocument, dangling.teacherDocument), /exactly one private stable-ID mapping/);
  const reused = pair(); reused.teacherDocument.parts[0].solution.mappings[1].wordId = reused.teacherDocument.parts[0].solution.mappings[0].wordId;
  assert.throws(() => reused.kind.normalizeTeacher(reused.teacherDocument), /reused/);
  const missing = pair(); missing.teacherDocument.parts[0].solution.mappings.pop();
  assert.throws(() => missing.kind.validatePair(missing.publicDocument, missing.teacherDocument), /exactly one/);
});

test("managed image requirements close every layer once and canonical removals retain shared assets", () => {
  const current = pair();
  assert.deepEqual(nativeDragDropAssetRequirements(current.publicDocument).map((entry) => entry.slot), [assets[0].slot, assets[1].slot]);
  removeNativeDragDropImage(current.publicDocument, panelIds[0], imageIds[1]);
  assert.deepEqual(current.publicDocument.assets.map((asset) => asset.slot), [assets[0].slot]);
  removeNativeDragDropPanel(current.publicDocument, current.teacherDocument, panelIds[0]);
  assert.deepEqual(current.publicDocument.assets.map((asset) => asset.slot), [assets[0].slot], "shared panel artwork remains referenced");
  assert.deepEqual(current.teacherDocument.parts[0].solution.mappings, [{ targetId: targetIds[1], wordId: wordIds[0] }]);
  removeNativeDragDropWord(current.publicDocument, current.teacherDocument, wordIds[0]);
  assert.deepEqual(current.teacherDocument.parts[0].solution.mappings, []);
});

test("controlled response helpers place, move, displace, remove, and sanitize one word instance", () => {
  const current = pair();
  assert.deepEqual(normalizeNativeDragDropResponses({ [targetIds[0]]: wordIds[0], [targetIds[1]]: wordIds[0], unknown: wordIds[2] }, current.publicDocument), { [targetIds[0]]: wordIds[0] });
  let responses = placeNativeDragDropWord({}, targetIds[0], wordIds[0]);
  responses = placeNativeDragDropWord(responses, targetIds[1], wordIds[0]);
  assert.deepEqual(responses, { [targetIds[1]]: wordIds[0] }, "moving a word clears its old target");
  responses = placeNativeDragDropWord(responses, targetIds[1], wordIds[1]);
  assert.deepEqual(responses, { [targetIds[1]]: wordIds[1] }, "placing into an occupied target displaces its old word");
  assert.deepEqual(removeNativeDragDropResponse(responses, targetIds[1]), {});
});

test("Teacher reveal state supports individual, next, all, reset, and idempotent actions", () => {
  let revealed = updateNativeDragDropRevealState(new Set(), targetIds, { targetId: targetIds[1] });
  assert.deepEqual([...revealed], [targetIds[1]]);
  assert.equal(updateNativeDragDropRevealState(revealed, targetIds, { targetId: targetIds[1] }), revealed);
  revealed = updateNativeDragDropRevealState(revealed, targetIds, "show-next");
  assert.deepEqual(new Set(revealed), new Set(targetIds));
  assert.equal(updateNativeDragDropRevealState(revealed, targetIds, "show-all"), revealed);
  assert.deepEqual([...updateNativeDragDropRevealState(revealed, targetIds, "reset-activity")], []);
});

function source(payload, revision = 1) { return { payload, revision, sha256: builderDocumentSha256(payload) }; }

test("publication v2 separates mappings and closes every Drag & Drop image asset", () => {
  const current = pair(); const sources = createPublicationV2FixtureSources();
  const entry = { activityId, kind: "drag-drop", placement: { pageId: publicationV2Fixture.pageId }, sortOrder: 4 };
  sources.native.index.payload.activities.push(entry); sources.native.index = source(sources.native.index.payload, sources.native.index.revision);
  sources.native.activities[activityId] = { index: entry, public: source(current.publicDocument), teacher: source(current.teacherDocument) };
  sources.native.assetRows.push(...assets.map((asset, index) => ({ id: asset.assetId, checksum_sha256: asset.checksumSha256, asset_role: asset.role, object_key: `builder-native-assets/drag-${index}.png`, storage_profile: "private", storage_bucket: "private", mime_type: "image/png", byte_size: 100, width: 1000, height: 600, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: activityId, asset_slot: asset.slot } })));
  sources.documents.hotspots.payload.pages[publicationV2Fixture.pageId].push({ id: "hotspot-native-drag-drop-test", unitNumber: 1, pageId: publicationV2Fixture.pageId, pageNumber: 5, left: 68, top: 4, width: 12, height: 12, label: "Drag and Drop", actionType: "normalized_activity", activityKey: activityId });
  sources.documents.hotspots = source(sources.documents.hotspots.payload, sources.documents.hotspots.revision);
  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  const published = compiled.publicProjection.nativeActivities[activityId].document;
  assert.deepEqual(published.parts[0].interaction.panels.map((panel) => panel.images.length), [2, 1]);
  assert.doesNotMatch(JSON.stringify(published), /mappings|solution/);
  assert.match(JSON.stringify(compiled.teacherProjection.nativeActivities[activityId]), /mappings/);
  assert.deepEqual(compiled.assetManifest.filter((asset) => asset.role === "activity_artwork" && ["b", "c"].includes(asset.sha256[0])).map((asset) => asset.sha256).sort(), ["b".repeat(64), "c".repeat(64)]);
});

test("Builder and web/Android runtimes expose managed panels, controlled responses, pointer and keyboard paths", async () => {
  const [editor, surface, runner, androidProvider, publicContract] = await Promise.all([
    readFile(new URL("../src/apps/book-builder/hosted/NativeDragDropEditor.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-drag-drop/NativeDragDropSurface.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/lms/activities/ultimate-b2/PublishedNativeActivityRunner.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/apps/android-teacher-offline/hostedNativeDraftProvider.js", import.meta.url), "utf8"),
    readFile(new URL("../src/data/native-activities/nativeActivityPublic.js", import.meta.url), "utf8"),
  ]);
  assert.match(editor, /Add Background/); assert.match(editor, /Add Image/); assert.match(editor, /Replace image/); assert.match(editor, /Draw Drop Target/); assert.match(editor, /Teacher-only correct mappings/); assert.match(editor, /Move panel/); assert.match(editor, /Remove this word and its private target mapping/);
  assert.doesNotMatch(await readFile(new URL("../src/components/native-drag-drop/nativeDragDrop.css", import.meta.url), "utf8"), /\d+(?:\.\d+)?vh\b/, "activity sizing must be based on its container rather than the browser viewport");
  assert.match(surface, /onPointerDown/); assert.match(surface, /elementFromPoint/); assert.match(surface, /selectedWordId/); assert.match(surface, /Delete/); assert.match(surface, /initialResponses/); assert.match(surface, /onResponsesChange/); assert.match(surface, /readOnly/);
  assert.match(runner, /NativeDragDropStudentSurface/); assert.match(runner, /NativeDragDropTeacherSurface/);
  assert.match(androidProvider, /"drag-drop"/); assert.match(androidProvider, /normalizeNativeRuntimeTeacherDocument/);
  assert.match(publicContract, /interaction\?\.panels\?\.some\(\(panel\) => panel\.images/);
  assert.doesNotMatch(surface, /data-(?:answer|correct|mapping)/i);
});
