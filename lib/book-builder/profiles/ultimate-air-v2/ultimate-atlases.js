import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { XMLValidator } from "fast-xml-parser";
import { parseAttributes } from "./iwb-codec.js";
import { pngDimensions, resolveSourceFile, sha256File } from "./source-files.js";
import { createReviewItem } from "./ultimate-review.js";

function stableCropId(metadataPath, regionName) { return `crop_${createHash("sha256").update(`${metadataPath.toLowerCase()}\0${regionName}`).digest("hex").slice(0, 24)}`; }
function safeSlug(value) { return String(value).normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "region"; }
function qualityFromPath(sourcePath) { return sourcePath.match(/\/(HD|SD)\//i)?.[1].toUpperCase() || "SINGLE"; }
function categoryFromPath(sourcePath) {
  const lower = sourcePath.toLowerCase();
  if (lower.includes("/book_menu/")) return "main_menu";
  if (lower.includes("/topbar/")) return "topbar";
  if (lower.includes("/navbar/")) return "navbar";
  if (lower.includes("/audioplayer/")) return "audio_player";
  if (lower.includes("/obj")) return "activity_object";
  return "publisher_ui";
}

function inferredStates(regionName) {
  const lower = regionName.toLowerCase();
  const states = [];
  if (/(?:^|[_-])(?:disabled|inactive)(?:$|[_-])/.test(lower)) states.push("disabled");
  if (/(?:^|[_-])(?:pressed|down|selected)(?:$|[_-])/.test(lower)) states.push("pressed");
  if (/(?:^|[_-])(?:hover|over|active)(?:$|[_-])/.test(lower)) states.push("hover");
  if (/(?:^|[_-])(?:normal|up|idle)(?:$|[_-])/.test(lower)) states.push("normal");
  return states;
}

function menuTextureMap(menu) {
  const map = new Map();
  for (const button of menu?.buttons || []) {
    const [normal, hover, pressed] = button.textureTriple;
    for (const [name, state] of [[normal, "normal"], [hover, "hover"], [pressed, "pressed"]]) {
      if (!name) continue;
      if (!map.has(name)) map.set(name, { states: new Set(), button });
      map.get(name).states.add(state);
    }
  }
  return map;
}

function menuOutput(button, states) {
  const state = states.includes("normal") ? "normal" : states.includes("hover") && states.includes("pressed") ? "hover-pressed" : states.join("-");
  if (button.proposedDestination.kind === "unit") return `book-menu/units/unit-${String(button.proposedDestination.unit).padStart(2, "0")}-${state}.png`;
  const slug = button.proposedDestination.role === "grammar_book" ? "grammar-book" : safeSlug(button.proposedDestination.role || button.name);
  return `book-menu/editions/${slug}-${state}.png`;
}

export async function buildAtlasInventoryAndCropPlan({ sourceRoot, inventoryEntries, menu, concurrency = 8 }) {
  const byPath = new Map(inventoryEntries.map((entry) => [entry.path.toLowerCase(), entry]));
  const metadataEntries = inventoryEntries.filter((entry) => entry.extension === ".xml").sort((a, b) => a.path.localeCompare(b.path));
  const atlases = []; const reviewItems = [];
  for (const metadataEntry of metadataEntries) {
    const metadataSource = await resolveSourceFile(sourceRoot, metadataEntry.path); const xmlBytes = await fs.readFile(metadataSource.absolutePath); const xml = xmlBytes.toString("utf8");
    if (!/<TextureAtlas\b/i.test(xml)) continue;
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml, { allowBooleanAttributes: false }) !== true) throw new Error(`Unsafe or malformed atlas metadata: ${metadataEntry.path}`);
    const rootTag = xml.match(/<TextureAtlas\b[^>]*>/i)?.[0]; const rootAttributes = parseAttributes(rootTag || ""); const imageName = rootAttributes.imagePath;
    if (!imageName || path.posix.isAbsolute(imageName) || imageName.replaceAll("\\", "/").split("/").includes("..")) {
      reviewItems.push(createReviewItem({ category: "atlas", locator: metadataEntry.path, reasonCode: "atlas_metadata_image_mismatch", explanation: "Atlas imagePath is missing or unsafe.", blocking: true }));
      continue;
    }
    const imagePath = path.posix.normalize(`${path.posix.dirname(metadataEntry.path)}/${imageName.replaceAll("\\", "/")}`); const imageEntry = byPath.get(imagePath.toLowerCase());
    if (!imageEntry) { reviewItems.push(createReviewItem({ category: "atlas", locator: metadataEntry.path, reasonCode: "atlas_metadata_image_mismatch", explanation: "Atlas metadata references a missing image.", blocking: true, evidence: [{ imagePath }] })); continue; }
    const imageSource = await resolveSourceFile(sourceRoot, imageEntry.path); const dimensions = await pngDimensions(imageSource.absolutePath);
    if ((rootAttributes.width && Number(rootAttributes.width) !== dimensions.width) || (rootAttributes.height && Number(rootAttributes.height) !== dimensions.height)) { reviewItems.push(createReviewItem({ category: "atlas", locator: metadataEntry.path, reasonCode: "atlas_metadata_image_mismatch", explanation: "Atlas declared dimensions differ from the source PNG.", blocking: true, evidence: [{ declaredWidth: Number(rootAttributes.width), declaredHeight: Number(rootAttributes.height), actualWidth: dimensions.width, actualHeight: dimensions.height }] })); continue; }
    const seen = new Set(); const regions = []; let valid = true;
    for (const match of xml.matchAll(/<SubTexture\b[^>]*>/gi)) {
      const attributes = parseAttributes(match[0]); const name = attributes.name; const identity = String(name || "").toLowerCase();
      if (!name || seen.has(identity)) { valid = false; reviewItems.push(createReviewItem({ category: "atlas", locator: metadataEntry.path, reasonCode: "duplicate_atlas_region", explanation: `Atlas has a missing or duplicate region name: ${name || "[missing]"}.`, blocking: true })); continue; }
      seen.add(identity);
      const x = Number(attributes.x); const y = Number(attributes.y); const width = Number(attributes.width); const height = Number(attributes.height);
      const boundsValid = [x, y, width, height].every(Number.isInteger) && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= dimensions.width && y + height <= dimensions.height;
      if (!boundsValid) { valid = false; reviewItems.push(createReviewItem({ category: "atlas", locator: `${metadataEntry.path}/region/${safeSlug(name)}`, reasonCode: "invalid_atlas_bounds", explanation: `Atlas region ${name} exceeds valid integer image bounds.`, blocking: true, evidence: [{ x, y, width, height, imageWidth: dimensions.width, imageHeight: dimensions.height }] })); continue; }
      regions.push({ name, x, y, width, height, frameX: Number.isFinite(Number(attributes.frameX)) ? Number(attributes.frameX) : null, frameY: Number.isFinite(Number(attributes.frameY)) ? Number(attributes.frameY) : null, frameWidth: Number.isFinite(Number(attributes.frameWidth)) ? Number(attributes.frameWidth) : null, frameHeight: Number.isFinite(Number(attributes.frameHeight)) ? Number(attributes.frameHeight) : null });
    }
    if (!regions.length) continue;
    atlases.push({ metadataSourcePath: metadataEntry.path, metadataSha256: metadataEntry.sha256 || createHash("sha256").update(xmlBytes).digest("hex"), imageSourcePath: imageEntry.path, imageSha256: imageEntry.sha256 || await sha256File(imageSource.absolutePath), imageWidth: dimensions.width, imageHeight: dimensions.height, quality: qualityFromPath(metadataEntry.path), regionCount: regions.length, valid, regions });
  }
  atlases.sort((a, b) => a.metadataSourcePath.localeCompare(b.metadataSourcePath));
  const menuTextures = menuTextureMap(menu); const outputs = new Set(); const crops = [];
  for (const atlas of atlases) for (const region of atlas.regions) {
    const menuTexture = categoryFromPath(atlas.metadataSourcePath) === "main_menu" ? menuTextures.get(region.name) : null;
    const states = menuTexture ? [...menuTexture.states].sort() : inferredStates(region.name);
    const id = stableCropId(atlas.metadataSourcePath, region.name);
    const outputRelativePath = menuTexture && atlas.quality === "HD" ? menuOutput(menuTexture.button, states) : `atlas-regions/${id.slice(-12)}/${safeSlug(region.name)}.png`;
    if (outputs.has(outputRelativePath.toLowerCase())) throw new Error(`Atlas crop output collision: ${outputRelativePath}`);
    outputs.add(outputRelativePath.toLowerCase());
    crops.push({ id, sourceAtlasPath: atlas.imageSourcePath, sourceMetadataPath: atlas.metadataSourcePath, sourceAtlasSha256: atlas.imageSha256, sourceMetadataSha256: atlas.metadataSha256, regionName: region.name, bounds: { x: region.x, y: region.y, width: region.width, height: region.height }, frame: { x: region.frameX, y: region.frameY, width: region.frameWidth, height: region.frameHeight }, outputRelativePath, proposedCategory: categoryFromPath(atlas.metadataSourcePath), proposedStates: states, proposedAudience: "unapproved", evidence: menuTexture ? ["book1_params_texture_triple", `atlas_quality:${atlas.quality}`] : ["texturepacker_numeric_region"], confidence: menuTexture ? 1 : 0.85 });
  }
  crops.sort((a, b) => a.id.localeCompare(b.id));
  const atlasArtifact = { schemaVersion: "1.0", parserId: "ultimate-air-v2-atlases", parserVersion: "1.0", summary: { familyCount: atlases.length, regionCount: atlases.reduce((sum, item) => sum + item.regionCount, 0), invalidFamilyCount: atlases.filter((item) => !item.valid).length }, atlases };
  const cropPlan = { schemaVersion: "1.0", parserId: "ultimate-air-v2-atlas-crop-plan", parserVersion: "1.0", summary: { cropCount: crops.length, mainMenuStateRegionCount: crops.filter((item) => item.proposedCategory === "main_menu" && item.proposedStates.length).length, materializableMenuCropCount: crops.filter((item) => item.outputRelativePath.startsWith("book-menu/")).length }, crops };
  void concurrency;
  return { atlasArtifact, cropPlan, reviewItems };
}
