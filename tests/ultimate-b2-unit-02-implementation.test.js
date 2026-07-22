import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseMediaRange } from "../netlify/functions/ultimate-b2-media.js";
import { isProtectedUnit2SourcePath } from "../scripts/ultimate-b2/unit2-media-vite-plugin.mjs";

const matrixPath = "books/ultimate-b2/generated/editorial/unit-02.implementation-matrix.json";
const runtimePath = "src/data/ultimate-b2/generated/unit-02.runtime.json";

async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }

test("Unit 2 implementation matrix deterministically covers all 50 definite objects", async () => {
  const matrix = await readJson(matrixPath);
  assert.equal(matrix.activities.length, 50);
  assert.deepEqual(matrix.summary, {
    "auto-scored": 28,
    "teacher-reviewed": 9,
    "unscored-practice": 2,
    "media-interaction": 0,
    "reading-content": 1,
    "unsupported-disabled": 10,
  });
  assert.equal(new Set(matrix.activities.map((activity) => activity.stableNormalizedId)).size, 50);
  assert.ok(matrix.activities.every((activity) => activity.unitNumber === 2));
  assert.ok(matrix.activities.every((activity) => activity.publisherObjectId && activity.partNumber && activity.printedPage && activity.printedSpread));
  assert.ok(matrix.activities.every((activity) => activity.implementationMode && activity.implementationStatus && activity.editorialStatus));
  assert.ok(matrix.activities.every((activity) => activity.sourceProvenance.length > 0 && Array.isArray(activity.warnings)));
  assert.ok(matrix.activities.every((activity, index) => index === 0
    || activity.partNumber > matrix.activities[index - 1].partNumber
    || activity.partNumber === matrix.activities[index - 1].partNumber));
  assert.doesNotMatch(JSON.stringify(matrix), /[A-Za-z]:[\\/]/);
});

test("every auto-scored object has paired prompts and explicit publisher answer evidence", async () => {
  const matrix = await readJson(matrixPath);
  const autoScored = matrix.activities.filter((activity) => activity.implementationMode === "auto-scored");
  assert.ok(autoScored.length > 2);
  assert.ok(autoScored.every((activity) => activity.runtime.questions.length > 0));
  assert.ok(autoScored.every((activity) => activity.runtime.questions.every((question) => question.prompt && question.acceptedAnswers.length)));
  assert.ok(autoScored.every((activity) => activity.scoringMode === "authoritative-explicit-answer"));
});

test("letter-based publisher answers are expanded into learner-facing text", async () => {
  const matrix = await readJson(matrixPath);
  const activity = (id) => matrix.activities.find((candidate) => candidate.stableNormalizedId === id);
  const collocations = activity("ultimate-b2-sb-u2-p3-o2");
  assert.equal(collocations.runtime.questions[0].prompt, "suffer");
  assert.deepEqual(collocations.runtime.questions[0].acceptedAnswers, ["from jetlag / from travel sickness"]);
  assert.ok(collocations.runtime.questions[0].options.every((option) => option.text.length > 1));

  const reading = activity("ultimate-b2-sb-u2-p9-o1");
  assert.equal(reading.runtime.questions[0].prompt, "Gap 1 in the reading text");
  assert.ok(reading.runtime.questions.every((question) => question.options.length === 7));
  assert.ok(reading.runtime.questions.every((question) => question.acceptedAnswers.every((answer) => answer.length > 1)));

  const compounds = activity("ultimate-b2-sb-u2-p11-o2");
  assert.equal(compounds.runtime.questions[0].prompt, "air");
  assert.deepEqual(compounds.runtime.questions[0].acceptedAnswers, ["space"]);
  assert.ok(compounds.runtime.questions[0].options.some((option) => option.text === "streaming"));
});

test("all confident logical media mappings existed during generation", async () => {
  const matrix = await readJson(matrixPath);
  const media = matrix.activities.flatMap((activity) => activity.mediaDependencies).filter((dependency) => dependency.logicalKey);
  assert.equal(media.length, 7);
  assert.ok(media.every((dependency) => dependency.sourceExistsAtGeneration === true));
  const offlineModule = await readFile("src/data/ultimate-b2/ultimateB2MediaAssets.offline.js", "utf8");
  assert.ok(media.every((dependency) => offlineModule.includes(`\"${dependency.logicalKey}\"`)));
});

test("teacher-reviewed prompts exclude publisher model responses", async () => {
  const matrix = await readJson(matrixPath);
  const opener = matrix.activities.find((activity) => activity.stableNormalizedId === "ultimate-b2-sb-u2-p1-o1");
  assert.equal(opener.runtime.questions[0].prompt, "Do you believe that time travel is possible? Why/Why not?");
  assert.doesNotMatch(opener.runtime.questions.map((question) => question.prompt).join(" "), /I believe that|I would like to/);
  const video = matrix.activities.find((activity) => activity.stableNormalizedId === "ultimate-b2-sb-u2-p2-o1");
  assert.doesNotMatch(video.runtime.questions.map((question) => question.prompt).join(" "), /There have been many instances|Pilots never report/);
});

test("student runtime catalog contains no answer keys or decoder material", async () => {
  const raw = await readFile(runtimePath, "utf8");
  assert.doesNotMatch(raw, /acceptedAnswers|publisherAnswerValue|explicitAnswerEvidence|decodedPublisherValue|decodeIwbXml/);
  const runtime = JSON.parse(raw);
  assert.equal(runtime.activities.length, 50);
  assert.ok(runtime.activities.every((activity) => activity.runtime.questions.every((question) => !("acceptedAnswers" in question))));
});

test("unsupported interactions stay disabled and legacy games are not reproduced", async () => {
  const matrix = await readJson(matrixPath);
  const unsupported = matrix.activities.filter((activity) => activity.implementationMode === "unsupported-disabled");
  assert.equal(unsupported.length, 10);
  assert.ok(unsupported.every((activity) => activity.implementationStatus === "disabled-editorial-only"));
  for (const id of ["ultimate-b2-sb-u2-p8-o3", "ultimate-b2-sb-u2-p8-o4"]) {
    const activity = matrix.activities.find((candidate) => candidate.stableNormalizedId === id);
    assert.match(activity.warnings.join(" "), /Legacy game semantics are intentionally not reproduced/);
  }
});

test("migration seeds only evidence-backed assignable activities and server supports pending teacher review", async () => {
  const migration = await readFile("database/020_ultimate_b2_unit2_recovered_activities.sql", "utf8");
  const server = await readFile("netlify/functions/book-content.js", "utf8");
  assert.match(migration, /implementationMode/);
  assert.match(migration, /decoded-publisher-explicit-answer/);
  assert.doesNotMatch(migration, /ticTacToe|choosingGame/);
  assert.match(server, /requiresTeacherReview/);
  assert.match(server, /awaiting_review/);
  assert.match(server, /Awaiting teacher review/);
});

test("web Unit 2 media uses the protected local gateway and blocks direct source paths", async () => {
  const webAssets = await readFile("src/data/ultimate-b2/ultimateB2MediaAssets.web.js", "utf8");
  assert.equal((webAssets.match(/protectedStudentsBookMedia\("ultimate-b2\.students-book\.unit-2\./g) || []).length, 7);
  assert.match(webAssets, /\.netlify\/functions\/ultimate-b2-media/);
  assert.equal(isProtectedUnit2SourcePath("/src/assets/books/ultimate-b2/media/unit_2_reading_video.mp4"), true);
  assert.equal(isProtectedUnit2SourcePath("/Ultimate%20English%20B2.app/Contents/Resources/assets/books/book1/unit/2/part5/obj3/audio.mp3"), true);
  assert.equal(isProtectedUnit2SourcePath("/src/assets/books/ultimate-b2/student-text.jpg"), false);
  assert.deepEqual(parseMediaRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseMediaRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.equal(parseMediaRange("bytes=100-110", 100), null);
});
