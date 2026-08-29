import assert from "node:assert/strict";
import path from "node:path";

export async function assertInteractiveOverview(frame, expected, label, screenshot = {}) {
  const cards = frame.locator("[data-overview-entry]");
  const images = frame.locator(".teacher-unit-page-thumb img");
  await cards.nth(expected.labels.length - 1).waitFor();
  await images.nth(expected.labels.length - 1).waitFor();
  await images.evaluateAll(async (nodes, expectedCount) => {
    if (nodes.length !== expectedCount) throw new Error(`Expected ${expectedCount} overview images, found ${nodes.length}`);
    await Promise.all(nodes.map((image) => image.decode()));
  }, expected.labels.length);

  const metrics = await frame.locator(".teacher-offline-unit-overview").evaluate((panel) => {
    const entries = [...panel.querySelectorAll("[data-overview-entry]")];
    const rectangles = entries.map((entry) => entry.getBoundingClientRect());
    const panelRect = panel.getBoundingClientRect();
    return {
      labels: entries.map((entry) => entry.querySelector(".teacher-unit-page-copy b")?.textContent?.trim()),
      rows: entries.map((entry) => Number(entry.dataset.overviewRow)),
      weights: entries.map((entry) => Number(entry.dataset.overviewWeight)),
      spans: entries.map((entry) => Number(entry.dataset.overviewColumnSpan)),
      rowTopSpreads: [1, 2].map((row) => {
        const tops = rectangles.filter((_, index) => Number(entries[index].dataset.overviewRow) === row).map((rectangle) => rectangle.top);
        return tops.length ? Math.max(...tops) - Math.min(...tops) : null;
      }),
      minimumWidth: Math.min(...rectangles.map((rectangle) => rectangle.width)),
      minimumWidthRatio: Math.min(...rectangles.map((rectangle) => rectangle.width)) / panelRect.width,
      contained: rectangles.every((rectangle) => rectangle.left >= panelRect.left - 2 && rectangle.right <= panelRect.right + 2 && rectangle.top >= panelRect.top - 2 && rectangle.bottom <= panelRect.bottom + 2),
      overlaps: rectangles.some((first, index) => rectangles.slice(index + 1).some((second) => (
        first.left < second.right - 1 && first.right > second.left + 1
        && first.top < second.bottom - 1 && first.bottom > second.top + 1
      ))),
      objectFits: [...panel.querySelectorAll(".teacher-unit-page-thumb img")].map((image) => getComputedStyle(image).objectFit),
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  assert.deepEqual(metrics.labels, expected.labels, `${label} labels`);
  assert.deepEqual(metrics.rows, expected.rows, `${label} rows`);
  assert.deepEqual(metrics.weights, expected.weights, `${label} weights`);
  assert.deepEqual([1, 2].map((row) => metrics.spans
    .filter((_, index) => metrics.rows[index] === row)
    .reduce((sum, span) => sum + span, 0)), expected.columnTotals, `${label} proportional columns`);
  assert.ok(metrics.rowTopSpreads.every((spread) => spread !== null && spread <= 3), `${label} exactly two visual rows`);
  assert.ok(metrics.minimumWidth >= 80 && metrics.minimumWidthRatio >= 0.1, `${label} readable card width: ${metrics.minimumWidth} (${metrics.minimumWidthRatio})`);
  assert.equal(metrics.contained, true, `${label} entries contained`);
  assert.equal(metrics.overlaps, false, `${label} no overlap`);
  assert.ok(metrics.objectFits.every((value) => value === "contain"), `${label} object-fit contain`);
  assert.equal(metrics.objectFits.length, expected.labels.length, `${label} all images rendered`);
  assert.ok(metrics.documentOverflow <= 1, `${label} document overflow`);

  if (screenshot.directory && screenshot.fileName) {
    await frame.locator(".teacher-offline-unit-overview-screen").screenshot({ path: path.join(screenshot.directory, screenshot.fileName) });
  }
}
