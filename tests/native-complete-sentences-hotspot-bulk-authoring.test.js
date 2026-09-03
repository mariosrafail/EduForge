import assert from "node:assert/strict";
import test from "node:test";

import { isNativeChildId } from "../src/data/native-activities/nativeChildIdentity.js";
import { assessNativeCompleteSentencesReadiness, assessNativeCompleteSentencesSaveability } from "../src/data/native-activities/nativeCompleteSentences.js";
import {
  generateNativeCompleteSentencesHotspotImportCandidate,
  NATIVE_COMPLETE_SENTENCES_HOTSPOT_BULK_MAX_CHARACTERS,
  parseNativeCompleteSentencesHotspotBulk,
  scaleNativeCompleteSentencesHotspotArea,
} from "../src/data/native-activities/nativeCompleteSentencesHotspotBulkAuthoring.js";

const childId = (prefix, value) => `${prefix}-${value.toString(16).padStart(32, "0")}`;
const artwork = { assetId: "30000000-0000-4000-8000-000000000001", checksumSha256: "a".repeat(64), role: "activity_artwork", slot: "panel-background" };
const font = { assetId: "30000000-0000-4000-8000-000000000002", checksumSha256: "b".repeat(64), role: "activity_font", slot: "answer-font" };

function publicDraft() {
  const items = [1, 2, 3, 4, 5].map((ordinal) => ({ id: childId("item", ordinal), prompt: `Sentence ${ordinal} [[blank]].` }));
  const panels = [
    { id: childId("panel", 1), backgroundAssetSlot: artwork.slot, sourceWidth: 1024, sourceHeight: 582, hotspots: [] },
    { id: childId("panel", 2), backgroundAssetSlot: artwork.slot, sourceWidth: 512, sourceHeight: 291, hotspots: [] },
    { id: childId("panel", 3), backgroundAssetSlot: artwork.slot, sourceWidth: 800, sourceHeight: 800, hotspots: [] },
  ];
  return {
    schemaVersion: "1.0", activityId: "complete-bulk", kind: "complete-sentences",
    metadata: { title: "Bulk geometry", visibleInstructionText: "" }, placement: { pageId: "page-1" }, assets: [artwork, font],
    parts: [{ id: "part-1", interaction: { kind: "complete-sentences", evaluationMode: "exact-answer", items, presentation: { kind: "image-hotspot", answerStyle: { fontSize: 24, color: "#12304b", fontAssetSlot: font.slot }, panels } } }],
    readableText: { marker: "preserve readable text" }, video: { marker: "preserve video" }, audioTextHotspots: { marker: "preserve audio companion" },
  };
}

function teacherDraft(document = publicDraft()) {
  return { parts: [{ solution: { kind: "complete-sentences", answers: document.parts[0].interaction.items.map((item, index) => ({ itemId: item.id, text: `Answer ${index + 1}` })) } }] };
}

const onePanelSource = "SOURCE 1024x582\n\nPANEL 1\nITEM 1 x=120 y=185 width=190 height=30";
const twoPanelSource = "SOURCE 1024x582\nPANEL 1\nITEM 1 x=120 y=185 width=190 height=30\nITEM 2 x=315 y=185 width=170 height=30\nPANEL 2\nITEM 3 x=140 y=240 width=160 height=30";

test("strict parser accepts one or multiple panels and retains ordinal source lines", () => {
  const one = parseNativeCompleteSentencesHotspotBulk(onePanelSource);
  assert.deepEqual({ sourceWidth: one.sourceWidth, sourceHeight: one.sourceHeight, sourceLine: one.sourceLine, hotspotCount: one.hotspotCount }, { sourceWidth: 1024, sourceHeight: 582, sourceLine: 1, hotspotCount: 1 });
  assert.deepEqual(one.panels[0], { ordinal: 1, line: 3, entries: [{ itemOrdinal: 1, area: { x: 120, y: 185, width: 190, height: 30 }, line: 4 }] });
  const many = parseNativeCompleteSentencesHotspotBulk(twoPanelSource);
  assert.deepEqual(many.panels.map(({ ordinal, entries }) => [ordinal, entries.map(({ itemOrdinal }) => itemOrdinal)]), [[1, [1, 2]], [2, [3]]]);
});

test("parser normalizes CRLF, CR, LF, blank lines, spaces, and tabs", () => {
  for (const separator of ["\n", "\r", "\r\n"]) {
    const parsed = parseNativeCompleteSentencesHotspotBulk(["", " \tSOURCE\t10x10 ", "", " PANEL 1\t", " ITEM\t1\tx=0  y=0\twidth=1 height=1 ", ""].join(separator));
    assert.deepEqual({ width: parsed.sourceWidth, height: parsed.sourceHeight, panel: parsed.panels[0].ordinal, item: parsed.panels[0].entries[0].itemOrdinal, area: parsed.panels[0].entries[0].area }, { width: 10, height: 10, panel: 1, item: 1, area: { x: 0, y: 0, width: 1, height: 1 } });
  }
});

test("parser rejects empty, missing, late, duplicate, invalid, and oversized SOURCE directives", () => {
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk(" \n\t"), /Paste hotspot geometry/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("PANEL 1\nITEM 1 x=0 y=0 width=1 height=1"), /Line 1: expected SOURCE/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("PANEL 1\nSOURCE 10x10"), /Line 1: expected SOURCE/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10\nSOURCE 10x10\nPANEL 1\nITEM 1 x=0 y=0 width=1 height=1"), /Line 2: SOURCE may appear only once/);
  for (const dimension of ["0x10", "-1x10", "1.5x10", "1e2x10", "9007199254740992x10", "16385x10"]) {
    assert.throws(() => parseNativeCompleteSentencesHotspotBulk(`SOURCE ${dimension}\nPANEL 1\nITEM 1 x=0 y=0 width=1 height=1`), /Line 1:/);
  }
});

test("parser rejects missing, invalid, duplicate, and empty PANEL blocks", () => {
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10"), /Add at least one PANEL/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10\nPANEL 0\nITEM 1 x=0 y=0 width=1 height=1"), /Line 2: PANEL ordinal/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10\nPANEL 1.5"), /Line 2: expected PANEL/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10\nPANEL 1\nITEM 1 x=0 y=0 width=1 height=1\nPANEL 1\nITEM 2 x=1 y=1 width=1 height=1"), /Line 4: PANEL 1 is duplicated/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10\nPANEL 1\nPANEL 2\nITEM 1 x=0 y=0 width=1 height=1"), /Line 2: PANEL 1 must contain/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10\nPANEL 1"), /Line 2: PANEL 1 must contain/);
});

test("parser rejects ITEM entries before panels, invalid ordinals, duplicates, and unsupported syntax", () => {
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10\nITEM 1 x=0 y=0 width=1 height=1\nPANEL 1"), /Line 2: add a PANEL header/);
  for (const ordinal of ["0", "-1", "1.5", "1e2", "31", "9007199254740992"]) assert.throws(() => parseNativeCompleteSentencesHotspotBulk(`SOURCE 10x10\nPANEL 1\nITEM ${ordinal} x=0 y=0 width=1 height=1`), /Line 3:/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10\nPANEL 1\nITEM 1 x=0 y=0 width=1 height=1\nPANEL 2\nITEM 1 x=1 y=1 width=1 height=1"), /Line 5: ITEM 1 is duplicated/);
  for (const line of ["# comment", "OFFSET 4", "ITEM 1 y=0 x=0 width=1 height=1", "ITEM 1 x=0 y=0 width=1 height=1 extra=2", "ITEM 1 x=0 y=0 width=1 width=1 height=1"]) {
    assert.throws(() => parseNativeCompleteSentencesHotspotBulk(`SOURCE 10x10\nPANEL 1\n${line}`), /Line 3: expected ITEM/);
  }
});

test("parser rejects invalid geometry, missing fields, overflow, and excessive input", () => {
  for (const geometry of [
    "x=-1 y=0 width=1 height=1", "x=0 y=-1 width=1 height=1", "x=0.5 y=0 width=1 height=1",
    "x=0 y=0 width=0 height=1", "x=0 y=0 width=1 height=0", "x=0 y=0 width=1", "x=0 y=0 width=1.5 height=1",
    "x=9007199254740992 y=0 width=1 height=1",
  ]) assert.throws(() => parseNativeCompleteSentencesHotspotBulk(`SOURCE 10x10\nPANEL 1\nITEM 1 ${geometry}`), /Line 3:/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk("SOURCE 10x10\nPANEL 1\nITEM 1 x=9 y=0 width=2 height=1"), /Line 3: rectangle exceeds SOURCE 10x10/);
  assert.throws(() => parseNativeCompleteSentencesHotspotBulk(`${onePanelSource}${" ".repeat(NATIVE_COMPLETE_SENTENCES_HOTSPOT_BULK_MAX_CHARACTERS)}`), /must not exceed 65,536 characters/);
});

test("edge scaling is exact, proportional, independently rounded, bounded, and deterministic", () => {
  const area = { x: 120, y: 185, width: 190, height: 30 };
  assert.deepEqual(scaleNativeCompleteSentencesHotspotArea(area, { width: 1024, height: 582 }, { width: 1024, height: 582 }), area);
  assert.deepEqual(scaleNativeCompleteSentencesHotspotArea(area, { width: 1024, height: 582 }, { width: 2048, height: 1164 }), { x: 240, y: 370, width: 380, height: 60 });
  assert.deepEqual(scaleNativeCompleteSentencesHotspotArea(area, { width: 1024, height: 582 }, { width: 512, height: 291 }), { x: 60, y: 92, width: 95, height: 16 });
  assert.deepEqual(scaleNativeCompleteSentencesHotspotArea({ x: 1, y: 1, width: 1, height: 1 }, { width: 3, height: 3 }, { width: 2, height: 5 }), { x: 0, y: 1, width: 2, height: 3 });
  assert.deepEqual(scaleNativeCompleteSentencesHotspotArea({ x: 9, y: 9, width: 1, height: 1 }, { width: 10, height: 10 }, { width: 3, height: 7 }), { x: 2, y: 6, width: 1, height: 1 });
  assert.deepEqual(scaleNativeCompleteSentencesHotspotArea({ x: 4, y: 4, width: 1, height: 1 }, { width: 10, height: 10 }, { width: 1, height: 1 }), { x: 0, y: 0, width: 1, height: 1 });
  assert.deepEqual(scaleNativeCompleteSentencesHotspotArea(area, { width: 1024, height: 582 }, { width: 777, height: 333 }), scaleNativeCompleteSentencesHotspotArea(area, { width: 1024, height: 582 }, { width: 777, height: 333 }));
  assert.throws(() => scaleNativeCompleteSentencesHotspotArea({ x: 9, y: 0, width: 2, height: 1 }, { width: 10, height: 10 }, { width: 5, height: 5 }), /exceeds SOURCE/);
});

test("candidate resolves stable IDs, scales geometry, is transactional, and preserves Complete companion state", () => {
  const input = publicDraft(); const before = structuredClone(input);
  let next = 100; const result = generateNativeCompleteSentencesHotspotImportCandidate({ source: twoPanelSource, publicDocument: input, createId: (prefix) => childId(prefix, next++) });
  assert.deepEqual(input, before);
  for (const key of ["readableText", "video", "audioTextHotspots"]) assert.deepEqual(result.publicDocument[key], before[key]);
  const nextInteraction = result.publicDocument.parts[0].interaction;
  assert.deepEqual(nextInteraction.items, before.parts[0].interaction.items);
  assert.deepEqual(nextInteraction.evaluationMode, before.parts[0].interaction.evaluationMode);
  assert.deepEqual(nextInteraction.presentation.answerStyle, before.parts[0].interaction.presentation.answerStyle);
  const [first, second] = nextInteraction.presentation.panels;
  assert.deepEqual(first.hotspots.map(({ itemId, area }) => ({ itemId, area })), [
    { itemId: childId("item", 1), area: { x: 120, y: 185, width: 190, height: 30 } },
    { itemId: childId("item", 2), area: { x: 315, y: 185, width: 170, height: 30 } },
  ]);
  assert.deepEqual(second.hotspots[0].area, { x: 70, y: 120, width: 80, height: 15 });
  assert.ok(first.hotspots.every((hotspot) => isNativeChildId(hotspot.id, "hot") && Object.keys(hotspot).sort().join(",") === "area,id,itemId"));
  assert.deepEqual(result.selection, { panelId: first.id, hotspotId: first.hotspots[0].id });
  assert.deepEqual(result.summary, { headline: "3 hotspots imported", sourceDimensions: { width: 1024, height: 582 }, panelsUpdated: 2, hotspotsImported: 3, preservedIds: 0, createdIds: 3, removedHotspots: 0, missingItems: 2, targetDimensions: [{ panelOrdinal: 1, width: 1024, height: 582 }, { panelOrdinal: 2, width: 512, height: 291 }], warnings: [] });
});

test("candidate prerequisites reject missing draft, semantics, Visual mode, panel, background, dimensions, and item", () => {
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: onePanelSource, publicDocument: {} }), /native Complete the Sentences draft/);
  const noItems = publicDraft(); noItems.parts[0].interaction.items = [];
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: onePanelSource, publicDocument: noItems }), /Create the Complete the Sentences items/);
  const noVisual = publicDraft(); delete noVisual.parts[0].interaction.presentation;
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: onePanelSource, publicDocument: noVisual }), /Open the Visual tab/);
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: "SOURCE 10x10\nPANEL 4\nITEM 1 x=0 y=0 width=1 height=1", publicDocument: publicDraft() }), /Line 2: PANEL 4 does not exist/);
  const noBackground = publicDraft(); noBackground.parts[0].interaction.presentation.panels[0].backgroundAssetSlot = "";
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: onePanelSource, publicDocument: noBackground }), /Line 3: PANEL 1 needs an uploaded background/);
  const noDimensions = publicDraft(); noDimensions.parts[0].interaction.presentation.panels[0].sourceWidth = 0;
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: onePanelSource, publicDocument: noDimensions }), /Line 3: PANEL 1 needs valid intrinsic image dimensions/);
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: "SOURCE 10x10\nPANEL 1\nITEM 6 x=0 y=0 width=1 height=1", publicDocument: publicDraft() }), /Line 3: item 6 does not exist/);
});

test("replacement preserves, creates, removes, and moves IDs while leaving non-listed panels unchanged", () => {
  const input = publicDraft(); const panels = input.parts[0].interaction.presentation.panels; const items = input.parts[0].interaction.items;
  panels[0].hotspots = [
    { id: childId("hot", 1), itemId: items[0].id, area: { x: 1, y: 1, width: 2, height: 2 } },
    { id: childId("hot", 2), itemId: items[3].id, area: { x: 3, y: 3, width: 2, height: 2 } },
  ];
  panels[1].hotspots = [{ id: childId("hot", 3), itemId: items[2].id, area: { x: 4, y: 4, width: 2, height: 2 } }];
  const unlistedBefore = structuredClone(panels[2]);
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: twoPanelSource, publicDocument: input }), /Panel 1 already contains hotspots/);
  let next = 20;
  const result = generateNativeCompleteSentencesHotspotImportCandidate({ source: twoPanelSource, publicDocument: input, replaceExistingPanels: true, createId: (prefix) => childId(prefix, next++) });
  const resultPanels = result.publicDocument.parts[0].interaction.presentation.panels;
  assert.deepEqual(resultPanels[2], unlistedBefore);
  assert.deepEqual(resultPanels[0].hotspots.map((hotspot) => hotspot.id), [childId("hot", 1), childId("hot", 20)]);
  assert.deepEqual(resultPanels[1].hotspots.map((hotspot) => hotspot.id), [childId("hot", 3)]);
  assert.deepEqual({ preserved: result.summary.preservedIds, created: result.summary.createdIds, removed: result.summary.removedHotspots }, { preserved: 2, created: 1, removed: 1 });

  const moving = publicDraft(); const movingPanels = moving.parts[0].interaction.presentation.panels; const movingItems = moving.parts[0].interaction.items;
  movingPanels[1].hotspots = [{ id: childId("hot", 44), itemId: movingItems[0].id, area: { x: 1, y: 1, width: 1, height: 1 } }];
  const moved = generateNativeCompleteSentencesHotspotImportCandidate({ source: "SOURCE 1024x582\nPANEL 2\nITEM 3 x=1 y=1 width=1 height=1\nPANEL 1\nITEM 1 x=2 y=2 width=2 height=2", publicDocument: moving, replaceExistingPanels: true, createId: (prefix) => childId(prefix, 45) });
  assert.equal(moved.publicDocument.parts[0].interaction.presentation.panels[0].hotspots[0].id, childId("hot", 44));
  assert.deepEqual(moved.publicDocument.parts[0].interaction.presentation.panels.map((panel) => panel.hotspots.map(({ itemId }) => itemId)), [[childId("item", 1)], [childId("item", 3)], []]);
});

test("non-listed mappings and invalid existing identities fail closed without mutation", () => {
  const input = publicDraft(); const panels = input.parts[0].interaction.presentation.panels; const items = input.parts[0].interaction.items;
  panels[2].hotspots = [{ id: childId("hot", 60), itemId: items[0].id, area: { x: 1, y: 1, width: 1, height: 1 } }];
  const before = structuredClone(input);
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: onePanelSource, publicDocument: input }), /ITEM 1 already has a hotspot on non-listed panel 3/);
  assert.deepEqual(input, before);
  const duplicate = publicDraft(); duplicate.parts[0].interaction.presentation.panels[0].hotspots = [{ id: childId("hot", 1), itemId: items[0].id, area: { x: 1, y: 1, width: 1, height: 1 } }]; duplicate.parts[0].interaction.presentation.panels[1].hotspots = [{ id: childId("hot", 2), itemId: items[0].id, area: { x: 1, y: 1, width: 1, height: 1 } }];
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: onePanelSource, publicDocument: duplicate }), /binding is invalid or duplicate/);
  const invalidId = publicDraft(); invalidId.parts[0].interaction.presentation.panels[0].hotspots = [{ id: "hot-invalid", itemId: items[0].id, area: { x: 1, y: 1, width: 1, height: 1 } }];
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: onePanelSource, publicDocument: invalidId }), /binding is invalid or duplicate/);
  assert.throws(() => generateNativeCompleteSentencesHotspotImportCandidate({ source: onePanelSource, publicDocument: publicDraft(), createId: () => "hot-invalid" }), /identity generation produced/);
});

test("candidate ordering is semantic, partial import stays saveable, full import becomes ready, and aspect mismatch warns", () => {
  const partialSource = "SOURCE 1024x582\nPANEL 1\nITEM 2 x=20 y=20 width=10 height=10\nITEM 1 x=10 y=10 width=10 height=10";
  let partialNext = 70; const partial = generateNativeCompleteSentencesHotspotImportCandidate({ source: partialSource, publicDocument: publicDraft(), createId: (prefix) => childId(prefix, partialNext++) });
  assert.deepEqual(partial.publicDocument.parts[0].interaction.presentation.panels[0].hotspots.map((hotspot) => hotspot.itemId), [childId("item", 1), childId("item", 2)]);
  assert.equal(partial.summary.missingItems, 3);
  assert.equal(assessNativeCompleteSentencesSaveability(partial.publicDocument, teacherDraft(partial.publicDocument)).saveable, true);
  const partialReadiness = assessNativeCompleteSentencesReadiness(partial.publicDocument, teacherDraft(partial.publicDocument));
  assert.equal(partialReadiness.ready, false); assert.match(partialReadiness.issues.join("\n"), /Item 3 needs exactly one blank hotspot/);
  const fullSource = "SOURCE 1024x582\nPANEL 1\nITEM 1 x=1 y=1 width=10 height=10\nITEM 2 x=20 y=1 width=10 height=10\nITEM 3 x=40 y=1 width=10 height=10\nITEM 4 x=60 y=1 width=10 height=10\nITEM 5 x=80 y=1 width=10 height=10";
  let next = 80; const full = generateNativeCompleteSentencesHotspotImportCandidate({ source: fullSource, publicDocument: publicDraft(), createId: (prefix) => childId(prefix, next++) });
  assert.equal(full.summary.missingItems, 0);
  assert.equal(assessNativeCompleteSentencesReadiness(full.publicDocument, teacherDraft(full.publicDocument)).ready, true);
  const mismatch = generateNativeCompleteSentencesHotspotImportCandidate({ source: "SOURCE 10x10\nPANEL 2\nITEM 1 x=0 y=0 width=1 height=1", publicDocument: publicDraft(), createId: (prefix) => childId(prefix, 99) });
  assert.deepEqual(mismatch.summary.warnings, ["Panel 2 has a different aspect ratio from SOURCE 10×10. Coordinates were scaled independently and may need manual adjustment."]);
});
