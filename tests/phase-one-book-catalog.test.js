import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PHASE_ONE_PACKAGE_SLUGS,
  PHASE_ONE_VISIBLE_COMPONENTS,
  filterPhaseOneComponents,
  isCatalogPackageVisible,
  isPhaseOneComponentVisible,
} from "../src/config/bookCatalogVisibility.js";

const component = (slug) => ({ slug });

test("Phase 1 catalog is ordered, exact, and excludes archived English Journey 6", () => {
  assert.deepEqual(PHASE_ONE_PACKAGE_SLUGS, ["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]);
  assert.equal(isCatalogPackageVisible("english-journey-6"), false);
  assert.equal(isCatalogPackageVisible({ packageTitle: "Ultimate B2" }), true);
});

test("central policy exposes exactly Students Book and Workbook for every Phase 1 package", () => {
  assert.deepEqual(PHASE_ONE_VISIBLE_COMPONENTS, {
    "ultimate-b1": ["ultimate-b1-students-book", "ultimate-b1-workbook"],
    "ultimate-b1-plus": ["ultimate-b1-plus-students-book", "ultimate-b1-plus-workbook"],
    "ultimate-b2": ["ultimate-b2-students-book", "ultimate-b2-workbook"],
  });
  const completeB2 = {
    slug: "ultimate-b2",
    components: [
      component("ultimate-b2-students-book"),
      component("ultimate-b2-workbook"),
      component("ultimate-b2-grammar-book"),
      component("ultimate-b2-test-book"),
    ],
  };
  assert.deepEqual(
    filterPhaseOneComponents(completeB2).components.map(({ slug }) => slug),
    ["ultimate-b2-students-book", "ultimate-b2-workbook"],
  );
  assert.equal(isPhaseOneComponentVisible("ultimate-b2", "ultimate-b2-grammar-book"), false);
  assert.equal(isPhaseOneComponentVisible("ultimate-b2", "test-book"), false);
  assert.equal(isPhaseOneComponentVisible("ultimate-b2", "students-book"), true);
  assert.equal(isPhaseOneComponentVisible("ultimate-b2", "workbook"), true);
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
  assert.match(androidSource, /return filterPhaseOneComponents\(\{/);
});

test("migrations preserve all four B2 components and Phase 1 changes are non-destructive", async () => {
  const [originalCatalogMigration, phaseOneMigration] = await Promise.all([
    readFile("database/006_book_content_platform.sql", "utf8"),
    readFile("database/027_phase_one_ultimate_book_catalog.sql", "utf8"),
  ]);
  for (const slug of [
    "ultimate-b2-students-book",
    "ultimate-b2-workbook",
    "ultimate-b2-grammar-book",
    "ultimate-b2-test-book",
  ]) {
    assert.match(originalCatalogMigration, new RegExp(`'${slug}'`));
  }
  assert.match(originalCatalogMigration, /'ultimate-b2-grammar-book'[\s\S]*'unit-2'[\s\S]*'ultimate-b2-test-book'[\s\S]*'quiz-1'/);
  assert.match(originalCatalogMigration, /'unit-2-grammar'[\s\S]*'quiz-1-vocabulary'[\s\S]*'quiz-2-test'/);
  assert.match(phaseOneMigration, /'ultimate-b1'/);
  assert.match(phaseOneMigration, /'ultimate-b1-plus'/);
  assert.match(phaseOneMigration, /cover_asset_path,\s*status[\s\S]*null,\s*'active'/);
  assert.match(phaseOneMigration, /set status = 'archived' where slug = 'english-journey-6'/);
  assert.doesNotMatch(phaseOneMigration, /\bdelete\b|\btruncate\b|\bdrop\b/i);
});

test("the visibility-only change adds no migration and keeps hidden assets and source support", async () => {
  const [packageSource, assetSource] = await Promise.all([
    readFile("src/data/ultimate-b2/ultimateB2Package.js", "utf8"),
    readFile("src/components/lms/books/bookCoverAssets.js", "utf8"),
  ]);
  assert.match(packageSource, /id: "grammar-book"[\s\S]*title: "Ultimate B2 Grammar Book"/);
  assert.match(packageSource, /id: "test-book"[\s\S]*title: "Ultimate B2 Test Book"/);
  assert.match(assetSource, /"ultimate-b2-grammar-book"/);
  assert.match(assetSource, /"ultimate-b2-test-book"/);
});
