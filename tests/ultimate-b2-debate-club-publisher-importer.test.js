import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import {
  DEBATE_CLUB_SOURCE_FILES,
  importUltimateB2DebateClubPublisherSource,
  normalizeDebateClubPublisherRevealText,
} from "../scripts/ultimate-b2/debate-club-publisher-importer.mjs";
import trackedAuthoring from "../src/data/ultimate-b2/authoring/unit-01-reading-debate-club.open-answer.json" with { type: "json" };

const root = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(root, "tmp/debateclub");
const trackedAssetRoot = path.join(root, "src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("publisher reveal line breaks normalize to safe plain text", () => {
  assert.equal(normalizeDebateClubPublisherRevealText("Line one<br>Line two<br/>Line three"), "Line one\nLine two\nLine three");
  assert.throws(() => normalizeDebateClubPublisherRevealText("Safe<script>alert(1)</script>"), /unsupported markup/);
});

test("Debate Club publisher package inventory and tracked images are exact", async () => {
  const names = (await readdir(sourceRoot)).sort();
  assert.deepEqual(names, [...DEBATE_CLUB_SOURCE_FILES].sort());
  const expectedDimensions = [[250, 105], [646, 60], [336, 123], [268, 99], [250, 166], [259, 172]];
  for (let index = 1; index <= 6; index += 1) {
    const name = `image_${index}.png`;
    const source = await readFile(path.join(sourceRoot, name));
    const tracked = await readFile(path.join(trackedAssetRoot, name));
    assert.equal(hash(source), hash(tracked), `${name} reuses the tracked publisher bytes`);
    const metadata = await sharp(source).metadata();
    assert.deepEqual([metadata.width, metadata.height], expectedDimensions[index - 1]);
  }
});

test("publisher XML deterministically reconstructs the exact two-part canonical Debate Club authoring", async () => {
  const first = await importUltimateB2DebateClubPublisherSource(sourceRoot);
  const second = await importUltimateB2DebateClubPublisherSource(sourceRoot);
  assert.deepEqual(first, second);
  assert.deepEqual(first.authoring, trackedAuthoring);
  assert.equal(first.activityId, "ultimate-b2-sb-u1-p2-o5");
  assert.deepEqual(first.authoring.surface, { width: 1024, height: 582 });
  assert.deepEqual(first.authoring.source.partMapping, [
    { partId: "part-1", pagesIndex: 1, exerciseIndex: 1 },
    { partId: "part-2", pagesIndex: 2, exerciseIndex: 2 },
  ]);
  assert.deepEqual(first.authoring.parts.map(({ id, number }) => ({ id, number })), [{ id: "part-1", number: 1 }, { id: "part-2", number: 2 }]);
  assert.deepEqual(first.authoring.parts[0].promptArea, { x: 111, y: 132, width: 841, height: 29 });
  assert.equal(first.authoring.parts[1].promptArea, null, "publisher page 2 has no duplicated prompt object");
  assert.deepEqual(first.authoring.parts.map((part) => part.responseRegion.area), [
    { x: 70, y: 272, width: 776, height: 296 },
    { x: 390, y: 242, width: 634, height: 236 },
  ]);
  assert.deepEqual(first.authoring.parts.map((part) => part.responseRegion.presentation.lineCount), [10, 8]);
  assert.deepEqual(first.report.secondaryProfile, { lineCounts: [9, 8], maxLines: [9, 8] });
  assert.ok(first.authoring.parts[0].responseRegion.revealText.includes("\n"));
  assert.ok(first.authoring.parts[1].responseRegion.revealText.includes("\n"));
  assert.doesNotMatch(JSON.stringify(first.authoring), /<br|<text|<params|C:\\|tmp[\\/]/i);
  for (const part of first.authoring.parts) assert.deepEqual({ fontFamily: part.responseRegion.presentation.fontFamily, fontSize: part.responseRegion.presentation.fontSize, color: part.responseRegion.presentation.color, align: part.responseRegion.presentation.align }, { fontFamily: "ITC Flora Std Medium", fontSize: 21, color: "#e40083", align: "left" });
});

test("publisher artwork maps by XML name, page index, natural size, and exact source coordinates", async () => {
  const { authoring } = await importUltimateB2DebateClubPublisherSource(sourceRoot);
  assert.deepEqual(authoring.artwork, {
    badge: { binding: "unit1.reading.debate-club.badge", sourceFile: "image_1.png", naturalSize: { width: 250, height: 105 }, area: { x: 5, y: 18, width: 250, height: 105 }, parts: [1] },
    instruction: { binding: "unit1.reading.debate-club.instruction", sourceFile: "image_2.png", naturalSize: { width: 646, height: 60 }, area: { x: 263, y: 45, width: 646, height: 60 }, parts: [1] },
  });
  assert.deepEqual(authoring.parts.map((part) => part.visualObjects), [
    {
      photo: { binding: "unit1.reading.debate-club.part-1-photo", sourceFile: "image_5.png", naturalSize: { width: 250, height: 166 }, area: { x: 727, y: 387, width: 250, height: 166 }, parts: [1] },
      argument: { binding: "unit1.reading.debate-club.part-1-argument", sourceFile: "image_3.png", naturalSize: { width: 336, height: 123 }, area: { x: 665, y: 264, width: 336, height: 123 }, parts: [1] },
    },
    {
      photo: { binding: "unit1.reading.debate-club.part-2-photo", sourceFile: "image_6.png", naturalSize: { width: 259, height: 172 }, area: { x: 60, y: 350, width: 259, height: 172 }, parts: [2] },
      argument: { binding: "unit1.reading.debate-club.part-2-argument", sourceFile: "image_4.png", naturalSize: { width: 268, height: 99 }, area: { x: 60, y: 264, width: 268, height: 99 }, parts: [2] },
    },
  ]);
});

test("Debate Club importer fails closed when the fixed package is incomplete", async () => {
  const missingRoot = await mkdtemp(path.join(os.tmpdir(), "hhplms-debate-missing-"));
  try {
    await assert.rejects(importUltimateB2DebateClubPublisherSource(missingRoot), /ENOENT/);
  } finally { await rm(missingRoot, { recursive: true, force: true }); }
});
