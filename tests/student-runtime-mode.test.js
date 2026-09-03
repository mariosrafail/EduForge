import assert from "node:assert/strict";
import test from "node:test";

import { getActivityModeCapabilities } from "../src/components/lms/activities/activityModes.js";
import { activityModeForStudentRuntime, deriveStudentRuntimeCapabilities, STUDENT_RUNTIME_MODES } from "../src/components/lms/student/runtime/studentRuntimeMode.js";
import { buildLegacyFinalSubmission, buildNativeFinalSubmission, isDuplicateFinalSubmission } from "../src/components/lms/student/runtime/studentSubmissionContract.js";

test("practice is editable but cannot submit, persist grades, or reveal answers", () => {
  const capabilities = deriveStudentRuntimeCapabilities({ mode: STUDENT_RUNTIME_MODES.PRACTICE, submittable: true });
  assert.equal(capabilities.canEditResponses, true);
  assert.equal(capabilities.canFinalSubmit, false);
  assert.equal(capabilities.canPersistGrade, false);
  assert.equal(capabilities.canRevealAnswerKey, false);
  assert.equal(capabilities.isLocked, false);
  const activityCapabilities = getActivityModeCapabilities(activityModeForStudentRuntime(STUDENT_RUNTIME_MODES.PRACTICE));
  assert.equal(activityCapabilities.canEditAnswers, true);
  assert.equal(activityCapabilities.canSubmitStudentWork, false);
  assert.equal(activityCapabilities.canRequestSolutions, false);
});

test("assigned capability is conditional and review is always read-only", () => {
  const assigned = deriveStudentRuntimeCapabilities({ mode: STUDENT_RUNTIME_MODES.ASSIGNED, submittable: true, targetLoaded: true, supported: true });
  assert.equal(assigned.canFinalSubmit, true);
  assert.equal(assigned.canPersistGrade, true);
  for (const restriction of [{ closed: true }, { expired: true }, { submitted: true }, { supported: false }, { targetLoaded: false }]) {
    assert.equal(deriveStudentRuntimeCapabilities({ mode: STUDENT_RUNTIME_MODES.ASSIGNED, submittable: true, ...restriction }).canFinalSubmit, false);
  }
  const review = deriveStudentRuntimeCapabilities({ mode: STUDENT_RUNTIME_MODES.REVIEW, submittable: true });
  assert.equal(review.canEditResponses, false);
  assert.equal(review.canFinalSubmit, false);
  assert.equal(review.isLocked, true);
  const activityCapabilities = getActivityModeCapabilities(activityModeForStudentRuntime(STUDENT_RUNTIME_MODES.REVIEW));
  assert.equal(activityCapabilities.canEditAnswers, false);
  assert.equal(activityCapabilities.canSubmitStudentWork, false);
  assert.equal(activityCapabilities.canRevealSolutions, false);
});

test("submission envelopes omit client scores, identities, teacher material, and target overrides", () => {
  assert.deepEqual(buildLegacyFinalSubmission({ assignmentId: "assignment", activityId: "activity", result: { answers: { q1: "A" }, score: 100, correctAnswer: "A" } }), {
    assignmentId: "assignment", activityId: "activity", answers: { q1: "A" },
  });
  const target = {
    nativeKind: "single-choice",
    capability: { responseSchemaVersion: 2 },
    releaseId: "immutable-release",
    nativeActivityId: "immutable-activity",
    entry: { document: { parts: [{ interaction: { questions: [{ id: "q1" }] } }] } },
  };
  assert.deepEqual(buildNativeFinalSubmission({ assignmentId: "assignment", target, responses: { q1: "choice-b" } }), {
    assignmentId: "assignment",
    response: { schemaVersion: 2, items: [{ id: "q1", value: "choice-b" }] },
  });
  assert.equal(isDuplicateFinalSubmission({ status: 409, message: "This assignment has already been submitted" }), true);
  assert.equal(isDuplicateFinalSubmission({ status: 409, message: "This assignment has been closed" }), false);
});
