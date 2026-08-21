import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

import { assertPublicBuilderDocument, builderDocumentSha256, stableBuilderJson } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2 } from "../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { validateBuilderNativeAssetReferences } from "../netlify-sites/ultimate-b2-builder/server/_builder-native-activity-store.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { nativeChildIdFromUuid } from "../src/data/native-activities/nativeChildIdentity.js";
import { assessNativeSingleChoiceReadiness } from "../src/data/native-activities/nativeSingleChoice.js";
import { logicalAreaStyle } from "../src/components/builder-studio/stageGeometry.js";
import {
  addUnansweredNativeSingleChoiceQuestion,
  removeNativeSingleChoiceOption,
  setNativeSingleChoiceCorrectAnswer,
} from "../src/data/native-activities/nativeSingleChoiceAuthoring.js";
import { selectNativeSingleChoiceResponse, updateNativeSingleChoiceVisualNavigation, visibleNativeSingleChoicePanelIndexes } from "../src/data/native-activities/nativeSingleChoiceRuntime.js";
import { createPublicationV2FixtureSources } from "./fixtures/publication-v2.js";

const kind = resolveNativeActivityKind("single-choice");
const activityId = "ultimate-b2-sb-u1-p1-o97";
const pageId = "ub2-sb-unit-1-part-1";
const ids = {
  questions: [nativeChildIdFromUuid("q", "20000000-0000-4000-8000-000000000001"), nativeChildIdFromUuid("q", "20000000-0000-4000-8000-000000000002")],
  options: [
    [nativeChildIdFromUuid("opt", "20000000-0000-4000-8000-000000000011"), nativeChildIdFromUuid("opt", "20000000-0000-4000-8000-000000000012")],
    [nativeChildIdFromUuid("opt", "20000000-0000-4000-8000-000000000013"), nativeChildIdFromUuid("opt", "20000000-0000-4000-8000-000000000014")],
  ],
  panels: [nativeChildIdFromUuid("panel", "20000000-0000-4000-8000-000000000021"), nativeChildIdFromUuid("panel", "20000000-0000-4000-8000-000000000022")],
  hotspots: Array.from({ length: 4 }, (_, index) => nativeChildIdFromUuid("hot", `20000000-0000-4000-8000-${String(index + 31).padStart(12, "0")}`)),
};
const visualAsset = { assetId: "20000000-0000-4000-8000-000000000041", checksumSha256: "b".repeat(64), role: "activity_artwork", slot: "visual-background" };

function visualPair() {
  const publicDocument = kind.createBlankPublic({ activityId, title: "Visual Multiple Choice", placement: { pageId } });
  publicDocument.assets = [visualAsset];
  publicDocument.parts[0].interaction.questions = ids.questions.map((questionId, questionIndex) => ({
    id: questionId,
    prompt: `Question ${questionIndex + 1}?`,
    options: ids.options[questionIndex].map((optionId, optionIndex) => ({ id: optionId, text: `Option ${questionIndex + 1}.${optionIndex + 1}` })),
  }));
  publicDocument.parts[0].interaction.presentation = {
    kind: "image-hotspot",
    panels: ids.panels.map((panelId, panelIndex) => ({
      id: panelId,
      backgroundAssetSlot: visualAsset.slot,
      sourceWidth: 1200,
      sourceHeight: 800,
      hotspots: ids.options[panelIndex].map((optionId, optionIndex) => ({
        id: ids.hotspots[panelIndex * 2 + optionIndex],
        questionId: ids.questions[panelIndex],
        optionId,
        area: { x: 100 + optionIndex * 400, y: 200, width: 300, height: 120 },
      })),
    })),
  };
  const teacherDocument = kind.createBlankTeacher({ activityId });
  teacherDocument.parts[0].solution.correctAnswers = ids.questions.map((questionId, index) => ({ questionId, correctOptionId: ids.options[index][1] }));
  return { publicDocument, teacherDocument };
}

function mutateVisual(mutator) {
  const pair = visualPair();
  mutator(pair.publicDocument.parts[0].interaction.presentation, pair.publicDocument);
  return pair;
}

test("legacy text-only Single Choice canonical JSON and immutable publication hashes remain unchanged", () => {
  const document = {
    schemaVersion: "1.0", activityId: "choice-compat", kind: "single-choice",
    metadata: { title: "Compatibility", visibleInstructionText: "" }, placement: { pageId: "page-1" }, assets: [],
    parts: [{ id: "part-1", interaction: { kind: "single-choice", questions: [{ id: "q-00000000000040008000000000000001", prompt: "Question?", options: [{ id: "opt-00000000000040008000000000000001", text: "A" }, { id: "opt-00000000000040008000000000000002", text: "B" }] }] } }],
  };
  const normalized = kind.normalizePublic(document, "choice-compat");
  assert.deepEqual(Object.keys(normalized.parts[0].interaction), ["kind", "questions"]);
  assert.equal(builderDocumentSha256(normalized), "370d125e49355054168f083193ff088daa98dcdfad9aadb6c74b4372c51e40ba");
  assert.doesNotMatch(stableBuilderJson(normalized), /presentation/);

  const compiled = compileUltimateB2ComponentReleaseV2(createPublicationV2FixtureSources());
  assert.deepEqual({
    compatibility: compiled.compatibility,
    source: compiled.sourceSnapshotSha256,
    public: compiled.publicProjectionSha256,
    teacher: compiled.teacherProjectionSha256,
    release: compiled.releaseSha256,
  }, {
    compatibility: "f1fca746955e58c0c4153c97a717a2f5e024cb5d12eb9263ad8c6b2a7caf9316",
    source: "2471477ceb9d4d454528baa58f644717b1f40fd2246de3bcf035cc5ceeaa1427",
    public: "f74cc28b0aafc76dacb990ed1bc9a72229134c9923fd6cfb6608c6b0a26bdac6",
    teacher: "0f8211a405cc7074054d5aab9e74e0f035d07eb94f56c9ca2c34655b289dd5a1",
    release: "4ec25bc0fe4a738a1c4e4aae2b2420eb628e819f77a297f40a45c73592aa8c8d",
  });
});

test("visual Single Choice normalizes strict student-safe panels and source-pixel hotspots", () => {
  const pair = visualPair();
  assert.equal(kind.validatePair(pair.publicDocument, pair.teacherDocument), true);
  const normalized = kind.normalizePublic(pair.publicDocument, activityId);
  assert.equal(normalized.schemaVersion, "1.0");
  assert.equal(normalized.parts.length, 1);
  assert.equal(normalized.parts[0].id, "part-1");
  assert.equal(normalized.parts[0].interaction.presentation.panels.length, 2);
  assert.doesNotThrow(() => assertPublicBuilderDocument(normalized));
  assert.doesNotMatch(JSON.stringify(normalized), /correctAnswers|correctOptionId|isCorrect|answerKey/);
  assert.match(JSON.stringify(pair.teacherDocument), /correctAnswers|correctOptionId/);
});

test("visual contract rejects unknown fields, invalid identities, dimensions, geometry, and semantic bindings", () => {
  const cases = [
    mutateVisual((presentation) => { presentation.extra = true; }),
    mutateVisual((presentation) => { presentation.panels[0].id = "panel-1"; }),
    mutateVisual((presentation) => { presentation.panels[0].sourceWidth = 0; }),
    mutateVisual((presentation) => { presentation.panels[0].hotspots[0].area.x = 1199; }),
    mutateVisual((presentation) => { presentation.panels[0].hotspots[0].questionId = nativeChildIdFromUuid("q", "20000000-0000-4000-8000-000000000099"); }),
    mutateVisual((presentation) => { presentation.panels[0].hotspots[0].optionId = ids.options[1][0]; }),
    mutateVisual((presentation) => { presentation.panels[1].hotspots[0].id = presentation.panels[0].hotspots[0].id; }),
    mutateVisual((presentation) => { presentation.panels[0].hotspots[0].correctOptionId = ids.options[0][0]; }),
  ];
  for (const pair of cases) assert.throws(() => kind.normalizePublic(pair.publicDocument, activityId));
});

test("visual topology requires exact unambiguous option coverage and keeps each question on one panel", () => {
  const missing = mutateVisual((presentation) => { presentation.panels[0].hotspots.pop(); });
  assert.throws(() => kind.validatePair(missing.publicDocument, missing.teacherDocument), /exactly one hotspot/);
  const duplicate = mutateVisual((presentation) => { presentation.panels[0].hotspots[1].optionId = presentation.panels[0].hotspots[0].optionId; });
  assert.throws(() => kind.validatePair(duplicate.publicDocument, duplicate.teacherDocument), /exactly one hotspot/);
  const split = mutateVisual((presentation) => {
    const moved = presentation.panels[0].hotspots.pop();
    presentation.panels[1].hotspots.push(moved);
  });
  assert.throws(() => kind.validatePair(split.publicDocument, split.teacherDocument), /cannot span visual panels/);
});

test("local unanswered authoring never guesses option one and strict persisted topology remains enforced", () => {
  const publicDocument = kind.createBlankPublic({ activityId, title: "Manual", placement: { pageId } });
  const teacherDocument = kind.createBlankTeacher({ activityId });
  let counter = 0;
  const generated = [ids.questions[0], ids.options[0][0], ids.options[0][1]];
  const { questionId } = addUnansweredNativeSingleChoiceQuestion(publicDocument, teacherDocument, () => generated[counter++]);
  const question = publicDocument.parts[0].interaction.questions[0];
  question.prompt = "Choose explicitly."; question.options[0].text = "First"; question.options[1].text = "Second";
  assert.deepEqual(teacherDocument.parts[0].solution.correctAnswers, []);
  assert.match(assessNativeSingleChoiceReadiness(publicDocument, teacherDocument).issues.join(" "), /needs a correct option/);
  assert.throws(() => kind.validatePair(publicDocument, teacherDocument), /exactly match/);
  setNativeSingleChoiceCorrectAnswer(publicDocument, teacherDocument, questionId, question.options[1].id);
  assert.equal(assessNativeSingleChoiceReadiness(publicDocument, teacherDocument).ready, true);
  assert.equal(kind.validatePair(publicDocument, teacherDocument), true);
  removeNativeSingleChoiceOption(publicDocument, teacherDocument, questionId, question.options[1].id);
  assert.deepEqual(teacherDocument.parts[0].solution.correctAnswers, []);
});

test("visual navigation and selection preserve the canonical response model", () => {
  const original = { [ids.questions[0]]: ids.options[0][0] };
  const changed = selectNativeSingleChoiceResponse(original, ids.questions[0], ids.options[0][1]);
  assert.deepEqual(changed, { [ids.questions[0]]: ids.options[0][1] });
  assert.deepEqual(original, { [ids.questions[0]]: ids.options[0][0] });
  let navigation = { panelIndex: 0, showAll: false };
  navigation = updateNativeSingleChoiceVisualNavigation(navigation, 2, "next");
  assert.deepEqual(navigation, { panelIndex: 1, showAll: false });
  assert.deepEqual(updateNativeSingleChoiceVisualNavigation(navigation, 2, "next"), navigation);
  navigation = updateNativeSingleChoiceVisualNavigation(navigation, 2, "toggle-all");
  assert.deepEqual(visibleNativeSingleChoicePanelIndexes(navigation, 2), [0, 1]);
  navigation = updateNativeSingleChoiceVisualNavigation(navigation, 2, "paged");
  assert.deepEqual(visibleNativeSingleChoicePanelIndexes(navigation, 2), [1]);
});

test("source-pixel hotspots use shared percentage geometry at every responsive render size", () => {
  const style = logicalAreaStyle({ x: 120, y: 80, width: 300, height: 160 }, { width: 1200, height: 800 });
  assert.deepEqual(style, { left: "10%", top: "10%", width: "25%", height: "20%" });
  const rendered = (width) => ({ x: width * .1, y: (width * 2 / 3) * .1, width: width * .25, height: (width * 2 / 3) * .2 });
  assert.deepEqual(rendered(600), { x: 60, y: 40, width: 150, height: 80 });
  assert.deepEqual(rendered(960), { x: 96, y: 64, width: 240, height: 128 });
});

test("student surface keeps text radios unchanged and renders accessible managed visual hotspots", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { NativeSingleChoiceStudentSurface } = await vite.ssrLoadModule("/src/components/native-single-choice/NativeSingleChoiceStudentSurface.jsx");
    const pair = visualPair();
    const visual = renderToStaticMarkup(React.createElement(NativeSingleChoiceStudentSurface, { document: pair.publicDocument, assetUrl: () => "/published/background.png", responses: { [ids.questions[0]]: ids.options[0][1] } }));
    assert.match(visual, /published\/background\.png/);
    assert.match(visual, /native-single-choice-hotspot/);
    assert.match(visual, /aria-pressed="true"/);
    assert.match(visual, /Question 1\?: Option 1\.1/);
    assert.match(visual, /Show All/);
    assert.match(visual, />Next</);
    assert.doesNotMatch(visual, /correctAnswers|correctOptionId/);
    const readOnly = renderToStaticMarkup(React.createElement(NativeSingleChoiceStudentSurface, { document: pair.publicDocument, assetUrl: () => "/published/background.png", initialResponses: { [ids.questions[0]]: ids.options[0][0] }, readOnly: true }));
    assert.match(readOnly, /aria-pressed="true"/);
    assert.match(readOnly, /disabled=""/);

    const textDocument = kind.createBlankPublic({ activityId, title: "Text", placement: { pageId } });
    textDocument.parts[0].interaction.questions = pair.publicDocument.parts[0].interaction.questions;
    const textMarkup = renderToStaticMarkup(React.createElement(NativeSingleChoiceStudentSurface, { document: textDocument }));
    assert.match(textMarkup, /type="radio"/);
    assert.doesNotMatch(textMarkup, /native-single-choice-visual-stage|Show All/);
  } finally { await vite.close(); }
});

test("visual background is materialized through publication and dimension mismatches fail closed", () => {
  const sources = createPublicationV2FixtureSources();
  const entry = sources.native.activities[activityId];
  const pair = visualPair();
  entry.public.payload = pair.publicDocument;
  entry.public.sha256 = builderDocumentSha256(pair.publicDocument);
  entry.teacher.payload = pair.teacherDocument;
  entry.teacher.sha256 = builderDocumentSha256(pair.teacherDocument);
  sources.native.assetRows.push({
    id: visualAsset.assetId, checksum_sha256: visualAsset.checksumSha256, asset_role: visualAsset.role,
    object_key: "builder-native-assets/visual.png", storage_profile: "private", storage_bucket: "private", mime_type: "image/png", byte_size: 100,
    width: 1200, height: 800, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: activityId, asset_slot: visualAsset.slot },
  });
  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  assert.equal(compiled.publicProjection.nativeActivities[activityId].document.parts[0].interaction.presentation.panels.length, 2);
  assert.ok(compiled.assetManifest.some((asset) => asset.sha256 === visualAsset.checksumSha256));
  assert.doesNotMatch(JSON.stringify(compiled.publicProjection), /correctAnswers|correctOptionId/);
  sources.native.assetRows.at(-1).width = 1199;
  assert.throws(() => compileUltimateB2ComponentReleaseV2(sources), /native_activity_asset_invalid/);
});

test("authoring save validates managed background ownership and intrinsic dimensions", async () => {
  const row = {
    id: visualAsset.assetId, checksum_sha256: visualAsset.checksumSha256, asset_role: visualAsset.role,
    publication_status: "draft", access_level: "internal", storage_profile: "private", width: 1200, height: 800,
    source_metadata: { native_activity_id: activityId, asset_slot: visualAsset.slot },
  };
  const sql = async () => [row];
  const input = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId, assets: [visualAsset], requirements: [{ slot: visualAsset.slot, width: 1200, height: 800 }] };
  await assert.doesNotReject(validateBuilderNativeAssetReferences(sql, input));
  await assert.rejects(validateBuilderNativeAssetReferences(sql, { ...input, requirements: [{ slot: visualAsset.slot, width: 1199, height: 800 }] }), /dimensions do not match/);
});

test("Builder Front is public-only while Back owns answers, managed upload, and shared hotspot transforms", async () => {
  const [editor, canvas, publishedRunner, teacherSurface] = await Promise.all([
    readFile(new URL("../src/apps/book-builder/hosted/NativeSingleChoiceEditor.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-single-choice/NativeSingleChoiceHotspotCanvas.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/lms/activities/ultimate-b2/PublishedNativeActivityRunner.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/native-single-choice/NativeSingleChoiceTeacherSurface.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(editor, /<NativeSingleChoiceStudentSurface document=\{publicDraft\} assetUrl=\{assetUrl\}/);
  assert.doesNotMatch(editor, /NativeSingleChoiceStudentSurface[^>]+teacherDocument/);
  assert.match(editor, /addUnansweredNativeSingleChoiceQuestion/);
  assert.match(editor, /disabled=\{!dirty \|\| state\.saving \|\| !readiness\.ready \|\| readableTextIncomplete\}/);
  assert.match(editor, /uploadNativeActivityAsset/);
  assert.match(editor, /NativeSingleChoiceHotspotCanvas/);
  assert.match(editor, /Needs answer/);
  assert.match(canvas, /StageSelectionFrame/);
  assert.match(canvas, /onPointerDown=\{beginDraw\}/);
  assert.match(canvas, /onPointerMove=\{moveDraw\}/);
  assert.match(canvas, /onDelete=\{onDelete\}/);
  assert.match(publishedRunner, /NativeSingleChoiceStudentSurface document=\{document\} assetUrl=\{assetUrl\}/);
  assert.doesNotMatch(teacherSurface, /NativeSingleChoiceEditor|Front|Back|HotspotCanvas/);
});
