import assert from "node:assert/strict";
import test from "node:test";

import { createBlankTeacherProject } from "../lib/teacher-project-builder/schema.js";
import { MATCH_CONFIDENCE, matchTeacherProjectAssets, naturalCompare, normalizeTeacherAssetName } from "../src/apps/book-builder/teacher-projects/teacherProjectAssetMatcher.js";

function file(name, relativePath = name) { return { name, relativePath, size: 10 }; }
function planFor(names) {
  const project = createBlankTeacherProject({ projectId: "matcher", displayName: "Matcher" });
  return matchTeacherProjectAssets(names.map((name) => file(name)), project.shell);
}
function mapping(plan, key) { return plan.mappings.find((item) => item.target.key === key); }
function mappedName(plan, key) { const selected = mapping(plan, key)?.candidateId; return plan.candidates.find((item) => item.id === selected)?.name || null; }

test("matcher normalizes separators, preserves token boundaries, and sorts atlas names naturally", () => {
  assert.deepEqual(normalizeTeacherAssetName("Units\\Unit_01-hover.pressed.PNG").tokens, ["units", "unit", "01", "hover", "pressed"]);
  assert.deepEqual(["foo_SD_10.png", "foo_SD.png", "foo_SD_2.png"].sort(naturalCompare), ["foo_SD.png", "foo_SD_2.png", "foo_SD_10.png"]);
});

test("matcher deterministically maps background, GAF, and naturally ordered SD/HD atlases", () => {
  const plan = planFor(["background.png", "logo.gaf", "logo_SD_10.png", "logo_SD.png", "logo_SD_2.png", "logo_HD_2.png", "logo_HD.png"]);
  assert.equal(mappedName(plan, "background"), "background.png"); assert.equal(mappedName(plan, "animation.gaf"), "logo.gaf");
  assert.deepEqual([0, 1, 2].map((index) => mappedName(plan, `animation.sdAtlases.${index}`)), ["logo_SD.png", "logo_SD_2.png", "logo_SD_10.png"]);
  assert.deepEqual([0, 1].map((index) => mappedName(plan, `animation.hdAtlases.${index}`)), ["logo_HD.png", "logo_HD_2.png"]);
});

test("matcher maps Unit variants without confusing Unit 1 and Unit 10", () => {
  const plan = planFor(["unit-01-normal.png", "unit-01-hover-pressed.png", "u2_default.png", "u2_active.png", "unit10_pressed.webp"]);
  assert.equal(mappedName(plan, "units.unit-1.normal"), "unit-01-normal.png"); assert.equal(mappedName(plan, "units.unit-1.active"), "unit-01-hover-pressed.png");
  assert.equal(mappedName(plan, "units.unit-2.normal"), "u2_default.png"); assert.equal(mappedName(plan, "units.unit-2.active"), "u2_active.png");
  assert.equal(mappedName(plan, "units.unit-10.active"), "unit10_pressed.webp"); assert.equal(mapping(plan, "units.unit-10.normal").candidateId, null);
});

test("matcher recognizes Edition identities and boundary-safe abbreviations", () => {
  const plan = planFor(["students-book-normal.png", "students-book-active.png", "workbook-normal.png", "wb-active.png", "grammar-book-normal.png", "gb-pressed.png", "extras-normal.png", "extras-active.png", "webinar.png"]);
  assert.equal(mappedName(plan, "editions.students-book.normal"), "students-book-normal.png"); assert.equal(mappedName(plan, "editions.workbook.active"), "wb-active.png");
  assert.equal(mappedName(plan, "editions.grammar-book.active"), "gb-pressed.png"); assert.equal(mappedName(plan, "editions.extras.active"), "extras-active.png");
  assert.ok(plan.unmatched.some((item) => item.name === "webinar.png"));
});

test("matcher recognizes Chrome and historical Toolbar synonyms", () => {
  const plan = planFor(["settings.png", "minimise.png", "exit.png", "button-pencil.png", "button-pencil-active.png", "button-open.png", "button-open-active.png", "button-custom-page.png", "button-custom-page-active.png"]);
  assert.equal(mappedName(plan, "chrome.settings.image"), "settings.png"); assert.equal(mappedName(plan, "chrome.minimize.image"), "minimise.png"); assert.equal(mappedName(plan, "chrome.close.image"), "exit.png");
  assert.equal(mappedName(plan, "toolbar.pencil.normal"), "button-pencil.png"); assert.equal(mappedName(plan, "toolbar.load.active"), "button-open-active.png"); assert.equal(mappedName(plan, "toolbar.annotations.normal"), "button-custom-page.png");
});

test("matcher recognizes exact audio identities but keeps generic clicks reusable", () => {
  const plan = planFor(["button.mp3", "pencil.wav", "unit-01.mp3", "close.mp3"]);
  assert.equal(mappedName(plan, "toolbar.pencil.sound"), "pencil.wav"); assert.equal(mappedName(plan, "units.unit-1.sound"), "unit-01.mp3"); assert.equal(mappedName(plan, "chrome.close.sound"), "close.mp3");
  assert.ok(plan.commonAudio.some((item) => item.name === "button.mp3"));
});

test("matcher exposes ambiguity instead of selecting among credible candidates", () => {
  const plan = planFor(["background.png", "menu-bg.webp", "settings.png", "setting.png"]);
  assert.equal(mapping(plan, "background").confidence, MATCH_CONFIDENCE.AMBIGUOUS); assert.equal(mapping(plan, "background").candidateId, null);
  assert.equal(mapping(plan, "chrome.settings.image").confidence, MATCH_CONFIDENCE.AMBIGUOUS);
});

test("matcher rejects documented false positives and unexplained visual states", () => {
  const plan = planFor(["title.gaf", "unrelated_SD.png", "x.png", "webinar.png", "chapter-2-active.png", "unit-3.png", "random-10-pressed.png"]);
  assert.equal(mapping(plan, "chrome.close.image").candidateId, null); assert.equal(mapping(plan, "editions.workbook.normal").candidateId, null); assert.equal(mapping(plan, "units.unit-2.active").candidateId, null); assert.equal(mapping(plan, "units.unit-3.normal").candidateId, null); assert.equal(mapping(plan, "units.unit-10.active").candidateId, null);
  const visual = plan.mappings.filter((item) => item.candidateId && item.target.kind !== "audio"); assert.equal(new Set(visual.map((item) => item.candidateId)).size, visual.length);
  assert.equal(mapping(plan, "animation.sdAtlases.0").candidateId, null);
});

test("matcher enforces the bounded local candidate limit", () => {
  const project = createBlankTeacherProject({ projectId: "limit", displayName: "Limit" });
  assert.throws(() => matchTeacherProjectAssets(Array.from({ length: 257 }, (_, index) => file(`asset-${index}.png`)), project.shell), (error) => error.code === "teacher_bulk_file_limit");
});
