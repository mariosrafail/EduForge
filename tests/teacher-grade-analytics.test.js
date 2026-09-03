import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScoreBands,
  normalizeTeacherAnalyticsOverview,
  normalizeTeacherAnalyticsStudents,
  roundAnalyticsMetric,
  scoreBandFor,
} from "../netlify/functions/_book-content/teacher-grade-analytics.js";

test("teacher analytics overview preserves null score statistics and explicit completion denominator", () => {
  assert.deepEqual(normalizeTeacherAnalyticsOverview({ assigned_slots: 4, submitted: 1, missing: 3, completion_rate: "25.0" }), {
    assignedSlots: 4,
    submitted: 1,
    missing: 3,
    completionRate: 25,
    scoredCount: 0,
    averageScore: null,
    medianScore: null,
    highestScore: null,
    lowestScore: null,
    awaitingReview: 0,
    reviewed: 0,
    autoScored: 0,
    completed: 0,
    unscoredCount: 0,
    recentGradedCount: 0,
  });
  assert.equal(roundAnalyticsMetric("66.66"), 66.7);
  assert.equal(roundAnalyticsMetric(null), null);
});

test("teacher analytics keeps scored aggregates separate from awaiting-review and missing work", () => {
  const overview = normalizeTeacherAnalyticsOverview({
    assigned_slots: 5,
    submitted: 4,
    missing: 1,
    completion_rate: 80,
    scored_count: 3,
    average_score: "76.666",
    median_score: 80,
    highest_score: 100,
    lowest_score: 50,
    awaiting_review: 1,
    reviewed: 1,
    auto_scored: 2,
    completed: 0,
    unscored_count: 1,
    recent_graded_count: 3,
  });
  assert.equal(overview.averageScore, 76.7);
  assert.equal(overview.medianScore, 80);
  assert.equal(overview.scoredCount, 3);
  assert.equal(overview.awaitingReview, 1);
  assert.equal(overview.missing, 1);
});

test("score-band boundaries are centralized and exact", () => {
  assert.equal(scoreBandFor(100).id, "excellent");
  assert.equal(scoreBandFor(85).id, "excellent");
  assert.equal(scoreBandFor(84.99).id, "good");
  assert.equal(scoreBandFor(70).id, "good");
  assert.equal(scoreBandFor(69.99).id, "developing");
  assert.equal(scoreBandFor(50).id, "developing");
  assert.equal(scoreBandFor(49.99).id, "needs-support");
  assert.equal(scoreBandFor(0).id, "needs-support");
  assert.equal(scoreBandFor(null), null);
  assert.deepEqual(buildScoreBands({ excellent: 1, good: 2, developing: 3, needs_support: 4 }).map(({ id, count }) => [id, count]), [
    ["excellent", 1], ["good", 2], ["developing", 3], ["needs-support", 4],
  ]);
});

test("student summaries add only explainable attention reasons", () => {
  const { students, attention } = normalizeTeacherAnalyticsStudents([
    { student_id: "a", full_name: "A", assigned: 4, submitted: 0, missing: 4, completion_rate: 0, overdue_missing: 2 },
    { student_id: "b", full_name: "B", assigned: 4, submitted: 4, scored_count: 4, average_score: 40 },
    { student_id: "c", full_name: "C", assigned: 4, submitted: 4, scored_count: 4, average_score: 60 },
    { student_id: "d", full_name: "D", assigned: 4, submitted: 4, scored_count: 4, average_score: 80 },
    { student_id: "e", full_name: "E", assigned: 4, submitted: 4, scored_count: 4, average_score: 100 },
  ]);
  assert.equal(students[0].averageScore, null);
  assert.deepEqual(attention.find((item) => item.studentId === "a").reasons, ["2 overdue or closed items missing", "No submitted work yet"]);
  assert.match(attention.find((item) => item.studentId === "b").reasons[0], /bottom scored quartile/);
});
