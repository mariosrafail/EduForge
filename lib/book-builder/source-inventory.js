import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { portablePath } from "./path-safety.js";
import { stableHash } from "./stable-json.js";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const audioExtensions = new Set([".mp3", ".m4a", ".wav", ".aac"]);
const videoExtensions = new Set([".mp4", ".flv", ".mov", ".m4v"]);
const structuredExtensions = new Set([".xml", ".json", ".txt", ".csv", ".iwb"]);
const nativeExtensions = new Set([".exe", ".dll", ".dylib", ".so", ".bat", ".cmd"]);

function categoryFor(relativePath, extension, mainSwfRelativePath) {
  const lower = relativePath.toLowerCase();
  const filename = path.posix.basename(lower);
  if (lower === "contents/resources/meta-inf/air/application.xml") return "descriptor";
  if (mainSwfRelativePath && lower === mainSwfRelativePath.toLowerCase()) return "main_swf";
  if (lower.startsWith("contents/frameworks/") || lower.includes("adobe air.framework/") || lower.startsWith("contents/resources/meta-inf/air/extensions/")) return "framework";
  if (lower.startsWith("contents/_codesignature/") || lower.includes("/_codesignature/")) return "framework";
  if (lower.startsWith("contents/macos/") || nativeExtensions.has(extension)) return "native_executable";
  if (extension === ".iwb") return "iwb_metadata";
  if (extension === ".gaf" || (extension === ".zip" && /(?:logo|animation|team)_?\d*\.zip$/.test(filename))) return "gaf_package";
  if ((extension === ".xml" || extension === ".json") && /(?:atlas|buttons?|section|audioplayer|navbar|topbar)/.test(filename)) return "atlas_metadata";
  if (imageExtensions.has(extension) && /(?:atlas|buttons?|section)/.test(filename)) return "atlas_image";
  if (imageExtensions.has(extension) && /\/parts\/(?:hd\/|sd\/)?parts_part_?\d+\./.test(lower)) return "page_candidate";
  if (audioExtensions.has(extension)) return "audio";
  if (videoExtensions.has(extension)) return "video";
  if (imageExtensions.has(extension)) return "image";
  if (structuredExtensions.has(extension)) return "structured_metadata";
  return "unknown";
}

function safetyFor(relativePath, category) {
  const lower = relativePath.toLowerCase();
  if (category === "framework") return "framework";
  if (category === "native_executable") return lower.includes("autoplay") || lower.includes("setup") ? "installer_wrapper" : "native_binary";
  if (/\.(?:lproj)\//.test(lower)) return "language_resource";
  if (category === "descriptor" || category === "main_swf" || lower.startsWith("contents/resources/assets/")) return "publisher_resource";
  if (lower.startsWith("contents/")) return "application_runtime";
  return "publisher_resource";
}

function roleFor(relativePath, category) {
  const lower = relativePath.toLowerCase();
  if (category === "page_candidate") return "page_image";
  if (/\/book_menu\//.test(lower)) return "book_menu";
  if (/\/home\//.test(lower)) return "home";
  if (/\/topbar\//.test(lower)) return "topbar";
  if (/\/navbar\//.test(lower)) return "navbar";
  if (/\/part\d+\/obj\d+\//.test(lower)) return "activity_object";
  if (category === "audio" || category === "video") return "media";
  return null;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

export async function buildSourceInventory(root, {
  mainSwfRelativePath = null,
  concurrency = 8,
  maxFiles = 50_000,
  metadataHashLimitBytes = 512 * 1024,
  signal,
  onProgress,
} = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32) throw new Error("Inventory concurrency must be between 1 and 32");
  const realRoot = await fsp.realpath(root);
  const pendingDirectories = [realRoot];
  const files = [];
  const diagnostics = [];
  while (pendingDirectories.length) {
    if (signal?.aborted) throw new Error("Source inventory was cancelled");
    const directory = pendingDirectories.pop();
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = portablePath(path.relative(realRoot, absolutePath));
      if (entry.isSymbolicLink()) diagnostics.push({ code: "symlink_skipped", path: relativePath });
      else if (entry.isDirectory()) pendingDirectories.push(absolutePath);
      else if (entry.isFile()) {
        if (files.length >= maxFiles) throw new Error(`Source inventory exceeded the ${maxFiles} file safety limit`);
        files.push({ absolutePath, relativePath });
      }
    }
  }
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const inventoryEntries = new Array(files.length);
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= files.length) return;
      if (signal?.aborted) throw new Error("Source inventory was cancelled");
      const file = files[index];
      const stat = await fsp.stat(file.absolutePath);
      const extension = path.posix.extname(file.relativePath).toLowerCase();
      const category = categoryFor(file.relativePath, extension, mainSwfRelativePath);
      const mustHash = category === "descriptor" || category === "main_swf";
      const smallStructured = structuredExtensions.has(extension) && stat.size <= metadataHashLimitBytes;
      const calculated = mustHash || smallStructured;
      inventoryEntries[index] = {
        path: file.relativePath,
        filename: path.posix.basename(file.relativePath),
        extension: extension || "[none]",
        byteSize: stat.size,
        category,
        safetyCategory: safetyFor(file.relativePath, category),
        hashState: calculated ? "calculated" : "deferred",
        sha256: calculated ? await sha256File(file.absolutePath) : null,
        candidateRole: roleFor(file.relativePath, category),
      };
      completed += 1;
      if (onProgress && (completed === files.length || completed % 100 === 0)) onProgress({ completed, total: files.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(files.length, 1)) }, () => worker()));
  const categoryCounts = {};
  const extensionCounts = {};
  let totalBytes = 0;
  let publisherFileCount = 0;
  let publisherBytes = 0;
  let deferredHashCount = 0;
  for (const entry of inventoryEntries) {
    categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
    extensionCounts[entry.extension] = (extensionCounts[entry.extension] || 0) + 1;
    totalBytes += entry.byteSize;
    if (entry.safetyCategory === "publisher_resource") { publisherFileCount += 1; publisherBytes += entry.byteSize; }
    if (entry.hashState === "deferred") deferredHashCount += 1;
  }
  const summary = {
    fileCount: inventoryEntries.length,
    totalBytes,
    publisherFileCount,
    publisherBytes,
    deferredHashCount,
    categoryCounts: Object.fromEntries(Object.entries(categoryCounts).sort()),
    extensionCounts: Object.fromEntries(Object.entries(extensionCounts).sort()),
  };
  return {
    schemaVersion: "1.0",
    entries: inventoryEntries,
    summary,
    diagnostics: diagnostics.sort((left, right) => left.path.localeCompare(right.path)),
    structuralDigest: stableHash(inventoryEntries.map(({ path: sourcePath, byteSize, hashState, sha256 }) => ({ path: sourcePath.toLowerCase(), byteSize, hashState, sha256 }))),
  };
}
