import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import assetManifest from "../src/data/ultimate-b2/unit1Part1Exercise2AssetManifest.json" with { type: "json" };
import hotspotManifest from "../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import studentsBookRuntime from "../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import { findStudentsBookImplementation } from "../src/data/ultimate-b2/studentsBookCatalog.js";

const activityId = "ultimate-b2-sb-u1-p1-o2";

test("Unit 1 Page 5 Exercise 2 preserves the original publisher display asset", async () => {
  const asset = assetManifest.copiedAssets[0];
  const bytes = await readFile(asset.trackedPath);
  assert.equal(bytes.length, asset.bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  assert.deepEqual(assetManifest.scope.activityIds, [activityId]);
  assert.equal(asset.width, 807);
  assert.equal(asset.height, 114);
  assert.equal(asset.preserveOriginalBytes, true);
  assert.equal(assetManifest.sourceMetadata[0].decodedExerciseType, "display");
});

test("the recovered publisher display is enabled as an unscored image activity", async () => {
  const implementation = findStudentsBookImplementation(activityId);
  assert.ok(implementation);
  assert.equal(implementation.title, "Unit opener · Exercise 2");
  assert.equal(implementation.activityType, "publisher-image-display");
  assert.equal(implementation.implementationMode, "reading-content");
  assert.equal(implementation.scoringMode, "unscored");
  assert.equal(implementation.availability, "enabled");
  assert.deepEqual(implementation.runtime.questions, []);

  const page = studentsBookRuntime.units.find((unit) => unit.number === 1).pages.find((candidate) => candidate.id === "ub2-sb-unit-1-part-1");
  assert.ok(page.activities.some((activity) => activity.id === activityId && activity.availability === "enabled"));
  assert.ok(page.actions.some((action) => action.activityKey === activityId));
});

test("the image display renderer uses the tracked image and exact recovered publisher lines", async () => {
  const [displaySource, rendererSource, normalizedSource, recoveredActivityStyles] = await Promise.all([
    readFile("src/data/ultimate-b2/unit1Part1Exercise2Display.js", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/UltimateB2PublisherImageDisplayActivity.jsx", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx", "utf8"),
    readFile("src/styles/ultimate-b2-recovered-activities.css", "utf8"),
  ]);
  assert.match(displaySource, /obj2\/image_2\.png/);
  assert.match(displaySource, /your favourite form of entertainment/);
  assert.match(displaySource, /how often you watch films, plays and TV programmes/);
  assert.match(displaySource, /where you watch them/);
  assert.match(rendererSource, /data-publisher-image-display-activity/);
  assert.match(rendererSource, /<img src=\{display\.image\}/);
  assert.match(normalizedSource, /isUltimateB2PublisherImageDisplay\(activity\)/);
  assert.match(normalizedSource, /UltimateB2PublisherImageDisplayActivity/);
  assert.match(recoveredActivityStyles, /\.ultimate-b2-publisher-image-display-sheet/);
});

test("the second authored Page 5 hotspot opens the recovered display activity", () => {
  const pageHotspots = hotspotManifest.pages["ub2-sb-unit-1-part-1"];
  const exercise2 = pageHotspots.find((hotspot) => hotspot.activityKey === activityId);
  assert.ok(exercise2);
  assert.equal(exercise2.label, "Unit opener · Exercise 2");
  assert.equal(exercise2.pageNumber, 5);
});
