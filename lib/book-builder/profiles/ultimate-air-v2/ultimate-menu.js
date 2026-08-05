import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { booleanValue, finiteNumber, pngDimensions, resolveSourceFile, sha256Bytes, sha256File } from "./source-files.js";
import { elementsNamed } from "./iwb-codec.js";
import { parseGafSummary, readSafeZipEntries } from "./safe-zip-gaf.js";
import { createReviewItem } from "./ultimate-review.js";

function stableId(prefix, value) { return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 20)}`; }

function menuDestination(value) {
  const unit = String(value || "").match(/^section_(\d+)$/i)?.[1];
  if (unit) return { kind: "unit", unit: Number(unit), confidence: 1 };
  const role = new Map([["workbook", "workbook"], ["grammar", "grammar_book"], ["extras", "extras"]]).get(String(value || "").toLowerCase());
  return role ? { kind: "component", role, confidence: 0.95 } : { kind: "unresolved", value: value || null, confidence: 0 };
}

async function assetCandidate(sourceRoot, inventoryByPath, sourceRelativePath, role) {
  const entry = inventoryByPath.get(sourceRelativePath.toLowerCase());
  if (!entry) return null;
  const source = await resolveSourceFile(sourceRoot, entry.path); const dimensions = path.extname(entry.path).toLowerCase() === ".png" ? await pngDimensions(source.absolutePath) : null;
  return { role, sourceRelativePath: entry.path, byteSize: source.stat.size, sha256: entry.sha256 || await sha256File(source.absolutePath), width: dimensions?.width || null, height: dimensions?.height || null };
}

export async function buildMenuAndBranding({ sourceRoot, inventoryEntries, internalDocuments }) {
  const inventoryByPath = new Map(inventoryEntries.map((entry) => [entry.path.toLowerCase(), entry]));
  const homePath = [...internalDocuments.keys()].find((item) => /\/assets\/home\/common\/home_params\.iwb$/i.test(item));
  const menuPath = [...internalDocuments.keys()].find((item) => /\/assets\/books\/book1\/book_menu\/common\/book1_params\.iwb$/i.test(item));
  if (!homePath || !menuPath) throw new Error("Required Ultimate home or book-menu metadata is missing");
  const movieClips = elementsNamed(internalDocuments.get(homePath), "movieClip").map((item) => ({
    name: item.attributes.name || null, textures: item.attributes.textures || null, x: finiteNumber(item.attributes.x), y: finiteNumber(item.attributes.y), scale: finiteNumber(item.attributes.scale), loop: booleanValue(item.attributes.loop), play: booleanValue(item.attributes.play), startFrame: finiteNumber(item.attributes.startFrame), fps: finiteNumber(item.attributes.fps), hdScaleFactor: finiteNumber(item.attributes.hdScaleFactor),
  }));
  const titleDeclaration = movieClips.find((item) => item.textures) || null;
  const menuButtons = elementsNamed(internalDocuments.get(menuPath), "menuButton").map((item, index) => {
    const attrs = item.attributes; const textureTriple = String(attrs.textureNames || attrs.textures || "").split(",").map((value) => value.trim()).filter(Boolean);
    const destination = menuDestination(attrs.url);
    return { id: stableId("menu", `${menuPath}\0${attrs.name || index}\0${attrs.url || ""}`), sourceRelativePath: menuPath, name: attrs.name || null, url: attrs.url || null, active: booleanValue(attrs.active), visible: booleanValue(attrs.visible), x: finiteNumber(attrs.x), y: finiteNumber(attrs.y), width: finiteNumber(attrs.width), height: finiteNumber(attrs.height), scale: finiteNumber(attrs.scale), scaleOnHover: finiteNumber(attrs.scaleOnOver), scaleOnDown: finiteNumber(attrs.scaleOnDown), textureTriple, proposedDestination: destination, confidence: textureTriple.length === 3 && destination.kind !== "unresolved" ? 1 : 0.5 };
  });
  const reviewItems = [];
  for (const button of menuButtons) if (button.proposedDestination.kind === "unresolved") reviewItems.push(createReviewItem({ category: "menu", locator: menuPath, reasonCode: "unresolved_menu_destination", explanation: `Menu destination is unresolved for ${button.name || button.id}.`, suggestedDecisionKind: "menu_destination", evidence: [{ buttonId: button.id }] }));
  let archive = null; let gaf = null; let internalArchiveEntries = new Map();
  if (titleDeclaration?.textures) {
    const archivePath = `${path.posix.dirname(homePath)}/${titleDeclaration.textures}.zip`;
    const source = await resolveSourceFile(sourceRoot, archivePath); const archiveBytes = await fs.readFile(source.absolutePath); internalArchiveEntries = readSafeZipEntries(archiveBytes);
    const entrySummaries = [];
    for (const entry of internalArchiveEntries.values()) {
      let dimensions = null; if (entry.path.toLowerCase().endsWith(".png")) { const temporaryHeader = entry.content; if (temporaryHeader.length >= 24 && temporaryHeader.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) dimensions = { width: temporaryHeader.readUInt32BE(16), height: temporaryHeader.readUInt32BE(20) }; }
      entrySummaries.push({ path: entry.path, byteSize: entry.content.length, sha256: sha256Bytes(entry.content), dimensions });
    }
    const gafEntry = [...internalArchiveEntries.values()].find((item) => item.path.toLowerCase().endsWith(".gaf"));
    if (!gafEntry) throw new Error("Declared Ultimate menu-title archive has no GAF entry");
    gaf = { schemaVersion: "1.0", parserId: "ultimate-air-v2-gaf", parserVersion: "1.0", sourceArchivePath: archivePath, entryPath: gafEntry.path, ...parseGafSummary(gafEntry.content) };
    archive = { sourceRelativePath: archivePath, byteSize: source.stat.size, sha256: sha256Bytes(archiveBytes), entries: entrySummaries };
  }
  const brandingPaths = [
    ["Contents/Resources/assets/topbar/HD/topBar_URL.png", "publisher_logo"], ["Contents/Resources/assets/topbar/SD/topBar_URL.png", "publisher_logo_sd"],
    ["Contents/Resources/assets/topbar/HD/topBar_Logo.png", "publisher_logo_placeholder"], ["Contents/Resources/assets/home/HD/home_BG.png", "home_background"],
    ["Contents/Resources/assets/home/HD/bg_front.png", "home_foreground"], ["Contents/Resources/assets/home/SD/home_BG.png", "home_background_sd"],
    ["Contents/Resources/assets/home/SD/bg_front.png", "home_foreground_sd"],
  ];
  const assets = (await Promise.all(brandingPaths.map(([sourcePath, role]) => assetCandidate(sourceRoot, inventoryByPath, sourcePath, role)))).filter(Boolean);
  return {
    menu: { schemaVersion: "1.0", parserId: "ultimate-air-v2-menu", parserVersion: "1.0", sourceRelativePath: menuPath, summary: { buttonCount: menuButtons.length }, buttons: menuButtons },
    branding: { schemaVersion: "1.0", parserId: "ultimate-air-v2-branding", parserVersion: "1.0", sourceRelativePath: homePath, movieClips, menuTitleKind: archive ? "standalone_gaf_timeline" : "missing", startupIntroIsSeparate: true, assets, archive },
    gaf,
    internalArchiveEntries,
    reviewItems,
  };
}
