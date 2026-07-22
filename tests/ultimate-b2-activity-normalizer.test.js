import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  detectAnswerIndexBase,
  extractNormalizedActivities,
  normalizeActivity,
  validateNormalizedActivity,
  validateNormalizedCatalog,
} from "../scripts/ultimate-b2/activity-normalizer.mjs";
import { writeNormalizedActivityOutputs } from "../scripts/ultimate-b2/extract-activities.mjs";
import {
  buildNormalizedSubmissionAnswers,
  createNormalizedActivityAttempt,
  resetNormalizedActivityAttempt,
  scoreNormalizedStudentsBookActivity,
} from "../scripts/ultimate-b2/normalized-activity-scoring.mjs";
import { buildScoredAssignmentResult } from "../src/utils/assignmentSubmission.js";

const fixtureRoot = path.resolve("tests/fixtures/ultimate-b2-source");
const generatedUnit2Path = "books/ultimate-b2/generated/activities/unit-02.activities.json";
const generatedUnit2 = JSON.parse(await readFile(generatedUnit2Path, "utf8"));

function getNormalizedStudentsBookActivity(idOrAlias) {
  return generatedUnit2.activities.find((activity) => activity.id === idOrAlias || activity.aliases?.includes(idOrAlias)) || null;
}

function sourceActivity(overrides = {}) {
  return {
    id: "ultimate-b2-sb-u1-p1-o1",
    partNumber: 1,
    pageNumber: 5,
    spreadNumber: "5",
    order: 1,
    publisherExerciseTypes: ["write"],
    media: [],
    sourceMetadataFiles: ["Contents/Resources/assets/books/book1/unit/1/part1/obj1/obj_params.iwb"],
    ...overrides,
  };
}

test("answer index bases are detected per interaction family", () => {
  assert.equal(detectAnswerIndexBase([1, 2, 1], [2, 2, 2]), "one-based");
  assert.equal(detectAnswerIndexBase([0, 1, 0], [2, 2, 2]), "zero-based");
  assert.equal(detectAnswerIndexBase([1], [2]), "ambiguous");
  assert.equal(detectAnswerIndexBase(["publisher-id"], [2]), null);
});

test("normalized validation rejects duplicate question IDs, missing ready answers, and absolute paths", () => {
  const ready = structuredClone(getNormalizedStudentsBookActivity("reading-ex4"));
  assert.equal(validateNormalizedActivity(ready).valid, true);
  ready.questions[1].id = ready.questions[0].id;
  assert.match(validateNormalizedActivity(ready).errors.join(" "), /duplicate or missing question id/);

  const missing = structuredClone(getNormalizedStudentsBookActivity("reading-ex4"));
  missing.answerRecords = [];
  assert.match(validateNormalizedActivity(missing).errors.join(" "), /no explicit answers/);

  const leaking = structuredClone(getNormalizedStudentsBookActivity("reading-ex4"));
  leaking.sourceProvenance = ["C:\\publisher\\obj_params.iwb"];
  assert.match(validateNormalizedActivity(leaking).errors.join(" "), /absolute path leakage/);
});

test("catalog validation rejects duplicate activity IDs", () => {
  const activity = getNormalizedStudentsBookActivity("reading-ex3");
  const validation = validateNormalizedCatalog([activity, structuredClone(activity)]);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /duplicate activity id/);
});

test("unsupported publisher interactions and malformed sources remain explicit", () => {
  const unsupported = normalizeActivity({
    sourceActivity: sourceActivity({ publisherExerciseTypes: ["ticTacToe"] }),
    unitNumber: 1,
    decodedEntries: [{
      relativePath: "Contents/Resources/assets/books/book1/unit/1/part1/obj1/questions_params.iwb",
      document: { questions: { question: [{ "@_id": "1", "#text": "Sanitized?", answer: ["Yes", "No"], correct: "Yes" }] } },
    }],
  });
  assert.equal(unsupported.activityType, "unsupported-publisher-interaction");
  assert.ok(unsupported.qualityCategories.includes("unsupported-interaction"));
  assert.ok(!unsupported.qualityCategories.includes("ready-for-implementation"));

  const malformed = normalizeActivity({
    sourceActivity: sourceActivity(),
    unitNumber: 1,
    decodedEntries: [{ relativePath: sourceActivity().sourceMetadataFiles[0], error: "Repeated attribute" }],
  });
  assert.ok(malformed.qualityCategories.includes("malformed-source"));
  assert.match(malformed.extractionWarnings.join(" "), /Repeated attribute/);
});

test("multiple answers normalize and score without assuming ordering", () => {
  const activity = {
    questions: [{ id: "q1", prompt: "Sanitized", options: [{ id: "a" }, { id: "b" }, { id: "c" }], answerRecordIds: ["ar1"] }],
    answerRecords: [{ id: "ar1", optionIds: ["a", "c"], orderingSignificant: false }],
  };
  assert.equal(scoreNormalizedStudentsBookActivity(activity, { q1: ["c", "a"] })[0].correct, true);
  assert.equal(scoreNormalizedStudentsBookActivity(activity, { q1: ["a", "b"] })[0].correct, false);
});

test("attempt reset/retry clears answers and submitted state", () => {
  const initial = createNormalizedActivityAttempt();
  const attempted = { answers: { q1: "a" }, submittedRows: [{ id: "q1", correct: true }] };
  assert.deepEqual(initial, { answers: {}, submittedRows: null });
  assert.deepEqual(resetNormalizedActivityAttempt(attempted), initial);
});

test("real generated Unit 2 catalog has complete counts, provenance, media, and page relationships", async () => {
  const unit2 = JSON.parse(await readFile(generatedUnit2Path, "utf8"));
  assert.equal(unit2.activities.length, 50);
  assert.equal(unit2.activities.filter((activity) => activity.qualityCategories.includes("ready-for-implementation")).length, 2);
  assert.ok(unit2.activities.every((activity) => activity.sourceProvenance.length && !/[A-Za-z]:[\\/]/.test(JSON.stringify(activity))));

  const exercise3 = unit2.activities.find((activity) => activity.id === "ultimate-b2-sb-u2-p2-o3");
  assert.equal(exercise3.questions.length, 6);
  assert.equal(exercise3.physicalPageNumber, 20);
  assert.equal(exercise3.spread, "20-21");
  assert.deepEqual(exercise3.answerRecords.map((answer) => Number(answer.decodedPublisherValue)), [6, 3, 5, 1, 7, 2]);
  assert.equal(exercise3.mediaDependencies[0].id, "ultimate-b2.students-book.unit-2.reading.text-audio");

  const exercise4 = unit2.activities.find((activity) => activity.id === "ultimate-b2-sb-u2-p2-o4");
  assert.equal(exercise4.questions.length, 8);
  assert.deepEqual(exercise4.answerRecords.map((answer) => Number(answer.decodedPublisherValue)), [1, 2, 1, 2, 2, 1, 2, 1]);

  const questionBank = unit2.activities.find((activity) => activity.id === "ultimate-b2-sb-u2-p8-o3");
  assert.equal(questionBank.questions.length, 25);
  assert.equal(questionBank.answerRecords.length, 25);
  assert.ok(questionBank.qualityCategories.includes("unsupported-interaction"));
});

test("normalized scoring generates assignment-compatible results", () => {
  const activity = getNormalizedStudentsBookActivity("reading-ex4");
  const answers = Object.fromEntries(activity.questions.map((question) => [question.id, activity.answerRecords.find((record) => record.questionId === question.id).optionIds[0]]));
  const rows = scoreNormalizedStudentsBookActivity(activity, answers);
  const submissionAnswers = buildNormalizedSubmissionAnswers(activity, answers);
  const result = buildScoredAssignmentResult({ activityKey: "reading-ex4", activityId: activity.id, answers: submissionAnswers, rows });
  assert.equal(result.score, 100);
  assert.equal(result.activityId, "ultimate-b2-sb-u2-p2-o4");
  assert.equal(result.answers["1"], "air space");
  assert.equal(result.answers["8"], "route");
  assert.equal(result.answers[activity.questions[0].id], answers[activity.questions[0].id]);
});

test("database migration replaces obsolete demo scoring with normalized Unit 2 evidence", async () => {
  const migration = await readFile("database/019_ultimate_b2_unit2_normalized_activities.sql", "utf8");
  assert.match(migration, /ultimate-b2-sb-u2-p2-o3/);
  assert.match(migration, /ultimate-b2-sb-u2-p2-o4/);
  assert.match(migration, /'F'\),\s*\n\s*\('unit-2-reading-exercise-3', 2/);
  assert.match(migration, /'route', true/);
  assert.doesNotMatch(migration, /young inventor|Paragraph 3|step by step/);
});

test("sanitized fixture extraction and generated output are deterministic and byte-identical", async () => {
  const first = await extractNormalizedActivities({ sourceRoot: fixtureRoot });
  const second = await extractNormalizedActivities({ sourceRoot: fixtureRoot });
  assert.deepEqual(first, second);
  assert.equal(first.validation.valid, true);
  assert.ok(first.activities.every((activity) => activity.sourceProvenance.every((source) => !path.isAbsolute(source))));

  const temporary = await mkdtemp(path.join(os.tmpdir(), "ultimate-b2-normalized-"));
  const catalogRoot = path.join(temporary, "catalog");
  const readyOutput = path.join(temporary, "ready.json");
  await writeNormalizedActivityOutputs(first, { catalogRoot, readyOutput });
  const before = await readFile(path.join(catalogRoot, "students-book-activities.index.json"));
  const beforeReady = await readFile(readyOutput);
  await writeNormalizedActivityOutputs(first, { catalogRoot, readyOutput });
  assert.deepEqual(await readFile(path.join(catalogRoot, "students-book-activities.index.json")), before);
  assert.deepEqual(await readFile(readyOutput), beforeReady);
});
