import test from "node:test";
import assert from "node:assert/strict";
import { buildScoredAssignmentResult } from "../src/utils/assignmentSubmission.js";

test("database-backed activity results retain answers for server-side scoring", () => {
  const answers = { "question-1": "yes", "question-2": "no" };
  const result = buildScoredAssignmentResult({
    activityKey: "qa-activity",
    activityId: "activity-1",
    answers,
    rows: [{ correct: true }, { correct: false }],
  });

  assert.deepEqual(result, { activityKey: "qa-activity", activityId: "activity-1", score: 50, answers });
  assert.notEqual(result.answers, answers);
});
