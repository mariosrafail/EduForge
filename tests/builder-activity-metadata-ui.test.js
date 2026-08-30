import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { projectNativeActivityPublicForAuthoring } from "../src/apps/book-builder/hosted/nativeActivityAuthoringProjection.js";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import {
  createUltimateB2HostedOpenResponseSeed,
  normalizeUltimateB2HostedOpenResponseDraft,
  projectUltimateB2HostedOpenResponseDraftForAuthoring,
} from "../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { findStudentsBookImplementation } from "../src/data/ultimate-b2/studentsBookCatalog.js";

const nativeKinds = ["open-response", "image", "single-choice", "complete-sentences", "listening", "oldschool-listening", "drag-drop"];

test("native schema v1 retains the deprecated instruction while Builder authoring projects it empty", () => {
  for (const [index, kindName] of nativeKinds.entries()) {
    const activityId = `metadata-compat-${index + 1}`;
    const kind = resolveNativeActivityKind(kindName);
    const blank = kind.createBlankPublic({ activityId, title: `Compatibility ${kindName}`, placement: { pageId: "page-1" } });
    assert.equal(blank.schemaVersion, "1.0");
    assert.equal(blank.metadata.visibleInstructionText, "");

    const historical = structuredClone(blank);
    historical.metadata.visibleInstructionText = `Historical ${kindName} instruction`;
    const normalized = kind.normalizePublic(historical, activityId);
    assert.equal(normalized.metadata.visibleInstructionText, historical.metadata.visibleInstructionText);

    const projected = projectNativeActivityPublicForAuthoring(normalized);
    assert.equal(projected.metadata.visibleInstructionText, "");
    assert.equal(normalized.metadata.visibleInstructionText, historical.metadata.visibleInstructionText);
    assert.deepEqual({ ...projected.metadata, visibleInstructionText: normalized.metadata.visibleInstructionText }, normalized.metadata);
  }
});

test("legacy editable Open Response remains schema-compatible and receives the same non-dirty authoring projection", () => {
  const activity = findStudentsBookImplementation("ultimate-b2-sb-u1-p1-o1");
  const seed = createUltimateB2HostedOpenResponseSeed(activity);
  const historical = { ...seed, visibleInstructionText: "Historical hosted instruction" };
  assert.equal(normalizeUltimateB2HostedOpenResponseDraft(historical, seed).visibleInstructionText, historical.visibleInstructionText);
  const projected = projectUltimateB2HostedOpenResponseDraftForAuthoring(historical);
  assert.equal(projected.visibleInstructionText, "");
  assert.equal(historical.visibleInstructionText, "Historical hosted instruction");
  assert.deepEqual(projected, projectUltimateB2HostedOpenResponseDraftForAuthoring(historical));
});

test("all Activity Builder editors omit generic instruction controls and preserve real content plus stable identity", async () => {
  const editorPaths = [
    "src/apps/book-builder/hosted/NativeOpenResponseEditor.jsx",
    "src/apps/book-builder/hosted/NativeImageEditor.jsx",
    "src/apps/book-builder/hosted/NativeSingleChoiceEditor.jsx",
    "src/apps/book-builder/hosted/NativeCompleteSentencesEditor.jsx",
    "src/apps/book-builder/hosted/NativeListeningEditor.jsx",
    "src/apps/book-builder/hosted/NativeDragDropEditor.jsx",
  ];
  const editors = await Promise.all(editorPaths.map((path) => readFile(path, "utf8")));
  for (const editor of editors) {
    assert.match(editor, /Activity title/);
    assert.match(editor, /activityId/);
    assert.match(editor, /projectNativeActivityPublicForAuthoring/);
    assert.doesNotMatch(editor, /Visible instruction|Student instruction|metadata\.visibleInstructionText/);
  }
  assert.match(editors[0], /Prompt|Private model answer/);
  assert.match(editors[1], /Content|Alt text/);
  assert.match(editors[2], /Prompt|Options and private correct answer/);
  assert.match(editors[3], /Full sentence with one marked answer|parseNativeCompleteSentencesMarkedSentence/);
  assert.doesNotMatch(editors[3], /Private correct word or phrase/);
  const listeningHelpers = await Promise.all([
    readFile("src/apps/book-builder/hosted/NativeListeningQuestionAuthoring.jsx", "utf8"),
    readFile("src/apps/book-builder/hosted/NativeListeningTranscriptAuthoring.jsx", "utf8"),
  ]);
  assert.match(`${editors[4]}\n${listeningHelpers.join("\n")}`, /Public prompt|Transcript text|Teacher-only model answer/);
  assert.match(editors[5], /Shared word bank|Teacher-only correct mappings/);

  const legacyEditor = await readFile("src/apps/ultimate-b2-builder/HostedOpenResponseEditor.jsx", "utf8");
  assert.match(legacyEditor, /Question \{index \+ 1\}/);
  assert.match(legacyEditor, /projectUltimateB2HostedOpenResponseDraftForAuthoring/);
  assert.doesNotMatch(legacyEditor, /Student instruction|Visible instruction/);
});

test("Activity Builder header contains only Add Activity actions and no global status banner", async () => {
  const [workspace, reviewCss, modernCss] = await Promise.all([
    readFile("src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx", "utf8"),
    readFile("src/apps/ultimate-b2-builder/hostedUltimateB2BuilderReview.css", "utf8"),
    readFile("src/apps/ultimate-b2-builder/hostedUltimateB2BuilderModern.css", "utf8"),
  ]);
  assert.match(workspace, /activity-builder-header-actions/);
  assert.match(workspace, /Add Activity/);
  assert.match(workspace, /Placement/);
  assert.match(workspace, /Initial title/);
  assert.match(workspace, /Create activity/);
  assert.doesNotMatch(`${workspace}\n${reviewCss}\n${modernCss}`, /b2-hosted-review-banner/);
  assert.doesNotMatch(modernCss, /min-width:\s*270px/);
  assert.match(modernCss, /\.activity-builder-header \{[^}]*display:\s*flex[^}]*justify-content:\s*space-between/);
});
