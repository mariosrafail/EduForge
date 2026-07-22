import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeDeterministicJson } from "./students-book-scanner.mjs";
import { buildStudentsBookContentCatalog } from "./students-book-content.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");
const generatedRoot = path.join(repoRoot, "books/ultimate-b2/generated");
const outputRoot = path.join(generatedRoot, "content");
const frontendOutput = path.join(repoRoot, "src/data/ultimate-b2/generated/students-book.runtime.json");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(generatedRoot, relativePath), "utf8"));
}

const structure = await readJson("students-book-structure.json");
const activityCatalogs = await Promise.all(Array.from({ length: 10 }, (_, index) => (
  readJson(`activities/unit-${String(index + 1).padStart(2, "0")}.activities.json`)
)));
const implementationMatrices = await Promise.all([1, 2].map((unitNumber) => (
  readJson(`editorial/unit-${String(unitNumber).padStart(2, "0")}.implementation-matrix.json`)
)));
const catalog = buildStudentsBookContentCatalog({ structure, activityCatalogs, implementationMatrices });

function frontendCatalog(source) {
  return {
    schemaVersion: source.schemaVersion,
    bookId: source.bookId,
    componentId: source.componentId,
    title: source.title,
    printedPageRange: source.printedPageRange,
    navigation: source.navigation,
    summary: source.summary,
    units: source.units.map((unit) => ({
      id: unit.id,
      number: unit.number,
      title: unit.title,
      printedPageRange: unit.printedPageRange,
      navigationOrder: unit.navigationOrder,
      pages: unit.pages.map((page) => ({
        id: page.id,
        sourcePageId: page.sourcePageId,
        unitId: page.unitId,
        unitNumber: page.unitNumber,
        unitTitle: page.unitTitle,
        sectionTitle: page.sectionTitle,
        partNumber: page.partNumber,
        physicalPageNumber: page.physicalPageNumber,
        spreadNumber: page.spreadNumber,
        pageNumbers: page.pageNumbers,
        navigationOrder: page.navigationOrder,
        pageImage: {
          identity: page.pageImage.identity,
          classification: page.pageImage.classification,
          localHdAssetPath: page.pageImage.localHdAssetPath,
        },
        activities: page.activities.map(({ sourceProvenance: _sourceProvenance, publisherSourceActivityId: _publisherSourceActivityId, ...activity }) => activity),
        media: page.media.map(({ sourceRelativePath: _sourceRelativePath, ...media }) => media),
        actions: page.actions,
        editorialStatus: page.editorialStatus,
      })),
    })),
  };
}

await writeDeterministicJson(path.join(outputRoot, "students-book-content.index.json"), catalog);
await writeDeterministicJson(frontendOutput, frontendCatalog(catalog));
for (const unit of catalog.units) {
  await writeDeterministicJson(path.join(outputRoot, `unit-${String(unit.number).padStart(2, "0")}.content.json`), {
    schemaVersion: catalog.schemaVersion,
    bookId: catalog.bookId,
    componentId: catalog.componentId,
    unit,
  });
}

console.log(JSON.stringify({
  output: "books/ultimate-b2/generated/content",
  ...catalog.summary,
  printedPageRange: catalog.printedPageRange,
}, null, 2));
