import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  IWB_XOR_KEY,
  applyRepeatingXor,
  buildIwbAnalysis,
  calculateEntropy,
  decodeBase64Wrapper,
  inspectIwbFile,
  inspectIwbPayload,
  probeStandardFormats,
} from "../scripts/ultimate-b2/iwb-inspector.mjs";
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
const normalizedUnit2 = JSON.parse(await readFile("books/ultimate-b2/generated/activities/unit-02.activities.json", "utf8"));

function getNormalizedStudentsBookActivity(idOrAlias) {
  return normalizedUnit2.activities.find((activity) => activity.id === idOrAlias || activity.aliases?.includes(idOrAlias)) || null;
}

function sanitizedIwb(xml) {
  return applyRepeatingXor(Buffer.from(xml), IWB_XOR_KEY).toString("base64");
}

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
  assert.equal(unit.activities.find((item) => item.id.endsWith("o1")).recoverability, "answer-known-interaction-unknown");
  assert.equal(unit.activities.find((item) => item.id.endsWith("o2")).recoverability, "fully-recoverable");
  assert.equal(first.iwbAnalysis.totals.strictXml, 3);
});

test("unit and spread extraction follows confirmed publisher pagination", () => {
  assert.deepEqual(pagesForUnitPart(1, 1), { pageNumber: 5, spreadNumber: "5" });
  assert.deepEqual(pagesForUnitPart(1, 9), { pageNumber: 17, spreadNumber: "17" });
  assert.deepEqual(pagesForUnitPart(2, 2), { pageNumber: 20, spreadNumber: "20-21" });
  assert.deepEqual(pagesForUnitPart(3, 10), { pageNumber: 48, spreadNumber: "48" });
  assert.deepEqual(pagesForUnitPart(4, 1), { pageNumber: 49, spreadNumber: "49" });
  assert.deepEqual(pagesForUnitPart(10, 12), { pageNumber: 154, spreadNumber: "154" });
});

test("IWB primitives strictly decode Base64, calculate entropy, and expose text evidence", () => {
  assert.deepEqual(decodeBase64Wrapper("QUJDRA=="), Buffer.from("ABCD"));
  assert.throws(() => decodeBase64Wrapper("not base64"), /Malformed Base64/);
  assert.equal(calculateEntropy(Buffer.alloc(32, 7)), 0);
  assert.equal(calculateEntropy(Buffer.from([0, 1, 0, 1])), 1);
  const utf8 = probeStandardFormats(Buffer.from("Sanitized UTF-8 evidence"));
  assert.equal(utf8.parsers.utf8Text, true);
  const utf16 = probeStandardFormats(Buffer.from("Sanitized UTF-16 evidence", "utf16le"));
  assert.equal(utf16.parsers.utf16Text, true);
});

test("standard compression and signature probes are read-only", () => {
  const compressed = gzipSync(Buffer.from("sanitized compressed fixture"));
  const result = probeStandardFormats(compressed);
  assert.equal(result.signatures.gzip, true);
  assert.equal(result.parsers.gzip.success, true);
  assert.equal(result.signatures.zip, false);
});

test("decoder rejects malformed wrappers and classifies malformed transformed XML", () => {
  assert.throws(() => inspectIwbPayload("%%%%"), /Malformed Base64/);
  const partial = inspectIwbPayload(sanitizedIwb('<params><field duplicated="1" duplicated="2"/></params>'));
  assert.equal(partial.binaryStatus, "decoded-partial");
  assert.equal(partial.xml.strict, false);
});

test("decoder is consistent across sanitized unit-shaped samples and retains explicit answer evidence", () => {
  const unit1 = inspectIwbPayload(sanitizedIwb('<params><exercises><exercise type="dnd"><drop id="1" answers="2"/></exercise></exercises></params>'));
  const unit10 = inspectIwbPayload(sanitizedIwb('<questions><question id="1"><answer>A</answer><answer>B</answer><correct>B</correct></question></questions>'));
  assert.equal(unit1.binaryStatus, "decoded-structured");
  assert.equal(unit10.binaryStatus, "decoded-structured");
  assert.equal(unit1.xml.hasExplicitAnswerEvidence, true);
  assert.equal(unit10.xml.correctAnswerCount, 1);
  const grouped = buildIwbAnalysis([
    { relativePath: "unit/1/part1/obj1/obj_params.iwb", inspection: unit1, objectId: "u1-o1", unitNumber: 1, role: "exercise" },
    { relativePath: "unit/10/part1/obj1/questions_params.iwb", inspection: unit10, objectId: "u10-o1", unitNumber: 10, role: "answers" },
  ]);
  assert.equal(grouped.totals.iwbFiles, 2);
  assert.deepEqual(grouped, buildIwbAnalysis([
    { relativePath: "unit/1/part1/obj1/obj_params.iwb", inspection: unit1, objectId: "u1-o1", unitNumber: 1, role: "exercise" },
    { relativePath: "unit/10/part1/obj1/questions_params.iwb", inspection: unit10, objectId: "u10-o1", unitNumber: 10, role: "answers" },
  ]));
});

test("decoded file lookup enforces path containment", async () => {
  await assert.rejects(() => inspectIwbFile(fixtureRoot, "../outside.iwb"), /escapes source root/);
  const result = await inspectIwbFile(fixtureRoot, "Contents/Resources/assets/books/book1/unit/2/part1/obj1/obj_params.iwb");
  assert.equal(result.binaryStatus, "decoded-structured");
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

test("scanner does not write to publisher source", async () => {
  const sourceFile = path.join(fixtureRoot, "Contents/Resources/assets/books/book1/unit/2/part1/obj1/obj_params.iwb");
  const before = await readFile(sourceFile);
  await scanUltimateB2StudentsBook({ sourceRoot: fixtureRoot, hashConcurrency: 2 });
  assert.deepEqual(await readFile(sourceFile), before);
});

test("selected Unit 2 controlled content and manifest remain internally consistent", async () => {
  const extraction = JSON.parse(await readFile("books/ultimate-b2/ultimate-b2.students-book-unit-2.extraction.json", "utf8"));
  const manifest = JSON.parse(await readFile("books/ultimate-b2/ultimate-b2.students-book-unit-2.manifest.json", "utf8"));
  assert.equal(extraction.summary.definiteActivityCount, 50);
  assert.equal(extraction.summary.implementedFromNormalizedCatalogCount, 2);
  assert.equal(readingExercise3.length, 6);
  assert.equal(readingExercise3Options.length, 7);
  assert.ok(readingExercise3.every((item) => !("answer" in item)));
  assert.equal(readingExercise4.length, 8);
  assert.ok(readingExercise4.every((item) => item.options.length === 2 && !("answer" in item)));
  assert.deepEqual(getNormalizedStudentsBookActivity("reading-ex3").answerRecords.map((answer) => Number(answer.decodedPublisherValue)), [6, 3, 5, 1, 7, 2]);
  assert.deepEqual(getNormalizedStudentsBookActivity("reading-ex4").answerRecords.map((answer) => Number(answer.decodedPublisherValue)), [1, 2, 1, 2, 2, 1, 2, 1]);
  assert.deepEqual(extraction.implementedActivities[0].explicitAnswerIndexes, [6, 3, 5, 1, 7, 2]);
  assert.deepEqual(extraction.implementedActivities[1].explicitAnswerIndexes, [1, 2, 1, 2, 2, 1, 2, 1]);
  const readingActivities = manifest.components[0].units[0].lessons[0].activities;
  assert.equal(readingActivities.find((item) => item.id === "activity-reading-ex3").type, "matching");
  assert.equal(readingActivities.find((item) => item.id === "activity-reading-ex3").status, "manual-review");
  assert.equal(readingActivities.find((item) => item.id === "activity-reading-ex4").type, "multiple_choice");
  assert.equal(readingActivities.find((item) => item.id === "activity-reading-ex4").status, "manual-review");
  for (const hotspot of manifest.components[0].units[0].pages.flatMap((page) => page.hotspots)) {
    assert.equal(validateHotspotCoordinates(hotspot), true);
  }
});
