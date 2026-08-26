import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { inspectManagedRaster } from "../../lib/book-assets/raster-inspection.js";

const runtimePath = path.resolve("src/data/ultimate-b2/generated/students-book.runtime.json");
const outputPath = path.resolve("src/data/ultimate-b2/generated/students-book-page-assets.json");
const checkOnly = process.argv.includes("--check");

const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
const pageIds = new Set();
const logicalIdentities = new Set();
const unitOrder = new Set();
const pages = [];

for (const unit of runtime.units || []) {
  for (const page of unit.pages || []) {
    assert.ok(!pageIds.has(page.id), `Duplicate Students Book page id: ${page.id}`);
    assert.ok(!logicalIdentities.has(page.pageImage.identity), `Duplicate Students Book page image identity: ${page.pageImage.identity}`);
    const orderIdentity = `${unit.number}:${page.navigationOrder}`;
    assert.ok(!unitOrder.has(orderIdentity), `Duplicate Students Book page order: ${orderIdentity}`);
    pageIds.add(page.id);
    logicalIdentities.add(page.pageImage.identity);
    unitOrder.add(orderIdentity);

    const sourcePath = path.resolve(page.pageImage.localHdAssetPath);
    const bytes = await readFile(sourcePath);
    const inspected = await inspectManagedRaster(bytes);
    pages.push({
      pageId: page.id,
      logicalIdentity: page.pageImage.identity,
      unitNumber: Number(unit.number),
      navigationOrder: Number(page.navigationOrder),
      repositoryPath: page.pageImage.localHdAssetPath.replaceAll("\\", "/"),
      originalFilename: path.basename(sourcePath),
      mimeType: inspected.mimeType,
      byteSize: inspected.byteSize,
      checksumSha256: inspected.checksumSha256,
      width: inspected.width,
      height: inspected.height,
    });
  }
}

const document = {
  schemaVersion: "1.0",
  source: "src/data/ultimate-b2/generated/students-book.runtime.json",
  sourceSha256: createHash("sha256").update(await readFile(runtimePath)).digest("hex"),
  pages,
};
const serialized = `${JSON.stringify(document, null, 2)}\n`;

if (checkOnly) {
  assert.equal(await readFile(outputPath, "utf8"), serialized, "Generated Students Book page asset manifest is stale.");
} else {
  await writeFile(outputPath, serialized);
}

console.log(JSON.stringify({
  status: checkOnly ? "current" : "generated",
  pages: pages.length,
  units: new Set(pages.map(({ unitNumber }) => unitNumber)).size,
  bytes: pages.reduce((total, page) => total + page.byteSize, 0),
  output: path.relative(process.cwd(), outputPath).replaceAll("\\", "/"),
}, null, 2));
