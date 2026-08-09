import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(repositoryRoot, "src/data/ultimate-b2/unit1Part2LegacyPilotAssetManifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const pilotRoot = path.join(repositoryRoot, "src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2");
const publisherRoot = path.join(repositoryRoot, "Ultimate English B2.app");
const expectedIds = [1, 2, 3, 4, 5].map((number) => `ultimate-b2-sb-u1-p2-o${number}`);

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(candidate));
    else files.push(candidate);
  }
  return files;
}

test("legacy pilot manifest is exactly scoped to Unit 1 Part 2", () => {
  assert.deepEqual(manifest.scope, {
    book: "ultimate-b2",
    component: "students-book",
    unit: 1,
    part: 2,
    activityIds: expectedIds,
  });
  assert.equal(manifest.copiedAssets.length, 28);
  assert.equal(manifest.derivedAssets.length, 2);
  assert.equal(manifest.reusedAssets.length, 2);
  assert.ok(manifest.copiedAssets.every((asset) => expectedIds.includes(asset.activityId)));
  assert.ok(manifest.copiedAssets.every((asset) => asset.sourceRelativePath.includes("/unit/1/part2/")));
  assert.ok(manifest.copiedAssets.every((asset) => asset.trackedPath.startsWith("src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/")));
  assert.ok(manifest.copiedAssets.every((asset) => [".png", ".jpg", ".mp3", ".mp4", ".srt"].includes(path.extname(asset.trackedPath))));
  assert.ok(manifest.derivedAssets.every((asset) => [".vtt", ".pdf"].includes(path.extname(asset.trackedPath))));
});

test("every copied pilot asset resolves and matches its recorded SHA-256", async () => {
  const trackedAssets = [...manifest.copiedAssets, ...manifest.derivedAssets];
  const expectedTrackedPaths = new Set(trackedAssets.map((asset) => path.resolve(repositoryRoot, asset.trackedPath)));
  const actualTrackedPaths = new Set(await walk(pilotRoot));
  assert.deepEqual(actualTrackedPaths, expectedTrackedPaths);

  for (const asset of trackedAssets) {
    const trackedFile = path.resolve(repositoryRoot, asset.trackedPath);
    assert.equal(await sha256(trackedFile), asset.sha256, asset.trackedPath);
    assert.equal((await readFile(trackedFile)).length, asset.bytes, asset.trackedPath);
  }
});

test("local publisher source, when present, matches every copied and reused provenance hash", async (t) => {
  try {
    await access(publisherRoot);
  } catch {
    t.skip("Ignored publisher source is unavailable in this environment.");
    return;
  }
  for (const asset of [...manifest.copiedAssets, ...manifest.reusedAssets]) {
    const sourceFile = path.resolve(publisherRoot, ...asset.sourceRelativePath.split("/"));
    assert.equal(await sha256(sourceFile), asset.sha256, asset.sourceRelativePath);
  }
});

test("pilot audio mappings are activity-correct and web mappings remain protected", async () => {
  const copiedAudio = manifest.copiedAssets.filter((asset) => asset.fileType === "mp3");
  assert.equal(copiedAudio.filter((asset) => asset.activityId.endsWith("-o2")).length, 3);
  assert.equal(copiedAudio.filter((asset) => asset.activityId.endsWith("-o3")).length, 6);
  assert.ok(copiedAudio.every((asset) => asset.logicalKey.includes(`.${asset.activityId.endsWith("-o2") ? "obj2" : "obj3"}.highlight-`)));

  const webMap = await readFile(path.join(repositoryRoot, "src/data/ultimate-b2/unit1Part2LegacyPilotAudio.web.js"), "utf8");
  const offlineMap = await readFile(path.join(repositoryRoot, "src/data/ultimate-b2/unit1Part2LegacyPilotAudio.offline.js"), "utf8");
  assert.doesNotMatch(webMap, /\.mp3|Ultimate English B2\.app|Contents[\\/]Resources/);
  assert.match(webMap, /ultimate-b2-source-asset/);
  assert.equal((offlineMap.match(/\.mp3"/g) || []).length, 9);
});

test("pilot activation and styles are restricted to the five exact activities", async () => {
  const assetsModule = await readFile(path.join(repositoryRoot, "src/data/ultimate-b2/unit1Part2LegacyPilotAssets.js"), "utf8");
  const renderer = await readFile(path.join(repositoryRoot, "src/components/lms/activities/ultimate-b2/UltimateB2LegacyPilotActivity.jsx"), "utf8");
  const normalizedRenderer = await readFile(path.join(repositoryRoot, "src/components/lms/activities/ultimate-b2/NormalizedStudentsBookActivity.jsx"), "utf8");
  const css = await readFile(path.join(repositoryRoot, "src/styles/activities.css"), "utf8");
  for (const id of expectedIds) assert.match(assetsModule, new RegExp(id));
  assert.match(normalizedRenderer, /isUltimateB2Unit1Part2LegacyPilot\(activity\)/);
  assert.match(renderer, /data-legacy-pilot-activity/);
  assert.match(renderer, /Video Worksheet/);
  assert.match(renderer, /PdfSaver\.savePdf/);
  assert.match(renderer, /Capacitor\.isNativePlatform/);
  assert.match(renderer, /TeacherLegacyUnitOpenerAnswer/);
  assert.match(assetsModule, /obj1\.vtt\?url/);
  assert.match(assetsModule, /video-worksheet\.pdf\?url/);
  assert.match(css, /\.ultimate-b2-legacy-pilot/);
  assert.doesNotMatch(renderer, /acceptedAnswers\s*:\s*\[/);
});

test("pilot assets contain no executable, runtime, SWF, or unrelated-unit files", async () => {
  const files = await walk(pilotRoot);
  assert.ok(files.every((file) => !/\.(?:app|air|dll|dylib|exe|swf|class|jar)$/i.test(file)));
  assert.ok(files.every((file) => !/[\\/]unit-(?:[2-9]|10)[\\/]/i.test(file)));
  assert.ok(files.every((file) => !path.isAbsolute(path.relative(repositoryRoot, file))));
});

test("activity identities, classifications, question counts, and enabled counts remain unchanged", async () => {
  const unit1 = JSON.parse(await readFile(path.join(repositoryRoot, "src/data/ultimate-b2/generated/unit-01.runtime.json"), "utf8"));
  const unit2 = JSON.parse(await readFile(path.join(repositoryRoot, "src/data/ultimate-b2/generated/unit-02.runtime.json"), "utf8"));
  const pilot = unit1.activities.filter((activity) => expectedIds.includes(activity.stableNormalizedId));
  assert.deepEqual(pilot.map((activity) => activity.stableNormalizedId), expectedIds);
  assert.deepEqual(pilot.map((activity) => activity.runtime.questions.length), [2, 3, 6, 8, 1]);
  assert.deepEqual(pilot.map((activity) => activity.implementationMode), [
    "teacher-reviewed",
    "teacher-reviewed",
    "auto-scored",
    "auto-scored",
    "teacher-reviewed",
  ]);
  assert.equal(unit1.activities.filter((activity) => activity.availability === "enabled").length, 38);
  assert.equal(unit2.activities.filter((activity) => activity.implementationMode !== "unsupported-disabled").length, 40);
  assert.equal(
    unit1.activities.filter((activity) => activity.availability === "enabled").length
      + unit2.activities.filter((activity) => activity.implementationMode !== "unsupported-disabled").length,
    78,
  );
  assert.equal(
    unit1.activities.filter((activity) => activity.availability !== "enabled").length
      + unit2.activities.filter((activity) => activity.implementationMode === "unsupported-disabled").length,
    12,
  );
});
