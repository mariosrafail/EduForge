import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const sourceArg = args.find((value) => !value.startsWith("--"));
if (!sourceArg) throw new Error("Usage: node scripts/ultimate-b2/recover-book-menu-assets.mjs <source.app> [--write]");

const sourceRoot = path.resolve(sourceArg);
const atlasRelativePath = "Contents/Resources/assets/books/book1/book_menu/HD/book_atlas.png";
const metadataRelativePath = "Contents/Resources/assets/books/book1/book_menu/HD/book_atlas.xml";
const paramsRelativePath = "Contents/Resources/assets/books/book1/book_menu/common/book1_params.iwb";
const assetRoot = path.join(repoRoot, "src/assets/books/ultimate-b2/legacy-classroom-ui");
const manifestPath = path.join(assetRoot, "asset-manifest.json");

const selectedRegions = [
  ...Array.from({ length: 10 }, (_, index) => String(index + 1).padStart(2, "0"))
    .flatMap((number) => ["a", "b"].map((state) => ({
      name: `button_${number}${state}`,
      outputPath: `book-menu/units/unit-${number}-${state === "a" ? "normal" : "hover-pressed"}.png`,
      role: `Students Book Unit ${Number(number)} menu button`,
      state: state === "a" ? "normal" : "hover-pressed",
    }))),
  ...[["12", "workbook", "Workbook"], ["13", "grammar-book", "Grammar Book"], ["14", "extras", "Extras"]]
    .flatMap(([number, slug, label]) => ["a", "b"].map((state) => ({
      name: `button_${number}${state}`,
      outputPath: `book-menu/editions/${slug}-${state === "a" ? "normal" : "hover-pressed"}.png`,
      role: `${label} menu button`,
      state: state === "a" ? "normal" : "hover-pressed",
    }))),
];

function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function sourcePath(relativePath) { return path.join(sourceRoot, ...relativePath.split("/")); }
function ensureOutsideSource(output) {
  const relative = path.relative(sourceRoot, path.resolve(output));
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error(`Refusing to write inside source bundle: ${output}`);
}

function parseAtlas(xml) {
  const root = xml.match(/<TextureAtlas\b([^>]+)>/)?.[1];
  if (!root) throw new Error("TextureAtlas root missing");
  const rootAttributes = Object.fromEntries([...root.matchAll(/([\w]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));
  const regions = new Map([...xml.matchAll(/<SubTexture\b([^>]+?)\/?\s*>/g)].map((match) => {
    const attributes = Object.fromEntries([...match[1].matchAll(/([\w]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]]));
    return [attributes.name, { x: Number(attributes.x), y: Number(attributes.y), width: Number(attributes.width), height: Number(attributes.height) }];
  }));
  return { rootAttributes, regions };
}

if (!fs.existsSync(sourceRoot) || !sourceRoot.toLowerCase().endsWith(".app")) throw new Error("Explicit source path must be an existing .app directory");
const atlasBytes = fs.readFileSync(sourcePath(atlasRelativePath));
const metadataBytes = fs.readFileSync(sourcePath(metadataRelativePath));
const paramsBytes = fs.readFileSync(sourcePath(paramsRelativePath));
const atlasHash = sha256(atlasBytes);
const metadataHash = sha256(metadataBytes);
const parsed = parseAtlas(metadataBytes.toString("utf8"));
const atlasMetadata = await sharp(atlasBytes).metadata();
if (parsed.rootAttributes.imagePath !== "book_atlas.png") throw new Error("Unexpected atlas imagePath");
if (Number(parsed.rootAttributes.width) !== atlasMetadata.width || Number(parsed.rootAttributes.height) !== atlasMetadata.height) throw new Error("Atlas metadata dimensions do not match the PNG");
const missing = selectedRegions.filter((selection) => !parsed.regions.has(selection.name));
if (missing.length) throw new Error(`Missing required atlas regions: ${missing.map((item) => item.name).join(", ")}`);

const entries = [];
for (const selection of selectedRegions) {
  const region = parsed.regions.get(selection.name);
  const bytes = await sharp(atlasBytes).extract({ left: region.x, top: region.y, width: region.width, height: region.height }).png().toBuffer();
  const output = path.join(assetRoot, ...selection.outputPath.split("/"));
  if (write) {
    ensureOutsideSource(output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, bytes);
  }
  const baseName = selection.name.slice(0, -1);
  entries.push({
    id: `book-menu-${selection.name.replaceAll("_", "-")}`,
    category: selection.outputPath.split("/").slice(0, -1).join("/"),
    sourceRelativePath: atlasRelativePath,
    outputPath: selection.outputPath,
    sha256: sha256(bytes), sourceSha256: atlasHash, sizeBytes: bytes.length,
    width: region.width, height: region.height, hasAlpha: true, format: "PNG",
    functionalRole: selection.role, state: selection.state, audience: "shared",
    intendedConsumer: "Teacher book-menu skin; recovered asset remains benign shared artwork",
    usedBy: [],
    evidence: `Machine-readable atlas region ${selection.name}; decoded book1_params.iwb declares ${baseName}a, ${baseName}b, ${baseName}b as normal, hover, and pressed textures`,
    confidence: "high", sourceKind: "atlas-crop",
    extractionDetails: {
      atlasMetadataPath: metadataRelativePath, atlasMetadataSha256: metadataHash,
      atlasImagePath: atlasRelativePath, atlasImageSha256: atlasHash,
      configurationPath: paramsRelativePath, configurationSha256: sha256(paramsBytes),
      regionName: selection.name, x: region.x, y: region.y, width: region.width, height: region.height, scaling: "none",
    },
    duplicateStatus: { type: "unique-by-byte-hash", matches: [] },
    nearDuplicateStatus: "The SD atlas is a separately authored lower-resolution counterpart; the paired a/b region is a distinct interaction state.",
    recommendedAction: "Use the exact HD crop through a book-menu skin while preserving semantic HTML button behavior.",
  });
}

if (write) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const generatedIds = new Set(entries.map((entry) => entry.id));
  const existingById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const mergedEntries = entries.map((entry) => {
    const existing = existingById.get(entry.id);
    return existing ? { ...entry, intendedConsumer: existing.intendedConsumer, usedBy: existing.usedBy, recommendedAction: existing.recommendedAction } : entry;
  });
  manifest.assets = [...manifest.assets.filter((asset) => !generatedIds.has(asset.id)), ...mergedEntries];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

console.log(JSON.stringify({
  method: "static XML-coordinate atlas cropping; no native, SWF, or ActionScript execution",
  sourceAtlas: atlasRelativePath, sourceAtlasSha256: atlasHash,
  sourceAtlasDimensions: { width: atlasMetadata.width, height: atlasMetadata.height },
  sourceMetadata: metadataRelativePath, sourceMetadataSha256: metadataHash,
  sourceConfiguration: paramsRelativePath, sourceConfigurationSha256: sha256(paramsBytes),
  entries: entries.map(({ id, outputPath, sha256: hash, sizeBytes, width, height, state, extractionDetails }) => ({
    id, outputPath, sha256: hash, sizeBytes, width, height, state,
    crop: { x: extractionDetails.x, y: extractionDetails.y, width: extractionDetails.width, height: extractionDetails.height },
  })),
}, null, 2));
