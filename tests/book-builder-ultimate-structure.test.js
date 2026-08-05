import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { materializeMenuReview } from "../lib/book-builder/profiles/ultimate-air-v2/menu-materializer.js";
import { buildAtlasInventoryAndCropPlan } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-atlases.js";
import { buildHotspotCandidates } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-hotspots.js";
import { buildMediaCandidates } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-media.js";
import { buildMenuAndBranding } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-menu.js";
import { buildPageCandidates } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-pages.js";
import { createReviewItem, createReviewQueue } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-review.js";
import { buildUltimateStructure } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-structure.js";
import { parseGafSummary, readSafeZipEntries } from "../lib/book-builder/profiles/ultimate-air-v2/safe-zip-gaf.js";

const roots = [];
test.after(async () => Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true }))));

async function temporaryRoot() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-ultimate-structure-")); roots.push(root); return root; }
async function write(root, relative, bytes) { const target = path.join(root, ...relative.split("/")); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes); return target; }
function entry(sourcePath, byteSize = 1, extension = path.posix.extname(sourcePath).toLowerCase()) { return { path: sourcePath, byteSize, extension, sha256: null }; }

function u16(value) { const bytes = Buffer.alloc(2); bytes.writeUInt16LE(value); return bytes; }
function i16(value) { const bytes = Buffer.alloc(2); bytes.writeInt16LE(value); return bytes; }
function u32(value) { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; }
function i32(value) { const bytes = Buffer.alloc(4); bytes.writeInt32LE(value); return bytes; }
function f32(value) { const bytes = Buffer.alloc(4); bytes.writeFloatLE(value); return bytes; }
function utf(value) { const bytes = Buffer.from(value); return Buffer.concat([u16(bytes.length), bytes]); }
function tag(code, payload) { return Buffer.concat([i16(code), u32(payload.length), payload]); }

function fictionalGaf() {
  const stage = tag(9, Buffer.concat([Buffer.from([24]), i32(-1), u16(1024), u16(768)]));
  const timelineHeader = Buffer.concat([u32(0), u32(2), f32(1), f32(2), f32(30), f32(40), f32(-1), f32(-2), Buffer.from([1]), utf("rootTimeline")]);
  const objects = tag(10, Buffer.concat([u32(1), u32(7), u32(9), u16(0)]));
  const sequences = tag(6, Buffer.concat([u32(1), utf("Fictional"), i16(1), i16(2)]));
  const records = tag(12, u32(2));
  const timeline = tag(13, Buffer.concat([timelineHeader, objects, sequences, records, tag(0, Buffer.alloc(0))]));
  const payload = Buffer.concat([u32(0), u32(0), stage, timeline]);
  const header = Buffer.alloc(10); header.writeUInt32LE(0x00474146, 0); header.writeInt8(5, 4); header.writeInt8(8, 5); header.writeUInt32LE(payload.length, 6);
  return Buffer.concat([header, payload]);
}

function storedZip(entries) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, contentValue] of entries) {
    const nameBytes = Buffer.from(name); const content = Buffer.from(contentValue);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(0, 14); local.writeUInt32LE(content.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, content);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(0, 16); central.writeUInt32LE(content.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes); offset += local.length + nameBytes.length + content.length;
  }
  const centralBytes = Buffer.concat(centrals); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

test("safe ZIP and GAF parsers reject unsafe archives and summarize a static timeline", () => {
  const gaf = fictionalGaf(); const archive = storedZip([["logo/logo.gaf", gaf], ["logo/atlas.png", Buffer.from("fictional")]]);
  const entries = readSafeZipEntries(archive);
  assert.deepEqual([...entries.keys()], ["logo/atlas.png", "logo/logo.gaf"]);
  const summary = parseGafSummary(entries.get("logo/logo.gaf").content);
  assert.equal(summary.version, "5.8"); assert.equal(summary.stage.width, 1024); assert.equal(summary.timeline.frames, 2); assert.equal(summary.timeline.objects.count, 1); assert.equal(summary.timeline.frameRecords, 2);
  assert.throws(() => readSafeZipEntries(storedZip([["../escape.txt", "x"]])), /Unsafe ZIP/);
  assert.throws(() => readSafeZipEntries(storedZip([["same.txt", "x"], ["SAME.txt", "y"]])), /Duplicate/);
  assert.throws(() => parseGafSummary(Buffer.from("short")), /Truncated/);
});

test("pages, structure, and hotspots remain deterministic unapproved candidates", async () => {
  const root = await temporaryRoot(); const pngHd = await sharp({ create: { width: 200, height: 100, channels: 4, background: "#336699" } }).png().toBuffer(); const pngSd = await sharp({ create: { width: 100, height: 50, channels: 4, background: "#336699" } }).png().toBuffer();
  const hd = "Contents/Resources/assets/books/book1/unit/1/parts/HD/parts_part_1.png"; const sd = "Contents/Resources/assets/books/book1/unit/1/parts/SD/parts_part_1.png";
  await write(root, hd, pngHd); await write(root, sd, pngSd);
  const partMetadata = "Contents/Resources/assets/books/book1/unit/1/part1/part_params.iwb"; const unitMetadata = "Contents/Resources/assets/books/book1/unit/1/unit_params.iwb";
  const inventory = [entry(hd, pngHd.length, ".png"), entry(sd, pngSd.length, ".png"), entry(partMetadata), entry(unitMetadata), entry("Contents/Resources/assets/books/book1/unit/1/part1/obj1/obj_params.iwb"), entry("Contents/Resources/assets/books/book1/unit/1/part1/obj2/obj_params.iwb")];
  const documents = new Map([[unitMetadata, '<params><menuButton url="part1" label="12"/></params>'], [partMetadata, '<params><button x="10" y="10" width="20" height="20"/><button x="40" y="10" width="20" height="20"/><quad x="1" y="2" width="3" height="4"/></params>']]);
  const pages = await buildPageCandidates({ sourceRoot: root, inventoryEntries: inventory, internalDocuments: documents });
  const structure = buildUltimateStructure({ inventoryEntries: inventory, internalDocuments: documents, pageCandidates: pages.artifact });
  const hotspots = buildHotspotCandidates({ inventoryEntries: inventory, internalDocuments: documents, structure, pageCandidates: pages.artifact });
  assert.deepEqual(pages.artifact.summary, { pageImageFileCount: 2, distinctSpreadCount: 1, hdCount: 1, sdCount: 1, specialCount: 0 });
  assert.equal(pages.artifact.spreads[0].printedPageCandidate.numericCandidate, 12);
  assert.equal(structure.summary.componentCount, 1); assert.equal(structure.components[0].approvalStatus, "unapproved");
  assert.equal(hotspots.artifact.summary.exactCardinalityCount, 1); assert.equal(hotspots.artifact.summary.mismatchCount, 0); assert.equal(hotspots.artifact.parts[0].hotspots[0].reviewStatus, "unapproved");
});

test("menu branding uses metadata-declared standalone GAF and remains separate from intro", async () => {
  const root = await temporaryRoot(); const archivePath = "Contents/Resources/assets/home/common/logo_1.zip"; const archive = storedZip([["logo/logo.gaf", fictionalGaf()]]); await write(root, archivePath, archive);
  const home = "Contents/Resources/assets/home/common/home_params.iwb"; const menu = "Contents/Resources/assets/books/book1/book_menu/common/book1_params.iwb";
  const documents = new Map([[home, '<params><movieClip name="logo" textures="logo_1" x="3" y="-70" fps="24"/></params>'], [menu, '<params><menuButton name="section_1" url="section_1" textureNames="one_a,one_b,one_b" x="1" y="2" width="3" height="4"/></params>']]);
  const result = await buildMenuAndBranding({ sourceRoot: root, inventoryEntries: [entry(archivePath, archive.length, ".zip")], internalDocuments: documents });
  assert.equal(result.menu.summary.buttonCount, 1); assert.deepEqual(result.menu.buttons[0].textureTriple, ["one_a", "one_b", "one_b"]); assert.equal(result.branding.menuTitleKind, "standalone_gaf_timeline"); assert.equal(result.branding.startupIntroIsSeparate, true); assert.equal(result.gaf.timeline.frames, 2);
});

test("media mapping distinguishes intro and does not convert source files", async () => {
  const root = await temporaryRoot(); const introXml = '<videos><video autoPlay="true" videoWidth="1024" videoHeight="768">../assets/videos/intro.flv</video></videos>'; const videoXml = '<videos><video hasCaption="true">clip.flv</video></videos>';
  const introDescriptor = "Contents/Resources/assets/books/intro.xml"; const introMedia = "Contents/Resources/assets/videos/intro.flv"; const descriptor = "Contents/Resources/assets/books/book1/unit/1/part1/obj1/video.xml"; const clip = "Contents/Resources/assets/books/book1/unit/1/part1/obj1/clip.flv"; const audio = "Contents/Resources/assets/books/book1/unit/1/part1/obj1/audio.mp3";
  await write(root, introDescriptor, introXml); await write(root, introMedia, "video"); await write(root, descriptor, videoXml); await write(root, clip, "video"); await write(root, audio, "audio");
  const inventory = [entry(introDescriptor, introXml.length, ".xml"), entry(introMedia, 5, ".flv"), entry(descriptor, videoXml.length, ".xml"), entry(clip, 5, ".flv"), entry(audio, 5, ".mp3")];
  const result = await buildMediaCandidates({ sourceRoot: root, inventoryEntries: inventory });
  assert.equal(result.artifact.summary.audioFileCount, 1); assert.equal(result.artifact.summary.videoFileCount, 2); assert.equal(result.artifact.summary.videoDescriptorCount, 1); assert.equal(result.artifact.intro.mediaPath, introMedia); assert.equal(result.artifact.intro.distinctFromMenuTitle, true); assert.equal(result.artifact.candidates.find((item) => item.sourceRelativePath === introMedia).conversionRequirement, "browser_webview_conversion_required");
});

test("review queue IDs and ordering are stable and never imply approval", () => {
  const item = createReviewItem({ category: "page", locator: "Contents/Resources/page.png", reasonCode: "uncertain_printed_page_number", explanation: "Needs review" });
  const again = createReviewItem({ category: "page", locator: "Contents/Resources/page.png", reasonCode: "uncertain_printed_page_number", explanation: "Needs review" });
  assert.equal(item.id, again.id); assert.equal(item.status, "open"); assert.deepEqual(createReviewQueue([item]), createReviewQueue([again]));
});

test("atlas validation emits a crop for every region and menu materialization is repeatable", async () => {
  const root = await temporaryRoot(); const source = path.join(root, "Fictional.app"); const workspace = path.join(root, "workspace", "projects", "fixture");
  const atlasPath = "Contents/Resources/assets/books/book1/book_menu/HD/book_atlas.png"; const metadataPath = "Contents/Resources/assets/books/book1/book_menu/HD/book_atlas.xml";
  const png = await sharp({ create: { width: 40, height: 20, channels: 4, background: "#557799" } }).png().toBuffer();
  const xml = '<TextureAtlas imagePath="book_atlas.png" width="40" height="20"><SubTexture name="one_a" x="0" y="0" width="20" height="20"/><SubTexture name="one_b" x="20" y="0" width="20" height="20"/></TextureAtlas>';
  await write(source, atlasPath, png); await write(source, metadataPath, xml);
  const menu = { buttons: [{ name: "section_1", textureTriple: ["one_a", "one_b", "one_b"], proposedDestination: { kind: "unit", unit: 1 } }], summary: { buttonCount: 1 } };
  const result = await buildAtlasInventoryAndCropPlan({ sourceRoot: source, inventoryEntries: [entry(atlasPath, png.length, ".png"), entry(metadataPath, xml.length, ".xml")], menu });
  assert.deepEqual(result.atlasArtifact.summary, { familyCount: 1, regionCount: 2, invalidFamilyCount: 0 });
  assert.equal(result.cropPlan.summary.cropCount, 2); assert.equal(result.cropPlan.summary.materializableMenuCropCount, 2); assert.equal(result.reviewItems.length, 0);
  await fs.mkdir(path.join(workspace, "profiles", "ultimate-air-v2"), { recursive: true });
  await fs.writeFile(path.join(workspace, "local-source-binding.json"), JSON.stringify({ canonicalApplicationRealPath: source }));
  await fs.writeFile(path.join(workspace, "profiles", "ultimate-air-v2", "atlas-crop-plan.json"), JSON.stringify(result.cropPlan));
  await fs.writeFile(path.join(workspace, "profiles", "ultimate-air-v2", "branding-model.json"), JSON.stringify({ assets: [], archive: null }));
  await fs.writeFile(path.join(workspace, "profiles", "ultimate-air-v2", "menu-model.json"), JSON.stringify(menu));
  const first = await materializeMenuReview({ projectDirectory: workspace }); const second = await materializeMenuReview({ projectDirectory: workspace });
  assert.equal(first.aggregateHash, second.aggregateHash); assert.equal(first.materializedFileCount, 4); assert.equal(first.reviewHtmlPath.startsWith(workspace), true);
  const crop = await fs.readFile(path.join(first.outputDirectory, "book-menu", "units", "unit-01-normal.png")); const metadata = await sharp(crop).metadata(); assert.deepEqual([metadata.width, metadata.height], [20, 20]);
});

test("atlas validation reports missing images, duplicate names, and overflow without guessing", async () => {
  const root = await temporaryRoot(); const metadataPath = "Contents/Resources/assets/books/book1/book_menu/HD/book_atlas.xml";
  const missingXml = '<TextureAtlas imagePath="missing.png"><SubTexture name="one" x="0" y="0" width="1" height="1"/></TextureAtlas>'; await write(root, metadataPath, missingXml);
  const missing = await buildAtlasInventoryAndCropPlan({ sourceRoot: root, inventoryEntries: [entry(metadataPath, missingXml.length, ".xml")], menu: { buttons: [] } });
  assert.equal(missing.reviewItems[0].reasonCode, "atlas_metadata_image_mismatch");
  const imagePath = path.posix.join(path.posix.dirname(metadataPath), "atlas.png"); const png = await sharp({ create: { width: 10, height: 10, channels: 4, background: "#000" } }).png().toBuffer(); await write(root, imagePath, png);
  const badXml = '<TextureAtlas imagePath="atlas.png" width="10" height="10"><SubTexture name="same" x="0" y="0" width="5" height="5"/><SubTexture name="same" x="1" y="1" width="5" height="5"/><SubTexture name="overflow" x="8" y="8" width="5" height="5"/></TextureAtlas>'; await write(root, metadataPath, badXml);
  const bad = await buildAtlasInventoryAndCropPlan({ sourceRoot: root, inventoryEntries: [entry(metadataPath, badXml.length, ".xml"), entry(imagePath, png.length, ".png")], menu: { buttons: [] } });
  assert.equal(bad.reviewItems.some((item) => item.reasonCode === "duplicate_atlas_region"), true);
  assert.equal(bad.reviewItems.some((item) => item.reasonCode === "invalid_atlas_bounds"), true);
});
