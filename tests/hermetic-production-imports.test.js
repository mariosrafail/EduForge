import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const repositoryRoot = path.resolve(".");
const sourceExtensions = /\.(?:js|jsx|mjs|ts|tsx)$/i;
const runtimeAssetExtensions = /\.(?:aac|gif|jpe?g|m4a|mp3|mp4|ogg|png|svg|webm|webp|wav)(?:[?#].*)?$/i;
const staticImportPattern = /\b(?:import|export)\s+(?:[^"'()]*?\sfrom\s*)?["']([^"']+)["']/g;
const dynamicImportPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
const forbiddenPublisherBundlePattern = /Ultimate English B2\.app|Contents[\\/]Resources/i;
const absoluteDeveloperPathPattern = /^(?:[a-z]:[\\/]|\\\\|\/(?:Users|home)\/)/i;

function trackedFiles(...paths) {
  return execFileSync("git", ["ls-files", "--", ...paths], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll("\\", "/"));
}

function importSpecifiers(source) {
  return [
    ...source.matchAll(staticImportPattern),
    ...source.matchAll(dynamicImportPattern),
  ].map((match) => match[1]);
}

test("tracked production source imports no runtime assets from ignored publisher bundles or developer paths", async () => {
  const tracked = new Set(trackedFiles());
  const productionSourceFiles = trackedFiles(
    "src",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.ts",
    "capacitor.config.ts",
    "postcss.config.js",
    "tailwind.config.js",
  ).filter((file) => sourceExtensions.test(file));
  const violations = [];

  for (const file of productionSourceFiles) {
    const source = await readFile(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      if (forbiddenPublisherBundlePattern.test(specifier) || absoluteDeveloperPathPattern.test(specifier)) {
        violations.push(`${file}: forbidden external import ${specifier}`);
        continue;
      }
      if (!specifier.startsWith(".") || !runtimeAssetExtensions.test(specifier)) continue;

      const cleanSpecifier = specifier.replace(/[?#].*$/, "");
      const resolved = path.resolve(path.dirname(file), cleanSpecifier);
      const relative = path.relative(repositoryRoot, resolved).replaceAll("\\", "/");
      if (relative.startsWith("../") || path.isAbsolute(relative) || !tracked.has(relative)) {
        violations.push(`${file}: runtime asset import is not repository-tracked: ${specifier}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("Ultimate B2 offline media imports use the exact committed teacher-pack copies", async () => {
  const source = await readFile("src/data/ultimate-b2/ultimateB2MediaAssets.offline.js", "utf8");
  const expectedImports = {
    grammarIntroVideo: "unit-2-grammar-intro.mp4",
    fjordsAudio: "unit-2-fjords.mp3",
    icelandTripAudio: "unit-2-iceland-trip.mp3",
    photoComparisonAudio: "unit-2-photo-comparison.mp3",
    tristanDaCunhaAudio: "unit-2-tristan-da-cunha.mp3",
    unit1ReadingAudio: "unit-1-reading-text.mp3",
    unit1ExtraVideo1: "unit-1-extra-1.mp4",
    unit1ExtraVideo2: "unit-1-extra-2.mp4",
    unit1ExtraVideo3: "unit-1-extra-3.mp4",
    unit1GrammarVideo: "unit-1-grammar-intro.mp4",
    unit1TelevisionDialogue: "unit-1-television-dialogue.mp3",
    unit1SixSituations: "unit-1-six-situations.mp3",
    unit1DiscussionReview: "unit-1-discussion-review.mp3",
    unit1StudentComparison: "unit-1-student-comparison.mp3",
    unit1EightSituations: "unit-1-eight-situations.mp3",
  };

  for (const [variable, fileName] of Object.entries(expectedImports)) {
    assert.match(
      source,
      new RegExp(`import ${variable} from "../../assets/books/ultimate-b2/teacher-offline-media/${fileName.replace(".", "\\.")}";`),
    );
  }
  assert.match(
    source,
    /import unit1ReadingVideo from "\.\.\/\.\.\/assets\/books\/ultimate-b2\/legacy-pilot\/unit-1\/part-2\/obj1\/video\/obj1\.mp4";/,
  );
  assert.doesNotMatch(source, forbiddenPublisherBundlePattern);
});
