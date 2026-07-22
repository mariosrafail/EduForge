import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanWebBundle } from "../scripts/verify-web-bundle-safety.mjs";

test("standard web safety scanner accepts learner-only assets and rejects answer and provenance leaks", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "eduforge-web-bundle-"));
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
});

test("web build alias selects a learner-only legacy catalog while Android retains the offline catalog", async () => {
  const [config, webCatalog, offlineCatalog] = await Promise.all([
    readFile("vite.config.js", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/content/webContent.js", "utf8"),
    readFile("src/components/lms/activities/ultimate-b2/content/listeningContent.js", "utf8"),
  ]);
  assert.match(config, /virtual:ultimate-b2-legacy-content/);
  assert.match(config, /isAndroidOffline[\s\S]*content\/index\.js[\s\S]*content\/webContent\.js/);
  assert.doesNotMatch(webCatalog, /acceptedAnswers|\banswer\s*:/);
  assert.match(offlineCatalog, /acceptedAnswers/);
});

test("production source maps are disabled explicitly", async () => {
  const config = await readFile("vite.config.js", "utf8");
  assert.match(config, /build:\s*\{\s*sourcemap:\s*false/);
});
