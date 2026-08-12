import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import runtime from "../src/data/ultimate-b2/runtime/unit-01-reading-exercise-4.complete-sentences.json" with { type: "json" };
import {
  COMPLETE_SENTENCES_STUDENT_RESPONSE_SCHEMA_VERSION,
  completeSentencesProgress,
  completeSentencesWordBank,
  moveCompleteSentencesWord,
} from "../src/components/lms/activities/ultimate-b2/completeSentencesStudentModel.js";

test("student Complete the Sentences uses only the projected neutral word bank and public question identity", () => {
  const words = completeSentencesWordBank(runtime);
  assert.equal(COMPLETE_SENTENCES_STUDENT_RESPONSE_SCHEMA_VERSION, 1);
  assert.equal(runtime.activityId, "ultimate-b2-sb-u1-p2-o4");
  assert.equal(runtime.example.exampleText, "On-demand");
  assert.equal(words.length, 8);
  assert.deepEqual(words.map(({ text }) => text), ["binge-watching", "episodes", "franchise", "genre", "Media streaming", "season", "sub-plots", "Tuning in"]);
  assert.deepEqual(words.map(({ id }) => id), Array.from({ length: 8 }, (_, index) => `word-${index + 1}`));
  assert.deepEqual(runtime.sentences.map(({ questionId }) => questionId), Array.from({ length: 8 }, (_, index) => `ultimate-b2-sb-u1-p2-o4-q${index + 1}`));
  assert.equal(words.some(({ text }) => text === runtime.example.exampleText), false, "the solved example is not draggable");
});

test("word moves are one-use, replaceable, movable between blanks and returnable to the bank", () => {
  let answers = {};
  answers = moveCompleteSentencesWord(answers, runtime, "word-1", "ultimate-b2-sb-u1-p2-o4-q1");
  assert.deepEqual(answers, { "ultimate-b2-sb-u1-p2-o4-q1": "binge-watching" });
  answers = moveCompleteSentencesWord(answers, runtime, "word-1", "ultimate-b2-sb-u1-p2-o4-q2");
  assert.deepEqual(answers, { "ultimate-b2-sb-u1-p2-o4-q2": "binge-watching" }, "moving removes the previous placement");
  answers = moveCompleteSentencesWord(answers, runtime, "word-6", "ultimate-b2-sb-u1-p2-o4-q2");
  assert.deepEqual(answers, { "ultimate-b2-sb-u1-p2-o4-q2": "season" }, "replacing returns the displaced word to the bank");
  answers = moveCompleteSentencesWord(answers, runtime, "word-6");
  assert.deepEqual(answers, {}, "dropping back into the bank clears the placement");
});

test("progress reaches exactly 8/8 using the canonical server question keys", () => {
  let answers = {};
  const words = completeSentencesWordBank(runtime);
  runtime.sentences.forEach((sentence, index) => { answers = moveCompleteSentencesWord(answers, runtime, words[index].id, sentence.questionId); });
  assert.deepEqual(completeSentencesProgress(answers, runtime), { answered: 8, total: 8, complete: true });
  assert.equal(Object.keys(answers).length, 8);
});

test("mode separation preserves Teacher reveal rendering and routes only learners to drag-and-drop", async () => {
  const [pilot, teacher, student, normalized, workspace, submissionBackend, teacherWorkspace] = await Promise.all([
    readFile("src/components/lms/activities/ultimate-b2/UltimateB2LegacyPilotActivity.jsx", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/UltimateB2CompleteSentencesActivity.jsx", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/UltimateB2CompleteSentencesStudentActivity.jsx", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx", "utf8"),
    readFile("src/components/lms/student/portal/StudentAssignmentWorkspace.jsx", "utf8"),
    readFile("netlify/functions/_book-content/submission-actions.js", "utf8"),
    readFile("src/components/lms/teacher/components/TeacherAssignmentReviewWorkspace.jsx", "utf8"),
  ]);
  assert.match(pilot, /capabilities\.isPresentation \|\| capabilities\.isReadOnly[\s\S]*UltimateB2CompleteSentencesActivity[\s\S]*UltimateB2CompleteSentencesStudentActivity/);
  assert.match(teacher, /revealedBlankIds/);
  assert.match(teacher, /show-next/);
  assert.match(teacher, /requestTeacherSolution/);
  assert.doesNotMatch(teacher, /readingExerciseAuthoringData|readingExerciseAuthoringSchema|revealedWord/);
  assert.doesNotMatch(teacher, /Draggable word bank|Are you sure you want to submit/);
  assert.match(student, /draggable=\{!frozen && !used\}/);
  assert.match(student, /data-drop-question-id/);
  assert.match(student, /Are you sure you want to submit\?/);
  assert.match(student, />Cancel</);
  assert.match(student, /Submitting…" : "Submit"/);
  assert.match(normalized, /answers: responsePayload\(activity, answers\)/);
  assert.match(normalized, /typeof onSubmit !== "function"[\s\S]*This is independent practice/);
  assert.match(normalized, /const result = await onSubmit\(/);
  assert.doesNotMatch(normalized, /const result = await onSubmit\?\./);
  assert.match(normalized, /persistedSubmissionResult\(submission\)/);
  assert.match(normalized, /submission\?\.submissionId \|\| submission\?\.submittedAt/);
  assert.doesNotMatch(normalized, /submission\?\.submissionId \|\| submission\?\.id/);
  assert.match(workspace, /submitStudentAssignment\(\{ assignmentId: assignment\.assignmentId, activityId: assignment\.activityId, score: result\.score, result \}\)/);
  assert.match(workspace, /return savedSubmission/);
  assert.match(workspace, /submission=\{assignment\}/);
  assert.match(workspace, /key=\{assignment\.assignmentId\}/);
  assert.match(workspace, /disableHighlightedActivityLaunch/);
  assert.match(submissionBackend, /validateSubmittedAnswers\(activity, body\.answers \|\| body\.result\?\.answers\)/);
  assert.match(submissionBackend, /scorePercent[\s\S]*correctCount[\s\S]*totalCount[\s\S]*status/);
  assert.match(teacherWorkspace, /selectedRow\.scorePercent|scorePolicy/);
});
