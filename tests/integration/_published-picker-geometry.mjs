import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";

export async function verifyPickerGeometry(page, picker, books) {
  const output = process.env.PUBLISHED_BOOK_EVIDENCE_DIR || "/tmp/published-book-evidence";
  await mkdir(output, { recursive: true });
  await expect(page.locator(".app-intro-overlay")).toHaveCount(0);
  const measurements = [];
  const measure = async (name) => {
    const value = await picker.locator(".published-page-scroll").evaluate((stage) => {
      const image = stage.querySelector("img"), canvas = stage.querySelector(".published-page"), hotspot = stage.querySelector(".published-page-hotspots button");
      const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      return { stage: rect(stage), image: rect(image), canvas: rect(canvas), hotspot: hotspot ? { ...rect(hotspot), left: parseFloat(hotspot.style.left), top: parseFloat(hotspot.style.top), authoredWidth: parseFloat(hotspot.style.width), authoredHeight: parseFloat(hotspot.style.height) } : null,
        width: image.width, height: image.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        overflowX: stage.scrollWidth - stage.clientWidth, overflowY: stage.scrollHeight - stage.clientHeight,
        documentOverflow: document.documentElement.scrollWidth - innerWidth };
    });
    assert.ok(value.image.width > 30 && value.image.height > 30, name);
    assert.ok(value.image.x >= value.stage.x - 1 && value.image.y >= value.stage.y - 1 && value.image.right <= value.stage.right + 1 && value.image.bottom <= value.stage.bottom + 1, `${name}: corners ${JSON.stringify(value)}`);
    assert.ok(Math.abs(value.image.width / value.image.height - value.naturalWidth / value.naturalHeight) < .006, `${name}: aspect`);
    assert.ok(value.overflowX <= 1 && value.overflowY <= 1 && value.documentOverflow <= 1, `${name}: overflow ${JSON.stringify(value)}`);
    if (value.hotspot) {
      for (const [actual, expected] of [[value.hotspot.x, value.image.x + value.image.width * value.hotspot.left / 100], [value.hotspot.y, value.image.y + value.image.height * value.hotspot.top / 100], [value.hotspot.width, value.image.width * value.hotspot.authoredWidth / 100], [value.hotspot.height, value.image.height * value.hotspot.authoredHeight / 100]]) assert.ok(Math.abs(actual - expected) < 1.1, `${name}: hotspot alignment`);
    }
    measurements.push({ name, ...value });
    await picker.locator(".published-book-surface").screenshot({ path: `${output}/${name}.png` });
  };
  for (const [component, shape] of [["ultimate-b2-students-book", "portrait"], ["ultimate-b2-students-book", "landscape"], ["ultimate-b2-workbook", "square"]]) {
    await picker.locator(":scope > label > select").selectOption(component);
    const book = books.find((entry) => entry.componentSlug === component);
    const selectedPage = shape === "landscape" ? book.pages.find((entry) => entry.image.width > entry.image.height) : book.pages[0];
    assert.ok(selectedPage, `Missing ${shape} fixture`);
    await picker.locator('.published-book-controls select').nth(1).selectOption(selectedPage.id);
    for (const [width, height] of [[1366,768],[1920,1080],[1024,768],[768,1024],[390,844]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => picker.locator(".published-page > img").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
      await page.waitForTimeout(100);
      await measure(`${component}-${shape}-${width}x${height}`);
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await picker.locator(":scope > label > select").selectOption("ultimate-b2-students-book");
  await picker.locator('.published-book-controls select').nth(1).selectOption(books.find((entry) => entry.componentSlug === "ultimate-b2-students-book").pages[0].id);
  await expect.poll(() => picker.locator(".published-page > img").evaluate((image) => image.complete && image.naturalWidth > 1)).toBe(true);
  await picker.locator('.published-book-controls input[type="range"]').fill("2");
  await expect(picker.locator(".published-page-scroll")).toHaveAttribute("data-fit", "false");
  await picker.getByRole("button", { name: "Fit / Reset", exact: true }).click();
  await page.waitForTimeout(100); await measure("fit-after-zoom");
  await picker.evaluate((node) => node.style.maxWidth = "640px");
  await page.waitForTimeout(100); await measure("container-width-change");
  await picker.evaluate((node) => node.style.maxWidth = "");
  await picker.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className)).toBe("published-book-surface");
  await page.waitForTimeout(100); await measure("fullscreen");
  const book = books.find((entry) => entry.componentSlug === "ultimate-b2-students-book");
  const open = book.pages[0].hotspots.find((hotspot) => hotspot.type === "open-response");
  await picker.locator(".published-page-hotspots").getByRole("button", { name: open.title, exact: true }).click();
  await picker.getByRole("button", { name: "Preview exercise", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator(".native-or-surface")).toBeVisible();
  const preview = await page.getByRole("dialog").evaluate((dialog) => { const stage=dialog.querySelector('.published-preview-stage').getBoundingClientRect(), surface=dialog.querySelector('.native-or-surface').getBoundingClientRect();return { stage:{x:stage.x,y:stage.y,right:stage.right,bottom:stage.bottom},surface:{x:surface.x,y:surface.y,right:surface.right,bottom:surface.bottom},insideFullscreen:document.fullscreenElement.contains(dialog) }; });
  assert.ok(preview.insideFullscreen && preview.surface.x >= preview.stage.x - 1 && preview.surface.right <= preview.stage.right + 1 && preview.surface.bottom <= preview.stage.bottom + 1, JSON.stringify(preview));
  await page.getByRole("dialog").screenshot({ path: `${output}/fullscreen-preview.png` });
  await page.getByRole("button", { name: "Close preview", exact: true }).click();
  await expect(picker.getByRole("button", { name: "Preview exercise", exact: true })).toBeFocused();
  await picker.getByRole("button", { name: "Exit fullscreen", exact: true }).click();
  await expect(picker.getByRole("button", { name: "Fullscreen", exact: true })).toBeFocused();
  await picker.getByRole("button", { name: "Add exercise", exact: true }).click();
  const imageRequests = [];
  const record = (request) => { if (request.url().includes("action=published-page-image")) imageRequests.push(request.url()); };
  page.on("request", record);
  await page.setViewportSize({ width: 768, height: 1024 });
  await picker.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  // The browser exit API takes the same fullscreenchange path as Escape.
  await page.evaluate(() => document.exitFullscreen());
  await expect(picker.getByRole("button", { name: "Fullscreen", exact: true })).toBeFocused();
  await expect(picker.getByRole("button", { name: "Remove selection", exact: true })).toBeVisible();
  await picker.evaluate((node) => { node.querySelector('.published-book-surface').requestFullscreen = () => Promise.reject(new Error("Test denial")); });
  await picker.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect(picker.getByRole("alert")).toContainText("Fullscreen is unavailable");
  await picker.evaluate((node) => { delete node.querySelector('.published-book-surface').requestFullscreen; });
  assert.deepEqual(imageRequests, [], "Layout/fullscreen must not refetch the page");
  page.off("request", record);
  await picker.getByRole("button", { name: "Remove selection", exact: true }).click();
  await picker.getByText("Activities on this page", { exact: true }).click();
  const alternative = picker.locator('.published-picker-list').getByRole("button", { name: open.title, exact: true });
  await alternative.focus(); await alternative.press("Enter");
  await expect(picker.getByRole("button", { name: "Add exercise", exact: true })).toBeVisible();
  await picker.getByText("Activities on this page", { exact: true }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await picker.getByRole("button", { name: "Next page", exact: true }).click();
  await expect.poll(() => picker.locator(".published-page > img").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.waitForTimeout(100); await measure("page-change-reduced-motion");
  await picker.getByRole("button", { name: "Previous page", exact: true }).click();
  await writeFile(`${output}/geometry.json`, JSON.stringify({ measurements, preview }, null, 2));
}
