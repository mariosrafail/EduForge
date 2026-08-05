import fs from "node:fs/promises";
import path from "node:path";
import { XMLValidator } from "fast-xml-parser";
import { elementsNamed } from "./iwb-codec.js";
import { booleanValue, finiteNumber, resolveSourceFile, sha256File } from "./source-files.js";
import { sourceStructureIdentity } from "./ultimate-structure.js";
import { createReviewItem } from "./ultimate-review.js";

const MIME = new Map([[".mp3", "audio/mpeg"], [".m4a", "audio/mp4"], [".wav", "audio/wav"], [".aac", "audio/aac"], [".mp4", "video/mp4"], [".flv", "video/x-flv"], [".mov", "video/quicktime"], [".m4v", "video/x-m4v"], [".srt", "application/x-subrip"]]);

function mediaType(extension) { return new Set([".mp3", ".m4a", ".wav", ".aac"]).has(extension) ? "audio" : extension === ".srt" ? "captions" : "video"; }

function safeVideoAttributes(attributes) {
  return { source: attributes.source || attributes.url || attributes.path || null, hasCaption: booleanValue(attributes.hasCaption), autoPlay: booleanValue(attributes.autoPlay), autoRewind: booleanValue(attributes.autoRewind), width: finiteNumber(attributes.videoWidth || attributes.width), height: finiteNumber(attributes.videoHeight || attributes.height), x: finiteNumber(attributes.videoX || attributes.x), y: finiteNumber(attributes.videoY || attributes.y) };
}

function videoElements(xml) {
  return [...xml.matchAll(/<video\b([^>]*)>([^<]*)<\/video\s*>|<video\b([^>]*)\/>/gi)].map((match) => {
    const tag = `<video ${match[1] || match[3] || ""}>`;
    const parsed = elementsNamed(tag, "video")[0];
    return { attributes: parsed?.attributes || {}, sourceText: String(match[2] || "").trim() || null };
  });
}

export async function buildMediaCandidates({ sourceRoot, inventoryEntries, concurrency = 8 }) {
  const mediaEntries = inventoryEntries.filter((entry) => MIME.has(entry.extension)).sort((a, b) => a.path.localeCompare(b.path));
  const candidates = new Array(mediaEntries.length); let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= mediaEntries.length) return;
      const entry = mediaEntries[index]; const identity = sourceStructureIdentity(entry.path);
      candidates[index] = { sourceRelativePath: entry.path, type: mediaType(entry.extension), mimeCandidate: MIME.get(entry.extension), byteSize: entry.byteSize, sha256: entry.sha256, owningStructureCandidate: identity ? { component: identity.component, unit: identity.unit, part: identity.part, object: identity.object } : null, conversionRequirement: entry.extension === ".flv" ? "browser_webview_conversion_required" : null, confidence: identity ? 0.9 : 0.6 };
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, mediaEntries.length)) }, () => worker()));
  const descriptors = [];
  for (const entry of inventoryEntries.filter((item) => path.posix.basename(item.path).toLowerCase() === "video.xml").sort((a, b) => a.path.localeCompare(b.path))) {
    const source = await resolveSourceFile(sourceRoot, entry.path); const xml = await fs.readFile(source.absolutePath, "utf8");
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml) || XMLValidator.validate(xml, { allowBooleanAttributes: false }) !== true) continue;
    const videos = videoElements(xml).map((item) => ({ ...safeVideoAttributes(item.attributes), source: safeVideoAttributes(item.attributes).source || item.sourceText }));
    descriptors.push({ sourceRelativePath: entry.path, sha256: entry.sha256 || await sha256File(source.absolutePath), videos });
  }
  const introDescriptorEntry = inventoryEntries.find((entry) => entry.path.toLowerCase() === "contents/resources/assets/books/intro.xml");
  let intro = null;
  if (introDescriptorEntry) {
    const source = await resolveSourceFile(sourceRoot, introDescriptorEntry.path); const xml = await fs.readFile(source.absolutePath, "utf8"); const video = videoElements(xml)[0];
    const reference = video?.attributes.source || video?.attributes.url || video?.attributes.path || video?.sourceText || null;
    const mediaEntry = reference ? inventoryEntries.find((entry) => entry.path.toLowerCase().endsWith(`/assets/videos/${path.posix.basename(reference).toLowerCase()}`)) : inventoryEntries.find((entry) => entry.path.toLowerCase() === "contents/resources/assets/videos/intro.flv");
    intro = { descriptorPath: introDescriptorEntry.path, descriptorSha256: introDescriptorEntry.sha256 || await sha256File(source.absolutePath), mediaPath: mediaEntry?.path || null, mediaSha256: mediaEntry?.sha256 || null, descriptor: video ? { ...safeVideoAttributes(video.attributes), source: reference } : null, distinctFromMenuTitle: true };
  }
  const reviewItems = [];
  const unownedCount = candidates.filter((item) => !item.owningStructureCandidate && !item.sourceRelativePath.toLowerCase().includes("/assets/videos/intro.")).length;
  if (unownedCount) reviewItems.push(createReviewItem({ category: "media", locator: "Contents/Resources/assets", reasonCode: "ambiguous_media_ownership", explanation: `${unownedCount} media files are not owned by a component/unit/part/object path.`, suggestedDecisionKind: "media_ownership", evidence: [{ count: unownedCount }] }));
  return { artifact: { schemaVersion: "1.0", parserId: "ultimate-air-v2-media", parserVersion: "1.0", summary: { candidateCount: candidates.length, audioFileCount: candidates.filter((item) => item.type === "audio").length, videoFileCount: candidates.filter((item) => item.type === "video").length, captionFileCount: candidates.filter((item) => item.type === "captions").length, videoDescriptorCount: descriptors.length, videoElementCount: descriptors.reduce((sum, item) => sum + item.videos.length, 0) }, intro, descriptors, candidates }, reviewItems };
}
