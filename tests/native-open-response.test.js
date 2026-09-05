import assert from "node:assert/strict";
import test from "node:test";

import { nextNativeOpenResponseReveal, updateNativeOpenResponseReveals } from "../src/components/native-open-response/nativeOpenResponseTeacherRuntime.js";

import { assertPublicBuilderDocument, builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { resolveNativeActivityKind, validateNativeActivityPair } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { nativeChildIdFromUuid } from "../src/data/native-activities/nativeChildIdentity.js";
import { mergeNativeManagedAssetReference, nativeActivityUsesManagedAssetSlot, removeNativeManagedAssetReferenceIfUnused } from "../src/data/native-activities/nativeActivityPublic.js";
import { assignNativeOpenResponseQuestion, assessNativeOpenResponseReadiness, commitNativeOpenResponseConfiguredFontSize, createNativeOpenResponseQuestion, duplicateNativeOpenResponseArtwork, initialNativeOpenResponseArtworkArea, nativeOpenResponseAnswerFontFamily, nativeOpenResponseAssetRequirements, nativeOpenResponseLinePositions, nativeOpenResponsePanelPromptIds, nativeOpenResponsePanelResponseIds, promoteNativeOpenResponsePanels, removeNativeOpenResponseArtwork, removeNativeOpenResponsePanel, resizeNativeOpenResponseRegion, updateNativeOpenResponsePanelMembership } from "../src/data/native-activities/nativeOpenResponse.js";
import { autoFitNativeOpenResponseAnswer, normalizeNativeAnswerWhitespace } from "../src/data/native-activities/nativeOpenResponseAutoFit.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const activityId = "ultimate-b2-sb-u1-p1-o99";
const placement = { pageId: "ub2-sb-unit-1-part-1" };
const kind = resolveNativeActivityKind("open-response");
const q1 = nativeChildIdFromUuid("q", "10000000-0000-4000-8000-000000000001");
const q2 = nativeChildIdFromUuid("q", "10000000-0000-4000-8000-000000000002");
const art1 = nativeChildIdFromUuid("art", "10000000-0000-4000-8000-000000000003");
const art2 = nativeChildIdFromUuid("art", "10000000-0000-4000-8000-000000000005");
const asset = { assetId: "10000000-0000-4000-8000-000000000004", checksumSha256: "a".repeat(64), role: "activity_artwork", slot: "asset-one" };
const font = { assetId: "10000000-0000-4000-8000-000000000007", checksumSha256: "f".repeat(64), role: "activity_font", slot: "font-10000000000040008000000000000007" };

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

test("Open Response accepts one or two private multiline variants and preserves legacy shape", () => {
  const legacy = pair([q1]);
  assert.deepEqual(kind.normalizeTeacher(legacy.teacherDocument, activityId).parts[0].solution.modelAnswers[0], { questionId: q1, text: "Answer 1" });

  const current = pair([q1]);
  current.teacherDocument.parts[0].solution.modelAnswers[0] = { questionId: q1, modelAnswerTexts: ["First\r\nline", "Second variant"] };
  assert.equal(kind.validatePair(current.publicDocument, current.teacherDocument), true);
  assert.deepEqual(kind.normalizeTeacher(current.teacherDocument, activityId).parts[0].solution.modelAnswers[0].modelAnswerTexts, ["First\nline", "Second variant"]);
  assert.doesNotThrow(() => assertPublicBuilderDocument(current.publicDocument));
  const leaked = structuredClone(current.publicDocument);
  leaked.parts[0].interaction.modelAnswerTexts = ["private"];
  assert.throws(() => assertPublicBuilderDocument(leaked), /modelAnswerTexts/);
  for (const invalidTexts of [[], ["one", "two", "three"]]) {
    const invalid = structuredClone(current.teacherDocument);
    invalid.parts[0].solution.modelAnswers[0].modelAnswerTexts = invalidTexts;
    assert.throws(() => kind.normalizeTeacher(invalid, activityId), /one or two variants/);
  }
});

test("Open Response answer typography reuses canonical component fonts without changing legacy documents", () => {
  const legacy = pair([q1]).publicDocument;
  const legacyNormalized = kind.normalizePublic(legacy);
  assert.equal(Object.hasOwn(legacyNormalized.parts[0].interaction.questions[0].responseRegion.presentation, "answerFontAssetSlot"), false);

  const publicDocument = structuredClone(legacy);
  publicDocument.assets.push(font);
  const presentation = publicDocument.parts[0].interaction.questions[0].responseRegion.presentation;
  presentation.answerFontAssetSlot = font.slot;
  presentation.color = "#13579b";
  presentation.answerFontSizeMax = 28;
  const normalized = kind.normalizePublic(publicDocument);
  const normalizedPresentation = normalized.parts[0].interaction.questions[0].responseRegion.presentation;
  assert.equal(normalizedPresentation.answerFontAssetSlot, font.slot);
  assert.equal(normalizedPresentation.color, "#13579b");
  assert.match(nativeOpenResponseAnswerFontFamily(normalized, normalizedPresentation), /^hh-native-font-10000000000040008000000000000007, Arial, sans-serif$/);
  assert.deepEqual(nativeOpenResponseAssetRequirements(normalized), [{ slot: font.slot, mediaType: "font/ttf", label: "Open Response question 1 answer font" }]);
  assert.equal(nativeActivityUsesManagedAssetSlot(normalized, font.slot), true);

  delete normalizedPresentation.answerFontAssetSlot;
  removeNativeManagedAssetReferenceIfUnused(normalized, font.slot);
  assert.deepEqual(normalized.assets, []);
  assert.equal(nativeOpenResponseAnswerFontFamily(normalized, normalizedPresentation), "Arial");
  assert.equal(nativeOpenResponseAnswerFontFamily(normalized, { ...normalizedPresentation, answerFontAssetSlot: "font-gone" }), "Arial");

  const dangling = structuredClone(publicDocument);
  dangling.parts[0].interaction.questions[0].responseRegion.presentation.answerFontAssetSlot = "font-missing";
  assert.throws(() => kind.normalizePublic(dangling), /managed component font/);
  const wrongRole = structuredClone(publicDocument);
  wrongRole.assets[0].role = "activity_artwork";
  assert.throws(() => kind.normalizePublic(wrongRole), /managed component font/);
});

test("Open Response publishes its configured component font, size, and color through v2", () => {
  const sources = createPublicationV2FixtureSources();
  const publicSource = sources.native.activities[publicationV2Fixture.openResponseId].public;
  const publicDocument = publicSource.payload;
  const presentation = publicDocument.parts[0].interaction.questions[0].responseRegion.presentation;
  publicDocument.assets.push(font);
  presentation.answerFontAssetSlot = font.slot;
  presentation.answerFontSizeMax = 26;
  presentation.color = "#13579b";
  publicSource.sha256 = builderDocumentSha256(publicDocument);
  sources.native.assetRows.push({
    id: font.assetId,
    checksum_sha256: font.checksumSha256,
    asset_role: font.role,
    object_key: `builder-font-library/ultimate-b2/ultimate-b2-students-book/${font.checksumSha256}.ttf`,
    storage_profile: "private",
    storage_bucket: "private",
    mime_type: "font/ttf",
    byte_size: 22000,
    width: null,
    height: null,
    publication_status: "draft",
    access_level: "internal",
    source_metadata: { font_library_scope: "component", display_label: "Ahem" },
  });

  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  const published = compiled.publicProjection.nativeActivities[publicationV2Fixture.openResponseId].document;
  const publishedPresentation = published.parts[0].interaction.questions[0].responseRegion.presentation;
  assert.equal(publishedPresentation.answerFontAssetSlot, font.slot);
  assert.equal(publishedPresentation.answerFontSizeMax, 26);
  assert.equal(publishedPresentation.color, "#13579b");
  assert.ok(compiled.assetManifest.some((entry) => entry.sha256 === font.checksumSha256 && entry.role === "activity_font" && entry.extension === "ttf" && entry.mediaType === "font/ttf"));
});

test("requested answer size accepts positive safe integers independently of layout", () => {
  const presentation = createNativeOpenResponseQuestion(q1).responseRegion.presentation;
  for (const value of [2, 22, 80, 100, 1000]) assert.deepEqual(commitNativeOpenResponseConfiguredFontSize(presentation, value), { value, bounds: { minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, clamped: false });
  for (const value of [0, -1, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => commitNativeOpenResponseConfiguredFontSize(presentation, value), /positive safe whole number/);
  assert.throws(() => commitNativeOpenResponseConfiguredFontSize(presentation, Number.NaN), /whole number/);
  assert.throws(() => commitNativeOpenResponseConfiguredFontSize(presentation, 18.5), /whole number/);
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

test("response line width follows linked region resizing and preserves an explicit override", () => {
  const responseRegion = createNativeOpenResponseQuestion(q1).responseRegion;
  responseRegion.area.width = 400;
  responseRegion.presentation.paddingX = 0;
  responseRegion.presentation.lineWidth = 400;
  resizeNativeOpenResponseRegion(responseRegion, { ...responseRegion.area, width: 500 });
  assert.equal(responseRegion.presentation.lineWidth, 500);

  responseRegion.presentation.lineWidth = 320;
  resizeNativeOpenResponseRegion(responseRegion, { ...responseRegion.area, width: 600 });
  assert.equal(responseRegion.presentation.lineWidth, 320);
  assert.equal(responseRegion.area.width, 600);

  responseRegion.presentation.lineWidth = 280;
  assert.equal(responseRegion.area.width, 600, "editing line width must not resize the response region");

  const legacyDefault = createNativeOpenResponseQuestion(q2).responseRegion;
  assert.equal(legacyDefault.area.width, 704);
  assert.equal(legacyDefault.presentation.lineWidth, 676);
  resizeNativeOpenResponseRegion(legacyDefault, { ...legacyDefault.area, width: 800 });
  assert.equal(legacyDefault.presentation.lineWidth, 776, "the canonical four-pixel legacy inset remains linked on first resize");

  const deliberateFourPixelOverride = createNativeOpenResponseQuestion(`q-${"3".repeat(32)}`).responseRegion;
  deliberateFourPixelOverride.area.width = 500;
  deliberateFourPixelOverride.presentation.paddingX = 0;
  deliberateFourPixelOverride.presentation.lineWidth = 496;
  resizeNativeOpenResponseRegion(deliberateFourPixelOverride, { ...deliberateFourPixelOverride.area, width: 600 });
  assert.equal(deliberateFourPixelOverride.presentation.lineWidth, 496, "a deliberate four-pixel override remains independent");
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

test("new artwork starts centered with trustworthy intrinsic proportions", () => {
  const surface = { width: 1024, height: 582 };
  const banner = initialNativeOpenResponseArtworkArea(surface, { width: 1600, height: 400 });
  const portrait = initialNativeOpenResponseArtworkArea(surface, { width: 400, height: 1600 });
  assert.ok(Math.abs(banner.width / banner.height - 4) < .02);
  assert.ok(Math.abs(portrait.height / portrait.width - 4) < .02);
  assert.ok(banner.width > banner.height);
  assert.ok(portrait.height > portrait.width);
  assert.equal(banner.x, Math.round((surface.width - banner.width) / 2));
  assert.equal(portrait.y, Math.round((surface.height - portrait.height) / 2));
  assert.deepEqual(initialNativeOpenResponseArtworkArea(surface), { x: 160, y: 120, width: 320, height: 220 });
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

test("Teacher Show Next resolves the next unrevealed question's panel across a panel boundary", () => {
  const panels = [
    { questionIds: [q1] },
    { questionIds: [q2] },
  ];
  assert.deepEqual(nextNativeOpenResponseReveal(new Set(), [q1, q2], panels), { questionId: q1, panelIndex: 0 });
  assert.deepEqual(nextNativeOpenResponseReveal(new Set([q1]), [q1, q2], panels), { questionId: q2, panelIndex: 1 });
  assert.deepEqual(nextNativeOpenResponseReveal(new Set([q1, q2]), [q1, q2], panels), { questionId: null, panelIndex: -1 });
});

test("panelized Open Response keeps semantic questions canonical and rejects ambiguous membership", () => {
  const { publicDocument, teacherDocument } = pair([q1, q2]);
  publicDocument.parts[0].interaction = promoteNativeOpenResponsePanels(publicDocument.parts[0].interaction);
  const interaction = publicDocument.parts[0].interaction;
  const secondPanelId = `panel-${"4".repeat(32)}`;
  interaction.presentation.panels.push({ id: secondPanelId, surface: { width: 800, height: 500 }, images: [], questionIds: [] });
  assignNativeOpenResponseQuestion(interaction, q2, secondPanelId);
  const normalized = kind.normalizePublic(publicDocument);
  assert.deepEqual(normalized.parts[0].interaction.presentation.panels.map((panel) => panel.questionIds), [[q1], [q2]]);
  assert.deepEqual(teacherDocument.parts[0].solution.modelAnswers.map((answer) => answer.questionId), [q1, q2]);
  assert.equal(validateNativeActivityPair(normalized, teacherDocument), true);

  const duplicate = structuredClone(publicDocument);
  duplicate.parts[0].interaction.presentation.panels[0].questionIds.push(q2);
  assert.throws(() => kind.normalizePublic(duplicate), /more than one panel/);
  const dangling = structuredClone(publicDocument);
  dangling.parts[0].interaction.presentation.panels[1].questionIds = [`q-${"9".repeat(32)}`];
  assert.throws(() => kind.normalizePublic(dangling), /does not reference/);
  const duplicatePanel = structuredClone(publicDocument);
  duplicatePanel.parts[0].interaction.presentation.panels[1].id = duplicatePanel.parts[0].interaction.presentation.panels[0].id;
  assert.throws(() => kind.normalizePublic(duplicatePanel), /panel identity/);
});

test("independent panel composition is backward compatible, repeatable, and canonically ordered", () => {
  const { publicDocument, teacherDocument } = pair([q1, q2]);
  publicDocument.parts[0].interaction = promoteNativeOpenResponsePanels(publicDocument.parts[0].interaction);
  const interaction = publicDocument.parts[0].interaction;
  const legacyPanel = interaction.presentation.panels[0];
  const legacyBefore = structuredClone(legacyPanel);
  const secondPanelId = nativeChildIdFromUuid("panel", "10000000-0000-4000-8000-000000000047");
  interaction.presentation.panels.push({ id: secondPanelId, surface: { width: 1024, height: 582 }, images: [], questionIds: [] });

  assert.deepEqual(nativeOpenResponsePanelPromptIds(legacyPanel), [q1, q2]);
  assert.deepEqual(nativeOpenResponsePanelResponseIds(legacyPanel), [q1, q2]);
  assert.deepEqual(kind.normalizePublic(publicDocument).parts[0].interaction.presentation.panels[0], legacyBefore, "an untouched legacy panel stays byte-shape compatible");
  const reorderedLegacy = structuredClone(interaction);
  reorderedLegacy.questions.reverse();
  updateNativeOpenResponsePanelMembership(reorderedLegacy, legacyPanel.id, q1, "response", false);
  assert.deepEqual(reorderedLegacy.presentation.panels[0].promptQuestionIds, [q2, q1], "first customization adopts current canonical question order");

  updateNativeOpenResponsePanelMembership(interaction, secondPanelId, q2, "prompt", true);
  updateNativeOpenResponsePanelMembership(interaction, secondPanelId, q1, "prompt", true);
  updateNativeOpenResponsePanelMembership(interaction, secondPanelId, q1, "response", true);
  const customized = interaction.presentation.panels[1];
  assert.equal(Object.hasOwn(customized, "questionIds"), false);
  assert.deepEqual(customized.promptQuestionIds, [q1, q2], "membership follows canonical question order rather than selection order");
  assert.deepEqual(customized.responseQuestionIds, [q1]);

  updateNativeOpenResponsePanelMembership(interaction, legacyPanel.id, q2, "response", false);
  assert.deepEqual(nativeOpenResponsePanelPromptIds(legacyPanel), [q1, q2]);
  assert.deepEqual(nativeOpenResponsePanelResponseIds(legacyPanel), [q1]);
  assert.equal(validateNativeActivityPair(kind.normalizePublic(publicDocument), teacherDocument), true);
  assert.deepEqual(teacherDocument.parts[0].solution.modelAnswers.map((answer) => answer.questionId), [q1, q2], "presentation duplication never forks Teacher answers");

  const partial = structuredClone(publicDocument);
  delete partial.parts[0].interaction.presentation.panels[0].responseQuestionIds;
  assert.throws(() => kind.normalizePublic(partial), /missing or unknown fields/);
  const duplicate = structuredClone(publicDocument);
  duplicate.parts[0].interaction.presentation.panels[1].promptQuestionIds.push(q1);
  assert.throws(() => kind.normalizePublic(duplicate), /duplicate question/);

  interaction.questions = interaction.questions.filter((question) => question.id !== q1);
  interaction.presentation.panels.forEach((panel) => {
    for (const key of ["questionIds", "promptQuestionIds", "responseQuestionIds"]) if (panel[key]) panel[key] = panel[key].filter((questionId) => questionId !== q1);
  });
  teacherDocument.parts[0].solution.modelAnswers = teacherDocument.parts[0].solution.modelAnswers.filter((answer) => answer.questionId !== q1);
  assert.equal(validateNativeActivityPair(kind.normalizePublic(publicDocument), teacherDocument), true, "canonical deletion can clean legacy and customized memberships without dangling IDs");
});

test("panel image geometry and globally duplicate image identities fail closed", () => {
  const { publicDocument } = pair([q1]);
  publicDocument.parts[0].interaction = promoteNativeOpenResponsePanels(publicDocument.parts[0].interaction);
  const interaction = publicDocument.parts[0].interaction;
  const imageId = nativeChildIdFromUuid("img", "10000000-0000-4000-8000-000000000043");
  publicDocument.assets = [asset];
  const image = { id: imageId, assetSlot: asset.slot, area: { x: 0, y: 0, width: 100, height: 100 }, order: 0, altText: "Panel diagram", decorative: false, fit: "contain", locked: false };
  interaction.presentation.panels[0].images = [image];
  interaction.presentation.panels.push({ id: nativeChildIdFromUuid("panel", "10000000-0000-4000-8000-000000000044"), surface: { width: 1024, height: 582 }, images: [], questionIds: [] });
  assert.doesNotThrow(() => kind.normalizePublic(publicDocument));

  const outside = structuredClone(publicDocument);
  outside.parts[0].interaction.presentation.panels[0].images[0].area.x = 1000;
  assert.throws(() => kind.normalizePublic(outside), /inside the logical surface/);

  const duplicateImage = structuredClone(publicDocument);
  duplicateImage.parts[0].interaction.presentation.panels[1].images = [structuredClone(image)];
  assert.throws(() => kind.normalizePublic(duplicateImage), /image identities/);
});

test("panel reassignment clamps geometry and panel deletion preserves questions and private answers", () => {
  const { publicDocument, teacherDocument } = pair([q1]);
  publicDocument.parts[0].interaction = promoteNativeOpenResponsePanels(publicDocument.parts[0].interaction);
  const interaction = publicDocument.parts[0].interaction;
  const secondPanelId = `panel-${"5".repeat(32)}`;
  interaction.presentation.panels.push({ id: secondPanelId, surface: { width: 400, height: 200 }, images: [], questionIds: [] });
  assert.equal(assignNativeOpenResponseQuestion(interaction, q1, secondPanelId).repositioned, true);
  const question = interaction.questions[0];
  assert.ok(question.promptArea.x + question.promptArea.width <= 400);
  assert.ok(question.responseRegion.area.y + question.responseRegion.area.height <= 200);
  removeNativeOpenResponsePanel(publicDocument, secondPanelId);
  assert.deepEqual(interaction.questions.map((entry) => entry.id), [q1]);
  assert.deepEqual(teacherDocument.parts[0].solution.modelAnswers.map((entry) => entry.questionId), [q1]);
  assert.match(assessNativeOpenResponseReadiness(publicDocument, teacherDocument).issues.join("\n"), /assigned to a panel/);
  assert.doesNotThrow(() => kind.normalizePublic(publicDocument));
});

test("panel reassignment safely resets response presentation for a much smaller destination surface", () => {
  const { publicDocument } = pair([q1]);
  publicDocument.parts[0].interaction = promoteNativeOpenResponsePanels(publicDocument.parts[0].interaction);
  const interaction = publicDocument.parts[0].interaction;
  const smallPanelId = nativeChildIdFromUuid("panel", "10000000-0000-4000-8000-000000000045");
  interaction.presentation.panels.push({ id: smallPanelId, surface: { width: 10, height: 10 }, images: [], questionIds: [] });
  assert.equal(assignNativeOpenResponseQuestion(interaction, q1, smallPanelId).repositioned, true);
  assert.doesNotThrow(() => kind.normalizePublic(publicDocument));

  const tooSmallPanelId = nativeChildIdFromUuid("panel", "10000000-0000-4000-8000-000000000046");
  interaction.presentation.panels.push({ id: tooSmallPanelId, surface: { width: 10, height: 8 }, images: [], questionIds: [] });
  assert.throws(() => assignNativeOpenResponseQuestion(interaction, q1, tooSmallPanelId), /too small/);
  assert.deepEqual(interaction.presentation.panels.find((panel) => panel.id === smallPanelId).questionIds, [q1]);
});

test("panel image cleanup retains a shared managed asset until its final panel use", () => {
  const { publicDocument } = pair();
  publicDocument.parts[0].interaction = promoteNativeOpenResponsePanels(publicDocument.parts[0].interaction);
  const interaction = publicDocument.parts[0].interaction;
  const shared = { assetId: "10000000-0000-4000-8000-000000000041", checksumSha256: "b".repeat(64), role: "activity_artwork", slot: "asset-shared-panels" };
  publicDocument.assets = [shared];
  const image = (idValue) => ({ id: idValue, assetSlot: shared.slot, area: { x: 0, y: 0, width: 100, height: 100 }, order: 0, altText: "Shared diagram", decorative: false, fit: "contain", locked: false });
  interaction.presentation.panels[0].images = [image(nativeChildIdFromUuid("img", "10000000-0000-4000-8000-000000000041"))];
  interaction.presentation.panels.push({ id: nativeChildIdFromUuid("panel", "10000000-0000-4000-8000-000000000042"), surface: { width: 1024, height: 582 }, images: [image(nativeChildIdFromUuid("img", "10000000-0000-4000-8000-000000000042"))], questionIds: [] });
  removeNativeOpenResponsePanel(publicDocument, interaction.presentation.panels[0].id);
  assert.deepEqual(publicDocument.assets, [shared]);
  removeNativeOpenResponsePanel(publicDocument, interaction.presentation.panels[0].id);
  assert.deepEqual(publicDocument.assets, []);
});

function region(overrides = {}) {
  const responseRegion = createNativeOpenResponseQuestion(q1).responseRegion;
  responseRegion.presentation = { ...responseRegion.presentation, ...overrides };
  return responseRegion;
}

test("authored size and blank lines survive normalization, resizing, and teacher rendering metrics", () => {
  const { publicDocument, teacherDocument } = pair([q1]);
  const question = publicDocument.parts[0].interaction.questions[0];
  question.prompt = "First prompt\r\n\r\nThird prompt";
  question.responseRegion.presentation.answerSizeMode = "authored";
  question.responseRegion.presentation.answerFontSizeMax = 100;
  teacherDocument.parts[0].solution.modelAnswers[0].text = "First line\r\n\r\nThird line";
  const normalized = kind.normalizePublic(publicDocument);
  const normalizedTeacher = kind.normalizeTeacher(teacherDocument, activityId);
  assert.equal(normalized.parts[0].interaction.questions[0].prompt, "First prompt\n\nThird prompt");
  assert.equal(normalizedTeacher.parts[0].solution.modelAnswers[0].text, "First line\n\nThird line");
  resizeNativeOpenResponseRegion(question.responseRegion, { ...question.responseRegion.area, height: 100 });
  assert.equal(question.responseRegion.presentation.answerFontSizeMax, 100);
  const fitted = autoFitNativeOpenResponseAnswer({ text: "A\n\nB", responseRegion: question.responseRegion });
  assert.equal(fitted.fontSize, 100);
  assert.deepEqual(fitted.lines, ["A", "", "B"]);
  assert.equal(fitted.baselines.length, 3);
  assert.equal(fitted.fits, false);
  assert.equal(kind.assessReadiness(publicDocument, teacherDocument).ready, true);
  assertPublicBuilderDocument(normalized);
});

test("deterministic Auto Fit covers wrapping, whitespace, tokens, punctuation, boundaries, and overflow", () => {
  assert.equal(normalizeNativeAnswerWhitespace("  one\n  two   three "), "one\ntwo three");
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

test("runtime measurement preserves requested size and only reduces it when the selected face requires it", () => {
  const ahemWidth = (text, fontSize) => String(text).length * fontSize;
  const at16 = region({ lineCount: 1, linePositions: [40], lineWidth: 100, answerFontSizeMin: 12, answerFontSizeMax: 16 });
  const at32 = region({ lineCount: 1, linePositions: [40], lineWidth: 100, answerFontSizeMin: 12, answerFontSizeMax: 32 });
  assert.equal(autoFitNativeOpenResponseAnswer({ text: "OK", responseRegion: at16, measureTextWidth: ahemWidth }).fontSize, 16);
  assert.equal(autoFitNativeOpenResponseAnswer({ text: "OK", responseRegion: at32, measureTextWidth: ahemWidth }).fontSize, 32);

  const fitted = autoFitNativeOpenResponseAnswer({ text: "AAAA", responseRegion: at32, measureTextWidth: ahemWidth });
  assert.deepEqual({ requested: at32.presentation.answerFontSizeMax, effective: fitted.fontSize, fits: fitted.fits }, { requested: 32, effective: 25, fits: true });
  assert.equal(at32.presentation.answerFontSizeMax, 32, "derived fitting must not overwrite the configured request");

  const impossible = region({ lineCount: 1, linePositions: [40], lineWidth: 30, answerFontSizeMin: 16, answerFontSizeMax: 32 });
  const overflow = autoFitNativeOpenResponseAnswer({ text: "AAAAAAAAAA", responseRegion: impossible, measureTextWidth: ahemWidth });
  assert.equal(overflow.fontSize, 16);
  assert.equal(overflow.fits, false);
  assert.ok(overflow.overflowReason);

  const fallbackFit = autoFitNativeOpenResponseAnswer({ text: "iiiiiiiiii", responseRegion: region({ lineCount: 1, linePositions: [40], lineWidth: 150, answerFontSizeMin: 16, answerFontSizeMax: 32 }) });
  const ahemFit = autoFitNativeOpenResponseAnswer({ text: "iiiiiiiiii", responseRegion: region({ lineCount: 1, linePositions: [40], lineWidth: 150, answerFontSizeMin: 16, answerFontSizeMax: 32 }), measureTextWidth: ahemWidth });
  assert.notEqual(ahemFit.fontSize, fallbackFit.fontSize, "selected-font metrics must affect the derived fit");
});
