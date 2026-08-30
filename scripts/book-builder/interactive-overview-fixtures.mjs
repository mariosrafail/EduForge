import { readFile } from "node:fs/promises";

import sharp from "sharp";

export const managedPageBytes = await readFile("unit/1/parts/HD/parts_part_1.png");
export const managedSpreadPageWidth = 581 * 2 + 18;
const managedSpreadPageBytes = await sharp({ create: { width: managedSpreadPageWidth, height: 794, channels: 4, background: "#ffffff" } })
  .composite([{ input: managedPageBytes, left: 0, top: 0 }, { input: managedPageBytes, left: 599, top: 0 }])
  .png()
  .toBuffer();

export function managedPageFixture(page) {
  return Number(page?.image?.width) > Number(page?.image?.height) ? managedSpreadPageBytes : managedPageBytes;
}

const physicalPages = (unitNumber, weights) => weights.map((physicalWeight, index) => ({
  unitNumber,
  printedLabel: `Page ${index + 1}`,
  token: String(index + 1),
  physicalWeight,
}));

export function managedOverviewDescriptors(componentSlug) {
  return [
    ...physicalPages(1, [1, 1]),
    ...physicalPages(2, [1]),
    ...(componentSlug === "ultimate-b2-workbook"
      ? physicalPages(7, [2, 2, 2, 1, 1, 2, 2])
      : physicalPages(3, [1, 2, 2, 1, 2, 1, 2])),
  ];
}
