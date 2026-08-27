import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BOOK_MENU_SKIN_SELECTION_SCHEMA_VERSION,
  BOOK_MENU_SKIN_IDS,
  bookMenuSkinCatalog,
  defaultBookMenuSkinId,
  findBookMenuSkinDefinition,
  listBookMenuSkinOptions,
  selectedBookMenuSkinId,
  validateAndNormalizeBookMenuSkinSelections,
} from "../src/config/bookMenuSkins.js";
import selections from "../src/config/bookMenuSkinSelections.json" with { type: "json" };

test("book menu skin catalog provides one explicit ready default for Ultimate B2", () => {
  assert.equal(bookMenuSkinCatalog.length, 1);
  assert.equal(defaultBookMenuSkinId("ultimate-b2-students-book"), BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY);
  assert.equal(defaultBookMenuSkinId("unknown-package"), null);
  assert.deepEqual(listBookMenuSkinOptions("ultimate-b2-students-book").map((skin) => skin.id), [BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY]);
  assert.equal(findBookMenuSkinDefinition(BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY)?.status, "ready");
  assert.equal(findBookMenuSkinDefinition("missing"), null);
});

test("tracked book menu skin selections are compatible, normalized, and deterministic", () => {
  assert.deepEqual(validateAndNormalizeBookMenuSkinSelections(selections), selections);
  assert.equal(selections.schemaVersion, BOOK_MENU_SKIN_SELECTION_SCHEMA_VERSION);
  assert.equal(selectedBookMenuSkinId(selections, "ultimate-b2-students-book"), BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY);
  assert.equal(selectedBookMenuSkinId({ schemaVersion: "1.0", selections: {} }, "ultimate-b2-students-book"), BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY);
  assert.throws(() => validateAndNormalizeBookMenuSkinSelections({ schemaVersion: "2.0", selections: {} }), /schema 1\.0/);
  assert.throws(() => validateAndNormalizeBookMenuSkinSelections({ schemaVersion: "1.0", selections: { "ultimate-b2-students-book": "missing" } }), /Unknown book menu skin/);
  assert.throws(() => validateAndNormalizeBookMenuSkinSelections({ schemaVersion: "1.0", selections: { "different-package": "ultimate-b2-legacy" } }), /does not support package/);
});

test("Teacher runtime resolves menu visuals by package without exposing assets through the shared catalog", async () => {
  const [runtime, library, app, catalog] = await Promise.all([
    readFile("src/apps/android-teacher-offline/teacherBookMenuSkins.js", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineLibrary.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8"),
    readFile("src/config/bookMenuSkins.js", "utf8"),
  ]);
  assert.match(runtime, /resolveTeacherBookMenuSkin/);
  assert.match(runtime, /canonicalTeacherRuntimeUiAssets/);
  assert.match(runtime, /runtimeUiAssets\.classroom/);
  assert.match(app, /const productPackageId = "ultimate-b2-students-book"/);
  assert.match(app, /selectedBookMenuSkinId\(bookMenuSkinSelections, productPackageId\)/);
  assert.match(app, /resolveTeacherBookMenuSkin\(productPackageId, selectedMenuSkinId, runtimeUiAssets\)/);
  assert.match(library, /data-book-menu-skin=\{menuSkin\.id\}/);
  assert.doesNotMatch(library, /legacyClassroomAssets/);
  assert.doesNotMatch(catalog, /legacyClassroomAssets|legacy-classroom-ui|\.png|\.gaf/);
});

test("Students, Workbook, and Grammar share one Unit launcher while navigation stays edition-aware", async () => {
  const [library, app, projectShell, projectPresentation] = await Promise.all([
    readFile("src/apps/android-teacher-offline/TeacherOfflineLibrary.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8"),
    readFile("src/apps/android-teacher-project/TeacherProjectShell.jsx", "utf8"),
    readFile("src/apps/android-teacher-project/TeacherProjectPresentation.jsx", "utf8"),
  ]);
  assert.match(library, /!extrasSelected \? <UnitColumn[\s\S]*items=\{units\.slice\(0, 5\)\}/);
  assert.match(library, /!extrasSelected \? <UnitColumn[\s\S]*items=\{units\.slice\(5\)\}/);
  assert.match(library, /onOpenUnit\?\.\(editionId, unit\.number\)/);
  assert.match(app, /onOpenUnit=\{\(editionId, unitNumber\) => switchTeacherEdition\(editionId, unitNumber\)\}/);
  assert.match(app, /resolveTeacherEditionComponent\(\(activeRuntime \|\| initialRuntime\)\.bookSlug, teacherEditionId\)/);
  assert.match(projectShell, /const showUnits = !showExtras/);
  assert.match(projectShell, /onOpenUnit\?\.\(editionId, unit\.id\)/);
  assert.match(projectPresentation, /if \(editionId !== "students-book"\) return/);
});
