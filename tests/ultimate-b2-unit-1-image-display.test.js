import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import hotspotManifest from "../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import studentsBookRuntime from "../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import assetManifest from "../src/data/ultimate-b2/unit1Part1Exercise2AssetManifest.json" with { type: "json" };
import { findStudentsBookImplementation } from "../src/data/ultimate-b2/studentsBookCatalog.js";

const activityId = "ultimate-b2-sb-u1-p1-o2";

test("Unit 1 Page 5 Exercise 2 preserves the original publisher instruction asset", async () => {
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

test("Page 5 Exercise 2 is enabled as a generic unscored image activity", () => {
  const implementation = findStudentsBookImplementation(activityId);
  assert.ok(implementation);
  assert.equal(implementation.activityType, "image");
  assert.equal(implementation.implementationMode, "reading-content");
  assert.equal(implementation.scoringMode, "unscored");
  assert.equal(implementation.availability, "enabled");
  assert.deepEqual(implementation.runtime.questions, []);
  const page = studentsBookRuntime.units.find((unit) => unit.number === 1).pages.find((candidate) => candidate.id === "ub2-sb-unit-1-part-1");
  assert.ok(page.activities.some((activity) => activity.id === activityId && activity.activityType === "image"));
  assert.ok(page.actions.some((action) => action.activityKey === activityId));
});

test("the image renderer uses optional instruction artwork and one horizontal content image without bullets", async () => {
  const [authoringSource, dataSource, rendererSource, normalizedSource, styles] = await Promise.all([
    readFile("src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.image.json", "utf8"),
    readFile("src/data/ultimate-b2/page5AuthoringData.js", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/UltimateB2ImageActivity.jsx", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx", "utf8"),
    readFile("src/styles/ultimate-b2-recovered-activities.css", "utf8"),
  ]);
  assert.match(dataSource, /discussion-prompts\.svg/);
  assert.match(authoringSource, /main-content/);
  assert.doesNotMatch(authoringSource, /bullet/);
  assert.match(rendererSource, /data-image-activity/);
  assert.match(rendererSource, /ultimate-b2-image-activity-main/);
  assert.doesNotMatch(rendererSource, /<ul|<li/);
  assert.match(normalizedSource, /isUltimateB2ImageActivity\(activity\)/);
  assert.match(styles, /\.ultimate-b2-image-activity-sheet/);
});

test("the authored Page 5 hotspot still opens Exercise 2", () => {
  const exercise2 = hotspotManifest.pages["ub2-sb-unit-1-part-1"].find((hotspot) => hotspot.activityKey === activityId);
  assert.ok(exercise2);
  assert.equal(exercise2.pageNumber, 5);
});
