import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  isPathWithinRoot,
  pagesForUnitPart,
  scanUltimateB2StudentsBook,
  validateExtractedActivity,
  validateHotspotCoordinates,
  writeDeterministicJson,
} from "../scripts/ultimate-b2/students-book-scanner.mjs";
import { readingExercise3, readingExercise3Options, readingExercise4 } from "../src/components/lms/activities/ultimate-b2/content/readingContent.js";

const fixtureRoot = path.resolve("tests/fixtures/ultimate-b2-source");

test("source-root containment rejects parent traversal", () => {
  const root = path.resolve("fixture-root");
  assert.equal(isPathWithinRoot(root, path.join(root, "inside/file.xml")), true);
  assert.equal(isPathWithinRoot(root, path.resolve(root, "../outside/file.xml")), false);
});

test("scanner rejects a symlink that escapes the source root", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ultimate-b2-symlink-"));
  const source = path.join(temporary, "source");
  const outside = path.join(temporary, "outside");
  await mkdir(source, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(outside, "escape.txt"), "escape", "utf8");
  try {
    await symlink(outside, path.join(source, "escape"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES"].includes(error.code)) return t.skip("Host does not permit test symlink creation");
    throw error;
  }
  await assert.rejects(() => scanUltimateB2StudentsBook({ sourceRoot: source }), /Symlink escapes source root/);
});

test("fixture scan is deterministic, strict, classified, and duplicate-aware", async () => {
  const first = await scanUltimateB2StudentsBook({ sourceRoot: fixtureRoot, hashConcurrency: 2 });
  const second = await scanUltimateB2StudentsBook({ sourceRoot: fixtureRoot, hashConcurrency: 2 });
  assert.deepEqual(first, second);
  assert.equal(first.packageSummary.totalFileCount, 8);
  assert.equal(first.packageSummary.structuredFileCount, 2);
  assert.equal(first.packageSummary.parseFailureCount, 1);
  assert.equal(first.packageSummary.duplicateGroupCount, 1);
  const page = first.inventory.find((item) => item.sourceRelativePath.endsWith("parts/HD/parts_part_1.png"));
  assert.equal(page.originalClassification, "students-book-page");
  assert.equal(page.unitNumber, 2);
  assert.equal(page.pageNumber, 19);
  assert.match(page.sha256, /^[a-f0-9]{64}$/);
  assert.ok(first.inventory.some((item) => item.classification === "duplicate"));
  const unit = first.structure.units.find((item) => item.number === 2);
  assert.deepEqual(unit.pages[0].activities, ["ultimate-b2-sb-u2-p1-o1", "ultimate-b2-sb-u2-p1-o2"]);
  assert.equal(unit.activities.find((item) => item.id.endsWith("o1")).recoverability, "interaction-known-answer-unknown");
  assert.equal(unit.activities.find((item) => item.id.endsWith("o2")).recoverability, "encoded-unresolved");
});

test("unit and spread extraction follows confirmed publisher pagination", () => {
  assert.deepEqual(pagesForUnitPart(1, 1), { pageNumber: 5, spreadNumber: "5" });
  assert.deepEqual(pagesForUnitPart(1, 9), { pageNumber: 17, spreadNumber: "17" });
  assert.deepEqual(pagesForUnitPart(2, 2), { pageNumber: 20, spreadNumber: "20-21" });
  assert.deepEqual(pagesForUnitPart(3, 10), { pageNumber: 49, spreadNumber: "49-50" });
  assert.deepEqual(pagesForUnitPart(10, 12), { pageNumber: 162, spreadNumber: "162" });
});

test("answer-key validation rejects missing and out-of-option answers", () => {
  const valid = validateExtractedActivity({ id: "fixture", questions: [{ id: "q1", options: [{ id: "a" }, { id: "b" }], correctAnswer: "a" }] });
  assert.equal(valid.valid, true);
  assert.equal(validateExtractedActivity({ id: "fixture", questions: [{ id: "q1", options: [{ id: "a" }], correctAnswer: "b" }] }).valid, false);
  assert.equal(validateExtractedActivity({ id: "fixture", questions: [{ id: "q1", options: [{ id: "a" }] }] }).valid, false);
});

test("hotspot percentage validation enforces finite in-page bounds", () => {
  assert.equal(validateHotspotCoordinates({ left: 3.2, top: 7, width: 45, height: 14 }), true);
  assert.equal(validateHotspotCoordinates({ left: 90, top: 7, width: 20, height: 14 }), false);
  assert.equal(validateHotspotCoordinates({ left: 0, top: 0, width: 0, height: 10 }), false);
});

test("rescanning writes byte-identical deterministic metadata", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ultimate-b2-output-"));
  const output = path.join(temporary, "inventory.json");
  const result = await scanUltimateB2StudentsBook({ sourceRoot: fixtureRoot, hashConcurrency: 2 });
  await writeDeterministicJson(output, result);
  const first = await readFile(output, "utf8");
  await writeDeterministicJson(output, result);
  assert.equal(await readFile(output, "utf8"), first);
});

test("selected Unit 2 controlled content and manifest remain internally consistent", async () => {
  const extraction = JSON.parse(await readFile("books/ultimate-b2/ultimate-b2.students-book-unit-2.extraction.json", "utf8"));
  const manifest = JSON.parse(await readFile("books/ultimate-b2/ultimate-b2.students-book-unit-2.manifest.json", "utf8"));
  assert.equal(extraction.fullyRecoverableActivities.length, 0);
  assert.equal(extraction.manualReviewActivities.length, 3);
  assert.equal(readingExercise3.length, 6);
  assert.equal(readingExercise3Options.length, 7);
  assert.equal(new Set(readingExercise3.map((item) => item.answer)).size, 6);
  assert.equal(readingExercise4.length, 8);
  assert.ok(readingExercise4.every((item) => item.options.length === 2 && item.options.includes(item.answer)));
  const readingActivities = manifest.components[0].units[0].lessons[0].activities;
  assert.equal(readingActivities.find((item) => item.id === "activity-reading-ex3").type, "matching");
  assert.equal(readingActivities.find((item) => item.id === "activity-reading-ex3").status, "manual-review");
  assert.equal(readingActivities.find((item) => item.id === "activity-reading-ex4").type, "multiple_choice");
  assert.equal(readingActivities.find((item) => item.id === "activity-reading-ex4").status, "manual-review");
  for (const hotspot of manifest.components[0].units[0].pages.flatMap((page) => page.hotspots)) {
    assert.equal(validateHotspotCoordinates(hotspot), true);
  }
});
