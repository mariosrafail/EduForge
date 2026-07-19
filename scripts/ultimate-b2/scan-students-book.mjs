import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanUltimateB2StudentsBook, writeDeterministicJson } from "./students-book-scanner.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");
const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source-root");
const sourceRoot = path.resolve(
  sourceIndex >= 0
    ? args[sourceIndex + 1]
    : process.env.ULTIMATE_B2_SOURCE_ROOT || path.join(repoRoot, "Ultimate English B2.app"),
);
const outputRoot = path.join(repoRoot, "books/ultimate-b2/generated");

try {
  const result = await scanUltimateB2StudentsBook({ sourceRoot });
  await writeDeterministicJson(path.join(outputRoot, "students-book-inventory.json"), {
    schemaVersion: result.schemaVersion,
    packageSummary: result.packageSummary,
    inventory: result.inventory,
  }, { pretty: false });
  await writeDeterministicJson(path.join(outputRoot, "students-book-structure.json"), result.structure);
  await writeDeterministicJson(path.join(outputRoot, "students-book-review.json"), result.review);
  await writeDeterministicJson(path.join(outputRoot, "students-book-iwb-analysis.json"), result.iwbAnalysis);
  await writeDeterministicJson(path.join(outputRoot, "students-book-page-audit.json"), result.pageAudit);
  console.log(JSON.stringify({
    source: result.packageSummary.sourceDescription,
    packageFiles: result.packageSummary.totalFileCount,
    studentsBookFiles: result.packageSummary.studentsBookInventoryCount,
    units: result.review.unitCount,
    pageImages: result.review.pageImageCount,
    activityObjects: result.review.activityObjectCount,
    exercisesDetected: result.review.exerciseDetectedCount,
    fullyRecoverable: result.review.fullyRecoverableCount,
    manualReview: result.review.manualReviewCount,
    unresolved: result.review.unresolvedCount,
    decodedStructuredIwb: result.iwbAnalysis.totals.strictXml,
    decodedPartialIwb: result.iwbAnalysis.totals.partialXml,
    output: "books/ultimate-b2/generated",
  }, null, 2));
} catch (error) {
  console.error(`Ultimate B2 Students Book scan failed: ${error.message}`);
  process.exitCode = 1;
}
