import assert from "node:assert/strict";
import test from "node:test";

import { isNativeChildId } from "../src/data/native-activities/nativeChildIdentity.js";
import { assessNativeSingleChoiceReadiness } from "../src/data/native-activities/nativeSingleChoice.js";
import {
  generateNativeSingleChoiceHotspotImportCandidate,
  NATIVE_SINGLE_CHOICE_HOTSPOT_BULK_MAX_CHARACTERS,
  parseNativeSingleChoiceHotspotBulk,
  scaleNativeSingleChoiceHotspotArea,
} from "../src/data/native-activities/nativeSingleChoiceHotspotBulkAuthoring.js";

const childId = (prefix, value) => `${prefix}-${value.toString(16).padStart(32, "0")}`;
const asset = { assetId: "30000000-0000-4000-8000-000000000001", checksumSha256: "a".repeat(64), role: "activity_artwork", slot: "panel-background" };

function publicDraft() {
  const questions = [1, 2].map((questionOrdinal) => ({
    id: childId("q", questionOrdinal),
    prompt: `Question ${questionOrdinal}`,
    options: [1, 2, 3].map((optionOrdinal) => ({ id: childId("opt", questionOrdinal * 10 + optionOrdinal), text: `Option ${questionOrdinal}.${optionOrdinal}` })),
  }));
  const panels = [
    { id: childId("panel", 1), backgroundAssetSlot: asset.slot, sourceWidth: 1024, sourceHeight: 582, hotspots: [] },
    { id: childId("panel", 2), backgroundAssetSlot: asset.slot, sourceWidth: 512, sourceHeight: 291, hotspots: [] },
    { id: childId("panel", 3), backgroundAssetSlot: asset.slot, sourceWidth: 800, sourceHeight: 800, hotspots: [] },
  ];
  return {
    schemaVersion: "1.0", activityId: "choice-bulk", kind: "single-choice",
    metadata: { title: "Bulk geometry", visibleInstructionText: "" }, placement: { pageId: "page-1" }, assets: [asset],
    parts: [{ id: "part-1", interaction: { kind: "single-choice", questions, presentation: { kind: "image-hotspot", panels } } }],
    audioTextHotspots: { marker: "must remain byte-identical" },
  };
}

const onePanelSource = "SOURCE 1024x582\n\nPANEL 1\n1.1 x=120 y=185 width=190 height=30";
const twoPanelSource = "SOURCE 1024x582\nPANEL 1\n1.1 x=120 y=185 width=190 height=30\n1.2 x=315 y=185 width=170 height=30\nPANEL 2\n2.1 x=140 y=240 width=160 height=30";

test("strict parser accepts one or multiple panels and retains ordinal source lines", () => {
  const one = parseNativeSingleChoiceHotspotBulk(onePanelSource);
  assert.deepEqual({ sourceWidth: one.sourceWidth, sourceHeight: one.sourceHeight, sourceLine: one.sourceLine, hotspotCount: one.hotspotCount }, { sourceWidth: 1024, sourceHeight: 582, sourceLine: 1, hotspotCount: 1 });
  assert.deepEqual(one.panels[0], { ordinal: 1, line: 3, entries: [{ questionOrdinal: 1, optionOrdinal: 1, area: { x: 120, y: 185, width: 190, height: 30 }, line: 4 }] });
  const many = parseNativeSingleChoiceHotspotBulk(twoPanelSource);
  assert.deepEqual(many.panels.map(({ ordinal, entries }) => [ordinal, entries.map(({ questionOrdinal, optionOrdinal }) => [questionOrdinal, optionOrdinal])]), [[1, [[1, 1], [1, 2]]], [2, [[2, 1]]]]);
});

test("parser normalizes CRLF, CR, LF, blank lines, and ordinary horizontal whitespace", () => {
  const expected = parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\nPANEL 1\n1.1 x=0 y=0 width=1 height=1");
  for (const separator of ["\n", "\r", "\r\n"]) {
    const parsed = parseNativeSingleChoiceHotspotBulk(["", " \tSOURCE\t10x10 ", "", " PANEL 1\t", " 1.1\tx=0  y=0\twidth=1 height=1 ", ""].join(separator));
    assert.deepEqual({ width: parsed.sourceWidth, height: parsed.sourceHeight, panel: parsed.panels[0].ordinal, area: parsed.panels[0].entries[0].area }, { width: expected.sourceWidth, height: expected.sourceHeight, panel: 1, area: expected.panels[0].entries[0].area });
  }
});

test("parser rejects empty, missing, late, duplicate, invalid, and oversized SOURCE directives", () => {
  assert.throws(() => parseNativeSingleChoiceHotspotBulk(" \n\t"), /Paste hotspot geometry/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("PANEL 1\n1.1 x=0 y=0 width=1 height=1"), /Line 1: expected SOURCE/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("PANEL 1\nSOURCE 10x10"), /Line 1: expected SOURCE/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\nSOURCE 10x10\nPANEL 1\n1.1 x=0 y=0 width=1 height=1"), /Line 2: SOURCE may appear only once/);
  for (const dimension of ["0x10", "-1x10", "1.5x10", "1e2x10", "9007199254740992x10", "16385x10"]) {
    assert.throws(() => parseNativeSingleChoiceHotspotBulk(`SOURCE ${dimension}\nPANEL 1\n1.1 x=0 y=0 width=1 height=1`), /Line 1:/);
  }
});

test("parser rejects missing, invalid, duplicate, and empty PANEL blocks", () => {
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10"), /Add at least one PANEL/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\nPANEL 0\n1.1 x=0 y=0 width=1 height=1"), /Line 2: PANEL ordinal/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\nPANEL 1.5"), /Line 2: expected PANEL/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\nPANEL 1\n1.1 x=0 y=0 width=1 height=1\nPANEL 1\n1.2 x=1 y=1 width=1 height=1"), /Line 4: PANEL 1 is duplicated/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\nPANEL 1\nPANEL 2\n2.1 x=0 y=0 width=1 height=1"), /Line 2: PANEL 1 must contain/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\nPANEL 1"), /Line 2: PANEL 1 must contain/);
});

test("parser rejects entries before panels, malformed ordinals, duplicate bindings, and unsupported syntax", () => {
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\n1.1 x=0 y=0 width=1 height=1\nPANEL 1"), /Line 2: add a PANEL header/);
  for (const reference of ["0.1", "1.0", "-1.1", "1.-1", "1.5.1", "1e2.1"]) assert.throws(() => parseNativeSingleChoiceHotspotBulk(`SOURCE 10x10\nPANEL 1\n${reference} x=0 y=0 width=1 height=1`), /Line 3:/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\nPANEL 1\n1.1 x=0 y=0 width=1 height=1\nPANEL 2\n1.1 x=1 y=1 width=1 height=1"), /Line 5: 1.1 is duplicated/);
  for (const line of ["# comment", "OFFSET 4", "1.1 y=0 x=0 width=1 height=1", "1.1 x=0 y=0 width=1 height=1 extra=2", "1.1 x=0 y=0 width=1 width=1 height=1"]) {
    assert.throws(() => parseNativeSingleChoiceHotspotBulk(`SOURCE 10x10\nPANEL 1\n${line}`), /Line 3:/);
  }
});

test("parser rejects invalid integer geometry, missing fields, overflow, and excessive input", () => {
  for (const geometry of [
    "x=-1 y=0 width=1 height=1", "x=0 y=-1 width=1 height=1", "x=0.5 y=0 width=1 height=1",
    "x=0 y=0 width=0 height=1", "x=0 y=0 width=1 height=0", "x=0 y=0 width=1", "x=0 y=0 width=1.5 height=1",
    "x=9007199254740992 y=0 width=1 height=1",
  ]) assert.throws(() => parseNativeSingleChoiceHotspotBulk(`SOURCE 10x10\nPANEL 1\n1.1 ${geometry}`), /Line 3:/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk("SOURCE 10x10\nPANEL 1\n1.1 x=9 y=0 width=2 height=1"), /Line 3: rectangle exceeds SOURCE 10x10/);
  assert.throws(() => parseNativeSingleChoiceHotspotBulk(`${onePanelSource}${" ".repeat(NATIVE_SINGLE_CHOICE_HOTSPOT_BULK_MAX_CHARACTERS)}`), /must not exceed 65,536 characters/);
});

test("edge scaling is exact, proportional, independently rounded, bounded, and deterministic", () => {
  const area = { x: 120, y: 185, width: 190, height: 30 };
  assert.deepEqual(scaleNativeSingleChoiceHotspotArea(area, { width: 1024, height: 582 }, { width: 1024, height: 582 }), area);
  assert.deepEqual(scaleNativeSingleChoiceHotspotArea(area, { width: 1024, height: 582 }, { width: 2048, height: 1164 }), { x: 240, y: 370, width: 380, height: 60 });
  assert.deepEqual(scaleNativeSingleChoiceHotspotArea(area, { width: 1024, height: 582 }, { width: 512, height: 291 }), { x: 60, y: 92, width: 95, height: 16 });
  assert.deepEqual(scaleNativeSingleChoiceHotspotArea({ x: 1, y: 1, width: 1, height: 1 }, { width: 3, height: 3 }, { width: 2, height: 5 }), { x: 0, y: 1, width: 2, height: 3 });
  assert.deepEqual(scaleNativeSingleChoiceHotspotArea({ x: 9, y: 9, width: 1, height: 1 }, { width: 10, height: 10 }, { width: 3, height: 7 }), { x: 2, y: 6, width: 1, height: 1 });
  const tiny = scaleNativeSingleChoiceHotspotArea({ x: 4, y: 4, width: 1, height: 1 }, { width: 10, height: 10 }, { width: 1, height: 1 });
  assert.deepEqual(tiny, { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(scaleNativeSingleChoiceHotspotArea(area, { width: 1024, height: 582 }, { width: 777, height: 333 }), scaleNativeSingleChoiceHotspotArea(area, { width: 1024, height: 582 }, { width: 777, height: 333 }));
  assert.throws(() => scaleNativeSingleChoiceHotspotArea({ x: 9, y: 0, width: 2, height: 1 }, { width: 10, height: 10 }, { width: 5, height: 5 }), /exceeds SOURCE/);
});

test("candidate resolves stable IDs, scales geometry, remains transactional, and preserves companion data", () => {
  const input = publicDraft(); const before = structuredClone(input);
  let next = 100; const result = generateNativeSingleChoiceHotspotImportCandidate({ source: twoPanelSource, publicDocument: input, createId: (prefix) => childId(prefix, next++) });
  assert.deepEqual(input, before);
  assert.deepEqual(result.publicDocument.audioTextHotspots, before.audioTextHotspots);
  assert.deepEqual(result.publicDocument.parts[0].interaction.questions, before.parts[0].interaction.questions);
  const [first, second] = result.publicDocument.parts[0].interaction.presentation.panels;
  assert.deepEqual(first.hotspots.map(({ questionId, optionId, area }) => ({ questionId, optionId, area })), [
    { questionId: childId("q", 1), optionId: childId("opt", 11), area: { x: 120, y: 185, width: 190, height: 30 } },
    { questionId: childId("q", 1), optionId: childId("opt", 12), area: { x: 315, y: 185, width: 170, height: 30 } },
  ]);
  assert.deepEqual(second.hotspots[0].area, { x: 70, y: 120, width: 80, height: 15 });
  assert.ok(first.hotspots.every((hotspot) => isNativeChildId(hotspot.id, "hot") && !Object.hasOwn(hotspot, "highlightArea")));
  assert.deepEqual(result.selection, { panelId: first.id, hotspotId: first.hotspots[0].id });
  assert.deepEqual(result.summary, { headline: "3 hotspots imported", sourceDimensions: { width: 1024, height: 582 }, panelsUpdated: 2, hotspotsImported: 3, preservedIds: 0, createdIds: 3, removedHotspots: 0, missingOptions: 3, targetDimensions: [{ panelOrdinal: 1, width: 1024, height: 582 }, { panelOrdinal: 2, width: 512, height: 291 }], warnings: [] });
});

test("candidate prerequisites reject missing draft, semantics, Visual mode, panel, background, dimensions, question, and option", () => {
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: onePanelSource, publicDocument: {} }), /native Multiple Choice draft/);
  const noQuestions = publicDraft(); noQuestions.parts[0].interaction.questions = [];
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: onePanelSource, publicDocument: noQuestions }), /questions and options/);
  const noVisual = publicDraft(); delete noVisual.parts[0].interaction.presentation;
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: onePanelSource, publicDocument: noVisual }), /Enable Visual mode/);
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: "SOURCE 10x10\nPANEL 4\n1.1 x=0 y=0 width=1 height=1", publicDocument: publicDraft() }), /Line 2: PANEL 4 does not exist/);
  const noBackground = publicDraft(); noBackground.parts[0].interaction.presentation.panels[0].backgroundAssetSlot = "";
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: onePanelSource, publicDocument: noBackground }), /Line 3: PANEL 1 needs an uploaded background/);
  const noDimensions = publicDraft(); noDimensions.parts[0].interaction.presentation.panels[0].sourceWidth = 0;
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: onePanelSource, publicDocument: noDimensions }), /Line 3: PANEL 1 needs valid intrinsic/);
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: "SOURCE 10x10\nPANEL 1\n3.1 x=0 y=0 width=1 height=1", publicDocument: publicDraft() }), /Line 3: question 3 does not exist/);
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: "SOURCE 10x10\nPANEL 1\n1.4 x=0 y=0 width=1 height=1", publicDocument: publicDraft() }), /Line 3: question 1 has only 3 options/);
});

test("listed hotspots require confirmation and replacement preserves, creates, removes, and moves IDs deterministically", () => {
  const input = publicDraft(); const panels = input.parts[0].interaction.presentation.panels; const questions = input.parts[0].interaction.questions;
  panels[0].hotspots = [
    { id: childId("hot", 1), questionId: questions[0].id, optionId: questions[0].options[0].id, area: { x: 1, y: 1, width: 2, height: 2 } },
    { id: childId("hot", 2), questionId: questions[0].id, optionId: questions[0].options[2].id, area: { x: 3, y: 3, width: 2, height: 2 } },
  ];
  panels[1].hotspots = [{ id: childId("hot", 3), questionId: questions[1].id, optionId: questions[1].options[0].id, area: { x: 4, y: 4, width: 2, height: 2 } }];
  const unlistedBefore = structuredClone(panels[2]);
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: twoPanelSource, publicDocument: input }), /Panel 1 already contains hotspots/);
  let next = 20;
  const result = generateNativeSingleChoiceHotspotImportCandidate({ source: twoPanelSource, publicDocument: input, replaceExistingPanels: true, createId: (prefix) => childId(prefix, next++) });
  const resultPanels = result.publicDocument.parts[0].interaction.presentation.panels;
  assert.deepEqual(resultPanels[2], unlistedBefore);
  assert.deepEqual(resultPanels[0].hotspots.map((hotspot) => hotspot.id), [childId("hot", 1), childId("hot", 20)]);
  assert.deepEqual(resultPanels[1].hotspots.map((hotspot) => hotspot.id), [childId("hot", 3)]);
  assert.deepEqual({ preserved: result.summary.preservedIds, created: result.summary.createdIds, removed: result.summary.removedHotspots }, { preserved: 2, created: 1, removed: 1 });

  const moving = publicDraft(); const movingPanels = moving.parts[0].interaction.presentation.panels; const movingQuestions = moving.parts[0].interaction.questions;
  movingPanels[1].hotspots = [{ id: childId("hot", 44), questionId: movingQuestions[0].id, optionId: movingQuestions[0].options[0].id, area: { x: 1, y: 1, width: 1, height: 1 } }];
  const moveSource = "SOURCE 1024x582\nPANEL 2\n2.1 x=1 y=1 width=1 height=1\nPANEL 1\n1.1 x=2 y=2 width=2 height=2";
  const moved = generateNativeSingleChoiceHotspotImportCandidate({ source: moveSource, publicDocument: moving, replaceExistingPanels: true, createId: (prefix) => childId(prefix, 45) });
  assert.equal(moved.publicDocument.parts[0].interaction.presentation.panels[0].hotspots[0].id, childId("hot", 44));
  assert.deepEqual(moved.publicDocument.parts[0].interaction.presentation.panels.map((panel) => panel.hotspots.map(({ questionId, optionId }) => [questionId, optionId])), [[[childId("q", 1), childId("opt", 11)]], [[childId("q", 2), childId("opt", 21)]], []]);
});

test("candidate rejects incoming and existing cross-panel conflicts and duplicate generated identities", () => {
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: "SOURCE 10x10\nPANEL 1\n1.1 x=0 y=0 width=1 height=1\nPANEL 2\n1.2 x=1 y=1 width=1 height=1", publicDocument: publicDraft() }), /Question 1 cannot span panels 1 and 2/);
  const occupied = publicDraft(); const questions = occupied.parts[0].interaction.questions; const panels = occupied.parts[0].interaction.presentation.panels;
  panels[2].hotspots = [{ id: childId("hot", 60), questionId: questions[0].id, optionId: questions[0].options[0].id, area: { x: 1, y: 1, width: 1, height: 1 } }];
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: onePanelSource, publicDocument: occupied }), /already has a hotspot on non-listed panel 3/);
  panels[2].hotspots[0].optionId = questions[0].options[2].id;
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: onePanelSource, publicDocument: occupied }), /Question 1 cannot span panels 3 and 1/);
  assert.throws(() => generateNativeSingleChoiceHotspotImportCandidate({ source: twoPanelSource, publicDocument: publicDraft(), createId: () => childId("hot", 99) }), /duplicate or invalid ID/);
});

test("candidate orders by current semantics, allows partial drafts, warns on aspect mismatch, and can satisfy readiness", () => {
  const unordered = "SOURCE 1024x582\nPANEL 1\n1.3 x=3 y=3 width=1 height=1\n1.1 x=1 y=1 width=1 height=1\n1.2 x=2 y=2 width=1 height=1";
  let next = 70; const partial = generateNativeSingleChoiceHotspotImportCandidate({ source: unordered, publicDocument: publicDraft(), createId: (prefix) => childId(prefix, next++) });
  assert.deepEqual(partial.publicDocument.parts[0].interaction.presentation.panels[0].hotspots.map((hotspot) => hotspot.optionId), [childId("opt", 11), childId("opt", 12), childId("opt", 13)]);
  assert.equal(partial.summary.missingOptions, 3);
  const mismatch = generateNativeSingleChoiceHotspotImportCandidate({ source: "SOURCE 1024x582\nPANEL 3\n1.1 x=0 y=0 width=1 height=1", publicDocument: publicDraft(), createId: (prefix) => childId(prefix, 90) });
  assert.match(mismatch.summary.warnings[0], /Panel 3 has a different aspect ratio.*scaled independently/);

  const fullSource = "SOURCE 1024x582\nPANEL 1\n1.1 x=1 y=1 width=1 height=1\n1.2 x=2 y=2 width=1 height=1\n1.3 x=3 y=3 width=1 height=1\nPANEL 2\n2.1 x=1 y=1 width=1 height=1\n2.2 x=2 y=2 width=1 height=1\n2.3 x=3 y=3 width=1 height=1";
  next = 100; const full = generateNativeSingleChoiceHotspotImportCandidate({ source: fullSource, publicDocument: publicDraft(), createId: (prefix) => childId(prefix, next++) });
  const teacherDocument = { schemaVersion: "1.0", activityId: "choice-bulk", kind: "single-choice", parts: [{ id: "part-1", solution: { kind: "single-choice", correctAnswers: [{ questionId: childId("q", 1), correctOptionId: childId("opt", 11) }, { questionId: childId("q", 2), correctOptionId: childId("opt", 21) }] } }] };
  assert.equal(full.summary.missingOptions, 0);
  assert.deepEqual(assessNativeSingleChoiceReadiness(full.publicDocument, teacherDocument), { ready: true, issues: [] });
});
