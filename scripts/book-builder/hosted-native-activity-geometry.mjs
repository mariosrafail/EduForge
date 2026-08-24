import assert from "node:assert/strict";

export async function measureEditorDock(page, { context, viewport, screenshotPath }) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator(".studio-save-bar").waitFor();
  await page.locator(".studio-tabs").scrollIntoViewIfNeeded();
  const measurement = await page.evaluate((measuredContext) => {
    const bounds = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const review = bounds(".unified-builder-review-launcher");
    const save = bounds(".studio-save-bar");
    const status = bounds(".studio-save-status");
    const tabs = bounds(".studio-tabs");
    const editor = document.querySelector(".studio-editor");
    const intersects = (left, right) => left && right && left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    return {
      context: measuredContext,
      viewport: { width: innerWidth, height: innerHeight },
      review, save, status, tabs,
      reviewSaveIntersect: intersects(review, save),
      reviewStatusIntersect: intersects(review, status),
      editorPaddingBottom: editor ? Number.parseFloat(getComputedStyle(editor).paddingBottom) : 0,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  }, context);
  process.stdout.write(`[activity-editor-geometry] ${JSON.stringify(measurement)}\n`);
  for (const rect of [measurement.review, measurement.save, measurement.status]) {
    assert.ok(rect && rect.left >= -1 && rect.right <= viewport.width + 1 && rect.top >= -1 && rect.bottom <= viewport.height + 1, JSON.stringify(measurement));
  }
  assert.equal(measurement.reviewSaveIntersect, false, JSON.stringify(measurement));
  assert.equal(measurement.reviewStatusIntersect, false, JSON.stringify(measurement));
  assert.ok(measurement.tabs && measurement.tabs.top >= -1 && measurement.tabs.top < viewport.height, JSON.stringify(measurement));
  assert.ok(measurement.editorPaddingBottom >= measurement.save.height + 20, JSON.stringify(measurement));
  assert.ok(measurement.horizontalOverflow <= 1, JSON.stringify(measurement));
  if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: true });
  return measurement;
}
