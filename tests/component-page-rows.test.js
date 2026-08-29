import assert from "node:assert/strict";
import test from "node:test";

import { canonicalStudentsBookPages } from "../netlify-sites/ultimate-b2-builder/server/_builder-page-catalog.js";
import { MAX_PRINTED_LABEL_PAGE_WEIGHT, printedPageWeight, splitUnitPageRows } from "../src/apps/book-builder/hosted/componentPageRows.js";

const labels = (pages) => pages.map((page) => page.printedLabel);
const managedPages = (...printedLabels) => printedLabels.map((printedLabel, index) => ({ id: `page-${index + 1}`, printedPages: [], printedLabel }));

test("printed page weight prioritizes valid unique canonical page numbers", () => {
  assert.equal(printedPageWeight({ printedPages: [5], printedLabel: "50-51" }), 1);
  assert.equal(printedPageWeight({ printedPages: [6, 7, 7, Number.NaN, Infinity, 7.5, -1], printedLabel: "99" }), 2);
  assert.equal(printedPageWeight({ printedPages: [null, Number.NaN], printedLabel: "70-71" }), 2);
});

test("printed page weight strictly accepts single pages and two-page label ranges", () => {
  for (const label of ["70-71", " 70 – 71 ", "70—71"]) assert.equal(printedPageWeight({ printedLabel: label }), 2);
  for (const label of ["70", "", "pages 70-71", "71-70", "70-72", "-1", "0", "1-999999999", "70-"]) {
    assert.equal(printedPageWeight({ printedLabel: label }), 1, label);
  }
  assert.equal(MAX_PRINTED_LABEL_PAGE_WEIGHT, 2);
});

test("Student's Book Units 1 and 2 split at the required physical-page boundaries", () => {
  const unit1 = canonicalStudentsBookPages.filter((page) => page.unitNumber === 1);
  const unit2 = canonicalStudentsBookPages.filter((page) => page.unitNumber === 2);
  const rows1 = splitUnitPageRows(unit1);
  const rows2 = splitUnitPageRows(unit2);

  assert.deepEqual(labels(rows1.top), ["5", "6-7", "8-9", "10-11"]);
  assert.deepEqual(labels(rows1.bottom), ["12", "13", "14-15", "16", "17", "18"]);
  assert.deepEqual([rows1.topWeight, rows1.bottomWeight], [7, 7]);
  assert.deepEqual(labels(rows2.top), ["19", "20-21", "22-23", "24-25", "26"]);
  assert.deepEqual(labels(rows2.bottom), ["27", "28-29", "30", "31", "32", "33", "34"]);
  assert.deepEqual([rows2.topWeight, rows2.bottomWeight], [8, 8]);
});

test("Workbook Unit 7 keeps spreads intact and produces the requested 6/4 split", () => {
  const pages = managedPages("70-71", "72-73", "74-75", "76", "77", "78-79");
  const rows = splitUnitPageRows(pages);
  assert.deepEqual(labels(rows.top), ["70-71", "72-73", "74-75"]);
  assert.deepEqual(labels(rows.bottom), ["76", "77", "78-79"]);
  assert.deepEqual([rows.topWeight, rows.bottomWeight], [6, 4]);
});

test("split handles even, odd, and inside-spread midpoints without reordering", () => {
  const even = splitUnitPageRows(managedPages("1", "2", "3", "4"));
  const odd = splitUnitPageRows(managedPages("1", "2", "3"));
  const insideSpread = splitUnitPageRows(managedPages("1", "2-3", "4-5"));
  assert.deepEqual([labels(even.top), labels(even.bottom), even.topWeight, even.bottomWeight], [["1", "2"], ["3", "4"], 2, 2]);
  assert.deepEqual([labels(odd.top), labels(odd.bottom), odd.topWeight, odd.bottomWeight], [["1", "2"], ["3"], 2, 1]);
  assert.deepEqual([labels(insideSpread.top), labels(insideSpread.bottom), insideSpread.topWeight, insideSpread.bottomWeight], [["1", "2-3"], ["4-5"], 3, 2]);
});

test("split handles empty, one-card, and two-card edge cases deterministically", () => {
  assert.deepEqual(splitUnitPageRows([]), { top: [], bottom: [], topWeight: 0, bottomWeight: 0, totalWeight: 0 });
  const [only] = managedPages("10-11");
  const one = splitUnitPageRows([only]);
  assert.deepEqual(one.top, [only]);
  assert.deepEqual(one.bottom, []);
  assert.deepEqual([one.topWeight, one.bottomWeight], [2, 0]);

  const heavyFirst = managedPages("1-2", "3");
  const heavyLast = managedPages("1", "2-3");
  assert.deepEqual(labels(splitUnitPageRows(heavyFirst).top), ["1-2"]);
  assert.deepEqual(labels(splitUnitPageRows(heavyFirst).bottom), ["3"]);
  assert.deepEqual(labels(splitUnitPageRows(heavyLast).top), ["1", "2-3"]);
  assert.deepEqual(labels(splitUnitPageRows(heavyLast).bottom), []);
});

test("split preserves order and object identity without mutating pages or the input array", () => {
  const pages = managedPages("1", "2-3", "4", "5");
  const snapshot = structuredClone(pages);
  const rows = splitUnitPageRows(pages);
  const flattened = [...rows.top, ...rows.bottom];

  assert.deepEqual(flattened.map((page) => page.id), pages.map((page) => page.id));
  assert.equal(new Set(flattened.map((page) => page.id)).size, pages.length);
  flattened.forEach((page, index) => assert.equal(page, pages[index]));
  assert.deepEqual(pages, snapshot);
});
