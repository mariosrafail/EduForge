import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertPublicBuilderDocument, builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { addNativeCompleteSentencesItem, addNextNativeCompleteSentencesHotspot, alignNativeCompleteSentencesAnswers, createNativeCompleteSentencesHotspotArea, createNativeCompleteSentencesPanel, findNextUnusedNativeCompleteSentencesItemId, nativeCompleteSentencesMarkedSentence, parseNativeCompleteSentencesMarkedSentence, removeNativeCompleteSentencesItem, removeNativeCompleteSentencesPanel, replaceNativeCompleteSentencesBackground } from "../src/data/native-activities/nativeCompleteSentencesAuthoring.js";
import { assessNativeCompleteSentencesReadiness, assessNativeCompleteSentencesSaveability, NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN, NATIVE_COMPLETE_SENTENCES_DEFAULT_HOTSPOT_PRESENTATION, NATIVE_COMPLETE_SENTENCES_LEGACY_PANEL_ID, nativeCompleteSentencesFontFamilyAlias, nativeCompleteSentencesPromptParts, normalizeNativeCompleteSentencesInteraction, updateNativeCompleteSentencesRevealState } from "../src/data/native-activities/nativeCompleteSentences.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const activityId = "ultimate-b2-sb-u1-p1-o96";
const asset = { assetId: "10000000-0000-4000-8000-000000000096", checksumSha256: "b".repeat(64), role: "activity_artwork", slot: "sentence-background" };
const fontAsset = { assetId: "20000000-0000-4000-8000-000000000096", checksumSha256: "c".repeat(64), role: "activity_font", slot: "font-20000000000040008000000000000096" };
let child = 100;
const createId = (prefix) => `${prefix}-${String(child++).padStart(32, "0")}`;
const source = (payload, revision = 1) => ({ payload, revision, sha256: builderDocumentSha256(payload) });

function completePair() {
  child = 100;
  const kind = resolveNativeActivityKind("complete-sentences");
  const publicDocument = kind.createBlankPublic({ activityId, title: "Complete the Sentences", placement: { pageId: publicationV2Fixture.pageId } });
  const teacherDocument = kind.createBlankTeacher({ activityId });
  const first = addNativeCompleteSentencesItem(publicDocument, teacherDocument, createId);
  const second = addNativeCompleteSentencesItem(publicDocument, teacherDocument, createId);
  publicDocument.parts[0].interaction.items[0].prompt = "I spent the weekend _____ the series.";
  publicDocument.parts[0].interaction.items[1].prompt = "The final _____ was surprising.";
  teacherDocument.parts[0].solution.answers[0].text = "catching up on";
  teacherDocument.parts[0].solution.answers[1].text = "episode";
  publicDocument.assets = [asset];
  Object.assign(publicDocument.parts[0].interaction.presentation.panels[0], { backgroundAssetSlot: asset.slot, sourceWidth: 1200, sourceHeight: 800, hotspots: [
    { id: createId("hot"), itemId: first, area: { x: 100, y: 100, width: 260, height: 52 } },
    { id: createId("hot"), itemId: second, area: { x: 500, y: 240, width: 220, height: 52 } },
  ] });
  return { kind, publicDocument, teacherDocument, first, second };
}

test("Complete the Sentences keeps stable items and phrase answers exclusively Teacher-private", () => {
  const pair = completePair();
  assert.equal(pair.kind.validatePair(pair.publicDocument, pair.teacherDocument), true);
  assert.equal(pair.kind.assessReadiness(pair.publicDocument, pair.teacherDocument).ready, true);
  assert.doesNotThrow(() => assertPublicBuilderDocument(pair.publicDocument));
  assert.doesNotMatch(JSON.stringify(pair.publicDocument), /catching up on|episode|correctAnswer|answerKey|solution/);
  assert.match(JSON.stringify(pair.teacherDocument), /catching up on/);
  const ids = pair.publicDocument.parts[0].interaction.items.map((item) => item.id);
  [pair.publicDocument.parts[0].interaction.items[0], pair.publicDocument.parts[0].interaction.items[1]] = [pair.publicDocument.parts[0].interaction.items[1], pair.publicDocument.parts[0].interaction.items[0]];
  alignNativeCompleteSentencesAnswers(pair.publicDocument, pair.teacherDocument);
  assert.deepEqual(pair.publicDocument.parts[0].interaction.items.map((item) => item.id), [...ids].reverse());
  assert.deepEqual(pair.teacherDocument.parts[0].solution.answers.map((answer) => answer.itemId), [...ids].reverse());
  removeNativeCompleteSentencesItem(pair.publicDocument, pair.teacherDocument, pair.first);
  assert.equal(pair.teacherDocument.parts[0].solution.answers.some((answer) => answer.itemId === pair.first), false);
  assert.equal(pair.publicDocument.parts[0].interaction.presentation.panels[0].hotspots.some((hotspot) => hotspot.itemId === pair.first), false);
});

test("legacy hotspots receive deterministic safe typography and authored presentation round-trips publicly", () => {
  const { publicDocument } = completePair();
  const canonical = publicDocument.parts[0].interaction;
  const panel = canonical.presentation.panels[0];
  const legacy = { ...canonical, presentation: { kind: "image-hotspot", backgroundAssetSlot: panel.backgroundAssetSlot, sourceWidth: panel.sourceWidth, sourceHeight: panel.sourceHeight, hotspots: panel.hotspots } };
  const normalizedLegacy = normalizeNativeCompleteSentencesInteraction(legacy, { assets: publicDocument.assets });
  assert.equal(normalizedLegacy.presentation.panels[0].id, NATIVE_COMPLETE_SENTENCES_LEGACY_PANEL_ID);
  assert.deepEqual(normalizedLegacy.presentation.answerStyle, NATIVE_COMPLETE_SENTENCES_DEFAULT_HOTSPOT_PRESENTATION);
  assert.equal(Object.hasOwn(normalizedLegacy.presentation.panels[0].hotspots[0], "presentation"), false);
  legacy.presentation.hotspots[0].presentation = { fontSize: 240, color: "#E40083" };
  const authored = normalizeNativeCompleteSentencesInteraction(legacy, { assets: publicDocument.assets });
  assert.deepEqual(authored.presentation.answerStyle, { fontSize: 240, color: "#e40083", fontAssetSlot: null });
  assert.doesNotMatch(JSON.stringify(authored.presentation.panels[0].hotspots[0]), /catching up on|correct|answer/i);
  for (const presentation of [{ fontSize: 0, color: "#12304b" }, { fontSize: -10, color: "#12304b" }, { fontSize: Number.POSITIVE_INFINITY, color: "#12304b" }, { fontSize: 21, color: "red" }, { fontSize: 21, color: "url(javascript:1)" }]) {
    const invalid = structuredClone(legacy); invalid.presentation.hotspots[0].presentation = presentation;
    assert.throws(() => normalizeNativeCompleteSentencesInteraction(invalid, { assets: publicDocument.assets }));
  }
});

test("one-field sentence syntax extracts one private answer and an answer-neutral blank", () => {
  assert.deepEqual(parseNativeCompleteSentencesMarkedSentence("I live in *New York City*."), { valid: true, prompt: `I live in ${NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN}.`, answer: "New York City" });
  assert.deepEqual(parseNativeCompleteSentencesMarkedSentence("*  more than one word  * after"), { valid: true, prompt: `${NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN} after`, answer: "more than one word" });
  for (const invalid of ["No answer", "Unmatched *answer", "Empty ** answer", "*one* and *two*", `Reserved ${NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN} *answer*`]) assert.equal(parseNativeCompleteSentencesMarkedSentence(invalid).valid, false);
  const roundTrip = nativeCompleteSentencesMarkedSentence(`Before ${NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN} after.`, "same answer");
  assert.equal(roundTrip, "Before *same answer* after.");
  assert.deepEqual(nativeCompleteSentencesPromptParts(`Before ${NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN} after.`), { before: "Before ", after: " after.", structured: true });
  const multipleTokens = completePair();
  multipleTokens.publicDocument.parts[0].interaction.items[0].prompt = `${NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN} then ${NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN}`;
  assert.throws(() => multipleTokens.kind.validatePair(multipleTokens.publicDocument, multipleTokens.teacherDocument), /only one blank token/);
});

test("Complete the Sentences readiness requires explicit answer, background, and exactly one blank hotspot", () => {
  const { kind, publicDocument, teacherDocument } = completePair();
  teacherDocument.parts[0].solution.answers[0].text = "";
  publicDocument.parts[0].interaction.presentation.panels[0].hotspots.pop();
  publicDocument.assets = [];
  publicDocument.parts[0].interaction.presentation.panels[0].backgroundAssetSlot = "";
  assert.deepEqual(kind.assessReadiness(publicDocument, teacherDocument).ready, false);
  assert.match(kind.assessReadiness(publicDocument, teacherDocument).issues.join(" "), /private correct word or phrase/);
  assert.match(kind.assessReadiness(publicDocument, teacherDocument).issues.join(" "), /managed background image/);
  assert.match(kind.assessReadiness(publicDocument, teacherDocument).issues.join(" "), /blank hotspot/);
});

test("Complete the Sentences preserves legacy answers and validates explicit exact alternatives privately", () => {
  const kind = resolveNativeActivityKind("complete-sentences");
  const legacy = completePair();
  const legacyNormalized = kind.normalizeTeacher(legacy.teacherDocument, activityId);
  assert.deepEqual(legacyNormalized.parts[0].solution.answers[0], { itemId: legacy.teacherDocument.parts[0].solution.answers[0].itemId, text: "catching up on" });
  assert.equal(Object.hasOwn(kind.normalizePublic(legacy.publicDocument, activityId).parts[0].interaction, "evaluationMode"), false);

  const current = completePair();
  current.publicDocument.parts[0].interaction.evaluationMode = "exact-answer";
  current.teacherDocument.parts[0].solution.answers[0] = {
    itemId: current.teacherDocument.parts[0].solution.answers[0].itemId,
    text: "catching up/catching up on",
    acceptedTexts: ["catching up", "catching up on"],
  };
  assert.equal(kind.validatePair(current.publicDocument, current.teacherDocument), true);
  assert.deepEqual(kind.normalizeTeacher(current.teacherDocument, activityId).parts[0].solution.answers[0].acceptedTexts, ["catching up", "catching up on"]);
  const leaked = structuredClone(current.publicDocument);
  leaked.parts[0].interaction.acceptedTexts = ["private"];
  assert.throws(() => assertPublicBuilderDocument(leaked), /acceptedTexts/);
  const duplicate = structuredClone(current.teacherDocument);
  duplicate.parts[0].solution.answers[0].acceptedTexts = ["same", "same"];
  assert.throws(() => kind.normalizeTeacher(duplicate, activityId), /unique/);
});

test("valid unmapped drafts and empty panels are saveable but explicitly not publication-ready", () => {
  const { publicDocument, teacherDocument } = completePair();
  publicDocument.parts[0].interaction.presentation.panels[0].hotspots = [];
  assert.deepEqual(assessNativeCompleteSentencesSaveability(publicDocument, teacherDocument), { saveable: true, issues: [] });
  const readiness = assessNativeCompleteSentencesReadiness(publicDocument, teacherDocument);
  assert.equal(readiness.ready, false);
  assert.equal(readiness.saveable, true);
  assert.match(readiness.issues.join(" "), /exactly one blank hotspot/);
});

test("ordered panels permit empty image-only panels and reject duplicate mappings across panels", () => {
  const { publicDocument } = completePair();
  const secondPanel = createNativeCompleteSentencesPanel(() => "panel-00000000000000000000000000000999");
  Object.assign(secondPanel, { backgroundAssetSlot: asset.slot, sourceWidth: 1200, sourceHeight: 800 });
  publicDocument.parts[0].interaction.presentation.panels.push(secondPanel);
  const normalized = normalizeNativeCompleteSentencesInteraction(publicDocument.parts[0].interaction, { assets: publicDocument.assets });
  assert.deepEqual(normalized.presentation.panels.map((panel) => panel.id), publicDocument.parts[0].interaction.presentation.panels.map((panel) => panel.id));
  assert.equal(normalized.presentation.panels[1].hotspots.length, 0);
  secondPanel.hotspots.push(structuredClone(publicDocument.parts[0].interaction.presentation.panels[0].hotspots[0]));
  secondPanel.hotspots[0].id = "hot-00000000000000000000000000000999";
  assert.throws(() => normalizeNativeCompleteSentencesInteraction(publicDocument.parts[0].interaction, { assets: publicDocument.assets }), /binding is invalid or duplicate/);
  secondPanel.hotspots[0].itemId = "item-00000000000000000000000000000999";
  assert.throws(() => normalizeNativeCompleteSentencesInteraction(publicDocument.parts[0].interaction, { assets: publicDocument.assets }), /binding is invalid or duplicate/);
});

test("panel reorder preserves IDs and mappings; deletion preserves content and cleans only unused artwork", () => {
  const { publicDocument, teacherDocument } = completePair();
  const secondAsset = { assetId: "30000000-0000-4000-8000-000000000096", checksumSha256: "d".repeat(64), role: "activity_artwork", slot: "sentence-background-2" };
  const secondPanel = createNativeCompleteSentencesPanel(() => "panel-00000000000000000000000000000998");
  publicDocument.assets.push(secondAsset, fontAsset);
  publicDocument.parts[0].interaction.presentation.panels.push(secondPanel);
  replaceNativeCompleteSentencesBackground(publicDocument, secondPanel.id, secondAsset, { width: 900, height: 600 });
  secondPanel.hotspots.push({ id: "hot-00000000000000000000000000000998", itemId: publicDocument.parts[0].interaction.items[1].id, area: { x: 10, y: 10, width: 100, height: 50 }, presentation: { fontSize: 240, color: "#12304b", fontAssetSlot: fontAsset.slot } });
  publicDocument.parts[0].interaction.presentation.panels[0].hotspots = publicDocument.parts[0].interaction.presentation.panels[0].hotspots.filter((hotspot) => hotspot.itemId !== secondPanel.hotspots[0].itemId);
  const firstId = publicDocument.parts[0].interaction.presentation.panels[0].id;
  const firstMapping = publicDocument.parts[0].interaction.presentation.panels[0].hotspots[0].itemId;
  publicDocument.parts[0].interaction.presentation.panels.reverse();
  assert.deepEqual(publicDocument.parts[0].interaction.presentation.panels.map((panel) => panel.id), [secondPanel.id, firstId]);
  assert.equal(publicDocument.parts[0].interaction.presentation.panels[1].hotspots[0].itemId, firstMapping);
  removeNativeCompleteSentencesPanel(publicDocument, secondPanel.id);
  assert.equal(publicDocument.assets.some((entry) => entry.slot === secondAsset.slot), false);
  assert.equal(publicDocument.assets.some((entry) => entry.slot === fontAsset.slot), true, "the activity-wide style may remain valid with no hotspots");
  assert.equal(publicDocument.assets.some((entry) => entry.slot === asset.slot), true);
  assert.equal(publicDocument.parts[0].interaction.items.length, 2);
  assert.equal(teacherDocument.parts[0].solution.answers.length, 2);
});

test("background replacement preserves geometry only when intrinsic dimensions match", () => {
  const { publicDocument } = completePair();
  const panel = publicDocument.parts[0].interaction.presentation.panels[0];
  const replacement = { assetId: "40000000-0000-4000-8000-000000000096", checksumSha256: "e".repeat(64), role: "activity_artwork", slot: "replacement" };
  publicDocument.assets.push(replacement);
  assert.deepEqual(replaceNativeCompleteSentencesBackground(publicDocument, panel.id, replacement, { width: 1200, height: 800 }), { dimensionsChanged: false });
  assert.equal(panel.hotspots.length, 2);
  const changed = { assetId: "50000000-0000-4000-8000-000000000096", checksumSha256: "f".repeat(64), role: "activity_artwork", slot: "changed" };
  publicDocument.assets.push(changed);
  assert.deepEqual(replaceNativeCompleteSentencesBackground(publicDocument, panel.id, changed, { width: 1600, height: 900 }), { dimensionsChanged: true });
  assert.equal(panel.hotspots.length, 0);
});

test("component font references use safe aliases and preserve large exact sizes and colors", () => {
  const { publicDocument } = completePair();
  publicDocument.assets.push(fontAsset);
  publicDocument.parts[0].interaction.presentation.answerStyle = { fontSize: 1_000_000.5, color: "#Ab12Ef", fontAssetSlot: fontAsset.slot };
  const normalized = normalizeNativeCompleteSentencesInteraction(publicDocument.parts[0].interaction, { assets: publicDocument.assets });
  assert.deepEqual(normalized.presentation.answerStyle, { fontSize: 1_000_000.5, color: "#ab12ef", fontAssetSlot: fontAsset.slot });
  assert.equal(nativeCompleteSentencesFontFamilyAlias(fontAsset.assetId), "hh-native-font-20000000000040008000000000000096");
  const foreign = structuredClone(publicDocument.parts[0].interaction);
  assert.throws(() => normalizeNativeCompleteSentencesInteraction(foreign, { assets: [asset] }), /authorized font/);
  foreign.presentation.answerStyle.extra = "unsafe";
  assert.throws(() => normalizeNativeCompleteSentencesInteraction(foreign, { assets: publicDocument.assets }), /missing or unknown fields/);
});

test("new Complete the Sentences hotspots are centered 80x30, clamp safely, and bind next-unused across panels", () => {
  assert.deepEqual(createNativeCompleteSentencesHotspotArea(1200, 800), { x: 560, y: 385, width: 80, height: 30 });
  assert.deepEqual(createNativeCompleteSentencesHotspotArea(121, 81), { x: 20, y: 25, width: 80, height: 30 });
  assert.deepEqual(createNativeCompleteSentencesHotspotArea(12, 8), { x: 0, y: 0, width: 12, height: 8 });
  const { publicDocument, second } = completePair();
  const panel = publicDocument.parts[0].interaction.presentation.panels[0];
  panel.hotspots = panel.hotspots.filter((hotspot) => hotspot.itemId !== second);
  const created = addNextNativeCompleteSentencesHotspot(publicDocument, panel.id, null, () => "hot-00000000000000000000000000009999");
  assert.equal(created.itemId, second);
  assert.deepEqual(created.area, { x: 560, y: 385, width: 80, height: 30 });
  const before = structuredClone(publicDocument);
  assert.equal(addNextNativeCompleteSentencesHotspot(publicDocument, panel.id), null);
  assert.deepEqual(publicDocument, before);
});

test("individual Teacher reveal is stable by itemId and lower commands skip revealed items", () => {
  const { first, second } = completePair();
  const itemIds = [first, second];
  let revealed = new Set();
  revealed = updateNativeCompleteSentencesRevealState(revealed, itemIds, { itemId: second });
  assert.deepEqual([...revealed], [second]);
  const same = updateNativeCompleteSentencesRevealState(revealed, itemIds, { itemId: second });
  assert.equal(same, revealed, "a second activation does not corrupt the reveal count");
  revealed = updateNativeCompleteSentencesRevealState(revealed, itemIds, "show-next");
  assert.deepEqual([...revealed], [second, first], "Show Next skips the individually revealed item");
  assert.equal(updateNativeCompleteSentencesRevealState(revealed, itemIds, "show-all"), revealed);
  revealed = updateNativeCompleteSentencesRevealState(revealed, itemIds, "reset-activity");
  assert.equal(revealed.size, 0);
});

test("Complete the Sentences compiles through v2 with public/Teacher separation and managed background", () => {
  const pair = completePair(); const sources = createPublicationV2FixtureSources();
  pair.publicDocument.assets.push(fontAsset);
  pair.publicDocument.parts[0].interaction.presentation.answerStyle = { fontSize: 240, color: "#e40083", fontAssetSlot: fontAsset.slot };
  const entry = { activityId, kind: "complete-sentences", placement: { pageId: publicationV2Fixture.pageId }, sortOrder: 4 };
  sources.native.index.payload.activities.push(entry); sources.native.index = source(sources.native.index.payload, sources.native.index.revision);
  sources.native.activities[activityId] = { index: entry, public: source(pair.publicDocument), teacher: source(pair.teacherDocument) };
  sources.native.assetRows.push({ id: asset.assetId, checksum_sha256: asset.checksumSha256, asset_role: asset.role, object_key: "builder-native-assets/sentences.png", storage_profile: "private", storage_bucket: "private", mime_type: "image/png", byte_size: 100, width: 1200, height: 800, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: activityId, asset_slot: asset.slot } });
  sources.native.assetRows.push({ id: fontAsset.assetId, checksum_sha256: fontAsset.checksumSha256, asset_role: fontAsset.role, object_key: `builder-font-library/ultimate-b2/ultimate-b2-students-book/${fontAsset.checksumSha256}.ttf`, storage_profile: "private", storage_bucket: "private", mime_type: "font/ttf", byte_size: 22000, width: null, height: null, publication_status: "draft", access_level: "internal", source_metadata: { font_library_scope: "component", display_label: "Ahem" } });
  sources.documents.hotspots.payload.pages[publicationV2Fixture.pageId].push({ id: "hotspot-native-complete-sentences", unitNumber: 1, pageId: publicationV2Fixture.pageId, pageNumber: 5, left: 52, top: 4, width: 12, height: 12, label: "Complete the Sentences", actionType: "normalized_activity", activityKey: activityId });
  sources.documents.hotspots = source(sources.documents.hotspots.payload, sources.documents.hotspots.revision);
  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  assert.equal(compiled.publicProjection.nativeActivities[activityId].kind, "complete-sentences");
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection.nativeActivities[activityId]), /catching up on|episode/);
  assert.match(JSON.stringify(compiled.teacherProjection.nativeActivities[activityId]), /catching up on/);
  assert.ok(compiled.assetManifest.some((entry) => entry.role === "activity_font" && entry.extension === "ttf" && entry.mediaType === "font\/ttf"));
});

test("shared runtime/editor render synchronized geometry, safe typography, Student inputs, and boxless Teacher reveal", async () => {
  const [surface, editor, fontControls, canvas, css] = await Promise.all([
    readFile(new URL("../src/components/native-complete-sentences/NativeCompleteSentencesSurface.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/apps/book-builder/hosted/NativeCompleteSentencesEditor.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/apps/book-builder/hosted/NativeCompleteSentencesFontControls.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-complete-sentences/NativeCompleteSentencesHotspotCanvas.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-complete-sentences/nativeCompleteSentences.css", import.meta.url), "utf8"),
  ]);
  assert.match(surface, /onResponsesChange/); assert.match(surface, /updateNativeCompleteSentencesRevealState/);
  assert.match(surface, /native-complete-sentences-teacher-target/); assert.match(surface, /onTeacherReveal\(hotspot\.itemId\)/);
  assert.doesNotMatch(surface, /data-(?:answer|correct)/i);
  assert.match(surface, /--native-complete-answer-font-size/); assert.match(surface, /--native-complete-answer-color/); assert.match(surface, /<input\s+type="text"/);
  assert.match(editor, /NativeReadableTextEditor/); assert.match(editor, /uploadNativeActivityAsset/); assert.match(editor, /Full sentence with one marked answer/); assert.doesNotMatch(editor, /Private correct word or phrase/); assert.match(editor, /<StageGeometryControls/); assert.match(fontControls, /Upload TTF/); assert.match(editor, /Answer font size/); assert.match(editor, /Answer text color/); assert.match(editor, /Lock hotspot position/);
  assert.match(canvas, /locked=\{locked\}/); assert.match(canvas, /onChange/);
  assert.match(css, /teacher-target[\s\S]*\{[^}]*background:\s*transparent[^}]*border:\s*0[^}]*border-radius:\s*0[^}]*box-shadow:\s*none/s);
  assert.match(css, /teacher-answer[^}]*align-items:\s*flex-end[^}]*white-space:\s*nowrap/s);
  assert.match(css, /teacher-target:focus-visible/);
  assert.doesNotMatch(editor, /fontSizeMaximum|maximum=\{96\}/);
  assert.doesNotMatch(editor, /Math\.min\(96/);
});
test("visual blank authoring selects the next unused stable item identity", () => {
  const items = [{ id: "item-a", prompt: "Same" }, { id: "item-b", prompt: "Same" }, { id: "item-c", prompt: "Other" }];
  const panels = [{ hotspots: [] }];
  assert.equal(findNextUnusedNativeCompleteSentencesItemId(items, panels), "item-a");
  panels[0].hotspots.push({ itemId: "item-a" });
  assert.equal(findNextUnusedNativeCompleteSentencesItemId(items, panels), "item-b", "duplicate answer text does not affect identity ordering");
  assert.equal(findNextUnusedNativeCompleteSentencesItemId(items, panels, "item-c"), "item-c", "an explicit unused override wins");
  panels[0].hotspots.push({ itemId: "item-b" }, { itemId: "item-c" });
  assert.equal(findNextUnusedNativeCompleteSentencesItemId(items, panels), null);
  panels[0].hotspots = panels[0].hotspots.filter((hotspot) => hotspot.itemId !== "item-a");
  assert.equal(findNextUnusedNativeCompleteSentencesItemId(items, panels), "item-a", "deletion restores eligibility in authored order");
});
