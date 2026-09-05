import assert from "node:assert/strict";
import test from "node:test";
import { resolveNativeActivityKind } from "../netlify-sites/ultimate-b2-builder/server/_native-activity-registry.js";
import { createMultiPartSection } from "../src/apps/book-builder/hosted/nativeMultiPartAuthoring.js";
import { duplicateNativeMultiPartSection, nativeMultiPartAssetSlots, projectNativeMultiPartChild } from "../src/data/native-activities/nativeMultiPart.js";
import { publicDocument as readyPublic, teacherDocument as readyTeacher } from "./fixtures/native-runtime-regressions/multi-part-data.js";

const activityId = "ultimate-b2-sb-u1-p1-o999";
const kind = resolveNativeActivityKind("multi-part");

test("all six completed section adapters pass topology and readiness in a composed document", () => {
  const pub = kind.normalizePublic(readyPublic); const teacher = kind.normalizeTeacher(readyTeacher);
  assert.equal(kind.validatePair(pub, teacher), true);
  assert.deepEqual(kind.assessReadiness(pub, teacher).issues, []);
  assert.equal(new Set(pub.parts[0].interaction.sections.map((section) => section.kind)).size, 6);
});

test("shared canvas rejects cross-section overlays, banks, mismatched coordinates and child-owned backgrounds", () => {
  for (const change of [
    (value) => { value.sections[1].interaction.panels[0].dropTargets[0].area = { ...value.sections[0].interaction.panels[0].dropTargets[0].area }; },
    (value) => { value.sections[1].bankRegion = { ...value.sections[0].bankRegion }; },
    (value) => { value.sections[0].interaction.panels[0].surface.width = 800; },
    (value) => { value.sections[0].interaction.panels.push(structuredClone(value.sections[0].interaction.panels[0])); },
    (value) => { value.sections[0].interaction.panels[0].images = [{ id: "img-00000000000000000000000000000001", assetSlot: "shared", area: { x: 0, y: 0, width: 100, height: 100 }, order: 0, altText: "", decorative: true, fit: "contain", locked: true }]; },
  ]) { const pub = structuredClone(readyPublic); change(pub.parts[0].interaction); assert.throws(() => kind.normalizePublic(pub)); }
  const orphan = structuredClone(readyTeacher); orphan.parts[0].solution.sections.pop();
  assert.throws(() => kind.validatePair(readyPublic, orphan), /identities/);
  const overflow = structuredClone(readyTeacher); overflow.parts[0].solution.sections[0].extra = "🙂".repeat(70000);
  assert.throws(() => kind.normalizeTeacher(overflow), /budget/);
});
function fixture() {
  const publicDocument = kind.createBlankPublic({ activityId, title: "Synthetic Multi-Part", placement: { pageId: "page-1" } });
  const teacherDocument = kind.createBlankTeacher({ activityId });
  const panel = { id: "panel-00000000000000000000000000000001", title: "Flow", layout: "flow", surface: { width: 1024, height: 582 }, background: null };
  publicDocument.parts[0].interaction.panels.push(panel);
  return { publicDocument, teacherDocument, panel };
}
test("Multi-Part blank and all six inline child kinds keep one parent identity", () => {
  const { publicDocument, teacherDocument, panel } = fixture();
  for (const childKind of ["drag-drop", "single-choice", "complete-sentences", "open-response", "mark-the-words", "image"]) {
    const added = createMultiPartSection(childKind, panel);
    publicDocument.parts[0].interaction.sections.push(added.section);
    teacherDocument.parts[0].solution.sections.push(added.privateSection);
    const child = projectNativeMultiPartChild(publicDocument, added.section, teacherDocument);
    assert.equal(child.publicDocument.activityId, activityId);
    assert.equal(child.teacherDocument.kind, childKind);
  }
  assert.equal(kind.normalizePublic(publicDocument).parts.length, 1);
  assert.equal(kind.normalizeTeacher(teacherDocument).parts[0].solution.sections.length, 6);
  assert.equal(kind.assessReadiness(publicDocument, teacherDocument).ready, false);
});
test("Multi-Part rejects nested kinds, duplicate ownership, unknown fields and aggregate budgets", () => {
  for (const mutate of [
    (value) => { value.parts.push(structuredClone(value.parts[0])); },
    (value) => { value.parts[0].interaction.extra = true; },
    (value) => { value.parts[0].interaction.panels = Array(13).fill(value.parts[0].interaction.panels[0]); },
    (value) => { value.metadata.title = "x".repeat(270000); },
    (value) => { value.parts[0].interaction.sections[0].kind = "multi-part"; },
    (value) => { value.parts[0].interaction.sections.push(value.parts[0].interaction.sections[0]); },
  ]) {
    const { publicDocument, panel } = fixture(); publicDocument.parts[0].interaction.sections.push(createMultiPartSection("single-choice", panel).section);
    mutate(publicDocument); assert.throws(() => kind.normalizePublic(publicDocument));
  }
});
test("Multi-Part duplicate remaps child identities and matching private bindings while retaining shared assets", () => {
  const { panel } = fixture(); const added = createMultiPartSection("single-choice", panel);
  const q = "q-00000000000000000000000000000002"; const option = "opt-00000000000000000000000000000003";
  added.section.interaction.questions.push({ id: q, prompt: "Choose", options: [{ id: option, text: "One" }] });
  added.privateSection.solution.correctAnswers.push({ questionId: q, correctOptionId: option });
  const copied = duplicateNativeMultiPartSection(added.section, added.privateSection);
  assert.notEqual(copied.section.id, added.section.id);
  assert.notEqual(copied.section.interaction.questions[0].id, q);
  assert.equal(copied.privateSection.solution.correctAnswers[0].questionId, copied.section.interaction.questions[0].id);
  assert.equal(copied.privateSection.solution.correctAnswers[0].correctOptionId, copied.section.interaction.questions[0].options[0].id);
  assert.deepEqual([...nativeMultiPartAssetSlots(copied.section)], []);
});
