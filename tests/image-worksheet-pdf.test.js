import assert from "node:assert/strict";
import test from "node:test";

import { inspectManagedPdf } from "../lib/book-assets/pdf-inspection.js";
import { buildSinglePageImagePdf, worksheetPdfLayout } from "../src/apps/book-builder/hosted/imageWorksheetPdf.js";

test("worksheet image PDF builder emits a validated one-page PDF with contained portrait artwork", () => {
  const layout = worksheetPdfLayout(800, 1_200);
  assert.equal(layout.pageWidth, 595.28);
  assert.equal(layout.pageHeight, 841.89);
  assert.ok(Math.abs(layout.drawWidth / layout.drawHeight - 800 / 1_200) < 1e-9);
  assert.ok(layout.x >= 36 && layout.y >= 36);

  const pdf = buildSinglePageImagePdf({ jpegBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 800, height: 1_200 });
  const inspected = inspectManagedPdf(pdf);
  assert.equal(inspected.mimeType, "application/pdf");
  const source = inspected.bytes.toString("latin1");
  assert.match(source, /\/Type \/Page\b/);
  assert.match(source, /\/Subtype \/Image/);
  assert.match(source, /\/Filter \/DCTDecode/);
  assert.match(source, /\/MediaBox \[0 0 595\.28 841\.89\]/);
  assert.match(source, /\/Count 1/);
});

test("worksheet image PDF builder chooses landscape A4 and preserves image aspect without cropping", () => {
  const layout = worksheetPdfLayout(1_600, 900);
  assert.equal(layout.pageWidth, 841.89);
  assert.equal(layout.pageHeight, 595.28);
  assert.ok(Math.abs(layout.drawWidth / layout.drawHeight - 1_600 / 900) < 1e-9);
  assert.ok(layout.drawWidth <= layout.pageWidth - 72 + 1e-9);
  assert.ok(layout.drawHeight <= layout.pageHeight - 72 + 1e-9);
  assert.ok(layout.x >= 36 - 1e-9 && layout.y >= 36 - 1e-9);

  const inspected = inspectManagedPdf(buildSinglePageImagePdf({ jpegBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 1_600, height: 900 }));
  assert.match(inspected.bytes.toString("latin1"), /\/MediaBox \[0 0 841\.89 595\.28\]/);
});
