import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  NETLIFY_IGNORE_EXIT_CODES,
  NETLIFY_TARGETS,
  affectedNetlifyTargets,
  decideNetlifyBuild,
  gitChangedPaths,
  netlifyIgnoreExitCode,
  shouldBuildNetlifyTarget,
} from "../scripts/netlify/ignore-site-build.mjs";

const scriptPath = fileURLToPath(new URL("../scripts/netlify/ignore-site-build.mjs", import.meta.url));
const cachedRef = "a".repeat(40);
const currentRef = "b".repeat(40);
const comparisonEnvironment = Object.freeze({
  CACHED_COMMIT_REF: cachedRef,
  COMMIT_REF: currentRef,
});

function decisions(changedPaths) {
  return Object.fromEntries(NETLIFY_TARGETS.map((target) => [
    target,
    shouldBuildNetlifyTarget(target, changedPaths),
  ]));
}

test("path policy implements the conservative three-site regression matrix", () => {
  const builderOnly = { lms: false, "ultimate-b2-builder": true, "ultimate-b2-interactive": false };
  const viewerOnly = { lms: false, "ultimate-b2-builder": false, "ultimate-b2-interactive": true };
  const lmsOnly = { lms: true, "ultimate-b2-builder": false, "ultimate-b2-interactive": false };
  const builderViewer = { lms: false, "ultimate-b2-builder": true, "ultimate-b2-interactive": true };
  const lmsViewer = { lms: true, "ultimate-b2-builder": false, "ultimate-b2-interactive": true };
  const allSites = { lms: true, "ultimate-b2-builder": true, "ultimate-b2-interactive": true };
  const noSites = { lms: false, "ultimate-b2-builder": false, "ultimate-b2-interactive": false };

  assert.deepEqual(decisions(["netlify-sites/ultimate-b2-builder/server/_builder-content.js"]), builderOnly);
  assert.deepEqual(decisions(["netlify-sites/ultimate-b2-builder/functions/builder-content.js"]), builderOnly);
  assert.deepEqual(decisions(["netlify-sites/ultimate-b2-builder/server/_builder-preview.js"]), builderOnly);
  assert.deepEqual(decisions(["netlify-sites/ultimate-b2-builder/functions/builder-preview.js"]), builderOnly);
  assert.deepEqual(decisions(["src/apps/book-builder/hosted/HostedBookBuilderApp.jsx"]), builderOnly);
  assert.deepEqual(decisions(["src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx"]), builderOnly);
  assert.deepEqual(decisions(["netlify-sites/viewer/netlify.toml"]), viewerOnly);
  assert.deepEqual(decisions(["netlify/functions/auth-signin.js"]), lmsOnly);
  assert.deepEqual(decisions(["netlify.toml"]), lmsOnly);
  assert.deepEqual(decisions(["src/apps/android-teacher-offline/TeacherOfflineApp.jsx"]), builderViewer);
  assert.deepEqual(decisions(["src/data/ultimate-b2/hostedReviewHotspotRuntime.js"]), allSites);
  assert.deepEqual(decisions(["scripts/netlify/build-review-target.mjs"]), builderViewer);
  assert.deepEqual(decisions(["scripts/netlify/committed-hotspot-vite-plugin.mjs"]), allSites);
  assert.deepEqual(decisions(["index.html"]), lmsViewer);
  assert.deepEqual(decisions(["vite.config.js"]), allSites);
  assert.deepEqual(decisions(["package.json"]), allSites);
  assert.deepEqual(decisions(["package-lock.json"]), allSites);
  assert.deepEqual(decisions(["database/033_example.sql"]), allSites);
  assert.deepEqual(decisions(["src/data/ultimate-b2/studentsBookCatalog.js"]), allSites);
  assert.deepEqual(decisions(["docs/netlify-review-targets.md"]), noSites);
  assert.deepEqual(decisions(["tests/builder-content-api.test.js"]), noSites);
  assert.deepEqual(decisions(["netlify-sites/ultimate-b2-builder/server/_builder-content.js", "tests/builder-content-api.test.js"]), builderOnly);
  assert.deepEqual(decisions(["netlify-sites/ultimate-b2-builder/netlify.toml", "netlify-sites/viewer/netlify.toml"]), builderViewer);
  assert.deepEqual(decisions(["netlify-sites/ultimate-b2-builder/netlify.toml", "src/components/lms/books/BookPageViewer.jsx"]), allSites);
  assert.deepEqual(decisions(["unclassified/new-deployment-input.conf"]), allSites);
  assert.deepEqual(affectedNetlifyTargets(["docs/guide.md", "tests/example.test.js"]), []);
});

test("decision boundary builds for ambiguous Git state and skips only proven irrelevant paths", () => {
  const relevant = decideNetlifyBuild("ultimate-b2-builder", {
    environment: comparisonEnvironment,
    changedPathsBetween: () => ["netlify-sites/ultimate-b2-builder/server/_builder-content.js"],
  });
  assert.deepEqual(relevant, {
    target: "ultimate-b2-builder", action: "build", reason: "relevant-paths", changedPathCount: 1,
  });

  const irrelevant = decideNetlifyBuild("lms", {
    environment: comparisonEnvironment,
    changedPathsBetween: () => ["netlify-sites/ultimate-b2-builder/server/_builder-content.js", "tests/builder-content-api.test.js"],
  });
  assert.deepEqual(irrelevant, {
    target: "lms", action: "skip", reason: "no-relevant-paths", changedPathCount: 2,
  });

  const unknown = decideNetlifyBuild("lms", {
    environment: comparisonEnvironment,
    changedPathsBetween: () => ["unclassified/path.conf"],
  });
  assert.deepEqual(unknown, {
    target: "lms", action: "build", reason: "unknown-path", changedPathCount: 1,
  });

  assert.equal(decideNetlifyBuild("lms", { environment: {} }).reason, "missing-commit-ref");
  assert.equal(decideNetlifyBuild("lms", { environment: { CACHED_COMMIT_REF: cachedRef } }).reason, "missing-commit-ref");
  assert.equal(decideNetlifyBuild("lms", { environment: { COMMIT_REF: currentRef } }).reason, "missing-commit-ref");
  assert.equal(decideNetlifyBuild("lms", {
    environment: { CACHED_COMMIT_REF: "not-a-ref", COMMIT_REF: currentRef },
  }).reason, "unsafe-commit-ref");

  let compared = false;
  const sameRef = decideNetlifyBuild("lms", {
    environment: { CACHED_COMMIT_REF: cachedRef, COMMIT_REF: cachedRef.toUpperCase() },
    changedPathsBetween: () => { compared = true; return []; },
  });
  assert.equal(sameRef.action, "build");
  assert.equal(sameRef.reason, "same-commit-ref");
  assert.equal(compared, false);

  const failedDiff = decideNetlifyBuild("ultimate-b2-interactive", {
    environment: comparisonEnvironment,
    changedPathsBetween: () => { throw new Error("expected test failure"); },
  });
  assert.equal(failedDiff.action, "build");
  assert.equal(failedDiff.reason, "git-diff-failed");
  assert.throws(() => decideNetlifyBuild("invalid-target"), /Invalid Netlify build target/);
});

test("Netlify ignore exit semantics are explicit and invalid targets cannot silently skip", () => {
  assert.deepEqual(NETLIFY_IGNORE_EXIT_CODES, { SKIP: 0, BUILD: 1 });
  assert.equal(netlifyIgnoreExitCode({ action: "skip" }), 0);
  assert.equal(netlifyIgnoreExitCode({ action: "build" }), 1);

  const environment = { ...process.env };
  delete environment.CACHED_COMMIT_REF;
  delete environment.COMMIT_REF;
  const missingRefs = spawnSync(process.execPath, [scriptPath, "lms"], { encoding: "utf8", env: environment });
  assert.equal(missingRefs.status, 1);
  assert.match(missingRefs.stdout, /target=lms action=build reason=missing-commit-ref/);

  const invalidTarget = spawnSync(process.execPath, [scriptPath, "invalid-target"], { encoding: "utf8", env: environment });
  assert.equal(invalidTarget.status, 1);
  assert.match(invalidTarget.stderr, /action=build reason=invalid-target/);
});

test("Git comparison disables rename detection so deleting an old relevant path still builds", async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "hhplms-netlify-ignore-"));
  const runGit = (...arguments_) => execFileSync("git", arguments_, { cwd: repository, encoding: "utf8" }).trim();
  try {
    runGit("init");
    runGit("config", "user.name", "Netlify Ignore Test");
    runGit("config", "user.email", "netlify-ignore@example.invalid");
    const oldDirectory = path.join(repository, "netlify-sites", "ultimate-b2-builder", "server");
    await mkdir(oldDirectory, { recursive: true });
    const oldPath = path.join(oldDirectory, "old-helper.js");
    await writeFile(oldPath, "export const value = 1;\n", "utf8");
    runGit("add", ".");
    runGit("commit", "-m", "old path");
    const first = runGit("rev-parse", "HEAD");

    await mkdir(path.join(repository, "docs"), { recursive: true });
    await rename(oldPath, path.join(repository, "docs", "old-helper.md"));
    runGit("add", "-A");
    runGit("commit", "-m", "move path");
    const second = runGit("rev-parse", "HEAD");

    const changedPaths = gitChangedPaths(first, second, { cwd: repository });
    assert.deepEqual(changedPaths.sort(), [
      "docs/old-helper.md",
      "netlify-sites/ultimate-b2-builder/server/old-helper.js",
    ]);
    assert.deepEqual(affectedNetlifyTargets(changedPaths), ["ultimate-b2-builder"]);

    const cliEnvironment = { ...process.env, CACHED_COMMIT_REF: first, COMMIT_REF: second };
    const builder = spawnSync(process.execPath, [scriptPath, "ultimate-b2-builder"], {
      cwd: repository, encoding: "utf8", env: cliEnvironment,
    });
    const lms = spawnSync(process.execPath, [scriptPath, "lms"], {
      cwd: repository, encoding: "utf8", env: cliEnvironment,
    });
    assert.equal(builder.status, 1);
    assert.match(builder.stdout, /action=build reason=relevant-paths changed=2/);
    assert.equal(lms.status, 0);
    assert.match(lms.stdout, /action=skip reason=no-relevant-paths changed=2/);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

function tomlString(configuration, section, key) {
  const header = `[${section}]`;
  const sectionStart = configuration.indexOf(header);
  if (sectionStart < 0) return undefined;
  const remainder = configuration.slice(sectionStart + header.length);
  const nextSection = remainder.search(/^\[/m);
  const sectionBody = nextSection < 0 ? remainder : remainder.slice(0, nextSection);
  return sectionBody.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"\\s*$`, "m"))?.[1];
}

test("all three Netlify packages use the shared ignore policy without changing build layout", async () => {
  const [lms, builder, viewer] = await Promise.all([
    readFile(new URL("../netlify.toml", import.meta.url), "utf8"),
    readFile(new URL("../netlify-sites/ultimate-b2-builder/netlify.toml", import.meta.url), "utf8"),
    readFile(new URL("../netlify-sites/viewer/netlify.toml", import.meta.url), "utf8"),
  ]);

  assert.equal(tomlString(lms, "build", "command"), "npm run deploy:build");
  assert.equal(tomlString(lms, "build", "publish"), "dist");
  assert.equal(tomlString(lms, "build", "functions"), "netlify/functions");
  assert.equal(tomlString(lms, "build", "ignore"), "node ./scripts/netlify/ignore-site-build.mjs lms");

  assert.equal(tomlString(builder, "build", "command"), "npm run build:netlify:ultimate-b2-builder");
  assert.equal(tomlString(builder, "build", "publish"), "dist-netlify/ultimate-b2-builder");
  assert.equal(tomlString(builder, "functions", "directory"), "netlify-sites/ultimate-b2-builder/functions");
  assert.equal(tomlString(builder, "build", "ignore"), "node ./scripts/netlify/ignore-site-build.mjs ultimate-b2-builder");

  assert.equal(tomlString(viewer, "build", "command"), "npm run build:netlify:ultimate-b2-interactive");
  assert.equal(tomlString(viewer, "build", "publish"), "dist-netlify/ultimate-b2-interactive");
  assert.equal(tomlString(viewer, "functions", "directory"), "netlify-sites/viewer/functions");
  assert.equal(tomlString(viewer, "build", "ignore"), "node ./scripts/netlify/ignore-site-build.mjs ultimate-b2-interactive");
});
