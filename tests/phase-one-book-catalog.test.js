import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PHASE_ONE_PACKAGE_SLUGS, isCatalogPackageVisible } from "../src/config/bookCatalogVisibility.js";

test("Phase 1 catalog is ordered, exact, and excludes archived English Journey 6", () => {
  assert.deepEqual(PHASE_ONE_PACKAGE_SLUGS, ["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]);
  assert.equal(isCatalogPackageVisible("english-journey-6"), false);
  assert.equal(isCatalogPackageVisible({ packageTitle: "Ultimate B2" }), true);
});

test("fallback code is fail-closed and scopes the recovered catalog to B2 Students Book", async () => {
  const [packagesSource, apiSource, androidSource] = await Promise.all([
    readFile("src/data/bookPackages.js", "utf8"),
    readFile("src/services/bookContentApi.js", "utf8"),
    readFile("src/apps/android-offline/androidBooks.js", "utf8"),
  ]);
  assert.match(packagesSource, /\)\) \|\| null;/);
  assert.match(packagesSource, /if \(normalized\.startsWith\("ultimate-b1-plus"\)\) return "ultimate-b1-plus"/);
  assert.match(packagesSource, /return "";\s*\}/);
  assert.match(apiSource, /packageIdentity === "ultimate-b2"[\s\S]*component\.slug === "ultimate-b2-students-book"/);
  assert.doesNotMatch(androidSource, /resolveBookPackage\(englishJourney6Package\),/);
});

test("Phase 1 migration is non-destructive and archives English Journey 6", async () => {
  const migration = await readFile("database/027_phase_one_ultimate_book_catalog.sql", "utf8");
  assert.match(migration, /'ultimate-b1'/);
  assert.match(migration, /'ultimate-b1-plus'/);
  assert.match(migration, /cover_asset_path,\s*status[\s\S]*null,\s*'active'/);
  assert.match(migration, /set status = 'archived' where slug = 'english-journey-6'/);
  assert.doesNotMatch(migration, /\bdelete\b|\btruncate\b|\bdrop\b/i);
});
