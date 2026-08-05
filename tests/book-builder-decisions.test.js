import assert from "node:assert/strict";
import test from "node:test";

import { createBookProject, validateBookProject } from "../lib/book-builder/book-project.js";
import {
  DECISION_SCHEMA_VERSION,
  normalizeDecision,
  normalizeDecisionMutationInput,
  stableDecisionId,
} from "../lib/book-builder/decision-contracts.js";
import { componentDecisionTargetId, createResolvedDecision, resolveDecisionContext } from "../lib/book-builder/decision-dependencies.js";
import { createDetectedFact } from "../lib/book-builder/detected-facts.js";
import { effectiveReviewQueue } from "../lib/book-builder/effective-reviews.js";

const now = "2026-08-05T12:00:00.000Z";

function fixture() {
  const component = { name: "unit", sourceRelativePath: "Contents/Resources/assets/books/book1/unit", proposedSemanticRole: "students_book" };
  const fact = createDetectedFact({ kind: "component_structure_candidate", locator: component.sourceRelativePath, value: { name: component.name, proposedSemanticRole: component.proposedSemanticRole }, parserId: "fixture", parserVersion: "1.0" });
  const reviewFact = createDetectedFact({ kind: "review_issue_dependency", locator: `${component.sourceRelativePath}/review/ambiguous_component_role`, value: { reviewId: "review_component_role", category: "component", reasonCode: "ambiguous_component_role" }, parserId: "fixture", parserVersion: "1.0" });
  const project = createBookProject({
    projectId: "decision-fixture", now, lifecycleStatus: "review_required", detectedFacts: [fact, reviewFact],
    sourceDescriptor: { label: "Fictional", canonicalAppRelativePath: "." }, sourceSnapshot: {}, publicationDraft: {},
  });
  const reviews = { items: [{ id: "review_component_role", category: "component", reasonCode: "ambiguous_component_role", sourceRelativeLocator: component.sourceRelativePath, dependencyFactIds: [fact.id], status: "open", blocking: true }] };
  return { component, fact, project, artifacts: { components: { components: [component] }, reviews } };
}

test("current decision contracts are versioned, strict, deterministic, and portable", () => {
  const { component, project, artifacts } = fixture();
  const input = normalizeDecisionMutationInput({
    targetId: componentDecisionTargetId(component), kind: "component_role", value: "students_book",
    approvalState: "approved", editorNote: "Publisher-confirmed role.", expectedRevision: 1, clientMutationId: "mutation_component_1",
  });
  const context = resolveDecisionContext({ project, artifacts, kind: input.kind, targetId: input.targetId, value: input.value });
  const decision = createResolvedDecision(context, input, now);
  assert.equal(decision.schemaVersion, DECISION_SCHEMA_VERSION);
  assert.equal(decision.id, stableDecisionId("component_role", "component", input.targetId));
  assert.deepEqual(decision.resolvesReviewIds, ["review_component_role"]);
  assert.equal(decision.dependencyFactIds.length, 2);
  assert.deepEqual(normalizeDecision(decision, project.detectedFacts, { requireCurrent: true }), decision);
  const withDecision = createBookProject({ ...project, approvedDecisions: [decision] });
  assert.deepEqual(validateBookProject(withDecision), { valid: true, errors: [] });
});

test("decision inputs reject unknown fields, arbitrary values, unsafe notes, and unstable identities", () => {
  const base = { targetId: "component_safe", kind: "component_role", value: "students_book", approvalState: "draft", editorNote: "", expectedRevision: 1, clientMutationId: "mutation_safe" };
  assert.throws(() => normalizeDecisionMutationInput({ ...base, dependencyFactIds: ["fact_fake"] }), /unknown field/);
  assert.throws(() => normalizeDecisionMutationInput({ ...base, value: "invented_role" }), /not allowed/);
  assert.throws(() => normalizeDecisionMutationInput({ ...base, editorNote: "C:\\Users\\publisher\\secret" }), /forbidden/);
  const { component, project, artifacts } = fixture();
  const context = resolveDecisionContext({ project, artifacts, kind: "component_role", targetId: componentDecisionTargetId(component), value: "students_book" });
  const decision = createResolvedDecision(context, { approvalState: "approved", editorNote: "" }, now);
  assert.throws(() => normalizeDecision({ ...decision, id: "decision_wrong" }, project.detectedFacts), /unstable identity/);
  assert.throws(() => normalizeDecision({ ...decision, surprise: true }, project.detectedFacts), /unknown field/);
});

test("legacy decisions remain readable and rejected is now a valid explicit state", () => {
  const { fact } = fixture();
  const legacy = { id: "legacy-role", kind: "component_role", value: "students_book", dependencyFactIds: [fact.id], dependencyEvidenceHashes: { [fact.id]: fact.evidenceHash }, approvalState: "approved", stale: false, staleReasons: [], editorNote: "", createdAt: now, updatedAt: now };
  assert.deepEqual(normalizeDecision(legacy, [fact]), legacy);
  assert.equal(normalizeDecision({ ...legacy, approvalState: "rejected" }, [fact]).approvalState, "rejected");
});

test("effective review state overlays generated items and removal reopens them", () => {
  const { component, project, artifacts } = fixture();
  const context = resolveDecisionContext({ project, artifacts, kind: "component_role", targetId: componentDecisionTargetId(component), value: "students_book" });
  const approved = createResolvedDecision(context, { approvalState: "approved", editorNote: "" }, now);
  assert.deepEqual(effectiveReviewQueue(artifacts.reviews, [approved]).summary, {
    totalGenerated: 1, open: 0, resolved: 1, deferred: 0, notApplicable: 0, acceptedRisk: 0, stale: 0, blockingOpen: 0,
  });
  assert.equal(effectiveReviewQueue(artifacts.reviews, []).items[0].effectiveStatus, "open");
  assert.equal(effectiveReviewQueue(artifacts.reviews, [{ ...approved, stale: true }]).items[0].effectiveStatus, "stale_resolution");
});
