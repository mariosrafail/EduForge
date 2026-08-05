import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { atomicWriteBytes, atomicWriteJson, atomicWriteText, readJsonFile } from "../../atomic-json-store.js";
import { isPathWithin } from "../../path-safety.js";
import { readSafeZipEntries } from "./safe-zip-gaf.js";
import { resolveSourceFile, sha256Bytes, sha256File } from "./source-files.js";

function htmlEscape(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function aggregateHash(entries) { const hash = createHash("sha256"); for (const item of [...entries].sort((a, b) => a.path.localeCompare(b.path))) hash.update(`${item.path}\0${item.sha256}\n`); return hash.digest("hex"); }

async function verifiedSourceBytes(sourceRoot, sourceRelativePath, expectedSha256) {
  const source = await resolveSourceFile(sourceRoot, sourceRelativePath); const actual = await sha256File(source.absolutePath);
  if (expectedSha256 && actual !== expectedSha256) throw new Error(`Source hash mismatch for ${sourceRelativePath}`);
  return { source, bytes: await fs.readFile(source.absolutePath), sha256: actual };
}

export async function materializeMenuReview({ projectDirectory }) {
  const projectRoot = await fs.realpath(path.resolve(projectDirectory));
  const binding = await readJsonFile(path.join(projectRoot, "local-source-binding.json"));
  const sourceRoot = await fs.realpath(binding.canonicalApplicationRealPath);
  const profileRoot = path.join(projectRoot, "profiles", "ultimate-air-v2");
  const cropPlan = await readJsonFile(path.join(profileRoot, "atlas-crop-plan.json"));
  const branding = await readJsonFile(path.join(profileRoot, "branding-model.json"));
  const menu = await readJsonFile(path.join(profileRoot, "menu-model.json"));
  const outputRoot = path.join(profileRoot, "review-assets", "menu");
  if (!isPathWithin(projectRoot, outputRoot) || isPathWithin(sourceRoot, outputRoot)) throw new Error("Menu materialization output is unsafe");
  await fs.mkdir(outputRoot, { recursive: true });
  const materialized = [];
  for (const crop of cropPlan.crops.filter((item) => item.outputRelativePath.startsWith("book-menu/")).sort((a, b) => a.outputRelativePath.localeCompare(b.outputRelativePath))) {
    const input = await verifiedSourceBytes(sourceRoot, crop.sourceAtlasPath, crop.sourceAtlasSha256);
    const bytes = await sharp(input.bytes).extract({ left: crop.bounds.x, top: crop.bounds.y, width: crop.bounds.width, height: crop.bounds.height }).png().toBuffer();
    const outputPath = path.join(outputRoot, ...crop.outputRelativePath.split("/"));
    await atomicWriteBytes(outputPath, bytes, { allowedRoot: outputRoot });
    materialized.push({ path: crop.outputRelativePath, sha256: sha256Bytes(bytes), byteSize: bytes.length, role: "menu_crop", regionName: crop.regionName, states: crop.proposedStates });
  }
  const brandingRoles = new Map([["publisher_logo", "branding/hamilton-house-logo.png"], ["home_background", "branding/home-background.png"], ["home_foreground", "branding/home-foreground.png"]]);
  for (const asset of branding.assets.filter((item) => brandingRoles.has(item.role)).sort((a, b) => a.role.localeCompare(b.role))) {
    const input = await verifiedSourceBytes(sourceRoot, asset.sourceRelativePath, asset.sha256); const relative = brandingRoles.get(asset.role);
    await atomicWriteBytes(path.join(outputRoot, ...relative.split("/")), input.bytes, { allowedRoot: outputRoot });
    materialized.push({ path: relative, sha256: input.sha256, byteSize: input.bytes.length, role: asset.role });
  }
  if (branding.archive) {
    const archive = await verifiedSourceBytes(sourceRoot, branding.archive.sourceRelativePath, branding.archive.sha256); const entries = readSafeZipEntries(archive.bytes);
    const expectedByPath = new Map(branding.archive.entries.map((item) => [item.path, item]));
    for (const entry of entries.values()) {
      const expected = expectedByPath.get(entry.path); const hash = sha256Bytes(entry.content);
      if (!expected || expected.sha256 !== hash) throw new Error(`Menu-title archive entry hash mismatch: ${entry.path}`);
      const relative = `branding/menu-title-animation/${path.posix.basename(entry.path)}`;
      await atomicWriteBytes(path.join(outputRoot, ...relative.split("/")), entry.content, { allowedRoot: outputRoot });
      materialized.push({ path: relative, sha256: hash, byteSize: entry.content.length, role: "menu_title_archive_entry", archiveEntryPath: entry.path });
    }
  }
  const reviewMetadata = { schemaVersion: "1.0", scope: "menu", profile: "ultimate-air-v2", menuButtonCount: menu.summary.buttonCount, files: materialized };
  const metadataPath = path.join(outputRoot, "review-metadata.json"); await atomicWriteJson(metadataPath, reviewMetadata, { allowedRoot: outputRoot });
  const metadataBytes = await fs.readFile(metadataPath); materialized.push({ path: "review-metadata.json", sha256: sha256Bytes(metadataBytes), byteSize: metadataBytes.length, role: "review_metadata" });
  const thumbnails = materialized.filter((item) => item.path.endsWith(".png") && item.role === "menu_crop").map((item) => `<figure><img src="${htmlEscape(item.path)}" alt="${htmlEscape(item.regionName)}"><figcaption>${htmlEscape(item.regionName)} — ${htmlEscape(item.states.join(" / "))}</figcaption></figure>`).join("\n");
  const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ultimate menu review</title><style>body{font-family:system-ui;margin:24px;background:#f5f7fa;color:#182230}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}figure{margin:0;padding:12px;background:white;border:1px solid #ccd3dc;border-radius:8px}img{display:block;max-width:100%;height:auto}figcaption{margin-top:8px;font-size:13px}</style></head><body><h1>Ultimate menu review</h1><p>Local review output only. No source content is executed.</p><main>${thumbnails}</main></body></html>\n`;
  const htmlPath = path.join(outputRoot, "menu-review.html"); await atomicWriteText(htmlPath, html, { allowedRoot: outputRoot }); const htmlBytes = Buffer.from(html, "utf8"); materialized.push({ path: "menu-review.html", sha256: sha256Bytes(htmlBytes), byteSize: htmlBytes.length, role: "review_html" });
  return { outputDirectory: outputRoot, materializedFileCount: materialized.length, aggregateHash: aggregateHash(materialized), reviewHtmlPath: htmlPath, files: materialized };
}
