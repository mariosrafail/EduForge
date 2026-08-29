import assert from "node:assert/strict";
import test from "node:test";

import studentsBookRuntime from "../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import { buildStudentsBookOverviewEntries } from "../src/apps/android-teacher-offline/studentsBookOverviewLayout.js";
import {
  allocateOverviewColumns,
  buildManagedOverviewEntries,
  cleanOverviewSectionLabel,
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
  assert.deepEqual(rowLabels(unit2, 1), ["pg 19", "pg 20-21", "pg 22-23", "pg 24-25", "pg 26"]);
  assert.deepEqual(rowLabels(unit2, 2), ["pg 27", "pg 28-29", "pg 30", "pg 31-32", "pg 33-34"]);
  assert.deepEqual([rowWeight(unit2, 1), rowWeight(unit2, 2)], [8, 8]);
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

test("Workbook Unit 7 and representative Grammar rows preserve spreads and allocate the full panel", () => {
  const workbook = buildManagedOverviewEntries({ number: 7, pages: pages("70-71", "72-73", "74-75", "76", "77", "78-79") });
  assert.deepEqual(rowLabels(workbook, 1), ["pg 70-71", "pg 72-73", "pg 74-75"]);
  assert.deepEqual(rowLabels(workbook, 2), ["pg 76", "pg 77", "pg 78-79"]);
  assert.deepEqual([rowWeight(workbook, 1), rowWeight(workbook, 2)], [6, 4]);
  assert.deepEqual(workbook.filter((entry) => entry.row === 1).map((entry) => entry.columnSpan), [8, 8, 8]);
  assert.equal(workbook.filter((entry) => entry.row === 1).reduce((sum, entry) => sum + entry.columnSpan, 0), 24);
  assert.equal(workbook.filter((entry) => entry.row === 2).reduce((sum, entry) => sum + entry.columnSpan, 0), 16);

  const grammar = buildManagedOverviewEntries({ number: 4, pages: pages("40", "41-42", "43") });
  assert.deepEqual(rowLabels(grammar, 1), ["pg 40", "pg 41-42"]);
  assert.deepEqual(rowLabels(grammar, 2), ["pg 43"]);
  assert.deepEqual([rowWeight(grammar, 1), rowWeight(grammar, 2)], [3, 1]);
  assert.deepEqual(grammar.filter((entry) => entry.row === 1).map((entry) => entry.columnSpan), [4, 8]);
  assert.deepEqual(grammar.filter((entry) => entry.row === 2).map((entry) => entry.columnSpan), [4]);
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
