import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const sourceArg = args.find((value) => !value.startsWith("--"));
if (!sourceArg) throw new Error("Usage: node scripts/ultimate-b2/legacy-ui-catalog.mjs <source.app> [--write]");
const sourceRoot = path.resolve(sourceArg);
const assetRoot = path.join(repoRoot, "src/assets/books/ultimate-b2/legacy-classroom-ui");
const manifestPath = path.join(assetRoot, "asset-manifest.json");
const reviewRoot = path.join(repoRoot, ".codex/legacy-assets/ultimate-b2");
const embeddedRoot = path.join(reviewRoot, "extracted-candidates/swf-embedded");
let extractionRoot = embeddedRoot;
const docsRoot = path.join(repoRoot, "docs/legacy-assets/ultimate-b2");
const mainSwfRelative = "Contents/Resources/UltimateB2.swf";

function posix(value) { return value.replaceAll("\\", "/"); }
function sourcePath(relative) { return path.join(sourceRoot, ...relative.split("/")); }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function fileHash(file) { return sha256(fs.readFileSync(file)); }
function slug(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replaceAll("_", "-").replace(/[^a-zA-Z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}
function xmlEscape(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function ensureOutsideSource(output) {
  const relative = path.relative(sourceRoot, path.resolve(output));
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error(`Refusing to write inside source bundle: ${output}`);
}
function ensureDirectories() {
  [assetRoot, reviewRoot, embeddedRoot, docsRoot, path.join(docsRoot, "contact-sheets")].forEach((directory) => {
    ensureOutsideSource(directory);
    fs.mkdirSync(directory, { recursive: true });
  });
}

function parseAtlas(xmlText) {
  const root = xmlText.match(/<TextureAtlas\b[^>]*\bimagePath="([^"]+)"[^>]*>/)?.[1];
  if (!root) throw new Error("TextureAtlas imagePath missing");
  const regions = [...xmlText.matchAll(/<SubTexture\b([^>]+?)\/?\s*>/g)].map((match) => {
    const attributes = Object.fromEntries([...match[1].matchAll(/([\w]+)="([^"]*)"/g)].map((entry) => [entry[1], entry[2]]));
    return { name: attributes.name, x: Number(attributes.x), y: Number(attributes.y), width: Number(attributes.width), height: Number(attributes.height), attributes };
  });
  return { imagePath: root, regions };
}

function mp3Metadata(bytes) {
  const syncsafe = (offset) => (bytes[offset] << 21) | (bytes[offset + 1] << 14) | (bytes[offset + 2] << 7) | bytes[offset + 3];
  let offset = bytes.toString("ascii", 0, 3) === "ID3" ? 10 + syncsafe(6) : 0;
  const bitrates1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const bitrates2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  let frames = 0; let samples = 0; let sampleRateHz = null; let channels = null; let codec = null;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) { offset += 1; continue; }
    const version = (bytes[offset + 1] >> 3) & 3;
    const layer = (bytes[offset + 1] >> 1) & 3;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 15;
    const rateIndex = (bytes[offset + 2] >> 2) & 3;
    const padding = (bytes[offset + 2] >> 1) & 1;
    if (version === 1 || layer !== 1 || !bitrateIndex || bitrateIndex === 15 || rateIndex === 3) { offset += 1; continue; }
    const rates = version === 3 ? [44100, 48000, 32000] : version === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    const rate = rates[rateIndex];
    const kbps = (version === 3 ? bitrates1 : bitrates2)[bitrateIndex];
    const frameLength = Math.floor((version === 3 ? 144000 : 72000) * kbps / rate) + padding;
    if (offset + frameLength > bytes.length) break;
    frames += 1;
    samples += version === 3 ? 1152 : 576;
    sampleRateHz = rate;
    channels = ((bytes[offset + 3] >> 6) & 3) === 3 ? 1 : 2;
    codec = version === 3 ? "MPEG-1 Layer III" : version === 2 ? "MPEG-2 Layer III" : "MPEG-2.5 Layer III";
    offset += frameLength;
  }
  if (!frames || !sampleRateHz) throw new Error("No valid MP3 frames found");
  return { durationSeconds: Number((samples / sampleRateHz).toFixed(3)), sampleRateHz, channels, codec, frameCount: frames };
}

function flvMetadata(bytes) {
  if (bytes.toString("ascii", 0, 3) !== "FLV") throw new Error("Not an FLV file");
  let offset = bytes.readUInt32BE(5) + 4;
  const codecs = new Set(); const soundFormats = new Set(); let videoTags = 0; let audioTags = 0; let maxTimestampMs = 0; let metadata = {};
  const readValue = (state) => {
    const type = bytes[state.offset++];
    if (type === 0) { const value = bytes.readDoubleBE(state.offset); state.offset += 8; return value; }
    if (type === 1) return Boolean(bytes[state.offset++]);
    if (type === 2) { const length = bytes.readUInt16BE(state.offset); state.offset += 2; const value = bytes.toString("utf8", state.offset, state.offset + length); state.offset += length; return value; }
    if (type === 3 || type === 8) {
      if (type === 8) state.offset += 4;
      const value = {};
      while (state.offset + 3 <= bytes.length) {
        const length = bytes.readUInt16BE(state.offset); state.offset += 2;
        if (!length && bytes[state.offset] === 9) { state.offset += 1; break; }
        const key = bytes.toString("utf8", state.offset, state.offset + length); state.offset += length;
        value[key] = readValue(state);
      }
      return value;
    }
    throw new Error(`Unsupported FLV AMF0 type ${type}`);
  };
  while (offset + 11 <= bytes.length) {
    const type = bytes[offset]; const size = bytes.readUIntBE(offset + 1, 3);
    const timestamp = bytes.readUIntBE(offset + 4, 3) + ((bytes[offset + 7] << 24) >>> 0);
    const payload = offset + 11;
    if (payload + size > bytes.length) break;
    maxTimestampMs = Math.max(maxTimestampMs, timestamp);
    if (type === 9 && size) { videoTags += 1; codecs.add(bytes[payload] & 15); }
    if (type === 8 && size) { audioTags += 1; soundFormats.add(bytes[payload] >> 4); }
    if (type === 18) { const state = { offset: payload }; readValue(state); metadata = readValue(state); }
    offset = payload + size + 4;
  }
  return { ...metadata, maxTimestampMs, videoTags, audioTags, videoCodecIds: [...codecs], soundFormatIds: [...soundFormats] };
}

const existingRegionIds = new Map([
  ["navibar_back_active", "navigation-back"], ["navibar_check_active", "answer-check"], ["navibar_home_active", "navigation-home"],
  ["navibar_next_active", "navigation-next"], ["navibar_previous_active", "navigation-previous"],
]);

const looseAtlases = [
  { key: "navigation", xml: "Contents/Resources/assets/naviBar/HD/naviBar.xml", image: "Contents/Resources/assets/naviBar/HD/naviBar.png", folder: "icons/navigation", audience: "shared" },
  { key: "media-player", xml: "Contents/Resources/assets/audioPlayer/HD/AudioPlayer.xml", image: "Contents/Resources/assets/audioPlayer/HD/AudioPlayer.png", folder: "icons/media", audience: "shared" },
  { key: "topbar", xml: "Contents/Resources/assets/topbar/HD/topBar_buttons.xml", image: "Contents/Resources/assets/topbar/HD/topBar_buttons.png", folder: "icons/dialogs", audience: "shared" },
];

const embeddedAtlases = [
  { key: "teacher-toolbar", imageId: 29, xmlId: 28, folder: "icons/teacher-tools", audience: "teacher" },
  { key: "teacher-toolbar-support", imageId: 26, xmlId: 20, folder: "controls/teacher-tools", audience: "teacher" },
  { key: "teacher-cursors", imageId: 34, xmlId: 32, folder: "icons/teacher-tools/cursors", audience: "teacher" },
  { key: "loading", imageId: 220, xmlId: 226, folder: "icons/dialogs/loading", audience: "shared" },
  { key: "alert", imageId: 222, xmlId: 224, folder: "controls/dialogs", audience: "shared" },
  { key: "toggle", imageId: 5, xmlId: 4, folder: "controls/toggles", audience: "shared" },
  { key: "karaoke-mode", imageId: 259, xmlId: 258, folder: "icons/media/karaoke", audience: "shared" },
  { key: "karaoke", imageId: 267, xmlId: 266, folder: "icons/media/karaoke", audience: "shared" },
  { key: "scorebox", imageId: 262, xmlId: 263, folder: "controls/teacher-tools/scoreboard", audience: "teacher" },
  { key: "settings", imageId: 273, xmlId: 274, folder: "controls/dialogs/settings", audience: "teacher" },
  { key: "exercise-check", imageId: 282, xmlId: 281, folder: "icons/activities/check", audience: "teacher" },
  { key: "show-answer", imageId: 289, xmlId: 288, folder: "icons/activities/show-answer", audience: "teacher" },
  { key: "activity-audio", imageId: 290, xmlId: 291, folder: "icons/media/activity-audio", audience: "shared" },
];

const embeddedStandalone = [
  [229, "icons/navigation/internal-previous-04.png", "Internal previous navigation state 04", "shared"],
  [231, "icons/navigation/internal-next-03.png", "Internal next navigation state 03", "shared"],
  [233, "icons/navigation/internal-next-04.png", "Internal next navigation state 04", "shared"],
  [234, "icons/navigation/internal-next-01.png", "Internal next navigation state 01", "shared"],
  [235, "icons/dialogs/embedded-exit.png", "Embedded exit control", "shared"],
  [236, "icons/navigation/internal-previous-02.png", "Internal previous navigation state 02", "shared"],
  [237, "icons/navigation/internal-previous-01.png", "Internal previous navigation state 01", "shared"],
  [238, "icons/navigation/internal-previous-03.png", "Internal previous navigation state 03", "shared"],
  [239, "icons/navigation/internal-next-02.png", "Internal next navigation state 02", "shared"],
  [244, "icons/dialogs/embedded-close.png", "Embedded close control", "shared"],
  [246, "controls/dialogs/embedded-button.png", "Generic embedded dialog button", "shared"],
  [247, "icons/dialogs/embedded-exit-hd.png", "Embedded HD exit control", "shared"],
];

const standaloneAudio = [
  ["Contents/Resources/assets/books/sounds/pageTurn2.mp3", "audio/navigation/page-turn-alternate.mp3", "Alternate page turn", "shared", "high"],
  ["Contents/Resources/assets/books/sounds/drip.mp3", "audio/feedback/drip.mp3", "Short activity interaction cue", "shared", "medium"],
  ["Contents/Resources/assets/books/sounds/pencil.mp3", "audio/feedback/pencil.mp3", "Pencil interaction cue", "shared", "high"],
  ["Contents/Resources/assets/books/sounds/pop.mp3", "audio/feedback/pop.mp3", "Short pop interaction cue", "shared", "medium"],
  ["Contents/Resources/assets/books/sounds/writing.mp3", "audio/feedback/writing.mp3", "Writing interaction cue", "shared", "high"],
];
for (const name of ["Annotations", "ClearScreen", "Eraser", "Hide", "Keyboard", "Load", "Marker", "Mouse", "Pencil", "Redo", "Save", "Score", "Show", "Text", "Timer", "Undo", "Url", "Zoom"]) {
  standaloneAudio.push([`Contents/Resources/assets/toolbar/sounds/audio_${name}.mp3`, `audio/ui/toolbar-labels/${slug(name)}.mp3`, `Spoken toolbar label: ${name}`, "teacher", "high"]);
}

const embeddedAudio = [
  [21, "audio/ui/timer-ring.mp3", "Timer ring", "teacher"],
  [27, "audio/ui/timer-minute.mp3", "Timer minute cue", "teacher"],
  [30, "audio/ui/timer-second.mp3", "Timer second cue", "teacher"],
  [33, "audio/ui/save-exists.mp3", "Save-already-exists alert", "teacher"],
];

function stateFromName(name) {
  const match = name.match(/(?:^|_)(active|disabled|pressed|enabled|inactive|correct|wrong|off|on|selected)(?:$|_)/i);
  if (match) return match[1].toLowerCase();
  if (/^loading_\d+$/i.test(name)) return `frame-${name.match(/(\d+)$/)[1]}`;
  return "normal";
}

function roleFor(group, name) {
  return `${group}: ${name.replaceAll("_", " ")}`;
}

async function addCrop({ manifestAssets, group, sourceRelativePath, sourceSha256, imageFile, region, outputPath, audience, extractionDetails }) {
  const output = path.join(assetRoot, ...outputPath.split("/"));
  if (write) { fs.mkdirSync(path.dirname(output), { recursive: true }); await sharp(imageFile).extract({ left: region.x, top: region.y, width: region.width, height: region.height }).png().toFile(output); }
  const bytes = write ? fs.readFileSync(output) : await sharp(imageFile).extract({ left: region.x, top: region.y, width: region.width, height: region.height }).png().toBuffer();
  const metadata = await sharp(bytes).metadata();
  manifestAssets.push({
    id: `${group}-${slug(region.name)}`, category: outputPath.split("/").slice(0, -1).join("/"), sourceRelativePath, outputPath,
    sha256: sha256(bytes), sourceSha256, sizeBytes: bytes.length, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha,
    format: "PNG", functionalRole: roleFor(group, region.name), state: stateFromName(region.name), audience,
    intendedConsumer: "Forensic catalog; not imported at runtime", usedBy: [], evidence: `Machine-readable atlas region ${region.name}`,
    confidence: "high", sourceKind: "atlas-crop", extractionDetails: { ...extractionDetails, regionName: region.name, x: region.x, y: region.y, width: region.width, height: region.height, scaling: "none" },
  });
}

function findEmbedded(index, characterId, extension) {
  const item = index.resources.find((candidate) => candidate.characterId === characterId && (!extension || candidate.extension === extension));
  if (!item) throw new Error(`Embedded character ${characterId}${extension ? ` (${extension})` : ""} not found`);
  return { ...item, absolutePath: path.join(extractionRoot, item.fileName) };
}

async function generate() {
  if (!fs.existsSync(sourceRoot) || !sourceRoot.toLowerCase().endsWith(".app")) throw new Error("Explicit source path must be an existing .app directory");
  if (write) ensureDirectories();
  const originalManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const originalAssets = structuredClone(originalManifest.assets.filter((asset) => Array.isArray(asset.usedBy) && asset.usedBy.length > 0));
  const mainSwf = sourcePath(mainSwfRelative);
  const mainSwfSha256 = fileHash(mainSwf);
  extractionRoot = write ? embeddedRoot : fs.mkdtempSync(path.join(os.tmpdir(), "ultimate-b2-ui-"));
  execFileSync("python", [path.join(repoRoot, "scripts/ultimate-b2/legacy-swf-static-extract.py"), mainSwf, "--output", extractionRoot, "--write"], { stdio: write ? "inherit" : "ignore" });
  const embeddedIndex = JSON.parse(fs.readFileSync(path.join(extractionRoot, "index.json"), "utf8"));
  const additions = [];

  for (const atlas of looseAtlases) {
    const xmlFile = sourcePath(atlas.xml); const imageFile = sourcePath(atlas.image); const parsed = parseAtlas(fs.readFileSync(xmlFile, "utf8"));
    for (const region of parsed.regions) {
      if (existingRegionIds.has(region.name)) continue;
      await addCrop({ manifestAssets: additions, group: atlas.key, sourceRelativePath: atlas.image, sourceSha256: fileHash(imageFile), imageFile, region,
        outputPath: `${atlas.folder}/${slug(region.name)}.png`, audience: atlas.audience,
        extractionDetails: { atlasMetadataPath: atlas.xml, atlasImagePath: atlas.image, atlasImageSha256: fileHash(imageFile) } });
    }
  }

  for (const atlas of embeddedAtlases) {
    const image = findEmbedded(embeddedIndex, atlas.imageId, ".png"); const xml = findEmbedded(embeddedIndex, atlas.xmlId, ".xml");
    const xmlText = fs.readFileSync(xml.absolutePath, xml.mediaType.includes("utf-16") ? "utf16le" : "utf8");
    const parsed = parseAtlas(xmlText);
    for (const region of parsed.regions) {
      await addCrop({ manifestAssets: additions, group: atlas.key, sourceRelativePath: mainSwfRelative, sourceSha256: mainSwfSha256,
        imageFile: image.absolutePath, region, outputPath: `${atlas.folder}/${slug(region.name)}.png`, audience: atlas.audience,
        extractionDetails: { container: "SWF DefineBitsJPEG2 PNG payload", characterId: atlas.imageId, symbol: image.symbol,
          atlasMetadataCharacterId: atlas.xmlId, atlasMetadataSymbol: xml.symbol, swfTagIndex: image.tagIndex, atlasImageSha256: image.sha256 } });
    }
  }

  for (const [characterId, outputPath, role, audience] of embeddedStandalone) {
    const source = findEmbedded(embeddedIndex, characterId, ".png"); const bytes = fs.readFileSync(source.absolutePath); const metadata = await sharp(bytes).metadata();
    const output = path.join(assetRoot, ...outputPath.split("/"));
    if (write) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.copyFileSync(source.absolutePath, output); }
    additions.push({ id: `embedded-${slug(path.basename(outputPath, ".png"))}`, category: outputPath.split("/").slice(0, -1).join("/"), sourceRelativePath: mainSwfRelative,
      outputPath, sha256: sha256(bytes), sourceSha256: mainSwfSha256, sizeBytes: bytes.length, width: metadata.width, height: metadata.height,
      hasAlpha: metadata.hasAlpha, format: "PNG", functionalRole: role, state: stateFromName(source.symbol), audience,
      intendedConsumer: "Forensic catalog; not imported at runtime", usedBy: [], evidence: `SWF SymbolClass ${source.symbol}, character ${characterId}, tag ${source.tagIndex}`,
      confidence: "high", sourceKind: "embedded-preview", extractionDetails: { container: "SWF DefineBitsJPEG2 PNG payload", characterId, symbol: source.symbol, swfTagIndex: source.tagIndex, extraction: "byte-exact embedded PNG payload" } });
  }

  const exButton2Source = "Contents/Resources/assets/books/book1/exButtons/exButton2.png";
  const exButtonBytes = fs.readFileSync(sourcePath(exButton2Source)); const exButtonMeta = await sharp(exButtonBytes).metadata();
  const exButtonOutput = "controls/hotspots/activity-hotspot-wide.png";
  if (write) { fs.mkdirSync(path.dirname(path.join(assetRoot, exButtonOutput)), { recursive: true }); fs.copyFileSync(sourcePath(exButton2Source), path.join(assetRoot, exButtonOutput)); }
  additions.push({ id: "activity-hotspot-wide", category: "controls/hotspots", sourceRelativePath: exButton2Source, outputPath: exButtonOutput,
    sha256: sha256(exButtonBytes), sourceSha256: sha256(exButtonBytes), sizeBytes: exButtonBytes.length, width: exButtonMeta.width, height: exButtonMeta.height,
    hasAlpha: exButtonMeta.hasAlpha, format: "PNG", functionalRole: "Alternate wide exercise hotspot", state: "normal", audience: "shared",
    intendedConsumer: "Forensic catalog; not imported at runtime", usedBy: [], evidence: "Standalone publisher file in book1/exButtons", confidence: "high", sourceKind: "copied",
    extractionDetails: { extraction: "byte-for-byte copy" } });

  const audioReview = [];
  for (const [sourceRelativePath, outputPath, role, audience, confidence] of standaloneAudio) {
    const bytes = fs.readFileSync(sourcePath(sourceRelativePath)); const metadata = mp3Metadata(bytes); const output = path.join(assetRoot, ...outputPath.split("/"));
    if (write) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.copyFileSync(sourcePath(sourceRelativePath), output); }
    additions.push({ id: `audio-${slug(outputPath.replace(/\.mp3$/i, ""))}`, category: outputPath.split("/").slice(0, -1).join("/"), sourceRelativePath, outputPath,
      sha256: sha256(bytes), sourceSha256: sha256(bytes), sizeBytes: bytes.length, ...metadata, functionalRole: role, state: "n/a", audience,
      intendedConsumer: "Forensic catalog; not wired to application behavior", usedBy: [], evidence: `Standalone non-content audio under ${posix(path.dirname(sourceRelativePath))}`,
      confidence, sourceKind: "copied", extractionDetails: { extraction: "byte-for-byte copy; no normalization, trimming, or transcoding" } });
    audioReview.push({ label: role, sourceRelativePath, durationSeconds: metadata.durationSeconds, classification: audience === "teacher" ? "interface / teacher toolbar label" : "interface or activity feedback", confidence, bytes });
  }

  for (const [characterId, outputPath, role, audience] of embeddedAudio) {
    const source = findEmbedded(embeddedIndex, characterId, ".mp3"); const bytes = fs.readFileSync(source.absolutePath); const metadata = mp3Metadata(bytes); const output = path.join(assetRoot, ...outputPath.split("/"));
    if (write) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.copyFileSync(source.absolutePath, output); }
    additions.push({ id: `embedded-audio-${slug(outputPath.replace(/\.mp3$/i, ""))}`, category: outputPath.split("/").slice(0, -1).join("/"), sourceRelativePath: mainSwfRelative,
      outputPath, sha256: sha256(bytes), sourceSha256: mainSwfSha256, sizeBytes: bytes.length, ...metadata, functionalRole: role, state: "n/a", audience,
      intendedConsumer: "Forensic catalog; not wired to application behavior", usedBy: [], evidence: `SWF DefineSound/SymbolClass ${source.symbol}, character ${characterId}`,
      confidence: "high", sourceKind: "embedded-preview", extractionDetails: { container: "SWF DefineSound MP3 payload", characterId, symbol: source.symbol,
        swfTagIndex: source.tagIndex, seekSamples: source.details.seekSamples, extraction: "MP3 frames copied byte-for-byte after the required two-byte SWF seek-sample field" } });
    audioReview.push({ label: role, sourceRelativePath: `${mainSwfRelative}#${source.symbol}`, durationSeconds: metadata.durationSeconds, classification: "interface / teacher", confidence: "high", bytes });
  }

  const originalByHash = new Map(originalAssets.map((asset) => [asset.sha256, asset]));
  const additionsByHash = Map.groupBy(additions, (asset) => asset.sha256);
  const canonicalAdditions = [];
  const assetAliases = [];
  for (const group of additionsByHash.values()) {
    const canonical = originalByHash.get(group[0].sha256)
      ?? [...group].sort((left, right) => left.id.length - right.id.length || left.id.localeCompare(right.id))[0];
    if (!originalByHash.has(group[0].sha256)) canonicalAdditions.push(canonical);
    for (const alias of group) {
      if (alias === canonical) continue;
      assetAliases.push({
        id: alias.id, canonicalAssetId: canonical.id, sha256: alias.sha256,
        sourceRelativePath: alias.sourceRelativePath, proposedOutputPath: alias.outputPath,
        functionalRole: alias.functionalRole, state: alias.state, audience: alias.audience,
        evidence: alias.evidence, confidence: alias.confidence, sourceKind: alias.sourceKind,
        extractionDetails: alias.extractionDetails,
        reason: "Exact byte duplicate; represented by the canonical tracked file instead of a second output",
      });
      if (write) fs.rmSync(path.join(assetRoot, ...alias.outputPath.split("/")), { force: true });
    }
  }
  const aliasesByCanonical = Map.groupBy(assetAliases, (alias) => alias.canonicalAssetId);
  for (const asset of canonicalAdditions) {
    const aliases = aliasesByCanonical.get(asset.id) ?? [];
    asset.duplicateStatus = aliases.length
      ? { type: "canonical-with-exact-aliases", matches: aliases.map((alias) => alias.id) }
      : { type: "unique-by-byte-hash", matches: [] };
    asset.nearDuplicateStatus = "Related HD/SD and visual-state families are documented by symbol name; no perceptual-equivalence claim is made.";
    asset.recommendedAction = aliases.length
      ? "Retain this one canonical file and resolve the listed legacy names through alias metadata."
      : "Retain as an exact review asset; evaluate runtime integration separately.";
  }

  const ids = new Set(originalAssets.map((asset) => asset.id)); const outputs = new Set(originalAssets.map((asset) => asset.outputPath));
  for (const asset of canonicalAdditions) {
    if (ids.has(asset.id)) throw new Error(`Duplicate manifest ID: ${asset.id}`);
    if (outputs.has(asset.outputPath)) throw new Error(`Duplicate manifest output: ${asset.outputPath}`);
    ids.add(asset.id); outputs.add(asset.outputPath);
  }
  const manifest = { ...originalManifest, schemaVersion: 2, schemaNotes: "Version 2 adds optional forensic provenance, state, audience, evidence, extraction details, and exact-alias metadata while preserving every version-1 entry and ID.", assets: [...originalAssets, ...canonicalAdditions], assetAliases };
  if (write) fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const allAssets = manifest.assets;
  const sourceFiles = new Set(["Contents/Info.plist", "Contents/Resources/META-INF/AIR/application.xml", mainSwfRelative,
    "Contents/Resources/assets/books/intro.xml", "Contents/Resources/assets/videos/intro.flv", exButton2Source,
    ...looseAtlases.flatMap((atlas) => [atlas.xml, atlas.image]), ...standaloneAudio.map(([source]) => source), ...originalAssets.map((asset) => asset.sourceRelativePath)]);
  const sources = [];
  for (const relative of [...sourceFiles].sort()) {
    const absolute = sourcePath(relative); const bytes = fs.readFileSync(absolute); const extension = path.extname(relative).toLowerCase();
    const item = { sourceRelativePath: relative, fileName: path.basename(relative), extension, sizeBytes: bytes.length, sha256: sha256(bytes) };
    if ([".png", ".jpg", ".jpeg"].includes(extension)) { const metadata = await sharp(bytes).metadata(); Object.assign(item, { format: metadata.format, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha, colorSpace: metadata.space }); }
    if (extension === ".mp3") Object.assign(item, { format: "MP3", ...mp3Metadata(bytes) });
    if (extension === ".flv") Object.assign(item, { format: "FLV", ...flvMetadata(bytes) });
    if (extension === ".swf") Object.assign(item, { format: "SWF", signature: bytes.toString("ascii", 0, 3), swfVersion: bytes[3], declaredUncompressedSizeBytes: bytes.readUInt32LE(4), frameRate: embeddedIndex.frameRate, frameCount: embeddedIndex.frameCount });
    sources.push(item);
  }

  const rejectedAliases = ["exit.mp3", "select.mp3"].map((fileName) => ({
    sourceRelativePath: `Contents/Resources/assets/books/sounds/${fileName}`, reason: "Byte-identical duplicate of books/sounds/button.mp3",
    sha256: fileHash(sourcePath(`Contents/Resources/assets/books/sounds/${fileName}`)), recommendedAction: "Do not duplicate; retain alias provenance in inventory",
  }));
  const introBytes = fs.readFileSync(sourcePath("Contents/Resources/assets/videos/intro.flv"));
  const forensic = {
    schemaVersion: 1, sourceBundle: "Ultimate English B2.app", method: "Read-only static inspection", generatedFromTrackedScript: "scripts/ultimate-b2/legacy-ui-catalog.mjs",
    summary: { focusedSourceFiles: sources.length, catalogAssets: allAssets.length, existingAssets: originalAssets.length, addedAssets: canonicalAdditions.length, exactAliases: assetAliases.length },
    existingAssetVerification: [], sources, candidates: canonicalAdditions, assetAliases, rejectedAliases,
    intro: { sourceRelativePath: "Contents/Resources/assets/videos/intro.flv", sha256: sha256(introBytes), ...flvMetadata(introBytes) },
  };

  for (const asset of originalAssets) {
    const tracked = fs.readFileSync(path.join(assetRoot, ...asset.outputPath.split("/")));
    let status = "verified exact"; let details = "Tracked bytes equal standalone publisher source";
    if (asset.sourceKind === "extracted") {
      const [x, y, width, height] = [...asset.conversionDetails.matchAll(/(?:x=|y=|, |x)(\d+)/g)].map((match) => Number(match[1]));
      const coordinates = asset.conversionDetails.match(/x=(\d+), y=(\d+), (\d+)x(\d+)/);
      if (!coordinates) throw new Error(`Could not parse existing crop: ${asset.id}`);
      const crop = await sharp(sourcePath(asset.sourceRelativePath)).extract({ left: Number(coordinates[1]), top: Number(coordinates[2]), width: Number(coordinates[3]), height: Number(coordinates[4]) }).raw().toBuffer();
      const decoded = await sharp(tracked).raw().toBuffer();
      status = crop.equals(decoded) ? "verified pixel-equivalent" : "provenance mismatch";
      details = "Decoded RGBA pixels compared with a fresh metadata-coordinate atlas crop";
    } else {
      const sourceBytes = fs.readFileSync(sourcePath(asset.sourceRelativePath));
      if (!sourceBytes.equals(tracked)) status = "provenance mismatch";
    }
    forensic.existingAssetVerification.push({ id: asset.id, outputPath: asset.outputPath, status, details });
  }

  if (write) {
    const inventoryDir = path.join(reviewRoot, "source-inventory"); fs.mkdirSync(inventoryDir, { recursive: true });
    fs.writeFileSync(path.join(inventoryDir, "focused-source-inventory.json"), `${JSON.stringify(forensic, null, 2)}\n`);
    fs.writeFileSync(path.join(docsRoot, "legacy-classroom-ui-inventory.json"), `${JSON.stringify({ ...forensic, sources: forensic.sources.map((item) => item), candidates: allAssets }, null, 2)}\n`);
    fs.writeFileSync(path.join(reviewRoot, "duplicate-reports/ui-audio-duplicates.json"), `${JSON.stringify({ rejectedAliases }, null, 2)}\n`);
    const introDir = path.join(reviewRoot, "intro-review"); fs.copyFileSync(sourcePath("Contents/Resources/assets/videos/intro.flv"), path.join(introDir, "intro.flv"));
    fs.writeFileSync(path.join(introDir, "metadata.json"), `${JSON.stringify(forensic.intro, null, 2)}\n`);

    const audioDir = path.join(reviewRoot, "audio-review/files"); fs.mkdirSync(audioDir, { recursive: true });
    const audioRows = [];
    for (let index = 0; index < audioReview.length; index += 1) {
      const item = audioReview[index]; const fileName = `${String(index + 1).padStart(2, "0")}-${slug(item.label)}.mp3`; fs.writeFileSync(path.join(audioDir, fileName), item.bytes);
      audioRows.push(`<tr><td>${xmlEscape(item.label)}</td><td><code>${xmlEscape(item.sourceRelativePath)}</code></td><td><audio controls preload="metadata" src="files/${fileName}"></audio></td><td>${item.durationSeconds.toFixed(3)} s</td><td>${xmlEscape(item.classification)}</td><td>${item.confidence}</td></tr>`);
    }
    fs.writeFileSync(path.join(reviewRoot, "audio-review/index.html"), `<!doctype html><meta charset="utf-8"><title>Ultimate B2 UI audio review</title><style>body{font:14px system-ui;margin:24px;color:#18222c}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd4dc;padding:8px;text-align:left;vertical-align:top}code{font-size:12px}audio{width:240px}</style><h1>Ultimate B2 UI audio review</h1><p>No audio autoplays. Educational narration/listening media is excluded.</p><table><thead><tr><th>Label</th><th>Original source</th><th>Play/pause</th><th>Duration</th><th>Classification</th><th>Confidence</th></tr></thead><tbody>${audioRows.join("")}</tbody></table>\n`);
    await createContactSheets(allAssets);
  }
  if (!write) fs.rmSync(extractionRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ mode: write ? "write" : "dry-run", existingAssets: originalAssets.length, addedAssets: canonicalAdditions.length, exactAliases: assetAliases.length, totalAssets: allAssets.length, sourceBundle: path.basename(sourceRoot) }, null, 2));
}

async function createContactSheets(assets) {
  const groups = new Map();
  for (const asset of assets.filter((item) => item.outputPath.endsWith(".png") && item.category !== "backgrounds")) {
    const group = asset.outputPath.includes("teacher-tools") ? "teacher-tools" : asset.outputPath.includes("media") ? "media" : asset.outputPath.includes("dialog") || asset.outputPath.includes("loading") ? "dialogs-status" : asset.outputPath.includes("activit") || asset.outputPath.includes("hotspot") ? "activities" : "navigation-controls";
    if (!groups.has(group)) groups.set(group, []); groups.get(group).push(asset);
  }
  for (const [group, items] of groups) {
    const columns = 4; const cellWidth = 330; const cellHeight = 150; const rows = Math.ceil(items.length / columns);
    const svg = [`<svg width="${columns * cellWidth}" height="${rows * cellHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#eef2f6"/>`];
    const composites = [];
    for (let index = 0; index < items.length; index += 1) {
      const asset = items[index]; const x = (index % columns) * cellWidth; const y = Math.floor(index / columns) * cellHeight;
      const source = path.join(assetRoot, ...asset.outputPath.split("/")); const metadata = await sharp(source).metadata();
      const scale = Math.min(1, 94 / metadata.width, 82 / metadata.height); const width = Math.max(1, Math.round(metadata.width * scale)); const height = Math.max(1, Math.round(metadata.height * scale));
      const image = await sharp(source).resize(width, height, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
      composites.push({ input: image, left: x + 12, top: y + 12 });
      const labelX = x + 118;
      svg.push(`<rect x="${x + 4}" y="${y + 4}" width="${cellWidth - 8}" height="${cellHeight - 8}" rx="8" fill="#fff" stroke="#b8c4cf"/><text x="${labelX}" y="${y + 30}" font-family="Arial" font-size="13" font-weight="700" fill="#17202a">${xmlEscape(asset.id)}</text><text x="${labelX}" y="${y + 51}" font-family="Arial" font-size="11" fill="#34495e">${asset.width}×${asset.height} · ${xmlEscape(asset.state || "normal")}</text><text x="${labelX}" y="${y + 70}" font-family="Arial" font-size="11" fill="#34495e">${xmlEscape(asset.audience || "teacher runtime baseline")}</text><text x="${labelX}" y="${y + 89}" font-family="Arial" font-size="10" fill="#566573">${xmlEscape(asset.extractionDetails?.regionName || path.basename(asset.sourceRelativePath))}</text>`);
    }
    svg.push("</svg>");
    const base = await sharp(Buffer.from(svg.join(""))).png().toBuffer();
    await sharp(base).composite(composites).png().toFile(path.join(docsRoot, "contact-sheets", `${group}.png`));
  }
}

await generate();
