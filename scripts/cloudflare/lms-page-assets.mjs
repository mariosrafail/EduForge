import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import manifest from "../../src/data/ultimate-b2/generated/students-book-page-assets.json" with { type: "json" };
import { inspectManagedRaster } from "../../lib/book-assets/raster-inspection.js";
import { lmsCanonicalPageAssetPath } from "../../shared/lmsCanonicalPages.js";

export async function verifyCanonicalPageBytes(bytes, page) {
  const actual = await inspectManagedRaster(bytes);
  for (const key of ["checksumSha256", "byteSize", "mimeType", "width", "height"]) assert.equal(actual[key], page[key], `${page.pageId}: ${key}`);
  return bytes;
}

export async function emitLmsPageAssets(root) {
  for (const page of manifest.pages) {
    const bytes = await verifyCanonicalPageBytes(await readFile(path.resolve(page.repositoryPath)), page);
    const target = path.resolve(root, `.${lmsCanonicalPageAssetPath(page)}`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}

export async function verifyLmsPageAssets(root) {
  for (const page of manifest.pages) await verifyCanonicalPageBytes(await readFile(path.resolve(root, `.${lmsCanonicalPageAssetPath(page)}`)), page);
  return manifest.pages.length;
}
