import assert from "node:assert/strict";
import test from "node:test";

import {
  createManualActivityId, createManualNodeId, serializeManualActivitiesArtifact, validateManualActivity,
} from "../lib/book-builder/manual-activity-contract.js";
import {
  removeOrphanManualSolutions, serializeManualActivitySolutionsArtifact, validateManualActivitySolution,
} from "../lib/book-builder/manual-activity-solutions.js";

const digest = "a".repeat(64);
const now = "2026-08-06T10:00:00.000Z";
function base(type, content, assetReferences = []) {
  return { schemaVersion: "1.0", activityId: "manual_activity_fictional", status: "approved", sourceMode: "manual", hierarchy: { sourceBookRootKey: "bookroot_fiction", componentKey: "componentkey_students", effectiveComponentRole: "students_book", unitGroupKey: "unitgroup_students_3", unitGroupNumber: 3, part: 1, pageCandidateId: "page_fiction", hotspotCandidateIds: [] }, type, title: "Fictional activity", instructions: "Complete the activity.", content, presentation: { viewportMode: "fit", viewportSizeMode: "responsive", backgroundReviewRequired: false }, assetReferences, dependencyFactIds: [], dependencyEvidenceHashes: {}, stale: false, staleReasons: [], createdAt: now, updatedAt: now };
}
function solution(activity, solutions) { return { schemaVersion: "1.0", activityId: activity.activityId, type: activity.type, solutions, updatedAt: now }; }

test("manual IDs use UUID identities and reject index/title identity", () => {
  assert.match(createManualActivityId(), /^manual_activity_[0-9a-f-]{36}$/);
  assert.match(createManualNodeId("question"), /^question_[0-9a-f-]{36}$/);
  assert.notEqual(createManualNodeId("field"), createManualNodeId("field"));
});

test("multiple-choice Student and Teacher contracts are strict and referential", () => {
  const activity = base("multiple_choice", { questions: [{ id: "question_one", prompt: "Which fictional colour?", options: [{ id: "option_blue", text: "Blue" }, { id: "option_gold", text: "Gold" }] }] });
  assert.equal(validateManualActivity(activity).valid, true);
  const teacher = solution(activity, { questions: [{ questionId: "question_one", correctOptionId: "option_gold" }] });
  assert.equal(validateManualActivitySolution(teacher, activity).valid, true);
  assert.equal(validateManualActivitySolution(solution(activity, { questions: [{ questionId: "question_one", correctOptionId: "option_orphan" }] }), activity).valid, false);
  const leaked = structuredClone(activity); leaked.content.questions[0].correctOptionId = "option_gold";
  assert.match(validateManualActivity(leaked).errors.join(" "), /unknown|forbidden/i);
});

test("all 4D1 Student types validate with separate solutions", () => {
  const assets = [
    { assetId: "asset_image", role: "background", mimeType: "image/png", sourceRelativeIdentity: "profiles/fiction/page.png", digest, stale: false },
    { assetId: "asset_audio", role: "audio", mimeType: "audio/mpeg", sourceRelativeIdentity: "profiles/fiction/audio.mp3", digest, stale: false },
    { assetId: "asset_video", role: "video", mimeType: "video/mp4", sourceRelativeIdentity: "profiles/fiction/video.mp4", digest, stale: false },
  ];
  const cases = [
    [base("true_false", { statements: [{ id: "statement_one", prompt: "The moon is fictional." }] }), { statements: [{ statementId: "statement_one", correctValue: true }] }],
    [base("typed_gap_fill", { items: [{ id: "gap_one", prompt: "The colour is ___.", responseFieldId: "field_one", displayGuidance: { case: "Ignore case", punctuation: "Optional" } }] }), { fields: [{ responseFieldId: "field_one", acceptedValues: ["azure"], normalizationPolicy: "trim_case_insensitive" }] }],
    [base("open_answer", { prompt: "Explain the fictional scene.", responseGuidance: "Write two sentences." }), { rubric: { guidance: "Teacher review", criteria: ["Clear explanation"] } }],
    [base("media_audio", { assetId: "asset_audio", transcript: "Fictional transcript." }, assets), {}],
    [base("media_video", { assetId: "asset_video", captions: "Fictional captions.", transcript: "Fictional transcript." }, assets), {}],
    [base("scrollable_panel", { blocks: [{ id: "block_one", kind: "image", assetId: "asset_image", altText: "A fictional long page." }, { id: "block_two", kind: "text", text: "Scrollable fictional text." }], linkedAudioAssetId: "asset_audio" }, assets), {}],
    [base("image_backed", { backgroundAssetId: "asset_image", fields: [{ id: "image_choice", kind: "single_choice", geometry: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }, prompt: "Choose", options: [{ id: "choice_a", text: "A" }, { id: "choice_b", text: "B" }] }, { id: "image_text", kind: "text_input", geometry: { x: 0.2, y: 0.5, width: 0.4, height: 0.1 }, prompt: "Type" }, { id: "image_media", kind: "media_trigger", geometry: { x: 0.8, y: 0.1, width: 0.1, height: 0.1 }, assetId: "asset_audio" }] }, assets), { fields: [{ fieldId: "image_choice", correctOptionId: "choice_b" }, { fieldId: "image_text", acceptedValues: ["fiction"], normalizationPolicy: "trim" }] }],
  ];
  for (const [activity, answers] of cases) { assert.deepEqual(validateManualActivity(activity).errors, [], activity.type); assert.deepEqual(validateManualActivitySolution(solution(activity, answers), activity).errors, [], activity.type); }
});

test("drafts report incompleteness while approval enforces content, geometry, hierarchy and stale assets", () => {
  const draft = base("multiple_choice", { questions: [] }); draft.status = "draft"; draft.title = ""; draft.hierarchy.unitGroupKey = null;
  assert.equal(validateManualActivity(draft).valid, true);
  assert.equal(validateManualActivity(draft, { requireApproval: true }).valid, false);
  const image = base("image_backed", { backgroundAssetId: "asset_image", fields: [{ id: "field_bad", kind: "text_input", geometry: { x: -0.1, y: 0, width: 0, height: 2 }, prompt: "Type" }] }, [{ assetId: "asset_image", role: "background", mimeType: "image/png", sourceRelativeIdentity: "page.png", digest, stale: true }]);
  assert.match(validateManualActivity(image).errors.join(" "), /normalized geometry|stale/i);
});

test("removing Student nodes removes orphan Teacher solutions and deterministic artifacts sort by ID", () => {
  const activity = base("multiple_choice", { questions: [{ id: "question_one", prompt: "One?", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] }, { id: "question_two", prompt: "Two?", options: [{ id: "c", text: "C" }, { id: "d", text: "D" }] }] });
  const teacher = solution(activity, { questions: [{ questionId: "question_one", correctOptionId: "a" }, { questionId: "question_two", correctOptionId: "c" }] });
  activity.content.questions.pop();
  const cleaned = removeOrphanManualSolutions(teacher, activity);
  assert.deepEqual(cleaned.solutions.questions, [{ questionId: "question_one", correctOptionId: "a" }]);
  const studentJson = serializeManualActivitiesArtifact({ schemaVersion: "1.0", audience: "student-safe-authoring", activities: [activity] });
  const teacherJson = serializeManualActivitySolutionsArtifact({ schemaVersion: "1.0", audience: "teacher-only-internal", classification: "local-only", activities: [cleaned] }, [activity]);
  assert.doesNotMatch(studentJson, /correctOptionId|acceptedValues/);
  assert.match(teacherJson, /correctOptionId/);
});

test("unknown fields, unsafe markup, absolute paths and duplicate child IDs fail closed", () => {
  const activity = base("multiple_choice", { questions: [{ id: "question_same", prompt: "<script>alert(1)</script>", options: [{ id: "option_same", text: "A" }, { id: "option_same", text: "B" }] }] });
  activity.extra = true; activity.assetReferences = [{ assetId: "asset_bad", role: "image", mimeType: "image/png", sourceRelativeIdentity: "C:\\private\\page.png", digest, stale: false }];
  const errors = validateManualActivity(activity).errors.join(" ");
  assert.match(errors, /unknown/); assert.match(errors, /plain text/); assert.match(errors, /unique/); assert.match(errors, /absolute path|plain text/);
});
