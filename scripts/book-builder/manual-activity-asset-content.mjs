import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { assertNoSymlinkPath, isPathWithin } from "../../lib/book-builder/path-safety.js";
import { MAXIMUM_PREVIEW_BYTES, ReviewStudioError } from "./review-studio-security.mjs";

const CONTENT_TYPES = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"],
  [".mp3", "audio/mpeg"], [".m4a", "audio/mp4"], [".aac", "audio/aac"], [".mp4", "video/mp4"],
]);
const MEDIA_ROLES = new Map([["audio", "audio"], ["video", "video"]]);
const digestCache = new Map();

function safeRelativePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return normalized;
}

async function sourceRootForProject(projectDirectory) {
  const bindingPath = path.join(projectDirectory, "local-source-binding.json");
  await assertNoSymlinkPath(projectDirectory, bindingPath);
  const info = await fs.lstat(bindingPath).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) throw new ReviewStudioError("manual_asset_not_available", 404);
  let binding;
  try { binding = JSON.parse(await fs.readFile(bindingPath, "utf8")); } catch { throw new ReviewStudioError("manual_asset_not_available", 404); }
  const sourceRoot = path.resolve(String(binding.canonicalApplicationRealPath || ""));
  const sourceInfo = await fs.lstat(sourceRoot).catch(() => null);
  if (!sourceInfo?.isDirectory() || sourceInfo.isSymbolicLink()) throw new ReviewStudioError("manual_asset_not_available", 404);
  return fs.realpath(sourceRoot);
}

async function verifiedSourceTarget(realRoot, sourceRelativeIdentity) {
  const relative = safeRelativePath(sourceRelativeIdentity);
  if (!relative) throw new ReviewStudioError("manual_asset_not_available", 404);
  const target = path.resolve(realRoot, ...relative.split("/"));
  if (!isPathWithin(realRoot, target)) throw new ReviewStudioError("manual_asset_not_available", 404);
  await assertNoSymlinkPath(realRoot, target);
  const info = await fs.lstat(target).catch(() => null);
  const contentType = CONTENT_TYPES.get(path.extname(target).toLowerCase());
  if (!info?.isFile() || info.isSymbolicLink() || !contentType || info.size > MAXIMUM_PREVIEW_BYTES) throw new ReviewStudioError("manual_asset_not_available", 404);
  return { target, info, contentType, relative };
}

async function currentDigest(target, info) {
  const key = `${target}\0${info.size}\0${info.mtimeMs}`;
  let pending = digestCache.get(key);
  if (!pending) { pending = fs.readFile(target).then((buffer) => createHash("sha256").update(buffer).digest("hex")); digestCache.set(key, pending); }
  return pending;
}

export async function resolveManualActivityMediaAssets(projectDirectory, media, { maximumPerType = 8 } = {}) {
  const realRoot = await sourceRootForProject(projectDirectory); const selected = new Map(); const output = [];
  const candidates = (Array.isArray(media?.candidates) ? media.candidates : []).filter((candidate) => MEDIA_ROLES.has(candidate.type) && safeRelativePath(candidate.sourceRelativePath) && Number(candidate.byteSize) <= MAXIMUM_PREVIEW_BYTES).sort((a, b) => Number(!a.owningStructureCandidate) - Number(!b.owningStructureCandidate) || Number(a.byteSize) - Number(b.byteSize) || String(a.sourceRelativePath).localeCompare(String(b.sourceRelativePath)));
  for (const candidate of candidates) {
    const role = MEDIA_ROLES.get(candidate.type); const count = selected.get(role) || 0; if (count >= maximumPerType) continue;
    try {
      const resolved = await verifiedSourceTarget(realRoot, candidate.sourceRelativePath);
      const expectedMime = candidate.mimeCandidate || resolved.contentType;
      if (resolved.contentType !== expectedMime) continue;
      output.push({ sourceRelativePath: resolved.relative, sha256: await currentDigest(resolved.target, resolved.info), mimeType: resolved.contentType, role, sourceKind: "verified_detected_media" });
      selected.set(role, count + 1);
    } catch (error) { if (!(error instanceof ReviewStudioError)) throw error; }
  }
  return output;
}

export async function readManualActivityAssetContent(projectDirectory, asset) {
  const realRoot = await sourceRootForProject(projectDirectory);
  const { target, contentType } = await verifiedSourceTarget(realRoot, asset.sourceRelativeIdentity);
  const buffer = await fs.readFile(target);
  if (createHash("sha256").update(buffer).digest("hex") !== asset.digest) throw new ReviewStudioError("manual_asset_changed", 409);
  return { buffer, contentType };
}
