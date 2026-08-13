import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  importUltimateB2Page5OpenResponsePublisherSource,
  PAGE5_OPEN_RESPONSE_SOURCE_FILES,
} from "../scripts/ultimate-b2/page5-open-response-publisher-importer.mjs";
import { publisherSourceEvidenceOptions } from "./_publisher-source-test-helper.js";

const sourceDirectory = path.resolve("tmp/page5-open-response-source");
const publisherEvidence = publisherSourceEvidenceOptions(sourceDirectory);
const activityId = "ultimate-b2-sb-u1-p1-o1";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("Page 5 publisher XML deterministically reconstructs the canonical public and Teacher-private activity", publisherEvidence, async () => {
  const first = await importUltimateB2Page5OpenResponsePublisherSource(sourceDirectory);
  const second = await importUltimateB2Page5OpenResponsePublisherSource(sourceDirectory);
  assert.deepEqual(second, first, "unchanged publisher input imports idempotently");

  assert.equal(first.activityId, activityId);
  assert.deepEqual(first.report.sourceFilesFound, PAGE5_OPEN_RESPONSE_SOURCE_FILES);
  assert.deepEqual(first.report.canvas, { width: 1024, height: 582 });
  assert.deepEqual([first.report.imageCount, first.report.questionCount, first.report.responseRegionCount], [2, 3, 3]);
  assert.deepEqual(first.report.lineCounts, [3, 4, 4]);
  assert.equal(first.report.validation, "valid");

  const { publicAuthoring, teacherAuthoring } = first;
  assert.equal(publicAuthoring.activityId, activityId);
  assert.deepEqual(publicAuthoring.surface, { width: 1024, height: 582 });
  assert.deepEqual(publicAuthoring.artwork.instruction, {
    binding: "unit1.page5.exercise1.instruction", sourceFile: "image_2.png",
    naturalSize: { width: 606, height: 34 }, area: { x: 206, y: 18, width: 606, height: 34 },
  });
  assert.deepEqual(publicAuthoring.artwork.quote, {
    binding: "unit1.page5.exercise1.quote", sourceFile: "image_1.png",
    naturalSize: { width: 317, height: 507 }, area: { x: 696, y: 75, width: 317, height: 507 },
  });
  assert.deepEqual(publicAuthoring.questions.map(({ prompt, promptArea }) => ({ prompt, promptArea })), [
    { prompt: "In what ways are films an art form?", promptArea: { x: 54, y: 79, width: 604, height: 29 } },
    { prompt: "Why is theatre life?", promptArea: { x: 54, y: 214, width: 571, height: 29 } },
    { prompt: "Do you agree that TV is furniture?", promptArea: { x: 54, y: 372, width: 491, height: 29 } },
  ]);
  assert.deepEqual(publicAuthoring.questions.map((question) => question.responseRegion.area), [
    { x: 73, y: 117, width: 605, height: 73 },
    { x: 73, y: 253, width: 605, height: 96 },
    { x: 73, y: 410, width: 601, height: 96 },
  ]);
  assert.deepEqual(publicAuthoring.questions.map((question) => question.responseRegion.presentation.linePositions), [[23, 47, 69], [21, 46, 69, 91], [23, 46, 69, 92]]);
  for (const question of publicAuthoring.questions) {
    assert.equal(question.responseRegion.presentation.fontSize, 21);
    assert.equal(question.responseRegion.presentation.color, "#e40083");
    assert.equal(question.responseRegion.presentation.fontFamily, "ITC Flora Std Medium");
  }

  assert.deepEqual(teacherAuthoring.modelAnswers.map((answer) => answer.text.split("\n").length), [3, 4, 4]);
  assert.ok(teacherAuthoring.modelAnswers.every((answer) => !/[<>]/.test(answer.text)), "model answers are safe plain text");
  assert.match(teacherAuthoring.modelAnswers[0].text, /processes; for\n/);
  const publicJson = JSON.stringify(publicAuthoring);
  assert.doesNotMatch(publicJson, /Films are an art form which involve many artistic processes/);
  assert.doesNotMatch(publicJson, /<br/i);

  const trackedAssets = {
    "image_1.png": "src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj1/image_1.png",
    "image_2.png": "src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj1/image_2.png",
  };
  for (const [sourceName, trackedPath] of Object.entries(trackedAssets)) {
    const [sourceBytes, trackedBytes] = await Promise.all([readFile(path.join(sourceDirectory, sourceName)), readFile(trackedPath)]);
    assert.equal(sha256(sourceBytes), sha256(trackedBytes), `${sourceName} reuses the byte-identical tracked asset`);
  }
});

test("Page 5 importer rejects missing fixed source files without broad filesystem behavior", async () => {
  await assert.rejects(importUltimateB2Page5OpenResponsePublisherSource(path.join(sourceDirectory, "missing")), /ENOENT/);
  const pluginSource = await readFile("scripts/ultimate-b2/page5-builder-vite-plugin.mjs", "utf8");
  assert.match(pluginSource, /defaultPublisherSourceDirectory/);
  assert.doesNotMatch(pluginSource, /searchParams\.get\(["']path["']\)/);
});
