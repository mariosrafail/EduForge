import assert from "node:assert/strict";
import test from "node:test";

import { updateNativeOpenResponseReveals } from "../src/components/native-open-response/nativeOpenResponseTeacherRuntime.js";

import { assertPublicBuilderDocument } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { resolveNativeActivityKind, validateNativeActivityPair } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { nativeChildIdFromUuid } from "../src/data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference } from "../src/data/native-activities/nativeActivityPublic.js";
import { assessNativeOpenResponseReadiness, createNativeOpenResponseQuestion, duplicateNativeOpenResponseArtwork, nativeOpenResponseLinePositions, removeNativeOpenResponseArtwork } from "../src/data/native-activities/nativeOpenResponse.js";
import { autoFitNativeOpenResponseAnswer, normalizeNativeAnswerWhitespace } from "../src/data/native-activities/nativeOpenResponseAutoFit.js";

const activityId = "ultimate-b2-sb-u1-p1-o99";
const placement = { pageId: "ub2-sb-unit-1-part-1" };
const kind = resolveNativeActivityKind("open-response");
const q1 = nativeChildIdFromUuid("q", "10000000-0000-4000-8000-000000000001");
const q2 = nativeChildIdFromUuid("q", "10000000-0000-4000-8000-000000000002");
const art1 = nativeChildIdFromUuid("art", "10000000-0000-4000-8000-000000000003");
const art2 = nativeChildIdFromUuid("art", "10000000-0000-4000-8000-000000000005");
const asset = { assetId: "10000000-0000-4000-8000-000000000004", checksumSha256: "a".repeat(64), role: "activity_artwork", slot: "asset-one" };

test("Teacher Open Response reveal commands advance exactly once, reveal all, and reset", () => {
  let revealed = new Set();
  revealed = updateNativeOpenResponseReveals(revealed, [q1, q2], "show-next");
  assert.deepEqual([...revealed], [q1]);
  revealed = updateNativeOpenResponseReveals(revealed, [q1, q2], "show-next");
  assert.deepEqual([...revealed], [q1, q2]);
  assert.equal(updateNativeOpenResponseReveals(revealed, [q1, q2], "show-next"), revealed);
  revealed = updateNativeOpenResponseReveals(new Set([q2]), [q1, q2], "show-all");
  assert.deepEqual([...revealed], [q1, q2]);
  revealed = updateNativeOpenResponseReveals(revealed, [q1, q2], "reset-activity");
  assert.equal(revealed.size, 0);
});

function pair(questionIds = []) {
  const publicDocument = kind.createBlankPublic({ activityId, title: "Native OR", placement });
  const teacherDocument = kind.createBlankTeacher({ activityId });
  publicDocument.parts[0].interaction.questions = questionIds.map((id, index) => ({ ...createNativeOpenResponseQuestion(id, index), prompt: `Prompt ${index + 1}` }));
  teacherDocument.parts[0].solution.modelAnswers = questionIds.map((questionId, index) => ({ questionId, text: `Answer ${index + 1}` }));
  return { publicDocument, teacherDocument };
}

test("blank, one-question, and multi-question native Open Response drafts normalize exactly", () => {
  assert.equal(validateNativeActivityPair(...Object.values(pair())), true);
  for (const ids of [[q1], [q1, q2]]) {
    const documents = pair(ids);
    assert.equal(validateNativeActivityPair(documents.publicDocument, documents.teacherDocument), true);
    assert.doesNotThrow(() => assertPublicBuilderDocument(documents.publicDocument));
    assert.equal(JSON.stringify(documents.publicDocument).includes("Answer"), false);
  }
});

test("question identity is opaque, stable across edits/reorder, unique, and topology is ID-based", () => {
  const { publicDocument, teacherDocument } = pair([q1, q2]);
  publicDocument.parts[0].interaction.questions[0].prompt = "Edited";
  publicDocument.parts[0].interaction.questions[0].promptArea.x = 30;
  teacherDocument.parts[0].solution.modelAnswers[0].text = "Edited privately";
  assert.equal(publicDocument.parts[0].interaction.questions[0].id, q1);
  publicDocument.parts[0].interaction.questions.reverse(); teacherDocument.parts[0].solution.modelAnswers.reverse();
  assert.equal(validateNativeActivityPair(publicDocument, teacherDocument), true);
  const duplicate = structuredClone(publicDocument); duplicate.parts[0].interaction.questions[1].id = q2;
  assert.throws(() => kind.normalizePublic(duplicate));
  assert.throws(() => validateNativeActivityPair(publicDocument, { ...teacherDocument, parts: [{ ...teacherDocument.parts[0], solution: { kind: "open-response", modelAnswers: [teacherDocument.parts[0].solution.modelAnswers[0]] } }] }));
  const stale = structuredClone(teacherDocument); stale.parts[0].solution.modelAnswers[0].questionId = q1;
  assert.throws(() => validateNativeActivityPair(publicDocument, stale));
});

test("geometry, response line topology, and unknown fields fail closed", () => {
  const { publicDocument } = pair([q1]);
  const invalids = [];
  const unknown = structuredClone(publicDocument); unknown.parts[0].interaction.questions[0].html = "<b>x</b>"; invalids.push(unknown);
  const nan = structuredClone(publicDocument); nan.parts[0].interaction.questions[0].promptArea.x = Number.NaN; invalids.push(nan);
  const infinity = structuredClone(publicDocument); infinity.parts[0].interaction.questions[0].promptArea.x = Number.POSITIVE_INFINITY; invalids.push(infinity);
  const outside = structuredClone(publicDocument); outside.parts[0].interaction.questions[0].responseRegion.area.x = 900; invalids.push(outside);
  const zero = structuredClone(publicDocument); zero.parts[0].interaction.questions[0].responseRegion.area.width = 0; invalids.push(zero);
  const count = structuredClone(publicDocument); count.parts[0].interaction.questions[0].responseRegion.presentation.lineCount = 0; invalids.push(count);
  const positions = structuredClone(publicDocument); positions.parts[0].interaction.questions[0].responseRegion.presentation.linePositions = [40, 80]; invalids.push(positions);
  invalids.forEach((value) => assert.throws(() => kind.normalizePublic(value)));
  assert.deepEqual(nativeOpenResponseLinePositions({ paddingY: 8, lineSpacing: 32, lineCount: 3 }), [40, 72, 104]);
});

test("Open Response permits many artwork instances for one canonical managed asset", () => {
  const { publicDocument } = pair([q1]);
  publicDocument.assets = [asset];
  publicDocument.parts[0].interaction.artwork = [{ id: art1, assetSlot: asset.slot, area: { x: 10, y: 10, width: 200, height: 100 }, order: 0, altText: "Diagram", decorative: false, fit: "contain" }];
  assert.equal(kind.normalizePublic(publicDocument).parts[0].interaction.artwork[0].locked, false);
  publicDocument.parts[0].interaction.artwork[0].locked = true;
  assert.equal(kind.normalizePublic(publicDocument).parts[0].interaction.artwork[0].locked, true);
  duplicateNativeOpenResponseArtwork(publicDocument.parts[0].interaction, art1, art2);
  const normalized = kind.normalizePublic(publicDocument);
  assert.equal(normalized.assets.length, 1);
  assert.deepEqual(normalized.parts[0].interaction.artwork.map((item) => [item.id, item.assetSlot, item.order]), [[art1, asset.slot, 0], [art2, asset.slot, 1]]);
  assert.deepEqual(normalized.parts[0].interaction.artwork[1].area, { x: 26, y: 26, width: 200, height: 100 });
  assert.equal(normalized.parts[0].interaction.artwork[1].locked, false);
  publicDocument.parts[0].interaction.artwork[1].area.x = 80;
  publicDocument.parts[0].interaction.artwork[1].locked = true;
  assert.equal(publicDocument.parts[0].interaction.artwork[0].area.x, 10);
  assert.equal(publicDocument.parts[0].interaction.artwork[0].locked, true);

  removeNativeOpenResponseArtwork(publicDocument, art1);
  assert.equal(publicDocument.assets.length, 1);
  assert.deepEqual(publicDocument.parts[0].interaction.artwork.map((item) => [item.id, item.order]), [[art2, 0]]);
  removeNativeOpenResponseArtwork(publicDocument, art2);
  assert.deepEqual(publicDocument.assets, []);
  assert.deepEqual(publicDocument.parts[0].interaction.artwork, []);
});

test("Open Response managed asset roots deduplicate identical finalize references and reject conflicts", () => {
  assert.deepEqual(mergeNativeManagedAssetReference([], asset), [asset]);
  assert.deepEqual(mergeNativeManagedAssetReference([asset], asset), [asset]);
  assert.throws(() => mergeNativeManagedAssetReference([asset], { ...asset, checksumSha256: "b".repeat(64) }));
  assert.throws(() => mergeNativeManagedAssetReference([asset], { ...asset, assetId: "10000000-0000-4000-8000-000000000006" }));

  const { publicDocument } = pair([q1]);
  publicDocument.assets = [asset];
  publicDocument.parts[0].interaction.artwork = [{ id: art1, assetSlot: asset.slot, area: { x: 10, y: 10, width: 200, height: 100 }, order: 0, altText: "Diagram", decorative: false, fit: "contain", locked: false }];
  for (const mutate of [
    (value) => { value.parts[0].interaction.artwork[0].id = "art-1"; },
    (value) => { value.parts[0].interaction.artwork[0].locked = "yes"; },
    (value) => { value.parts[0].interaction.artwork[0].assetSlot = "missing"; },
    (value) => { value.assets[0].role = "other_role"; },
    (value) => { value.parts[0].interaction.artwork.push({ ...structuredClone(value.parts[0].interaction.artwork[0]), order: 1 }); },
    (value) => { value.assets.push({ ...asset, slot: "asset-two" }); },
    (value) => { value.assets.push({ ...asset, assetId: "10000000-0000-4000-8000-000000000006" }); },
    (value) => { value.assets.push({ ...asset, assetId: "10000000-0000-4000-8000-000000000005", slot: "asset-two" }); },
  ]) { const invalid = structuredClone(publicDocument); mutate(invalid); assert.throws(() => kind.normalizePublic(invalid)); }
});

test("draft readiness distinguishes safe incomplete drafts from future readiness", () => {
  const blank = pair(); assert.deepEqual(assessNativeOpenResponseReadiness(blank.publicDocument, blank.teacherDocument), { ready: false, issues: ["Add at least one question."] });
  const complete = pair([q1]); assert.equal(assessNativeOpenResponseReadiness(complete.publicDocument, complete.teacherDocument).ready, true);
  complete.teacherDocument.parts[0].solution.modelAnswers[0].text = "";
  assert.match(assessNativeOpenResponseReadiness(complete.publicDocument, complete.teacherDocument).issues[0], /model answer/);
});

function region(overrides = {}) {
  const responseRegion = createNativeOpenResponseQuestion(q1).responseRegion;
  responseRegion.presentation = { ...responseRegion.presentation, ...overrides };
  return responseRegion;
}

test("deterministic Auto Fit covers wrapping, whitespace, tokens, punctuation, boundaries, and overflow", () => {
  assert.equal(normalizeNativeAnswerWhitespace("  one\n  two   three "), "one two three");
  const cases = [
    { text: "Short answer.", responseRegion: region(), fits: true, lines: 1 },
    { text: "A sentence with enough words to wrap cleanly across two authored answer lines.", responseRegion: region({ lineWidth: 300 }), fits: true, minimumLines: 2 },
    { text: "Supercalifragilisticexpialidocious".repeat(5), responseRegion: region({ lineWidth: 180 }), fits: false },
    { text: "Punctuation: commas, periods; parentheses (work)!", responseRegion: region(), fits: true },
    { text: "many words ".repeat(50), responseRegion: region({ lineCount: 1, linePositions: [40], lineWidth: 120 }), fits: false },
    { text: "wide region answer", responseRegion: region({ lineWidth: 676 }), fits: true, lines: 1 },
  ];
  for (const item of cases) {
    const first = autoFitNativeOpenResponseAnswer(item); const second = autoFitNativeOpenResponseAnswer(item);
    assert.deepEqual(first, second); assert.equal(first.fits, item.fits);
    if (item.lines) assert.equal(first.lines.length, item.lines);
    if (item.minimumLines) assert.ok(first.lines.length >= item.minimumLines);
    assert.ok(first.fontSize >= item.responseRegion.presentation.answerFontSizeMin);
  }
  const exact = autoFitNativeOpenResponseAnswer({ text: "MMMM", responseRegion: region({ lineWidth: 72, answerFontSizeMin: 20, answerFontSizeMax: 20 }) });
  assert.equal(exact.fits, true);
  assert.deepEqual(exact.baselines, exact.lines.map((_, index) => 180 + [40, 72, 104][index]));
});
