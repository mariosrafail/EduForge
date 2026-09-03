import assert from "node:assert/strict";
import test from "node:test";

import {
  activityOwnsSubmitConfirmation,
  persistedStudentAnswers,
  STUDENT_SUBMIT_CONFIRMATION_OWNERS,
} from "../src/components/lms/activities/studentSubmissionState.js";

test("direct learner compatibility keeps confirmation in the activity unless a runtime shell explicitly owns it", () => {
  assert.equal(activityOwnsSubmitConfirmation(), true);
  assert.equal(activityOwnsSubmitConfirmation(STUDENT_SUBMIT_CONFIRMATION_OWNERS.ACTIVITY), true);
  assert.equal(activityOwnsSubmitConfirmation(STUDENT_SUBMIT_CONFIRMATION_OWNERS.RUNTIME_SHELL), false);
});

test("legacy review restores authoritative numbered responses onto canonical question identities", () => {
  const activity = { runtime: { questions: [{ id: "q-one", number: 1 }, { id: "q-two", number: 2 }] } };
  assert.deepEqual(persistedStudentAnswers(activity, { responsePayload: { 1: "first", 2: "second" } }), {
    "q-one": "first",
    "q-two": "second",
  });
  assert.deepEqual(persistedStudentAnswers(activity, { responsePayload: { "q-one": "canonical" } }), {
    "q-one": "canonical",
    "q-two": "",
  });
  assert.deepEqual(persistedStudentAnswers(activity, { responsePayload: ["invalid"] }), {});
});
