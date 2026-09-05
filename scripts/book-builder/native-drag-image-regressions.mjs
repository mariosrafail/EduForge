import assert from "node:assert/strict";
import sharp from "sharp";
import { expect } from "@playwright/test";

export async function runNativeDragImageRegressions(browser, baseUrl, output) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const png = await sharp({ create: { width: 48, height: 64, channels: 4, background: "#278244" } }).png().toBuffer();
  await page.route("**/synthetic-managed-tick.png", (route) => route.fulfill({ contentType: "image/png", body: png }));
  try {
    await page.goto(`${baseUrl}tests/fixtures/native-runtime-regressions/image-items.html`);
    const first = page.locator('[data-owner="first"]');
    const second = page.locator('[data-owner="second"]');
    const tick = first.getByRole("button", { name: "Tick", exact: true });
    const image = tick.locator("img");
    await expect.poll(() => image.evaluate((node) => node.complete && node.naturalWidth)).toBe(48);
    await page.evaluate(() => imageItems.setScale(.7));
    const source = await tick.boundingBox();
    const foreign = await second.locator("[data-drag-drop-target-id]").boundingBox();
    await page.mouse.move(source.x + 12, source.y + 12); await page.mouse.down();
    await page.mouse.move(foreign.x + 30, foreign.y + 30, { steps: 8 });
    const preview = page.locator("[data-drag-drop-drag-preview]");
    await expect(preview.locator("img")).toHaveCount(1);
    const proxy = await preview.boundingBox();
    assert.ok(Math.abs(source.width - proxy.width) < 1 && Math.abs(source.height - proxy.height) < 1);
    await page.mouse.up();
    await expect(preview).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => [imageItems.responses, imageItems.otherResponses]), [{}, {}]);
    await tick.click(); await first.getByRole("button", { name: /^Target 1, contains empty,/ }).click();
    await expect(first.locator("[data-drag-drop-target-id] img")).toHaveCount(1);
    await expect(tick).toHaveCount(1);
    await first.getByRole("button", { name: "Next", exact: true }).click();
    await tick.click(); await first.getByRole("button", { name: /^Target 2, contains empty,/ }).click();
    await expect(first.locator("[data-drag-drop-target-id] img")).toHaveCount(1);
    assert.equal(Object.keys(await page.evaluate(() => imageItems.responses)).length, 2);
    await first.getByRole("button", { name: "Previous", exact: true }).click();
    await page.evaluate(() => { imageItems.setReadOnly(true); imageItems.setText(true); });
    await expect(first.locator("[data-drag-drop-target-id] img")).toHaveCount(1);
    await expect(first.locator("[data-drag-drop-target-id]")).toHaveAttribute("tabindex", "-1");
    await expect(tick).toBeDisabled();
    await page.screenshot({ path: `${output}/image-items-review.png` });
    await page.evaluate(() => imageItems.setTeacher(true));
    await first.locator("[data-drag-drop-target-id]").click();
    await expect(first.locator("[data-drag-drop-target-id] img")).toHaveCount(1);
    await page.screenshot({ path: `${output}/image-items-teacher.png` });
  } finally { await page.close(); }
}
