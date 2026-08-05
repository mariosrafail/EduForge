import assert from "node:assert/strict";
import test from "node:test";

import { createDetectedFact } from "../lib/book-builder/detected-facts.js";
import { invalidateDecisions } from "../lib/book-builder/decisions.js";
import { buildActivityContentAnchorFacts } from "../lib/book-builder/profiles/ultimate-air-v2/activity-content-facts.js";

function candidate(overrides = {}) {
  return {
    activityCandidateId: "activity_fictional",
    sourceObjectLocator: "Contents/Resources/books/book1/unit/1/part1/obj1",
    displayTitle: null, displayTitleAvailability: "raster-only-or-missing",
    instructions: "Read the fictional sentences.", instructionAvailability: "structured",
    questions: [{
      id: "question_fictional", prompt: "Choose the fictional colour.", promptAvailability: "structured",
      sourceEvidence: [{ sourceRelativePath: "Contents/Resources/fiction.iwb", sourceSha256: "a".repeat(64) }],
      options: [
        { id: "option_amber", order: 1, text: "Amber", textAvailability: "structured" },
        { id: "option_blue", order: 2, text: "Blue", textAvailability: "structured" },
      ],
    }],
    draggables: [{ id: "drag_fictional", label: null, labelAvailability: "raster-only-or-missing", geometry: { x: 1, y: 2 } }],
    targets: [{ id: "target_fictional", label: "Box", labelAvailability: "structured", geometry: { x: 3, y: 4 } }],
    responseFields: [{ id: "response_fictional", prompt: null, promptAvailability: "raster-only-or-missing", geometry: { x: 5, y: 6 } }],
    sourceEvidenceDigests: [{ sourceRelativePath: "Contents/Resources/fiction.iwb", sourceSha256: "a".repeat(64) }],
    ...overrides,
  };
}

function facts(activity) {
  return buildActivityContentAnchorFacts(activity, (kind, locator, value) => createDetectedFact({
    kind, locator, value, parserId: "fixture", parserVersion: "1.0",
    evidence: [{ detectedContentDigest: value.detectedContentDigest, sourceReferenceDigest: value.sourceReferenceDigest }],
  }));
}

test("field anchors are content-redacted, stable, and cover every supported existing node", () => {
  const result = facts(candidate());
  assert.deepEqual(result.map((item) => item.kind), [
    "activity_title_content_anchor", "activity_instruction_content_anchor", "activity_question_content_anchor",
    "activity_option_content_anchor", "activity_option_content_anchor", "activity_draggable_content_anchor",
    "activity_target_content_anchor", "activity_response_field_content_anchor",
  ]);
  const serialized = JSON.stringify(result);
  for (const text of ["Read the fictional sentences.", "Choose the fictional colour.", "Amber", "Blue", "Box"]) assert.doesNotMatch(serialized, new RegExp(text.replace(/[.]/g, "\\.")));
  assert.equal(result.find((item) => item.kind === "activity_question_content_anchor").value.targetId, "question_fictional");
  assert.equal(result.find((item) => item.kind === "activity_option_content_anchor").value.parentId, "question_fictional");
  assert.match(result.find((item) => item.kind === "activity_draggable_content_anchor").value.geometryDigest, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(result[0].value, "sourceRelativeReferences"), false);
});

test("changing one prompt changes only its exact anchor while unrelated nested fields remain stable", () => {
  const before = facts(candidate());
  const changedCandidate = candidate();
  changedCandidate.questions = structuredClone(changedCandidate.questions);
  changedCandidate.questions[0].prompt = "Choose another fictional colour.";
  const after = facts(changedCandidate);
  const changed = after.filter((item, index) => item.evidenceHash !== before[index].evidenceHash);
  assert.deepEqual(changed.map((item) => item.kind), ["activity_question_content_anchor"]);

  const prompt = before.find((item) => item.kind === "activity_question_content_anchor");
  const option = before.find((item) => item.kind === "activity_option_content_anchor");
  const decisions = [prompt, option].map((fact, index) => ({
    id: `legacy-${index}`, kind: "legacy", value: "safe", dependencyFactIds: [fact.id],
    dependencyEvidenceHashes: { [fact.id]: fact.evidenceHash }, approvalState: "approved", stale: false, staleReasons: [],
    editorNote: "", createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z",
  }));
  const invalidated = invalidateDecisions(decisions, after);
  assert.equal(invalidated[0].stale, true);
  assert.equal(invalidated[1].stale, false);
});

test("new unrelated nodes add facts without changing old anchors and removal stales only the removed dependency", () => {
  const before = facts(candidate());
  const expanded = candidate();
  expanded.questions = [...structuredClone(expanded.questions), { id: "question_new", prompt: null, promptAvailability: "raster-only-or-missing", options: [] }];
  const after = facts(expanded);
  assert.equal(after.length, before.length + 1);
  for (const fact of before) assert.equal(after.find((item) => item.id === fact.id)?.evidenceHash, fact.evidenceHash);

  const removed = after.filter((item) => item.value.targetId !== "option_blue");
  const option = before.find((item) => item.value.targetId === "option_blue");
  const [decision] = invalidateDecisions([{
    id: "legacy-option", kind: "legacy", value: "safe", dependencyFactIds: [option.id],
    dependencyEvidenceHashes: { [option.id]: option.evidenceHash }, approvalState: "approved", stale: false, staleReasons: [],
    editorNote: "", createdAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z",
  }], removed);
  assert.equal(decision.stale, true);
  assert.match(decision.staleReasons[0], /^dependency_removed:/);
});
