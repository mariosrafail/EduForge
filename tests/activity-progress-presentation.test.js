import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  exerciseDisplayStatus,
  exerciseSecondaryText,
} from "../src/components/lms/books/bookExercisePresentation.js";
import { databaseActivityPresentation } from "../src/services/bookActivityPresentation.js";

test("generic exercise rows show neutral capabilities and preserve real local completion", () => {
  const assignable = { status: "Available", availableToStudent: true, assignable: true };
  const practice = { status: "Available", availableToStudent: true, assignable: false };
  const locked = { status: "Locked", availableToStudent: false, assignable: false, locked: true };

  assert.equal(exerciseDisplayStatus(assignable), "Available");
  assert.equal(exerciseSecondaryText(assignable, { isTeacher: true }), "Assignable");
  assert.equal(exerciseSecondaryText(assignable, { isTeacher: false }), "Available");
  assert.equal(exerciseSecondaryText(practice, { isTeacher: true }), "Practice activity");
  assert.equal(exerciseSecondaryText(locked, { isTeacher: false }), "Unavailable");
  assert.equal(exerciseDisplayStatus(assignable, { score: 0 }), "Submitted");
  assert.equal(exerciseSecondaryText(assignable, { completed: { score: 0 } }), "Submitted / 0%");
  assert.equal(exerciseSecondaryText(assignable, { completed: {} }), "Submitted");
});

test("database activity presentation never fabricates assignment, submission, or feedback state", () => {
  assert.deepEqual(databaseActivityPresentation({ estimatedMinutes: 12 }), {
    status: "Available",
    estimatedTime: "12 min",
  });
  const unestimated = databaseActivityPresentation({ activityType: "timed_quiz" });
  assert.deepEqual(unestimated, { status: "Available", estimatedTime: "Self-paced" });
  assert.doesNotMatch(JSON.stringify(unestimated), /submitted|Assigned to|feedback ready/i);
});

test("shipped catalog and row sources contain no legacy fabricated progress fields or labels", async () => {
  const paths = [
    "src/services/bookContentApi.js",
    "src/services/bookActivityPresentation.js",
    "src/components/lms/books/BookExerciseRow.jsx",
    "src/components/lms/books/LockedRows.jsx",
    "src/data/ultimate-b2/studentsBookCatalog.js",
    "src/data/ultimate-b2/ultimateB2Package.js",
    "src/data/ultimate-b2/lockedContent.js",
    "src/data/englishJourney6DemoData.js",
    "src/apps/android-offline/data/ultimateB2Unit2StudentsBook.js",
  ];
  const combined = (await Promise.all(paths.map((path) => readFile(path, "utf8")))).join("\n");
  assert.doesNotMatch(combined, /progressLabel|studentProgressLabel/);
  assert.match(combined, /databaseActivityPresentation\(activity\)/);
  for (const fabricated of [
    "11/16 submitted",
    "Assigned to 2 classes",
    "Teacher feedback ready",
    "14/21 submitted",
    "Avg. score 72%",
    "Assigned to 1 class",
    "14/18 submitted",
    "Avg. score 76%",
  ]) {
    assert.doesNotMatch(combined, new RegExp(fabricated.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
