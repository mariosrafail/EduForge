import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assertPublicBuilderDocument, builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { addNativeCompleteSentencesItem, alignNativeCompleteSentencesAnswers, nativeCompleteSentencesMarkedSentence, parseNativeCompleteSentencesMarkedSentence, removeNativeCompleteSentencesItem } from "../src/data/native-activities/nativeCompleteSentencesAuthoring.js";
import { NATIVE_COMPLETE_SENTENCES_BLANK_TOKEN, nativeCompleteSentencesPromptParts, updateNativeCompleteSentencesRevealState } from "../src/data/native-activities/nativeCompleteSentences.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const activityId = "ultimate-b2-sb-u1-p1-o96";
const asset = { assetId: "10000000-0000-4000-8000-000000000096", checksumSha256: "b".repeat(64), role: "activity_artwork", slot: "sentence-background" };
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
  Object.assign(publicDocument.parts[0].interaction.presentation, { backgroundAssetSlot: asset.slot, sourceWidth: 1200, sourceHeight: 800, hotspots: [
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
  assert.equal(pair.publicDocument.parts[0].interaction.presentation.hotspots.some((hotspot) => hotspot.itemId === pair.first), false);
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
  publicDocument.parts[0].interaction.presentation.hotspots.pop();
  publicDocument.assets = [];
  publicDocument.parts[0].interaction.presentation.backgroundAssetSlot = "";
  assert.deepEqual(kind.assessReadiness(publicDocument, teacherDocument).ready, false);
  assert.match(kind.assessReadiness(publicDocument, teacherDocument).issues.join(" "), /private correct word or phrase/);
  assert.match(kind.assessReadiness(publicDocument, teacherDocument).issues.join(" "), /managed background image/);
  assert.match(kind.assessReadiness(publicDocument, teacherDocument).issues.join(" "), /blank hotspot/);
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
  const entry = { activityId, kind: "complete-sentences", placement: { pageId: publicationV2Fixture.pageId }, sortOrder: 4 };
  sources.native.index.payload.activities.push(entry); sources.native.index = source(sources.native.index.payload, sources.native.index.revision);
  sources.native.activities[activityId] = { index: entry, public: source(pair.publicDocument), teacher: source(pair.teacherDocument) };
  sources.native.assetRows.push({ id: asset.assetId, checksum_sha256: asset.checksumSha256, asset_role: asset.role, object_key: "builder-native-assets/sentences.png", storage_profile: "private", storage_bucket: "private", mime_type: "image/png", byte_size: 100, width: 1200, height: 800, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: activityId, asset_slot: asset.slot } });
  sources.documents.hotspots.payload.pages[publicationV2Fixture.pageId].push({ id: "hotspot-native-complete-sentences", unitNumber: 1, pageId: publicationV2Fixture.pageId, pageNumber: 5, left: 52, top: 4, width: 12, height: 12, label: "Complete the Sentences", actionType: "normalized_activity", activityKey: activityId });
  sources.documents.hotspots = source(sources.documents.hotspots.payload, sources.documents.hotspots.revision);
  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  assert.equal(compiled.publicProjection.nativeActivities[activityId].kind, "complete-sentences");
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection.nativeActivities[activityId]), /catching up on|episode/);
  assert.match(JSON.stringify(compiled.teacherProjection.nativeActivities[activityId]), /catching up on/);
});

test("shared runtime/editor render typed public responses and Teacher reveal without public answer attributes", async () => {
  const [surface, editor] = await Promise.all([
    readFile(new URL("../src/components/native-complete-sentences/NativeCompleteSentencesSurface.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/apps/book-builder/hosted/NativeCompleteSentencesEditor.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(surface, /onResponsesChange/); assert.match(surface, /updateNativeCompleteSentencesRevealState/);
  assert.match(surface, /native-complete-sentences-teacher-target/); assert.match(surface, /onTeacherReveal\(hotspot\.itemId\)/);
  assert.doesNotMatch(surface, /data-(?:answer|correct)/i);
  assert.match(editor, /NativeReadableTextEditor/); assert.match(editor, /uploadNativeActivityAsset/); assert.match(editor, /Full sentence with one marked answer/); assert.doesNotMatch(editor, /Private correct word or phrase/); assert.match(editor, /NativeCompleteSentencesHotspotCanvas/);
});
