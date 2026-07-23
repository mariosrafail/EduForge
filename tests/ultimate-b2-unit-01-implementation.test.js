import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { hasUltimateB2MediaAccess, parseMediaRange, resolveUltimateB2MediaFile } from "../netlify/functions/ultimate-b2-media.js";

const matrixPath = "books/ultimate-b2/generated/editorial/unit-01.implementation-matrix.json";
const activityPath = "books/ultimate-b2/generated/activities/unit-01.activities.json";
const runtimePath = "src/data/ultimate-b2/generated/unit-01.runtime.json";
const readerPath = "src/data/ultimate-b2/generated/students-book.runtime.json";

async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }

test("Unit 1 matrix covers every definite publisher object exactly once", async () => {
  const [matrix, source] = await Promise.all([readJson(matrixPath), readJson(activityPath)]);
  assert.equal(matrix.printedPageRange, "5-18");
  assert.equal(matrix.spreadCount, 10);
  assert.equal(matrix.activities.length, 39);
  assert.equal(matrix.mediaOnlyObjectCount, 16);
  assert.equal(matrix.nonExerciseDisplayObjectCount, 14);
  assert.deepEqual(matrix.sourceAssetSummary, { hdPageImages: 10, sdPageImages: 10, audioFiles: 35, primaryPlayableAudioMappings: 6, publisherHighlightAudioSegments: 29, videoFiles: 5, playableVideoMappings: 5, objectImageFiles: 140, relevantImageDependencies: 115 });
  assert.deepEqual(matrix.summary, {
    "auto-scored": 22,
    "teacher-reviewed": 10,
    "unscored-practice": 5,
    "reading-content": 0,
    "unsupported-disabled": 2,
    active: 37,
    disabled: 2,
    explicitAnswerObjects: 26,
    missingAnswerObjects: 13,
  });
  const ids = matrix.activities.map((activity) => activity.stableNormalizedId);
  assert.equal(new Set(ids).size, 39);
  assert.deepEqual(ids.sort(), source.activities.map((activity) => activity.id).sort());
  assert.ok(matrix.activities.every((activity) => activity.book === "ultimate-b2" && activity.component === "students-book" && activity.unitNumber === 1));
  assert.ok(matrix.activities.every((activity) => activity.sourceProvenance.every((sourcePath) => !path.isAbsolute(sourcePath))));
});

test("Unit 1 page and spread ordering is exact", async () => {
  const reader = await readJson(readerPath);
  const unit = reader.units.find((candidate) => candidate.number === 1);
  assert.equal(unit.printedPageRange, "5-18");
  assert.deepEqual(unit.pages.map((page) => page.spreadNumber), ["5", "6-7", "8-9", "10-11", "12", "13", "14-15", "16", "17", "18"]);
  assert.deepEqual(unit.pages.flatMap((page) => page.pageNumbers), [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.equal(unit.pages.reduce((sum, page) => sum + page.activities.length, 0), 39);
  assert.equal(unit.pages.reduce((sum, page) => sum + page.activities.filter((activity) => activity.availability === "enabled").length, 0), 37);
  assert.equal(unit.pages.find((page) => page.spreadNumber === "16").activities.filter((activity) => activity.availability === "disabled").length, 2);
});

test("every Unit 1 auto-scored record has complete explicit evidence", async () => {
  const matrix = await readJson(matrixPath);
  const auto = matrix.activities.filter((activity) => activity.implementationMode === "auto-scored");
  assert.equal(auto.length, 22);
  assert.ok(auto.every((activity) => activity.explicitAnswerEvidenceStatus === "complete-explicit-publisher-evidence"));
  assert.ok(auto.every((activity) => activity.runtime.questions.length > 0));
  assert.ok(auto.every((activity) => activity.runtime.questions.every((question) => question.prompt && question.acceptedAnswers.length)));
  assert.ok(auto.every((activity) => activity.normalizedAnswerRecords.length === activity.runtime.questions.length));
});

test("Vocabulary in Use Exercise 1 keeps the printed crew and performance blanks aligned", async () => {
  const matrix = await readJson(matrixPath);
  const activity = matrix.activities.find((item) => item.stableNormalizedId === "ultimate-b2-sb-u1-p3-o1");
  const crew = activity.runtime.questions[7];
  const performance = activity.runtime.questions[8];
  const soundtrack = activity.runtime.questions[9];

  assert.equal(crew.prompt, "During the actual shooting of the film, the director co-ordinates the actors and the rest of the film ____, such as lighting technicians, camera operators and make-up artists.");
  assert.deepEqual(crew.acceptedAnswers, ["crew"]);
  assert.equal(crew.publisherAnswerValue, "3");
  assert.equal(performance.prompt, "The director also has to coach the actors to give their best ____.");
  assert.deepEqual(performance.acceptedAnswers, ["performance"]);
  assert.equal(performance.publisherAnswerValue, "4");
  assert.equal(soundtrack.prompt, "Then, when filming is complete, there are many weeks of editing, after which they add special effects, mix the sound and add the music to the ____.");
  assert.deepEqual(soundtrack.acceptedAnswers, ["soundtrack"]);
  assert.doesNotMatch(JSON.stringify(activity.runtime.questions), /camera operators and make-up ____/);
});

test("TikTok gap-fill prompts retain enough printed context for their publisher answers", async () => {
  const matrix = await readJson(matrixPath);
  const activity = matrix.activities.find((item) => item.stableNormalizedId === "ultimate-b2-sb-u1-p4-o8");
  assert.deepEqual(
    activity.runtime.questions.map(({ prompt, acceptedAnswers }) => [prompt, acceptedAnswers]),
    [
      ["For anyone who doesn’t know, TikTok ____ an app that lets users make short videos and then share them online.", ["is"]],
      ["TikTok has only been in existence ____ a short time.", ["for"]],
      ["Nevertheless, it ____ already become incredibly successful.", ["has"]],
      ["The number of times people ____ downloaded the app now measures in the billions.", ["have"]],
      ["Up to now, the majority of TikTok users have ____ teenagers.", ["been"]],
      ["Statistics suggest, however, that these teenagers ____ continuing to use it into their twenties.", ["are"]],
      ["In other words, they have ____ grown out of it as we might expect.", ["not"]],
      ["Social media have been about keeping in touch with others or belonging to a community ____ the beginning.", ["since/from", "since", "from"]],
    ],
  );
});

test("Unit 1 browser catalogs contain no answers, source paths, or decoder material", async () => {
  const raw = `${await readFile(runtimePath, "utf8")}\n${await readFile(readerPath, "utf8")}`;
  assert.doesNotMatch(raw, /acceptedAnswers|publisherAnswerValue|decodedPublisherValue|normalizedAnswerRecords|explicitAnswerEvidence/);
  assert.doesNotMatch(raw, /Contents[\\/]Resources|[A-Za-z]:[\\/]|EA3DC7D7-6954-471A-8399-E217B522F5F2|IWB_XOR_KEY|decodeIwbXml/);
  const runtime = await readJson(runtimePath);
  assert.equal(runtime.activities.length, 39);
  assert.ok(runtime.activities.every((activity) => activity.runtime.questions.every((question) => !("acceptedAnswers" in question))));
});

test("generic Students Book renderer selects both Unit 1 and Unit 2 catalogs", async () => {
  const generic = await readFile("src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx", "utf8");
  const catalog = await readFile("src/data/ultimate-b2/studentsBookCatalog.js", "utf8");
  const compatibility = await readFile("src/components/lms/activities/ultimate-b2/NormalizedUnit2Activity.jsx", "utf8");
  const runner = await readFile("src/components/lms/activities/ultimate-b2/UltimateB2ActivityRunner.jsx", "utf8");
  assert.match(catalog, /unit-01\.runtime\.json/);
  assert.match(catalog, /unit-02\.runtime\.json/);
  assert.match(generic, /findStudentsBookImplementation/);
  assert.match(catalog, /aliasesToStableId\.get\(identifier\)/);
  assert.match(compatibility, /NormalizedStudentsBookActivity as NormalizedUnit2Activity/);
  assert.match(runner, /findStudentsBookImplementation/);
  assert.doesNotMatch(runner, /ReadingExercise3|ReadingExercise4/);
  const unit2 = await readJson("src/data/ultimate-b2/generated/unit-02.runtime.json");
  assert.equal(unit2.activities.length, 50);
});

test("Unit 1 teacher review and unscored persistence remain score-null", async () => {
  const [server, teacherPortal] = await Promise.all([
    readFile("netlify/functions/book-content.js", "utf8"),
    readFile("src/components/lms/teacher/TeacherPortalSections.jsx", "utf8"),
  ]);
  assert.match(server, /requiresTeacherReview \|\| unscoredPractice \? null/);
  assert.match(server, /requiresTeacherReview \? "awaiting_review" : unscoredPractice \? "completed"/);
  assert.match(server, /const averageScore = averageScoreValue === null \? null/);
  assert.match(server, /const averageScore = scoredRows\.length[\s\S]*?: null;/);
  assert.match(server, /teacher_feedback/);
  assert.match(server, /status: "reviewed"/);
  assert.match(server, /school_id = \$\{currentUser\.school_id\}/);
  assert.match(teacherPortal, /averageScore === null \? "Unscored"/);
  assert.match(teacherPortal, /summary\?\.averageScore == null \? "Unscored"/);
});

test("disabled Unit 1 games are omitted from migration and denied by the student renderer", async () => {
  const [matrix, migration, renderer] = await Promise.all([
    readJson(matrixPath),
    readFile("database/021_ultimate_b2_unit1_recovered_activities.sql", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx", "utf8"),
  ]);
  const disabled = matrix.activities.filter((activity) => activity.availability === "disabled");
  assert.deepEqual(disabled.map((activity) => activity.stableNormalizedId), ["ultimate-b2-sb-u1-p8-o3", "ultimate-b2-sb-u1-p8-o4"]);
  assert.doesNotMatch(migration, /ultimate-b2-sb-u1-p8-o3|ultimate-b2-sb-u1-p8-o4|spinningWheel|score4/);
  assert.match(renderer, /Activity not found\./);
});

test("Unit 1 media mappings are protected, offline-mapped, and range-capable", async () => {
  const [matrix, reader, endpoint, offline] = await Promise.all([
    readJson(matrixPath), readJson(readerPath), readFile("netlify/functions/ultimate-b2-media.js", "utf8"), readFile("src/data/ultimate-b2/ultimateB2MediaAssets.offline.js", "utf8"),
  ]);
  const activityKeys = matrix.activities.flatMap((activity) => activity.mediaDependencies).map((dependency) => dependency.logicalKey);
  assert.equal(activityKeys.length, 8);
  const extraKeys = reader.units.find((unit) => unit.number === 1).pages.flatMap((page) => page.media).filter((media) => media.availability === "enabled").map((media) => media.logicalKey);
  assert.equal(extraKeys.length, 3);
  for (const key of [...activityKeys, ...extraKeys]) {
    assert.match(endpoint, new RegExp(key.replaceAll(".", "\\.")));
    assert.match(offline, new RegExp(key.replaceAll(".", "\\.")));
  }
  assert.deepEqual(parseMediaRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(parseMediaRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.equal(parseMediaRange("bytes=100-110", 100), null);
});

test("media entitlement query is role-aware and school-scoped", async () => {
  const calls = [];
  const sql = async (strings) => { calls.push(strings.join("?")); return [{ one: 1 }]; };
  assert.equal(await hasUltimateB2MediaAccess(sql, { id: "student", role: "student", school_id: "school-a" }), true);
  assert.match(calls[0], /book_access/);
  assert.match(calls[0], /c\.school_id/);
});

test("media source resolution rejects traversal and symlink escapes", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eduforge-unit1-media-root-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "eduforge-unit1-media-outside-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); });
  await mkdir(path.join(root, "safe"));
  await writeFile(path.join(root, "safe", "audio.mp3"), "safe");
  await writeFile(path.join(outside, "outside.mp3"), "outside");
  assert.equal(await resolveUltimateB2MediaFile("safe/audio.mp3", root), path.join(root, "safe", "audio.mp3"));
  await assert.rejects(() => resolveUltimateB2MediaFile(path.relative(root, path.join(outside, "outside.mp3")), root), /escaped its source root/);
  try {
    await symlink(path.join(outside, "outside.mp3"), path.join(root, "safe", "escaped.mp3"), "file");
    await assert.rejects(() => resolveUltimateB2MediaFile("safe/escaped.mp3", root), /escaped its source root/);
  } catch (error) {
    if (!["EPERM", "EACCES", "UNKNOWN"].includes(error.code)) throw error;
    await symlink(outside, path.join(root, "safe", "escaped-directory"), "junction");
    await assert.rejects(() => resolveUltimateB2MediaFile("safe/escaped-directory/outside.mp3", root), /escaped its source root/);
  }
});

test("migration 021 is additive, idempotent, and scoped to Unit 1", async () => {
  const migration = await readFile("database/021_ultimate_b2_unit1_recovered_activities.sql", "utf8");
  assert.match(migration, /on conflict/gi);
  assert.match(migration, /slug = 'ultimate-b2'/);
  assert.match(migration, /slug = 'ultimate-b2-students-book'/);
  assert.match(migration, /insert into units \(book_component_id/);
  assert.match(migration, /insert into lessons \(unit_id/);
  assert.match(migration, /'Unit 1', 'unit-1', 1/);
  assert.doesNotMatch(migration, /book_units|book_unit_id/);
  assert.doesNotMatch(migration, /\b(delete|truncate|drop table|alter table)\b/i);
  assert.doesNotMatch(migration, /unit-2|six unresolved|school_id\s*=\s*['"][0-9a-f-]+/i);
});
