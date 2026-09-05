import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanWebBundle } from "../scripts/verify-web-bundle-safety.mjs";

test("standard web safety scanner accepts learner-only assets and rejects answer and provenance leaks", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hhplms-web-bundle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "safe.js"), "const prompt = 'Choose an option';", "utf8");
  assert.equal((await scanWebBundle(root)).matchCount, 0);
  await writeFile(path.join(root, "safe.js"), "const scaffold={answer:`Option A`};", "utf8");
  assert.equal((await scanWebBundle(root)).matchCount, 0);
  await writeFile(path.join(root, "unsafe.js"), "const item={answer:`secret`,acceptedAnswers:[`secret`]};const p='Contents/Resources/unit/1';", "utf8");
  const result = await scanWebBundle(root);
  assert.ok(result.findings.some((finding) => finding.label === "hardcoded answer value"));
  assert.ok(result.findings.some((finding) => finding.label === "hardcoded accepted-answer array"));
  assert.ok(result.findings.some((finding) => finding.label === "publisher resource path"));
  const teacherReviewResult = await scanWebBundle(root, { allowTeacherAnswers: true });
  assert.ok(!teacherReviewResult.findings.some((finding) => finding.label.includes("answer")));
  assert.ok(teacherReviewResult.findings.some((finding) => finding.label === "publisher resource path"));
});

test("Student bundle scanner rejects serialized and minified Mark the Words keys", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hhplms-mark-words-bundle-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "leak.js"), 'const a={correctWordIds:["word-00000000000000000000000000000001"]}; const b={"correctWordIds":[]};');
  const result = await scanWebBundle(root);
  assert.ok(result.findings.some((finding) => finding.label === "serialized answer-key field"));
  assert.ok(result.findings.some((finding) => finding.label === "hardcoded correct-word ID array"));
  assert.equal((await scanWebBundle(root, { allowTeacherAnswers: true })).matchCount, 0);
});

test("public Viewer uses an authorized dynamic solution provider while Android Teacher keeps its generated pack", async () => {
  const [hostedProvider, androidProvider, config] = await Promise.all([
    readFile("src/apps/android-teacher-offline/hostedAuthorizedTeacherSolutions.js", "utf8"),
    readFile("src/apps/android-teacher-offline/generatedPackProvider.js", "utf8"),
    readFile("vite.config.js", "utf8"),
  ]);
  assert.match(hostedProvider, /RELEASE_PREVIEW[\s\S]*hostedReleasePath[\s\S]*teacher-solution/);
  assert.doesNotMatch(hostedProvider, /teacher-solutions\.json|acceptedAnswers|correctOptionId|modelAnswer|revealText/i);
  assert.match(androidProvider, /import teacherSolutions[\s\S]*teacher-solutions\.json/);
  assert.match(config, /isHostedInteractiveReview[\s\S]*hostedAuthorizedTeacherSolutions\.js/);
  assert.doesNotMatch(config, /hostedReviewTeacherSolutions|teacher-solutions\.json/);
});

test("web and student Android builds select the learner-only legacy catalog", async () => {
  const [config, webCatalog, offlineCatalog] = await Promise.all([
    readFile("vite.config.js", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/content/webContent.js", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/content/listeningContent.js", "utf8"),
  ]);
  assert.match(config, /virtual:ultimate-b2-legacy-content/);
  assert.match(config, /ultimateB2LegacyContent[\s\S]*content\/webContent\.js/);
  assert.doesNotMatch(config, /ultimateB2LegacyContent[\s\S]*content\/index\.js/);
  assert.doesNotMatch(webCatalog, /acceptedAnswers|\banswer\s*:/);
  assert.match(offlineCatalog, /acceptedAnswers/);
});

test("production source maps are disabled explicitly", async () => {
  const config = await readFile("vite.config.js", "utf8");
  assert.match(config, /build:\s*\{\s*sourcemap:\s*false/);
});
