import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BOOK_MENU_SKIN_IDS,
  bookMenuSkinCatalog,
  defaultBookMenuSkinId,
  findBookMenuSkinDefinition,
  listBookMenuSkinOptions,
} from "../src/config/bookMenuSkins.js";

test("book menu skin catalog provides one explicit ready default for Ultimate B2", () => {
  assert.equal(bookMenuSkinCatalog.length, 1);
  assert.equal(defaultBookMenuSkinId("ultimate-b2-students-book"), BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY);
  assert.equal(defaultBookMenuSkinId("unknown-package"), null);
  assert.deepEqual(listBookMenuSkinOptions("ultimate-b2-students-book").map((skin) => skin.id), [BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY]);
  assert.equal(findBookMenuSkinDefinition(BOOK_MENU_SKIN_IDS.ULTIMATE_B2_LEGACY)?.status, "ready");
  assert.equal(findBookMenuSkinDefinition("missing"), null);
});

test("Teacher runtime resolves menu visuals by package without exposing assets through the shared catalog", async () => {
  const [runtime, library, app, catalog] = await Promise.all([
    readFile("src/apps/android-teacher-offline/teacherBookMenuSkins.js", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineLibrary.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8"),
    readFile("src/config/bookMenuSkins.js", "utf8"),
  ]);
  assert.match(runtime, /resolveTeacherBookMenuSkin/);
  assert.match(runtime, /legacyClassroomAssets\.branding\.bookMenu/);
  assert.match(app, /resolveTeacherBookMenuSkin\(pack\.manifest\.packageId\)/);
  assert.match(library, /data-book-menu-skin=\{menuSkin\.id\}/);
  assert.doesNotMatch(library, /legacyClassroomAssets/);
  assert.doesNotMatch(catalog, /legacyClassroomAssets|legacy-classroom-ui|\.png|\.gaf/);
});
