import assert from "node:assert/strict";
import test from "node:test";

import studentsBookRuntime from "../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import { buildStudentsBookOverviewEntries } from "../src/apps/android-teacher-offline/studentsBookOverviewLayout.js";
import {
  allocateOverviewColumns,
  buildManagedOverviewEntries,
  cleanOverviewSectionLabel,
  managedOverviewPageWeight,
  MAX_OVERVIEW_PAGE_WEIGHT,
  overviewEntryWeight,
  overviewPageWeight,
  printedPageNumbers,
  splitOverviewEntries,
} from "../src/apps/android-teacher-offline/unitOverviewLayout.js";

const pages = (...spreadNumbers) => spreadNumbers.map((spreadNumber, index) => ({
  id: `page-${index + 1}`,
  title: `Section ${index + 1}`,
  spreadNumber,
  pageNumbers: [],
  images: [`/${index + 1}.png`],
}));
const entries = (sourcePages) => sourcePages.map((page) => ({ id: page.id, pageIds: [page.id], pages: [page] }));
const managedPages = (...weights) => weights.map((weight, index) => ({
  id: `managed-page-${index + 1}`,
  title: `Managed page ${index + 1}`,
  spreadNumber: `Page ${index + 1}`,
  pageNumbers: [],
  imageWidth: weight === 2 ? 1180 : 581,
  imageHeight: 794,
  images: [`/managed-${index + 1}.png`],
}));
const rowLabels = (sourceEntries, row) => sourceEntries.filter((entry) => entry.row === row).map((entry) => entry.pageLabel);
const rowWeight = (sourceEntries, row) => sourceEntries.filter((entry) => entry.row === row).reduce((sum, entry) => sum + entry.physicalWeight, 0);

test("Teacher overview page weighting prioritizes canonical numbers and strictly parses printed labels", () => {
  assert.deepEqual(printedPageNumbers({ pageNumbers: [6, 7, 7, Number.NaN, Infinity, -1], spreadNumber: "99" }), [6, 7]);
  assert.equal(overviewPageWeight({ pageNumbers: [5], spreadNumber: "50-51" }), 1);
  for (const spreadNumber of ["70-71", " 70 – 71 ", "70—71"]) {
    assert.deepEqual(printedPageNumbers({ pageNumbers: [], spreadNumber }), [70, 71]);
    assert.equal(overviewPageWeight({ pageNumbers: [], spreadNumber }), 2);
  }
  for (const spreadNumber of ["", "pages 70-71", "71-70", "70-72", "-1", "0", "1-999999999", "70-"]) {
    assert.deepEqual(printedPageNumbers({ pageNumbers: [], spreadNumber }), [], spreadNumber);
    assert.equal(overviewPageWeight({ pageNumbers: [], spreadNumber }), 1, spreadNumber);
  }
  assert.equal(MAX_OVERVIEW_PAGE_WEIGHT, 2);
});

test("managed page weighting prioritizes persisted intrinsic geometry over editorial labels", () => {
  assert.equal(managedOverviewPageWeight({ spreadNumber: "Page 1", imageWidth: 1180, imageHeight: 794 }), 2);
  assert.equal(managedOverviewPageWeight({ spreadNumber: "Page 2", imageWidth: 581, imageHeight: 794 }), 1);
  assert.equal(managedOverviewPageWeight({ spreadNumber: "70-71", imageWidth: 581, imageHeight: 794 }), 1);
  assert.equal(managedOverviewPageWeight({ spreadNumber: "70-71" }), 2, "legacy catalogs without dimensions retain the strict label fallback");
});

test("entry weighting unions canonical pages without double-counting grouped duplicates", () => {
  const first = { id: "first", pageNumbers: [17], spreadNumber: "17" };
  const duplicate = { id: "duplicate", pageNumbers: [17, 18], spreadNumber: "17-18" };
  assert.equal(overviewEntryWeight({ pages: [first, duplicate] }), 2);
  assert.equal(overviewEntryWeight({ pages: [{ id: "bad-a" }, { id: "bad-b" }] }), 2);
});

test("Student Units 1 and 2 retain their canonical grouping and physical 7/7 and 8/8 rows", () => {
  const unit1 = buildStudentsBookOverviewEntries(studentsBookRuntime.units.find((unit) => unit.number === 1));
  const unit2 = buildStudentsBookOverviewEntries(studentsBookRuntime.units.find((unit) => unit.number === 2));
  assert.deepEqual(rowLabels(unit1, 1), ["pg 5", "pg 6-7", "pg 8-9", "pg 10-11"]);
  assert.deepEqual(rowLabels(unit1, 2), ["pg 12", "pg 13", "pg 14-15", "pg 16", "pg 17-18"]);
  assert.deepEqual([rowWeight(unit1, 1), rowWeight(unit1, 2)], [7, 7]);
  assert.deepEqual(unit1.at(-1).navigationTargets, [
    { pageId: "ub2-sb-unit-1-part-9", pageLabel: "pg 17" },
    { pageId: "ub2-sb-unit-1-part-10", pageLabel: "pg 18" },
  ]);
  assert.deepEqual(rowLabels(unit2, 1), ["pg 19", "pg 20-21", "pg 22-23", "pg 24-25", "pg 26"]);
  assert.deepEqual(rowLabels(unit2, 2), ["pg 27", "pg 28-29", "pg 30", "pg 31-32", "pg 33-34"]);
  assert.deepEqual([rowWeight(unit2, 1), rowWeight(unit2, 2)], [8, 8]);
  assert.deepEqual(unit2.find((entry) => entry.pageIds[0] === "grammar-24-25").navigationTargets, [
    { pageId: "grammar-24-25", pageLabel: "pg 24-25" },
  ], "one canonical spread remains one navigation target");
  assert.deepEqual(unit2.find((entry) => entry.pageIds[0] === "practice-31").navigationTargets.map((target) => target.pageId), ["practice-31", "practice-32"]);
  assert.deepEqual(unit2.find((entry) => entry.pageIds[0] === "progress-check-33").navigationTargets.map((target) => target.pageId), ["progress-check-33", "progress-check-34"]);
});

test("Student Units 3-10 keep every atomic page once and derive rows from physical pages", () => {
  for (const unit of studentsBookRuntime.units.filter((candidate) => candidate.number >= 3)) {
    const result = buildStudentsBookOverviewEntries(unit);
    const flattenedIds = result.flatMap((entry) => entry.pageIds);
    assert.deepEqual(flattenedIds, unit.pages.map((page) => page.id), `Unit ${unit.number} order`);
    assert.equal(new Set(flattenedIds).size, unit.pages.length, `Unit ${unit.number} uniqueness`);
    assert.ok(result.every((entry) => entry.pages.length === 1), `Unit ${unit.number} atomic assets`);
    assert.deepEqual(result.map((entry) => entry.row), buildStudentsBookOverviewEntries(unit).map((entry) => entry.row), `Unit ${unit.number} deterministic rows`);
    for (const row of [1, 2]) {
      const rowEntries = result.filter((entry) => entry.row === row);
      if (!rowEntries.length) continue;
      assert.equal(rowEntries.reduce((sum, entry) => sum + entry.columnSpan, 0), 24, `Unit ${unit.number} row ${row} columns`);
      assert.equal(rowEntries[0].columnStart, 1, `Unit ${unit.number} row ${row} starts at column 1`);
      assert.equal(rowEntries.at(-1).columnStart + rowEntries.at(-1).columnSpan, 25, `Unit ${unit.number} row ${row} fills the grid`);
    }
  }

  const unit5 = buildStudentsBookOverviewEntries(studentsBookRuntime.units.find((unit) => unit.number === 5));
  assert.deepEqual(unit5.map((entry) => entry.physicalWeight), [1, 2, 2, 2, 1, 1, 2, 1, 1, 1]);
  assert.deepEqual(rowLabels(unit5, 1), ["pg 65", "pg 66-67", "pg 68-69", "pg 70-71"]);
  assert.deepEqual(rowLabels(unit5, 2), ["pg 72", "pg 73", "pg 74-75", "pg 76", "pg 77", "pg 78"]);
  assert.deepEqual([rowWeight(unit5, 1), rowWeight(unit5, 2)], [7, 7]);
});

test("managed Workbook and Grammar rows follow intrinsic spread geometry despite simple Page labels", () => {
  const workbook = buildManagedOverviewEntries({ number: 7, pages: managedPages(2, 2, 2, 1, 1, 2, 2) });
  assert.deepEqual(rowLabels(workbook, 1), ["Page 1", "Page 2", "Page 3"]);
  assert.deepEqual(rowLabels(workbook, 2), ["Page 4", "Page 5", "Page 6", "Page 7"]);
  assert.deepEqual(workbook.map((entry) => entry.physicalWeight), [2, 2, 2, 1, 1, 2, 2]);
  assert.deepEqual([rowWeight(workbook, 1), rowWeight(workbook, 2)], [6, 6]);
  assert.deepEqual(workbook.filter((entry) => entry.row === 1).map((entry) => entry.columnSpan), [8, 8, 8]);
  assert.deepEqual(workbook.filter((entry) => entry.row === 2).map((entry) => entry.columnSpan), [4, 4, 8, 8]);
  assert.equal(workbook.filter((entry) => entry.row === 1).reduce((sum, entry) => sum + entry.columnSpan, 0), 24);
  assert.equal(workbook.filter((entry) => entry.row === 2).reduce((sum, entry) => sum + entry.columnSpan, 0), 24);

  const grammar = buildManagedOverviewEntries({ number: 3, pages: managedPages(1, 2, 2, 1, 2, 1, 2) });
  assert.deepEqual(rowLabels(grammar, 1), ["Page 1", "Page 2", "Page 3", "Page 4"]);
  assert.deepEqual(rowLabels(grammar, 2), ["Page 5", "Page 6", "Page 7"]);
  assert.deepEqual(grammar.map((entry) => entry.physicalWeight), [1, 2, 2, 1, 2, 1, 2]);
  assert.deepEqual([rowWeight(grammar, 1), rowWeight(grammar, 2)], [6, 5]);
  assert.deepEqual(grammar.filter((entry) => entry.row === 1).map((entry) => entry.columnSpan), [4, 8, 8, 4]);
  assert.deepEqual(grammar.filter((entry) => entry.row === 2).map((entry) => entry.columnSpan), [8, 4, 8]);
});

test("split handles empty and small inputs without mutation, reordering, or identity loss", () => {
  assert.deepEqual(splitOverviewEntries([]), { top: [], bottom: [], topWeight: 0, bottomWeight: 0, totalWeight: 0 });
  const sourcePages = pages("1", "2-3");
  const sourceEntries = entries(sourcePages);
  const snapshot = structuredClone(sourceEntries);
  const one = splitOverviewEntries(sourceEntries.slice(0, 1));
  const two = splitOverviewEntries(sourceEntries);
  assert.deepEqual(one.top, [sourceEntries[0]]);
  assert.deepEqual(one.bottom, []);
  assert.deepEqual([...two.top, ...two.bottom], sourceEntries);
  assert.equal([...two.top, ...two.bottom][0], sourceEntries[0]);
  assert.deepEqual(sourceEntries, snapshot);
  assert.deepEqual(allocateOverviewColumns(sourceEntries.slice(0, 1)), [{ columnStart: 11, columnSpan: 4 }]);
});

test("publisher labels suppress internal filenames without inventing section titles", () => {
  assert.equal(cleanOverviewSectionLabel("Reading"), "Reading");
  assert.equal(cleanOverviewSectionLabel("parts_part_2.png"), null);
  assert.equal(cleanOverviewSectionLabel("unit/5/parts_part_2.png"), null);
  assert.equal(cleanOverviewSectionLabel(""), null);
});
