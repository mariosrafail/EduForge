import assert from "node:assert/strict";
import test from "node:test";

import { studentsBookPageUnitsFromActivePageIds, studentsBookPageUnitsFromCatalog } from "../src/apps/android-teacher-offline/studentsBookPageLifecycleProjection.js";
import studentsBookContent from "../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };
import { buildStudentsBookPageUnits } from "../src/data/ultimate-b2/studentsBookReaderModel.js";

const authorization = `v1.${Buffer.from("page-scope").toString("base64url")}.${"a".repeat(43)}`;
const pageUnits = buildStudentsBookPageUnits(studentsBookContent, (unitNumber, partNumber) => `/canonical/unit-${unitNumber}-part-${partNumber}.png`);
const allPages = pageUnits.flatMap((unit) => unit.pages);

test("Student draft page projection removes tombstones and binds overrides to the exact scoped authorization", () => {
  const deletedId = allPages[1].id;
  const override = allPages[0];
  const projectedUnits = studentsBookPageUnitsFromCatalog(pageUnits, {
    component: { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", kind: "students-book" },
    pages: allPages.filter(({ id }) => id !== deletedId).map((page) => page.id === override.id
      ? { id: page.id, source: "override", image: { url: `/preview/pages/books/ultimate-b2/components/ultimate-b2-students-book/pages/${page.id}/assets/10000000-0000-4000-8000-000000000001?previewAuthorization=stale` } }
      : { id: page.id, source: "repository-baseline", image: { url: page.images[0] } }),
  }, authorization);
  const projected = projectedUnits.flatMap((unit) => unit.pages);
  assert.equal(projected.some(({ id }) => id === deletedId), false);
  assert.match(projected.find(({ id }) => id === override.id).images[0], new RegExp(`previewAuthorization=${encodeURIComponent(authorization)}`));
  assert.doesNotMatch(projected.find(({ id }) => id === override.id).images[0], /stale/);
  assert.deepEqual(projected.map(({ id }) => id), allPages.filter(({ id }) => id !== deletedId).map(({ id }) => id));
});

test("Student release page projection is backward-compatible and preserves canonical order", () => {
  const active = allPages.filter((_, index) => index !== 2).map(({ id }) => id);
  assert.deepEqual(studentsBookPageUnitsFromActivePageIds(pageUnits, active).flatMap((unit) => unit.pages.map(({ id }) => id)), active);
  assert.throws(() => studentsBookPageUnitsFromActivePageIds(pageUnits, [null]), /identities/);
  assert.throws(() => studentsBookPageUnitsFromCatalog(pageUnits, { component: { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", kind: "managed" }, pages: [] }, authorization), /identity/);
});
