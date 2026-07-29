import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyPath,
  collectTrackedSourceFiles,
  evaluateFile,
  thresholds,
} from "../scripts/audit-source-structure.mjs";

test("source structure audit classifies declarative and generated content separately", () => {
  assert.equal(classifyPath("src/data/ultimate-b2/generated/unit-01.runtime.js"), "generated-or-derived-content");
  assert.equal(classifyPath("src/data/bookPackages.js"), "catalog-or-data");
  assert.equal(classifyPath("database/001_schema.js"), "database-migrations");
  assert.equal(classifyPath("tests/fixture.js"), "tests");
});

test("source structure thresholds warn early and fail only clear new monoliths", () => {
  assert.equal(evaluateFile({ path: "src/components/NewPanel.jsx", lines: thresholds.ui.warning + 1 }).level, "warning");
  assert.equal(evaluateFile({ path: "src/components/NewPanel.jsx", lines: thresholds.ui.failure + 1 }, { tracked: false }).level, "failure");
  assert.equal(evaluateFile({ path: "src/data/ultimate-b2/catalog.js", lines: 5000 }).level, "excluded");
});

test("responsive.css is a deferred warning with a narrow growth ceiling", () => {
  assert.equal(evaluateFile({ path: "src/styles/responsive.css", lines: 1191 }).level, "warning");
  assert.equal(evaluateFile({ path: "src/styles/responsive.css", lines: 1216 }).level, "failure");
});

test("inventory uses tracked source files only", () => {
  const files = collectTrackedSourceFiles();
  assert.ok(files.some((file) => file.path === "src/App.jsx"));
  assert.ok(files.every((file) => /\.(?:js|jsx|mjs|css)$/.test(file.path)));
  assert.ok(files.every((file) => !file.path.startsWith("dist/")));
});
