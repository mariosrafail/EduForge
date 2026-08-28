import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  enabledStudentsBookActivitySequence,
  findStudentsBookImplementation,
  ultimateB2StudentsBookCatalog,
  ultimateB2StudentsBookTeacherCatalog,
} from "../../src/data/ultimate-b2/studentsBookCatalog.js";
import { buildUltimateB2TeacherSolutionPayload } from "../../netlify/functions/_ultimate-b2-teacher-solutions.js";
import studentsBookContent from "../../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import { teacherPackAssetSources } from "./pack-asset-sources.mjs";
import { fileIntegrity, semanticSha256, sha256 } from "./pack-utils.mjs";

const packRoot = path.resolve(import.meta.dirname, "../../android-content-packs/ultimate-b2-students-book");
const contentVersion = "2026.07.1";

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeJson(name, value) {
  const file = path.join(packRoot, name);
  await writeFile(file, jsonText(value), "utf8");
  return {
    ...(await fileIntegrity(file)),
    semanticSha256: semanticSha256(value),
  };
}

function buildCatalog() {
  return {
    schemaVersion: 1,
    packageId: "ultimate-b2-students-book",
    componentId: "students-book",
    title: "Ultimate B2 Students Book",
    units: ultimateB2StudentsBookCatalog.units.map((unit) => ({
      id: unit.id,
      runtimeId: unit.runtimeId,
      title: unit.title,
      unitNumber: unit.unitNumber,
      printedPageRange: unit.printedPageRange,
      navigationOrder: unit.navigationOrder,
      lessons: unit.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        sectionTitle: lesson.sectionTitle,
        pageLabel: lesson.pageLabel,
        pageNumber: lesson.pageNumber,
        pageSpread: lesson.pageSpread,
        navigationOrder: lesson.navigationOrder,
        exercises: lesson.exercises.map((exercise) => ({
          stableActivityId: exercise.stableActivityId,
          title: exercise.title,
          description: exercise.description,
          unitNumber: exercise.unitNumber,
          sectionTitle: exercise.sectionTitle,
          activityType: exercise.activityType,
          implementationMode: exercise.implementationMode,
          implementationModeLabel: exercise.implementationModeLabel,
          pageNumber: exercise.pageNumber,
          pageSpread: exercise.pageSpread,
          pageLabel: exercise.pageLabel,
          mediaDependencies: exercise.mediaDependencies,
        })),
      })),
    })),
  };
}

function buildActivities(sequence) {
  return {
    schemaVersion: 1,
    activities: sequence.map((exercise) => {
      const implementation = findStudentsBookImplementation(exercise.stableActivityId);
      return {
        stableActivityId: implementation.stableNormalizedId,
        unitNumber: implementation.unitNumber,
        partNumber: implementation.partNumber,
        printedPage: implementation.printedPage,
        sectionTitle: implementation.sectionTitle,
        title: implementation.title,
        visibleInstructionText: implementation.visibleInstructionText,
        activityType: implementation.activityType,
        implementationMode: implementation.implementationMode,
        scoringMode: implementation.scoringMode,
        mediaDependencies: implementation.mediaDependencies,
        runtime: implementation.runtime,
      };
    }),
  };
}

function buildSolutions(sequence) {
  return {
    schemaVersion: 1,
    teacherOnly: true,
    activityIds: sequence.map((activity) => activity.stableActivityId),
    solutions: Object.fromEntries(sequence.map((activity) => [
      activity.stableActivityId,
      buildUltimateB2TeacherSolutionPayload(activity.stableActivityId),
    ])),
  };
}

async function buildAssets(sequence) {
  const requiredMedia = new Set(sequence.flatMap((activity) => (
    findStudentsBookImplementation(activity.stableActivityId).mediaDependencies || []
  )).map((dependency) => dependency.logicalKey).filter(Boolean));
  const expectedPageKeys = new Set(
    (studentsBookContent.units || [])
      .flatMap((unit) => (unit.pages || []).map((page) => page.pageImage?.identity).filter(Boolean)),
  );
  const requiredPageMedia = new Set(
    (studentsBookContent.units || [])
      .filter((unit) => [1, 2].includes(Number(unit.number)))
      .flatMap((unit) => (unit.pages || []))
      .flatMap((page) => (page.actions || []))
      .filter((action) => action.availability === "enabled")
      .map((action) => action.logicalKey)
      .filter(Boolean),
  );
  const sourceAssets = teacherPackAssetSources().filter((asset) => (
    asset.type === "cover"
    || expectedPageKeys.has(asset.logicalKey)
    || requiredMedia.has(asset.logicalKey)
    || requiredPageMedia.has(asset.logicalKey)
  ));

  const assets = [];
  for (const asset of sourceAssets) {
    const info = await stat(asset.sourcePath);
    const bytes = await import("node:fs/promises").then(({ readFile }) => readFile(asset.sourcePath));
    assets.push({
      logicalKey: asset.logicalKey,
      bundleKey: asset.logicalKey,
      type: asset.type,
      required: true,
      sizeBytes: info.size,
      sha256: sha256(bytes),
    });
  }

  return {
    schemaVersion: 1,
    resolver: "bundled-capacitor-assets",
    assets,
  };
}

async function main() {
  await mkdir(packRoot, { recursive: true });
  const sequence = enabledStudentsBookActivitySequence();
  const disabledCount = ultimateB2StudentsBookTeacherCatalog.stats.disabledActivityCount;
  const catalog = buildCatalog();
  const activities = buildActivities(sequence);
  const teacherSolutions = buildSolutions(sequence);
  const assetsManifest = await buildAssets(sequence);

  const files = {};
  files["catalog.json"] = await writeJson("catalog.json", catalog);
  files["activities.json"] = await writeJson("activities.json", activities);
  files["teacher-solutions.json"] = await writeJson("teacher-solutions.json", teacherSolutions);
  files["assets-manifest.json"] = await writeJson("assets-manifest.json", assetsManifest);

  const groupedAssetCounts = Object.fromEntries(
    ["cover", "page", "image", "audio", "video", "font"].map((type) => [
      type,
      assetsManifest.assets.filter((asset) => asset.type === type).length,
    ]),
  );
  const totalAssetBytes = assetsManifest.assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
  const totalMetadataBytes = Object.values(files).reduce((sum, file) => sum + file.sizeBytes, 0);
  const manifest = {
    schemaVersion: 1,
    packageId: "ultimate-b2-students-book",
    componentId: "students-book",
    bookTitle: "Ultimate B2 Students Book",
    contentVersion,
    minimumSupportedAppVersion: "0.1.0",
    minimumSupportedContentSchemaVersion: 1,
    includedUnits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    enabledActivityCount: sequence.length,
    disabledActivityCount: disabledCount,
    activityCountsByUnit: {
      "1": sequence.filter((activity) => activity.unitNumber === 1).length,
      "2": sequence.filter((activity) => activity.unitNumber === 2).length,
    },
    pageCount: groupedAssetCounts.page,
    assetCountsByType: groupedAssetCounts,
    assetCount: assetsManifest.assets.length,
    totalContentSizeBytes: totalAssetBytes + totalMetadataBytes,
    totalAssetBytes,
    totalMetadataBytes,
    files,
    assetSetSha256: semanticSha256(assetsManifest.assets),
    deterministicBuild: {
      reproducible: true,
      generator: "scripts/android-teacher/build-pack.mjs",
      sourceRevision: process.env.CONTENT_PACK_REVISION || "repository-source",
    },
  };
  await writeJson("manifest.json", manifest);

  console.log(JSON.stringify({
    packRoot: path.relative(process.cwd(), packRoot).replaceAll("\\", "/"),
    contentVersion,
    enabledActivityCount: sequence.length,
    disabledActivityCount: disabledCount,
    pageCount: manifest.pageCount,
    assetCount: manifest.assetCount,
    totalContentSizeBytes: manifest.totalContentSizeBytes,
  }, null, 2));
}

await main();
