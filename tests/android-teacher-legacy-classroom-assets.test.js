import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const assetRoot = path.resolve("src/assets/books/ultimate-b2/legacy-classroom-ui");
const manifestPath = path.join(assetRoot, "asset-manifest.json");

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(absolute) : [absolute];
  }))).flat();
}

test("curated legacy classroom manifest is complete, safe, and hash-verified", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const hashes = new Set();
  const declaredPaths = new Set();

  for (const asset of manifest.assets) {
    const absolute = path.resolve(assetRoot, asset.outputPath);
    assert.ok(absolute.startsWith(`${assetRoot}${path.sep}`), `${asset.id} escapes the curated root`);
    assert.doesNotMatch(asset.outputPath, /\.(?:swf|exe|dll|dylib|bat|cmd|sh|js)$/i);
    const bytes = await readFile(absolute);
    assert.equal((await stat(absolute)).size, asset.sizeBytes, `${asset.id} size mismatch`);
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), asset.sha256, `${asset.id} hash mismatch`);
    assert.ok(!hashes.has(asset.sha256), `${asset.id} duplicates another curated asset`);
    hashes.add(asset.sha256);
    declaredPaths.add(path.normalize(asset.outputPath));
    if (asset.category === "audio/ui") assert.match(asset.outputPath, /\.mp3$/);
  }

  const actualAssets = (await filesBelow(assetRoot))
    .map((absolute) => path.relative(assetRoot, absolute))
    .filter((relative) => !["README.md", "asset-manifest.json"].includes(relative));
  assert.deepEqual(new Set(actualAssets), declaredPaths);
});

test("teacher registry resolves only declared assets and remains outside Student source", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const registryPath = path.resolve("src/apps/android-teacher-offline/legacyClassroomAssets.js");
  const registry = await readFile(registryPath, "utf8");
  const importedOutputs = [...registry.matchAll(/legacy-classroom-ui\/([^"']+)/g)].map((match) => path.normalize(match[1]));
  assert.deepEqual(new Set(importedOutputs), new Set(manifest.assets.map((asset) => path.normalize(asset.outputPath))));

  const sourceFiles = await filesBelow(path.resolve("src"));
  for (const sourceFile of sourceFiles) {
    if (sourceFile.startsWith(`${path.resolve("src/apps/android-teacher-offline")}${path.sep}`)) continue;
    if (!/\.(?:js|jsx|ts|tsx|css)$/.test(sourceFile)) continue;
    assert.doesNotMatch(await readFile(sourceFile, "utf8"), /legacyClassroomAssets|legacy-classroom-ui/);
  }

  const trackedLegacyBundleFiles = execFileSync("git", ["ls-files", "--", "Ultimate English B2.app/**"], { encoding: "utf8" }).trim();
  assert.equal(trackedLegacyBundleFiles, "");
});

test("Teacher build emits curated binaries as files rather than base64 payloads", async () => {
  const viteConfig = await readFile("vite.config.js", "utf8");
  assert.match(viteConfig, /assetsInlineLimit:\s*isAndroidTeacherOffline\s*\?\s*0\s*:\s*4096/);
});
