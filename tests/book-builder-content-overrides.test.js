import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ACTIVITY_CONTENT_DECISION_KINDS,
  normalizeActivityContentText,
  projectEffectiveActivityContent,
} from "../lib/book-builder/activity-content-overrides.js";
import { createBookProject, validateBookProject } from "../lib/book-builder/book-project.js";
import { normalizeDecisionMutationInput } from "../lib/book-builder/decision-contracts.js";
import { createResolvedDecision, resolveDecisionContext } from "../lib/book-builder/decision-dependencies.js";
import { createDetectedFact } from "../lib/book-builder/detected-facts.js";
import { effectiveReviewQueue } from "../lib/book-builder/effective-reviews.js";
import { ProjectMutationService } from "../lib/book-builder/project-mutation.js";
import { buildActivityContentAnchorFacts } from "../lib/book-builder/profiles/ultimate-air-v2/activity-content-facts.js";

const now = "2026-08-05T12:00:00.000Z";

function candidate() {
  return {
    activityCandidateId: "activity_fictional", sourceObjectLocator: "Fictional/book1/unit/1/part1/obj1",
    displayTitle: null, displayTitleAvailability: "raster-only-or-missing",
    instructions: "Answer the questions.", instructionAvailability: "structured",
    questions: [{ id: "question_fictional", prompt: null, promptAvailability: "raster-only-or-missing", options: [
      { id: "option_one", order: 1, text: null, textAvailability: "raster-only-or-missing" },
      { id: "option_two", order: 2, text: null, textAvailability: "raster-only-or-missing" },
    ] }],
    draggables: [{ id: "drag_one", label: null, labelAvailability: "raster-only-or-missing" }],
    targets: [{ id: "target_one", label: null, labelAvailability: "raster-only-or-missing" }],
    responseFields: [{ id: "response_one", prompt: null, promptAvailability: "raster-only-or-missing" }],
    sourceEvidenceDigests: [{ sourceRelativePath: "Fictional/content.iwb", sourceSha256: "a".repeat(64) }],
    reviewItemIds: ["review_prompt", "review_option_one", "review_option_two", "review_drag", "review_target", "review_response"],
  };
}

function setup() {
  const activity = candidate();
  const fact = (kind, locator, value, evidence = []) => createDetectedFact({ kind, locator, value, parserId: "fixture", parserVersion: "1.0", evidence });
  const anchors = buildActivityContentAnchorFacts(activity, (kind, locator, value) => fact(kind, locator, value));
  const reviewData = [
    ["review_prompt", "raster_prompt_missing", "question_prompt_text", "question_fictional"],
    ["review_option_one", "raster_option_text_missing", "option_display_text", "option_one"],
    ["review_option_two", "raster_option_text_missing", "option_display_text", "option_two"],
    ["review_drag", "raster_drag_label_missing", "draggable_display_label", "drag_one"],
    ["review_target", "raster_target_label_missing", "target_display_label", "target_one"],
    ["review_response", "raster_response_prompt_missing", "response_field_prompt_text", "response_one"],
  ];
  const reviews = reviewData.map(([id, reasonCode, suggestedDecisionKind, targetId]) => ({ id, reasonCode, suggestedDecisionKind, targetId, category: "activity", sourceRelativeLocator: `${activity.sourceObjectLocator}/${targetId}`, dependencyFactIds: [], status: "open", blocking: false }));
  const reviewFacts = reviews.map((item) => fact("review_issue_dependency", `${item.sourceRelativeLocator}/review/${item.reasonCode}`, { reviewId: item.id, category: "activity", reasonCode: item.reasonCode, suggestedDecisionKind: item.suggestedDecisionKind }));
  const project = createBookProject({ projectId: "content-overrides", now, lifecycleStatus: "review_required", sourceDescriptor: { label: "Fictional", canonicalAppRelativePath: "." }, sourceSnapshot: {}, detectedFacts: [...anchors, ...reviewFacts], publicationDraft: {} });
  const artifacts = { activities: { schemaVersion: "1.0", audience: "student-safe-authoring", candidates: [activity] }, reviews: { items: reviews } };
  return { activity, anchors, project, artifacts };
}

function input(kind, targetId, value, overrides = {}) {
  return normalizeDecisionMutationInput({ targetId, kind, value, approvalState: "approved", editorNote: "Fictional publisher note.", expectedRevision: 1, clientMutationId: `mutation_${kind}`, ...overrides });
}

function decision(value, kind, targetId, fixture) {
  const normalized = input(kind, targetId, value);
  return createResolvedDecision(resolveDecisionContext({ project: fixture.project, artifacts: fixture.artifacts, kind, targetId, value: normalized.value }), normalized, now);
}

test("the seven content decision kinds resolve only exact existing Student-safe targets", () => {
  const fixture = setup();
  const cases = [
    ["activity_display_title", "activity_fictional", "Fictional title", "activity"],
    ["activity_instruction_text", "activity_fictional", "Read and choose.", "activity"],
    ["question_prompt_text", "question_fictional", "Which fictional colour?", "question"],
    ["option_display_text", "option_one", "Amber", "option"],
    ["draggable_display_label", "drag_one", "Card", "draggable"],
    ["target_display_label", "target_one", "Panel", "target"],
    ["response_field_prompt_text", "response_one", "Write a fictional sentence.", "response_field"],
  ];
  assert.equal(ACTIVITY_CONTENT_DECISION_KINDS.size, cases.length);
  for (const [kind, targetId, value, targetType] of cases) {
    const created = decision(value, kind, targetId, fixture);
    assert.equal(created.targetType, targetType);
    assert.deepEqual(created.dependencyFactIds, [fixture.anchors.find((item) => item.kind === ({
      activity_display_title: "activity_title_content_anchor", activity_instruction_text: "activity_instruction_content_anchor",
      question_prompt_text: "activity_question_content_anchor", option_display_text: "activity_option_content_anchor",
      draggable_display_label: "activity_draggable_content_anchor", target_display_label: "activity_target_content_anchor",
      response_field_prompt_text: "activity_response_field_content_anchor",
    })[kind] && item.value.targetId === targetId).id]);
  }
  assert.throws(() => resolveDecisionContext({ project: fixture.project, artifacts: fixture.artifacts, kind: "option_display_text", targetId: "option_missing", value: "No" }), /not available/);
  assert.throws(() => resolveDecisionContext({ project: fixture.project, artifacts: fixture.artifacts, kind: "question_prompt_text", targetId: "option_one", value: "Wrong type" }), /not available/);
});

test("manual content validation preserves Unicode and internal spacing while enforcing plain bounded text", () => {
  assert.equal(normalizeActivityContentText("question_prompt_text", "  Ποια είναι η σωστή απάντηση;\r\nLine  two  "), "Ποια είναι η σωστή απάντηση;\nLine  two");
  assert.equal(normalizeActivityContentText("activity_instruction_text", "Answer the questions and explain the correct answer."), "Answer the questions and explain the correct answer.");
  for (const unsafe of ["<script>alert(1)</script>", "<b>markup</b>", "javascript:alert(1)", "data:text/html,unsafe", "C:\\Users\\publisher\\secret", "\\\\server\\share\\secret", "/Users/publisher/secret", "bad\u0000value", "bad\u0085value"]) {
    assert.throws(() => normalizeActivityContentText("question_prompt_text", unsafe));
  }
  assert.throws(() => normalizeActivityContentText("activity_display_title", "x".repeat(301)), /limit/);
  assert.throws(() => normalizeActivityContentText("option_display_text", "😀".repeat(1001)), /limit/);
  assert.throws(() => input("question_prompt_text", "question_fictional", ""), /cannot approve an empty value/);
  assert.equal(input("question_prompt_text", "question_fictional", "", { approvalState: "draft" }).value, "");
  assert.throws(() => normalizeDecisionMutationInput({ ...input("option_display_text", "option_one", "Amber"), value: { text: "Amber", correctAnswer: true } }), /plain text string/);
});

test("effective projection uses only approved non-stale values and reports partial, complete, stale and reopened states", () => {
  const fixture = setup();
  const prompt = decision("Which fictional colour?", "question_prompt_text", "question_fictional", fixture);
  let projection = projectEffectiveActivityContent(fixture.activity, [prompt]);
  assert.equal(projection.questions[0].promptField.valueOrigin, "manual_override");
  assert.equal(projection.completeness, "partially_overridden");
  assert.equal(projection.counts.missingOptions, 2);

  const decisions = [prompt,
    decision("Fictional activity", "activity_display_title", "activity_fictional", fixture),
    decision("Amber", "option_display_text", "option_one", fixture), decision("Blue", "option_display_text", "option_two", fixture),
    decision("Card", "draggable_display_label", "drag_one", fixture), decision("Panel", "target_display_label", "target_one", fixture),
    decision("Write a sentence.", "response_field_prompt_text", "response_one", fixture),
  ];
  projection = projectEffectiveActivityContent(fixture.activity, decisions);
  assert.equal(projection.completeness, "complete_with_manual_overrides");
  assert.equal(projection.counts.missingFields, 0);
  assert.equal(projection.counts.approvedOverrides, 7);

  projection = projectEffectiveActivityContent(fixture.activity, decisions.map((item) => item.kind === "question_prompt_text" ? { ...item, stale: true, staleReasons: ["dependency_changed:fact"] } : item));
  assert.equal(projection.questions[0].promptField.valueOrigin, "missing");
  assert.equal(projection.completeness, "stale_manual_content");
  assert.equal(projectEffectiveActivityContent(fixture.activity, decisions.filter((item) => item.kind !== "option_display_text")).counts.missingOptions, 2);
});

test("gap reviews resolve independently, draft and stale decisions remain open, and removal reopens one exact field", () => {
  const fixture = setup();
  const one = decision("Amber", "option_display_text", "option_one", fixture);
  let effective = effectiveReviewQueue(fixture.artifacts.reviews, [one]);
  assert.equal(effective.items.find((item) => item.id === "review_option_one").effectiveStatus, "resolved");
  assert.equal(effective.items.find((item) => item.id === "review_option_two").effectiveStatus, "open");
  assert.equal(effective.summary.open, 5);
  effective = effectiveReviewQueue(fixture.artifacts.reviews, [{ ...one, approvalState: "draft" }]);
  assert.equal(effective.items.find((item) => item.id === "review_option_one").effectiveStatus, "open");
  effective = effectiveReviewQueue(fixture.artifacts.reviews, [{ ...one, stale: true }]);
  assert.equal(effective.items.find((item) => item.id === "review_option_one").effectiveStatus, "stale_resolution");
  effective = effectiveReviewQueue(fixture.artifacts.reviews, [{ ...one, id: "decision_disposition", kind: "review_disposition", value: "deferred" }, one]);
  assert.equal(effective.items.find((item) => item.id === "review_option_one").effectiveStatus, "resolved");
  assert.equal(effectiveReviewQueue(fixture.artifacts.reviews, []).summary.open, 6);
});

test("portable decisions contain only normalized Student-safe strings and validate under schema 1.0", () => {
  const fixture = setup();
  const decisions = [
    decision("Fictional title", "activity_display_title", "activity_fictional", fixture),
    decision("Πολυγραμμική οδηγία\nSecond line", "activity_instruction_text", "activity_fictional", fixture),
  ];
  const project = createBookProject({ ...fixture.project, approvedDecisions: decisions });
  assert.deepEqual(validateBookProject(project), { valid: true, errors: [] });
  const serialized = JSON.stringify(project);
  for (const forbidden of ["teacherSolution", "correctAnswer", "acceptedAnswer", "decodedXml", "iwbKey", "C:\\Users\\mario"]) assert.doesNotMatch(serialized, new RegExp(forbidden.replaceAll("\\", "\\\\"), "i"));
});

test("preview, idempotency, revision conflicts, persistence and removal reuse the M4B1 mutation boundary", async (t) => {
  const fixture = setup();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-content-mutation-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  const projectDirectory = path.join(workspace, "projects", fixture.project.projectId);
  await fs.mkdir(projectDirectory, { recursive: true });
  await fs.writeFile(path.join(projectDirectory, "book-project.json"), `${JSON.stringify(fixture.project, null, 2)}\n`);
  const service = new ProjectMutationService({ workspace, projectDirectory, projectId: fixture.project.projectId, loadArtifacts: async () => fixture.artifacts, sessionId: "content-test", now: () => now });
  const request = input("question_prompt_text", "question_fictional", "Which fictional colour?");
  const before = await fs.readFile(path.join(projectDirectory, "book-project.json"), "utf8");
  const preview = await service.preview(request);
  assert.equal(preview.contentOverride.valueOrigin, "manual_override");
  assert.equal(preview.contentOverride.characterCount, 23);
  assert.equal(await fs.readFile(path.join(projectDirectory, "book-project.json"), "utf8"), before);
  assert.equal(await fs.lstat(path.join(projectDirectory, "decision-history")).catch(() => null), null);

  const applied = await service.apply(request);
  assert.equal(applied.revision, 2);
  assert.equal((await service.apply(request)).idempotentReplay, true);
  await assert.rejects(service.apply({ ...request, clientMutationId: "mutation_conflict", expectedRevision: 1 }), (error) => error.code === "project_revision_conflict");
  const persisted = JSON.parse(await fs.readFile(path.join(projectDirectory, "book-project.json"), "utf8"));
  assert.equal(persisted.approvedDecisions[0].value, "Which fictional colour?");
  const removed = await service.remove({ targetId: "question_fictional", kind: "question_prompt_text", expectedRevision: 2, clientMutationId: "mutation_remove_content" });
  assert.equal(removed.revision, 3);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(projectDirectory, "book-project.json"), "utf8")).approvedDecisions, []);
});
