import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { assertNoSymlinkPath, isPathWithin } from "../../lib/book-builder/path-safety.js";
import { MAXIMUM_PREVIEW_BYTES, ReviewStudioError } from "./review-studio-security.mjs";

const CONTENT_TYPES = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"],
  [".mp3", "audio/mpeg"], [".m4a", "audio/mp4"], [".aac", "audio/aac"], [".mp4", "video/mp4"],
]);

export async function readManualActivityAssetContent(projectDirectory, asset) {
  const bindingPath = path.join(projectDirectory, "local-source-binding.json");
  await assertNoSymlinkPath(projectDirectory, bindingPath);
  const info = await fs.lstat(bindingPath).catch(() => null);
  if (!info?.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) throw new ReviewStudioError("manual_asset_not_available", 404);
  let binding;
  try { binding = JSON.parse(await fs.readFile(bindingPath, "utf8")); } catch { throw new ReviewStudioError("manual_asset_not_available", 404); }
  const sourceRoot = path.resolve(String(binding.canonicalApplicationRealPath || ""));
  const sourceInfo = await fs.lstat(sourceRoot).catch(() => null);
  if (!sourceInfo?.isDirectory() || sourceInfo.isSymbolicLink()) throw new ReviewStudioError("manual_asset_not_available", 404);
  const realRoot = await fs.realpath(sourceRoot);
  const target = path.resolve(realRoot, ...asset.sourceRelativeIdentity.split("/"));
  if (!isPathWithin(realRoot, target)) throw new ReviewStudioError("manual_asset_not_available", 404);
  await assertNoSymlinkPath(realRoot, target);
  const targetInfo = await fs.lstat(target).catch(() => null);
  const contentType = CONTENT_TYPES.get(path.extname(target).toLowerCase());
  if (!targetInfo?.isFile() || targetInfo.isSymbolicLink() || !contentType || targetInfo.size > MAXIMUM_PREVIEW_BYTES) throw new ReviewStudioError("manual_asset_not_available", 404);
  const buffer = await fs.readFile(target);
  if (createHash("sha256").update(buffer).digest("hex") !== asset.digest) throw new ReviewStudioError("manual_asset_changed", 409);
  return { buffer, contentType };
}
