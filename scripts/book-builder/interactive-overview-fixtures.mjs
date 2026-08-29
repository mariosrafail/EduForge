import { readFile } from "node:fs/promises";

import sharp from "sharp";

import { overviewPageWeight } from "../../src/apps/android-teacher-offline/unitOverviewLayout.js";

export const managedPageBytes = await readFile("unit/1/parts/HD/parts_part_1.png");
export const managedSpreadPageWidth = 581 * 2 + 18;
const managedSpreadPageBytes = await sharp({ create: { width: managedSpreadPageWidth, height: 794, channels: 4, background: "#ffffff" } })
  .composite([{ input: managedPageBytes, left: 0, top: 0 }, { input: managedPageBytes, left: 599, top: 0 }])
  .png()
  .toBuffer();

export function isManagedSpreadLabel(printedLabel) {
  return overviewPageWeight({ spreadNumber: printedLabel }) > 1;
}

export function managedPageFixture(page) {
  return isManagedSpreadLabel(page.printedLabel) ? managedSpreadPageBytes : managedPageBytes;
}
