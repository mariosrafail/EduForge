import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildStudentsBookContentCatalog, validateStudentsBookContentCatalog } from "../scripts/ultimate-b2/students-book-content.mjs";
import {
  adjacentStudentsBookPageInCatalog,
  buildStudentsBookPageUnits,
  findStudentsBookPageInCatalog,
  findStudentsBookUnitInCatalog,
  flattenStudentsBookPages,
  studentsBookPageRouteTokenForPage,
  visibleStudentsBookActivitiesForMode,
} from "../src/data/ultimate-b2/studentsBookReaderModel.js";

const generatedRoot = "books/ultimate-b2/generated";

async function readJson(relativePath) {
  return JSON.parse(await readFile(`${generatedRoot}/${relativePath}`, "utf8"));
}

async function sourceInputs() {
  const structure = await readJson("students-book-structure.json");
  const activityCatalogs = await Promise.all(Array.from({ length: 10 }, (_, index) => (
    readJson(`activities/unit-${String(index + 1).padStart(2, "0")}.activities.json`)
  )));
  const implementationMatrices = await Promise.all([1, 2].map((unitNumber) => readJson(`editorial/unit-${String(unitNumber).padStart(2, "0")}.implementation-matrix.json`)));
  return { structure, activityCatalogs, implementationMatrices };
}

test("generated Students Book catalog is deterministic and byte-stable from sanitized inputs", async () => {
  const inputs = await sourceInputs();
  const first = buildStudentsBookContentCatalog(inputs);
  const second = buildStudentsBookContentCatalog(inputs);
  assert.deepEqual(first, second);
  const generated = await readJson("content/students-book-content.index.json");
  assert.deepEqual(generated, first);
  const trackedCatalog = await readFile(`${generatedRoot}/content/students-book-content.index.json`, "utf8");
  assert.equal(`${JSON.stringify(first, null, 2)}\n`, trackedCatalog.replaceAll("\r\n", "\n"));
});

test("catalog covers all ten units and every printed page from 5 through 154", async () => {
  const catalog = await readJson("content/students-book-content.index.json");
  const pages = flattenStudentsBookPages(catalog);
  const printedPages = new Set(pages.flatMap((page) => page.pageNumbers));
  assert.equal(catalog.units.length, 10);
  assert.equal(pages.length, 110);
  assert.deepEqual([...printedPages].sort((left, right) => left - right), Array.from({ length: 150 }, (_, index) => index + 5));
  assert.equal(catalog.summary.pageAssetCount, 110);
  assert.equal(catalog.summary.printedPageCount, 150);
  assert.deepEqual(validateStudentsBookContentCatalog(catalog), { valid: true, errors: [] });
});

test("stable identities, source ordering, and single/double spreads are preserved", async () => {
  const catalog = await readJson("content/students-book-content.index.json");
  const pages = flattenStudentsBookPages(catalog);
  assert.equal(new Set(catalog.units.map((unit) => unit.id)).size, 10);
  assert.equal(new Set(pages.map((page) => page.id)).size, 110);
  assert.ok(pages.every((page, index) => index === 0 || page.physicalPageNumber > pages[index - 1].physicalPageNumber));
  assert.ok(pages.some((page) => page.pageNumbers.length === 1));
  assert.ok(pages.some((page) => page.pageNumbers.length === 2));
  assert.equal(pages[0].physicalPageNumber, 5);
  assert.equal(pages.at(-1).pageNumbers.at(-1), 154);
});

test("Unit 2 retains pages 19-34 and expands the evidence-backed activity slice without regressing Exercises 3/4", async () => {
  const catalog = await readJson("content/students-book-content.index.json");
  const unit = findStudentsBookUnitInCatalog(catalog, 2);
  const printedPages = unit.pages.flatMap((page) => page.pageNumbers);
  assert.deepEqual(printedPages, Array.from({ length: 16 }, (_, index) => index + 19));
  const spread = findStudentsBookPageInCatalog(catalog, 20);
  assert.equal(spread.id, "reading-20-21");
  assert.equal(findStudentsBookPageInCatalog(catalog, 21).id, spread.id);
  assert.deepEqual(spread.activities.filter((activity) => activity.availability === "enabled").map((activity) => activity.activityKey), [
    "ultimate-b2-sb-u2-p2-o1",
    "ultimate-b2-sb-u2-p2-o2",
    "reading-ex3",
    "reading-ex4",
    "ultimate-b2-sb-u2-p2-o5",
  ]);
  assert.deepEqual(spread.actions.filter((action) => action.classification === "activity").map((action) => action.target), ["normalized-activity", "exercise-3", "exercise-4", "normalized-activity"]);
});

test("student visibility excludes incomplete activities while teachers retain diagnostics", async () => {
  const catalog = await readJson("content/students-book-content.index.json");
  const pages = flattenStudentsBookPages(catalog);
  const studentActivities = pages.flatMap((page) => visibleStudentsBookActivitiesForMode(page, "student"));
  const teacherActivities = pages.flatMap((page) => visibleStudentsBookActivitiesForMode(page, "teacher"));
  assert.equal(studentActivities.length, 78);
  assert.equal(teacherActivities.length, 434);
  assert.equal(teacherActivities.filter((activity) => activity.availability === "disabled").length, 356);
  assert.ok(studentActivities.every((activity) => activity.editorialStatus === "reviewed-evidence-backed"));
});

test("page, activity, reading, media, and illustration relationships remain explicit", async () => {
  const catalog = await readJson("content/students-book-content.index.json");
  const pages = flattenStudentsBookPages(catalog);
  const objects = pages.flatMap((page) => page.contentObjects);
  assert.equal(objects.filter((object) => object.classification === "page-image").length, 110);
  assert.equal(objects.filter((object) => object.classification === "activity").length + objects.filter((object) => object.classification === "unsupported").length, 434);
  assert.equal(objects.filter((object) => object.classification === "audio").length, catalog.summary.audioObjectCount);
  assert.equal(objects.filter((object) => object.classification === "video").length, catalog.summary.videoObjectCount);
  assert.ok(catalog.summary.readingTextObjectCount > 0);
  assert.ok(pages.some((page) => page.illustrationRelationships.length > 0));
  assert.ok(pages.every((page) => page.activityIds.length === page.activities.length));
});

test("catalog contains only safe relative provenance and no decoder material", async () => {
  const raw = await readFile(`${generatedRoot}/content/students-book-content.index.json`, "utf8");
  assert.doesNotMatch(raw, /[A-Za-z]:[\\/]/);
  assert.doesNotMatch(raw, /EA3DC7D7-6954-471A-8399-E217B522F5F2|IWB_XOR_KEY/);
  const catalog = JSON.parse(raw);
  for (const page of flattenStudentsBookPages(catalog)) {
    const paths = [page.pageImage.sdSourceRelativePath, page.pageImage.hdSourceRelativePath, ...page.sourceProvenance];
    assert.ok(paths.every((value) => !value.startsWith("/") && !value.split("/").includes("..")));
  }
});

test("routing is stable for refresh/back-forward tokens and crosses unit boundaries", async () => {
  const catalog = await readJson("content/students-book-content.index.json");
  const page20 = findStudentsBookPageInCatalog(catalog, "20");
  const routeToken = studentsBookPageRouteTokenForPage(page20);
  assert.equal(routeToken, "20");
  assert.equal(findStudentsBookPageInCatalog(catalog, routeToken).id, page20.id);
  assert.equal(findStudentsBookPageInCatalog(catalog, page20.id).id, page20.id);
  assert.equal(findStudentsBookPageInCatalog(catalog, page20.sourcePageId).id, page20.id);
  const lastUnit1 = findStudentsBookPageInCatalog(catalog, 18);
  assert.equal(adjacentStudentsBookPageInCatalog(catalog, lastUnit1, 1).physicalPageNumber, 19);
  assert.equal(adjacentStudentsBookPageInCatalog(catalog, 19, -1).physicalPageNumber, 18);
  assert.equal(adjacentStudentsBookPageInCatalog(catalog, 5, -1), null);
  assert.equal(adjacentStudentsBookPageInCatalog(catalog, 154, 1), null);
});

test("shared page model resolves every web/Android page and preserves Unit 2 hotspots", async () => {
  const catalog = await readJson("content/students-book-content.index.json");
  const pageUnits = buildStudentsBookPageUnits(catalog, (unit, part) => `asset:u${unit}:p${part}`);
  assert.equal(pageUnits.length, 10);
  assert.equal(pageUnits.flatMap((unit) => unit.pages).length, 110);
  assert.ok(pageUnits.flatMap((unit) => unit.pages).every((page) => page.images.length === 1));
  const unit2Spread = pageUnits[1].pages.find((page) => page.id === "reading-20-21");
  assert.equal(unit2Spread.actions.find((action) => action.id === "exercise-3").left, "53.2%");
  assert.equal(unit2Spread.actions.find((action) => action.id === "exercise-4").height, "29%");
  const offlineAssets = await readFile("src/data/ultimate-b2/ultimateB2PageAssets.offline.js", "utf8");
  const androidViewer = await readFile("src/apps/android-offline/AndroidBookViewer.jsx", "utf8");
  assert.match(offlineAssets, /import\.meta\.glob\("\.\.\/\.\.\/\.\.\/unit\/\*\/parts\/HD\/parts_part_\*\.png"/);
  assert.match(androidViewer, /<BookPackageBrowser/);
});
