import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  enabledStudentsBookActivitySequence,
  findStudentsBookImplementation,
  ultimateB2StudentsBookTeacherCatalog,
} from "../../src/data/ultimate-b2/studentsBookCatalog.js";
import studentsBookContent from "../../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import { teacherPackAssetSources } from "./pack-asset-sources.mjs";
import {
  containsForbiddenPackText,
  fileIntegrity,
  semanticSha256,
  sha256,
} from "./pack-utils.mjs";

const packRoot = path.resolve(import.meta.dirname, "../../android-content-packs/ultimate-b2-students-book");
const supportedImplementationModes = new Set([
  "auto-scored",
  "teacher-reviewed",
  "unscored-practice",
  "reading-content",
]);

async function readJson(name) {
  const file = path.join(packRoot, name);
  return {
    file,
    raw: await readFile(file, "utf8"),
    value: JSON.parse(await readFile(file, "utf8")),
  };
}

function allCatalogExercises(catalog) {
  return (catalog.units || []).flatMap((unit) => (
    (unit.lessons || []).flatMap((lesson) => lesson.exercises || [])
  ));
}

async function main() {
  const [manifestFile, catalogFile, activitiesFile, solutionsFile, assetsFile] = await Promise.all(
    ["manifest.json", "catalog.json", "activities.json", "teacher-solutions.json", "assets-manifest.json"].map(readJson),
  );
  const manifest = manifestFile.value;
  const catalog = catalogFile.value;
  const activities = activitiesFile.value.activities || [];
  const teacherSolutions = solutionsFile.value;
  const assetsManifest = assetsFile.value;
  const sequence = enabledStudentsBookActivitySequence();
  const enabledIds = sequence.map((activity) => activity.stableActivityId);
  const packIds = activities.map((activity) => activity.stableActivityId);
  const catalogExercises = allCatalogExercises(catalog);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.packageId, "ultimate-b2-students-book");
  assert.equal(manifest.minimumSupportedAppVersion, "0.1.0");
  assert.deepEqual(manifest.includedUnits, [1, 2]);
  assert.equal(manifest.enabledActivityCount, 78);
  assert.equal(manifest.activityCountsByUnit["1"], 38);
  assert.equal(manifest.activityCountsByUnit["2"], 40);
  assert.equal(manifest.disabledActivityCount, 12);
  assert.equal(ultimateB2StudentsBookTeacherCatalog.stats.disabledActivityCount, 12);
  assert.equal(sequence.length, 78);
  assert.equal(new Set(enabledIds).size, 78, "Enabled stable activity IDs must be unique");
  assert.deepEqual(packIds, enabledIds, "Pack activity order must match enabled navigation order");
  assert.equal(catalogExercises.length, 78);
  assert.equal(new Set(catalogExercises.map((exercise) => exercise.stableActivityId)).size, 78);

  for (const activity of activities) {
    const implementation = findStudentsBookImplementation(activity.stableActivityId);
    assert.ok(implementation, `No common renderer implementation for ${activity.stableActivityId}`);
    assert.ok(supportedImplementationModes.has(activity.implementationMode), `Unsupported renderer mode for ${activity.stableActivityId}`);
    assert.notEqual(implementation.availability, "disabled");
    assert.notEqual(implementation.implementationMode, "unsupported-disabled");
  }

  assert.equal(teacherSolutions.teacherOnly, true);
  assert.deepEqual(teacherSolutions.activityIds, enabledIds);
  assert.deepEqual(Object.keys(teacherSolutions.solutions), enabledIds);
  for (const [activityId, solution] of Object.entries(teacherSolutions.solutions)) {
    assert.ok(enabledIds.includes(activityId), `Solution references unknown activity ${activityId}`);
    assert.equal(solution.activityId, activityId);
    const questionIds = new Set((findStudentsBookImplementation(activityId).runtime?.questions || []).map((question) => question.id));
    for (const [questionId, question] of Object.entries(solution.questions || {})) {
      assert.ok(questionIds.has(questionId), `Solution references unknown question ${questionId}`);
      assert.equal(question.questionId, questionId);
      assert.ok(question.acceptedAnswers.length > 0);
    }
  }

  const assetKeys = new Set(assetsManifest.assets.map((asset) => asset.logicalKey));
  assert.equal(assetKeys.size, assetsManifest.assets.length, "Asset logical keys must be unique");
  const requiredDependencyKeys = new Set(activities.flatMap((activity) => (
    activity.mediaDependencies || []
  )).map((dependency) => dependency.logicalKey).filter(Boolean));
  for (const logicalKey of requiredDependencyKeys) {
    assert.ok(assetKeys.has(logicalKey), `Required activity asset is unavailable: ${logicalKey}`);
  }
  const pageActionAssetKeys = (studentsBookContent.units || [])
    .filter((unit) => [1, 2].includes(Number(unit.number)))
    .flatMap((unit) => unit.pages || [])
    .flatMap((page) => page.actions || [])
    .filter((action) => action.availability === "enabled")
    .map((action) => action.logicalKey)
    .filter(Boolean);
  for (const logicalKey of pageActionAssetKeys) {
    assert.ok(assetKeys.has(logicalKey), `Required page action asset is unavailable: ${logicalKey}`);
  }
  assert.equal(manifest.pageCount, 22);
  assert.equal(manifest.assetCountsByType.cover, 1);
  assert.equal(manifest.assetCountsByType.page, 22);
  assert.equal(manifest.assetCountsByType.audio, 11);
  assert.equal(manifest.assetCountsByType.video, 7);
  assert.equal(manifest.assetCount, 41);
  assert.equal(manifest.assetSetSha256, semanticSha256(assetsManifest.assets));

  const sourcesByKey = new Map(teacherPackAssetSources().map((asset) => [asset.logicalKey, asset]));
  for (const asset of assetsManifest.assets) {
    const source = sourcesByKey.get(asset.logicalKey);
    assert.ok(source, `No build source mapping exists for ${asset.logicalKey}`);
    const bytes = await readFile(source.sourcePath);
    assert.equal((await stat(source.sourcePath)).size, asset.sizeBytes);
    assert.equal(sha256(bytes), asset.sha256, `Asset checksum mismatch for ${asset.logicalKey}`);
  }

  for (const fileRecord of [catalogFile, activitiesFile, solutionsFile, assetsFile]) {
    const expected = manifest.files[path.basename(fileRecord.file)];
    assert.ok(expected, `Manifest entry missing for ${path.basename(fileRecord.file)}`);
    assert.deepEqual(await fileIntegrity(fileRecord.file), {
      sizeBytes: expected.sizeBytes,
      sha256: expected.sha256,
    });
    assert.equal(semanticSha256(fileRecord.value), expected.semanticSha256);
  }

  const serializedPack = [manifestFile, catalogFile, activitiesFile, solutionsFile, assetsFile]
    .map((record) => record.raw)
    .join("\n");
  assert.deepEqual(containsForbiddenPackText(serializedPack), [], "Pack contains a forbidden path, URL, or sensitive field");
  assert.doesNotMatch(serializedPack, /(?:submit|grade|studentProgress|assignmentResult)/i);

  console.log(JSON.stringify({
    status: "valid",
    packageId: manifest.packageId,
    contentVersion: manifest.contentVersion,
    unit1Enabled: manifest.activityCountsByUnit["1"],
    unit2Enabled: manifest.activityCountsByUnit["2"],
    enabled: manifest.enabledActivityCount,
    disabled: manifest.disabledActivityCount,
    pages: manifest.pageCount,
    assets: manifest.assetCount,
    totalContentSizeBytes: manifest.totalContentSizeBytes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
