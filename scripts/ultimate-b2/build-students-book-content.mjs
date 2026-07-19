import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeDeterministicJson } from "./students-book-scanner.mjs";
import { buildStudentsBookContentCatalog } from "./students-book-content.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");
const generatedRoot = path.join(repoRoot, "books/ultimate-b2/generated");
const outputRoot = path.join(generatedRoot, "content");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(generatedRoot, relativePath), "utf8"));
}

const structure = await readJson("students-book-structure.json");
const activityCatalogs = await Promise.all(Array.from({ length: 10 }, (_, index) => (
  readJson(`activities/unit-${String(index + 1).padStart(2, "0")}.activities.json`)
)));
const implementationMatrices = [await readJson("editorial/unit-02.implementation-matrix.json")];
const catalog = buildStudentsBookContentCatalog({ structure, activityCatalogs, implementationMatrices });

await writeDeterministicJson(path.join(outputRoot, "students-book-content.index.json"), catalog);
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
