import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAllowlistedLegacySourcePath, RUFFLE_VERSION } from "./legacy-flash-vite-plugin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = path.resolve(process.argv[2] || process.env.ULTIMATE_B2_SOURCE_ROOT || path.join(repoRoot, "Ultimate English B2.app"));
const outputPath = path.join(repoRoot, "books/ultimate-b2/generated/legacy-flash/compatibility-input.json");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (entry.isFile()) return [fullPath];
    return [];
  });
}

function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function relative(filePath) {
  return path.relative(sourceRoot, filePath).replaceAll("\\", "/");
}

function aggregate(entries) {
  const extensions = {};
  for (const entry of entries) {
    const extension = path.posix.extname(entry.path).toLowerCase() || "(none)";
    extensions[extension] = (extensions[extension] || 0) + 1;
  }
  return {
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    extensions: Object.fromEntries(Object.entries(extensions).sort(([a], [b]) => a.localeCompare(b))),
    files: entries.length,
  };
}

if (!fs.existsSync(sourceRoot)) throw new Error(`Publisher source was not found: ${sourceRoot}`);
const resourcesRoot = path.join(sourceRoot, "Contents/Resources");
const allFiles = walk(resourcesRoot);
const allowed = allFiles
  .map((filePath) => ({ bytes: fs.statSync(filePath).size, filePath, path: relative(filePath) }))
  .filter((entry) => isAllowlistedLegacySourcePath(entry.path))
  .sort((a, b) => a.path.localeCompare(b.path));
const unit2 = allowed.filter((entry) => /^Contents\/Resources\/assets\/books\/book1\/[^/]+\/2(?:\/|$)/.test(entry.path));
const startup = allowed.filter((entry) => !unit2.includes(entry) && entry.path !== "Contents/Resources/UltimateB2.swf");
const swfs = allFiles
  .filter((filePath) => path.extname(filePath).toLowerCase() === ".swf")
  .map((filePath) => ({ bytes: fs.statSync(filePath).size, path: relative(filePath), sha256: sha256(filePath) }))
  .sort((a, b) => a.path.localeCompare(b.path));
const descriptorPath = path.join(resourcesRoot, "META-INF/AIR/application.xml");
const descriptor = fs.readFileSync(descriptorPath, "utf8");
const value = (tag) => descriptor.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1] || null;
const unit2Dependencies = unit2.map((entry) => ({ bytes: entry.bytes, path: entry.path, sha256: sha256(entry.filePath) }));

const report = {
  schemaVersion: 1,
  experiment: {
    featureFlag: "VITE_ENABLE_LEGACY_FLASH_PLAYER=true",
    route: "/#/dev/ultimate-b2-legacy-player",
    ruffle: { package: "@ruffle-rs/ruffle", version: RUFFLE_VERSION },
    scope: "Startup plus Unit 2 only; publisher source remains external and read-only.",
  },
  sourceFingerprint: {
    airDescriptor: {
      applicationId: value("id"),
      applicationVersion: value("versionNumber"),
      bytes: fs.statSync(descriptorPath).size,
      namespace: descriptor.match(/<application xmlns="([^"]+)"/)?.[1] || null,
      sha256: sha256(descriptorPath),
    },
    mainSwf: swfs.find((entry) => entry.path.endsWith("/UltimateB2.swf")),
    swfs,
  },
  allowlistedDependencies: {
    startup: aggregate(startup),
    unit2: { ...aggregate(unit2), fileCount: unit2.length, files: unit2Dependencies },
  },
  airAndNativeAudit: {
    descriptorRequirements: {
      depthAndStencil: /<depthAndStencil>true<\/depthAndStencil>/.test(descriptor),
      fullScreen: /<fullScreen>true<\/fullScreen>/.test(descriptor),
      renderMode: value("renderMode"),
      requestedPermissions: [...descriptor.matchAll(/<uses-permission android:name="([^"]+)"\s*\/>/g)].map((match) => match[1]).sort(),
    },
    excludedNativeArtifacts: [
      "Contents/Resources/Ultimate English B2.exe",
      "Contents/Resources/assets/keyboard/keyboard.bat",
      "Contents/Resources/assets/keyboard/nircmd_x64.exe",
      "Contents/Resources/assets/keyboard/nircmd_x86.exe",
      "Contents/Resources/Adobe AIR/**",
    ],
    riskClassification: [
      { area: "AIR application lifecycle", classification: "fundamental-risk", evidence: "AIR 23 application descriptor and packaged AIR runtime" },
      { area: "native executable keyboard control", classification: "unsupported-and-blocked", evidence: "bat/nircmd artifacts are excluded by extension and path policy" },
      { area: "direct rendering/depth-stencil/fullscreen", classification: "compatibility-risk", evidence: "AIR descriptor settings require browser/WASM substitution" },
      { area: "external media and nested SWFs", classification: "test-required", evidence: "runtime URL resolution and codec support must be observed" },
    ],
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${path.relative(repoRoot, outputPath)} (${unit2.length} Unit 2 files, ${swfs.length} SWFs)`);
