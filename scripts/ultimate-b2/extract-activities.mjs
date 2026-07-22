import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractNormalizedActivities } from "./activity-normalizer.mjs";
import { writeDeterministicJson } from "./students-book-scanner.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");
const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source-root");
const sourceRoot = path.resolve(
  sourceIndex >= 0
    ? args[sourceIndex + 1]
    : process.env.ULTIMATE_B2_SOURCE_ROOT || path.join(repoRoot, "Ultimate English B2.app"),
);
const outputRoot = path.join(repoRoot, "books/ultimate-b2/generated/activities");

function unitFileName(unitNumber) {
  return `unit-${String(unitNumber).padStart(2, "0")}.activities.json`;
}

function compactActivity(activity) {
  return {
    id: activity.id,
    unitNumber: activity.unitNumber,
    partNumber: activity.partNumber,
    physicalPageNumber: activity.physicalPageNumber,
    spread: activity.spread,
    activityType: activity.activityType,
    questionCount: activity.questions.length,
    optionCount: activity.questions.reduce((sum, question) => sum + question.options.length, 0),
    explicitAnswerCount: activity.answerRecords.length,
    qualityCategories: activity.qualityCategories,
    implementationStatus: activity.implementationStatus,
    editorialStatus: activity.editorialStatus,
    publicationStatus: activity.publicationStatus,
    sourceProvenance: activity.sourceProvenance,
  };
}

function unit2Audit(result) {
  const activities = result.activities.filter((activity) => activity.unitNumber === 2);
  return {
    schemaVersion: "1.0",
    book: "ultimate-b2",
    component: "students-book",
    unitNumber: 2,
    printedRange: "19-34",
    fullBookPrintedRange: "5-154",
    mappingSource: "decoded publisher unit navigation metadata and corrected page audit",
    automaticPublication: false,
    summary: {
      definiteActivityCount: activities.length,
      readyForImplementationCount: activities.filter((activity) => activity.qualityCategories.includes("ready-for-implementation")).length,
      implementedActivityCount: activities.filter((activity) => activity.implementationStatus === "implemented-from-normalized-catalog").length,
      manualReviewCount: activities.filter((activity) => activity.editorialStatus === "manual-review-required").length,
    },
    activities: activities.map((activity) => ({
      sourceId: activity.publisherSourceActivityId,
      partNumber: activity.partNumber,
      physicalPageNumber: activity.physicalPageNumber,
      spread: activity.spread,
      detectedType: activity.activityType,
      publisherInteractionTypes: activity.publisherInteractionTypes,
      questionCount: activity.questions.length,
      optionCount: activity.questions.reduce((sum, question) => sum + question.options.length, 0),
      explicitAnswerStatus: activity.answerRecords.length ? "present" : "missing",
      explicitAnswerCount: activity.answerRecords.length,
      mediaDependencies: activity.mediaDependencies,
      implementationReadiness: activity.qualityCategories.includes("ready-for-implementation") ? "ready-for-implementation" : "manual-review",
      currentImplementationStatus: activity.implementationStatus,
      editorialReviewStatus: activity.editorialStatus,
      discrepancies: activity.extractionWarnings,
      missingFields: [
        ...(!activity.instructions ? ["instructions"] : []),
        ...(!activity.questions.length ? ["questions"] : []),
        ...(activity.questions.some((question) => !question.prompt) ? ["question-text"] : []),
        ...(!activity.answerRecords.length ? ["explicit-answers"] : []),
      ],
      unsupportedBehavior: activity.unsupportedSourceFields,
      canBeEnabled: activity.qualityCategories.includes("ready-for-implementation"),
      sourceProvenance: activity.sourceProvenance,
    })),
  };
}

function unit2Flipbook(result) {
  const activities = result.activities.filter((activity) => activity.unitNumber === 2);
  const byPart = new Map();
  activities.forEach((activity) => {
    if (!byPart.has(activity.partNumber)) byPart.set(activity.partNumber, []);
    byPart.get(activity.partNumber).push(activity);
  });
  return {
    schemaVersion: "1.0",
    book: "ultimate-b2",
    component: "students-book",
    unitNumber: 2,
    status: "relationship-fixture-only-no-flipbook-ui",
    pages: [...byPart.entries()].sort((a, b) => a[0] - b[0]).map(([partNumber, partActivities]) => ({
      pageId: `ultimate-b2-sb-u2-part-${partNumber}`,
      partNumber,
      physicalPageNumber: partActivities[0].physicalPageNumber,
      spread: partActivities[0].spread,
      activityIds: partActivities.map((activity) => activity.id),
      mediaIds: [...new Set(partActivities.flatMap((activity) => activity.mediaDependencies.map((dependency) => dependency.id)))],
      hotspots: partActivities.flatMap((activity) => activity.hotspotNavigation.hotspotIds.map((id, index) => ({
        id,
        activityId: activity.id,
        coordinates: activity.hotspotNavigation.coordinates[index] || null,
        presentation: activity.hotspotNavigation.presentation,
      }))),
      availability: Object.fromEntries(partActivities.map((activity) => [activity.id, activity.qualityCategories.includes("ready-for-implementation") ? "ready" : "manual-review"])),
    })),
  };
}

function editorialMarkdown(audit) {
  const lines = [
    "# Ultimate B2 Students Book Unit 2 editorial extraction report",
    "",
    `Definite activities: ${audit.summary.definiteActivityCount}. Ready/implemented: ${audit.summary.readyForImplementationCount}/${audit.summary.implementedActivityCount}. All ${audit.summary.manualReviewCount} remain editorial-review controlled.`,
    "",
    "| Source ID | Part | Page/spread | Type | Questions | Options | Answers | Readiness | Implemented | Missing/unsupported |",
    "|---|---:|---|---|---:|---:|---:|---|---|---|",
  ];
  audit.activities.forEach((activity) => {
    const gaps = [...activity.missingFields, ...activity.unsupportedBehavior].join(", ") || "none";
    lines.push(`| ${activity.sourceId} | ${activity.partNumber} | ${activity.physicalPageNumber} / ${activity.spread} | ${activity.detectedType} | ${activity.questionCount} | ${activity.optionCount} | ${activity.explicitAnswerCount} | ${activity.implementationReadiness} | ${activity.currentImplementationStatus} | ${gaps} |`);
  });
  lines.push("", "Publisher feedback was not found. Any Correct/Incorrect/Try again/Review your answer messages are application-generated neutral feedback.", "");
  return lines.join("\n");
}

export async function writeNormalizedActivityOutputs(result, { catalogRoot = outputRoot, readyOutput = null } = {}) {
  const units = [];
  for (let unitNumber = 1; unitNumber <= 10; unitNumber += 1) {
    const activities = result.activities.filter((activity) => activity.unitNumber === unitNumber);
    const filename = unitFileName(unitNumber);
    await writeDeterministicJson(path.join(catalogRoot, filename), { schemaVersion: "1.0", unitNumber, activities });
    units.push({ unitNumber, file: filename, definiteActivityCount: activities.length, readyForImplementationCount: activities.filter((activity) => activity.qualityCategories.includes("ready-for-implementation")).length });
  }
  const audit = unit2Audit(result);
  const flipbook = unit2Flipbook(result);
  await writeDeterministicJson(path.join(catalogRoot, "students-book-activities.index.json"), {
    schemaVersion: "1.0",
    book: "ultimate-b2",
    component: "students-book",
    automaticPublication: false,
    summary: result.summary,
    validation: result.validation,
    units,
    activities: result.activities.map(compactActivity),
    excludedObjects: result.excludedObjects,
  });
  await writeDeterministicJson(path.join(catalogRoot, "unit-02.editorial-audit.json"), audit);
  await writeDeterministicJson(path.join(catalogRoot, "unit-02.flipbook-relationships.json"), flipbook);
  await mkdir(catalogRoot, { recursive: true });
  await writeFile(path.join(catalogRoot, "unit-02.editorial-audit.md"), editorialMarkdown(audit), "utf8");
  const ready = result.activities.filter((activity) => activity.unitNumber === 2 && activity.qualityCategories.includes("ready-for-implementation"));
  if (readyOutput) await writeDeterministicJson(readyOutput, { schemaVersion: "1.0", activities: ready });
  return { units, audit, flipbook, ready };
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  try {
    const result = await extractNormalizedActivities({ sourceRoot });
    const outputs = await writeNormalizedActivityOutputs(result);
    console.log(JSON.stringify({
      definiteActivities: result.summary.definiteActivityCount,
      readyForImplementation: result.summary.readyForImplementationCount,
      explicitAnswerEvidence: result.summary.explicitAnswerEvidenceCount,
      missingAnswerEvidence: result.summary.missingAnswerEvidenceCount,
      unit2Definite: outputs.audit.summary.definiteActivityCount,
      unit2Implemented: outputs.audit.summary.implementedActivityCount,
      unit2ManualReview: outputs.audit.summary.manualReviewCount,
      catalog: "books/ultimate-b2/generated/activities",
    }, null, 2));
  } catch (error) {
    console.error(`Ultimate B2 activity extraction failed: ${error.message}`);
    process.exitCode = 1;
  }
}
