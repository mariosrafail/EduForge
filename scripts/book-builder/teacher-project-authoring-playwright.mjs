import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import sharp from "sharp";
import { createServer } from "vite";

import { createBookBuilderStudioFixture } from "../../tests/helpers/book-builder-studio-fixture.mjs";
import { bookBuilderReviewStudioPlugin } from "./review-studio-api.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");

function wavFixture() {
  const wav = Buffer.alloc(46); wav.write("RIFF", 0); wav.writeUInt32LE(38, 4); wav.write("WAVE", 8); wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8_000, 24); wav.writeUInt32LE(8_000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34); wav.write("data", 36); wav.writeUInt32LE(2, 40); wav[44] = 128; wav[45] = 128; return wav;
}

async function startStudio(workspace) {
  const server = await createServer({ root: repositoryRoot, configFile: path.join(repositoryRoot, "vite.config.js"), appType: "mpa", logLevel: "error", plugins: [bookBuilderReviewStudioPlugin({ workspace, writeEnabled: true })], server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await server.listen(); return { server, origin: `http://127.0.0.1:${server.httpServer.address().port}` };
}

async function assertNoOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert.equal(dimensions.width <= dimensions.viewport + 1, true, JSON.stringify(dimensions));
}

async function selectPageAsset(select, filename) {
  const value = await select.locator("option").filter({ hasText: filename }).getAttribute("value");
  assert.ok(value, `Missing page library option for ${filename}`);
  await select.selectOption(value);
}

async function relativeBox(locator, root) {
  const [box, rootBox] = await Promise.all([locator.boundingBox(), root.boundingBox()]);
  assert.ok(box && rootBox, "Expected visible elements for geometry comparison");
  return { x: box.x - rootBox.x, y: box.y - rootBox.y, width: box.width, height: box.height };
}

async function run() {
  const fixture = await createBookBuilderStudioFixture();
  const studio = await startStudio(fixture.workspace);
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const networkBodies = [];
    page.on("response", async (response) => { if (response.url().includes("/__hhplms/book-builder/") && String(response.headers()["content-type"] || "").includes("application/json")) try { networkBodies.push(await response.text()); } catch { /* navigation may cancel */ } });
    await page.goto(`${studio.origin}/builder.html`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("heading", { name: "Teacher APK Projects", exact: true }).waitFor();
    await page.getByLabel("Project name").fill("Ultimate B3"); await page.getByLabel("Project slug / ID").fill("ultimate-b3"); await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("heading", { name: "Overview" }).waitFor();
    await page.getByRole("button", { name: "Import Assets" }).first().click(); await page.getByRole("heading", { name: "Import assets" }).waitFor();
    const background = await sharp({ create: { width: 32, height: 18, channels: 4, background: "#184c68" } }).png().toBuffer();
    const alternate = await sharp({ create: { width: 32, height: 18, channels: 4, background: "#663355" } }).webp().toBuffer();
    const normal = await sharp({ create: { width: 20, height: 8, channels: 4, background: "#275d84" } }).png().toBuffer();
    const active = await sharp({ create: { width: 20, height: 8, channels: 4, background: "#f1bf24" } }).png().toBuffer();
    await page.locator(".teacher-import-pickers input[type=file]").nth(1).setInputFiles([
      { name: "background.png", mimeType: "image/png", buffer: background }, { name: "menu-bg.webp", mimeType: "image/webp", buffer: alternate },
      { name: "unit-01-normal.png", mimeType: "image/png", buffer: normal }, { name: "unit-01-active.png", mimeType: "image/png", buffer: active }, { name: "button.wav", mimeType: "audio/wav", buffer: wavFixture() },
    ]);
    await page.getByText("need review").waitFor();
    await page.getByLabel("Candidate for Shell · Background").selectOption({ label: "background.png" });
    await page.getByRole("button", { name: "Apply mappings" }).click(); await page.getByText(/unique assets imported/).waitFor(); await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByText("Unsaved", { exact: true }).waitFor();
    await page.getByRole("button", { name: /^Units \d+ missing$/ }).click(); await page.getByText("unit-01-normal.png").waitFor();
    await page.getByRole("button", { name: /^Sounds & Assets/ }).click(); await page.locator(".teacher-sound-bulk select").first().selectOption({ label: "button.wav" }); await page.getByRole("button", { name: "Apply sound" }).click();
    await page.locator(".teacher-project-editor-header").getByRole("button", { name: "Save", exact: true }).click(); await page.getByText(/Saved revision/).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("heading", { name: "Overview" }).waitFor(); await page.getByRole("button", { name: /^Units \d+ missing$/ }).click();
    assert.equal(await page.locator(".teacher-project-control-row").filter({ hasText: "Unit 1" }).first().locator("select").inputValue() !== "", true);
    await page.getByRole("button", { name: /^Units & Pages/ }).click(); await page.getByRole("heading", { name: "Units & Pages" }).waitFor();
    const page5 = await sharp({ create: { width: 70, height: 100, channels: 4, background: "#1d7195" } }).png().toBuffer();
    const spread67 = await sharp({ create: { width: 140, height: 80, channels: 4, background: "#77318c" } }).png().toBuffer();
    const page17 = await sharp({ create: { width: 64, height: 92, channels: 4, background: "#147b65" } }).png().toBuffer();
    const page18 = await sharp({ create: { width: 70, height: 96, channels: 4, background: "#ad5a26" } }).png().toBuffer();
    await page.locator(".teacher-pages-authoring > header input[type=file]").setInputFiles([
      { name: "page-18.png", mimeType: "image/png", buffer: page18 }, { name: "reading-6-7.png", mimeType: "image/png", buffer: spread67 },
      { name: "page-5.png", mimeType: "image/png", buffer: page5 }, { name: "page-17.png", mimeType: "image/png", buffer: page17 },
    ]);
    const pageImportMessage = page.locator(".teacher-page-import-message");
    await pageImportMessage.waitFor();
    assert.match(await pageImportMessage.textContent(), /4 page images imported in natural filename order/);
    const addEntry = page.getByRole("button", { name: "Add Page / Spread" });
    await addEntry.click(); await addEntry.click(); await addEntry.click();
    let entries = page.locator(".teacher-page-entry"); assert.equal(await entries.count(), 3);
    await entries.nth(0).getByLabel("Page label").fill("5"); await selectPageAsset(entries.nth(0).locator(".teacher-page-image-field select"), "page-5.png");
    await entries.nth(1).getByLabel("Page label").fill("6-7"); await entries.nth(1).getByLabel(/Section title/).fill("Reading"); await entries.nth(1).getByLabel("Double page").check(); await entries.nth(1).getByLabel("One spread image").check(); await selectPageAsset(entries.nth(1).locator(".teacher-page-image-field select"), "reading-6-7.png");
    await entries.nth(2).getByLabel("Page label").fill("17-18"); await entries.nth(2).getByLabel(/Section title/).fill("Practice 1"); await entries.nth(2).getByLabel("Double page").check(); await entries.nth(2).getByLabel("Two page images").check();
    await selectPageAsset(entries.nth(2).locator(".teacher-page-image-field select").nth(0), "page-17.png"); await selectPageAsset(entries.nth(2).locator(".teacher-page-image-field select").nth(1), "page-18.png");
    const practiceId = await entries.nth(2).getAttribute("data-entry-id"); await entries.nth(2).getByRole("button", { name: "Move entry 3 up" }).click(); await page.locator(`[data-entry-id="${practiceId}"]`).getByRole("button", { name: "Move entry 2 down" }).click();
    assert.deepEqual(await page.locator(".teacher-page-entry input[placeholder='e.g. 6-7']").evaluateAll((nodes) => nodes.map((node) => node.value)), ["5", "6-7", "17-18"]);
    const authoredIds = await page.locator(".teacher-page-entry").evaluateAll((nodes) => nodes.map((node) => node.dataset.entryId));
    await page.locator(".teacher-project-editor-header").getByRole("button", { name: "Save", exact: true }).click(); await page.getByText(/Saved revision/).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("heading", { name: "Overview" }).waitFor(); await page.getByRole("button", { name: /^Units & Pages/ }).click();
    entries = page.locator(".teacher-page-entry"); assert.deepEqual(await entries.evaluateAll((nodes) => nodes.map((node) => node.dataset.entryId)), authoredIds); assert.deepEqual(await page.locator(".teacher-page-entry input[placeholder='e.g. 6-7']").evaluateAll((nodes) => nodes.map((node) => node.value)), ["5", "6-7", "17-18"]);
    const preview = page.locator(".teacher-project-preview-stage"); await preview.getByRole("button", { name: "Unit 1", exact: true }).click(); await preview.locator(".teacher-project-overview-card").first().waitFor(); assert.equal(await preview.locator(".teacher-project-overview-card").count(), 3);
    const overviewNav = await relativeBox(preview.locator(".teacher-book-navigation"), preview); const overviewToolbar = await relativeBox(preview.locator(".classroom-teaching-toolbar"), preview);
    await preview.locator(".teacher-project-overview-card").nth(0).click(); await preview.locator("[data-entry-id]").waitFor(); assert.equal(await preview.locator("[data-entry-id]").getAttribute("data-layout"), "single-page");
    await preview.getByRole("button", { name: "Next page" }).click(); assert.equal(await preview.locator("[data-entry-id]").getAttribute("data-layout"), "double-wide");
    await preview.getByRole("button", { name: "Next page" }).click(); assert.equal(await preview.locator("[data-entry-id]").getAttribute("data-layout"), "double-pair"); assert.equal(await preview.locator(".teacher-project-page-composite img").count(), 2); assert.equal(await preview.getByRole("button", { name: "Next page" }).isDisabled(), true);
    const pageNav = await relativeBox(preview.locator(".teacher-book-navigation"), preview); const pageToolbar = await relativeBox(preview.locator(".classroom-teaching-toolbar"), preview);
    for (const key of ["x", "y", "width", "height"]) assert.equal(Math.abs(overviewNav[key] - pageNav[key]) <= .5, true, `${key}: ${overviewNav[key]} vs ${pageNav[key]}`);
    for (const key of ["x", "y", "width", "height"]) assert.equal(Math.abs(overviewToolbar[key] - pageToolbar[key]) <= .5, true, `toolbar ${key}`);
    const pageStage = preview.locator("[data-entry-id]");
    const runtimeViewports = [{ width: 1280, height: 720 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 2560, height: 1080 }, { width: 2560, height: 1440 }];
    for (const viewport of runtimeViewports) {
      await page.setViewportSize(viewport); await assertNoOverflow(page);
      await page.waitForTimeout(50);
      assert.equal(await preview.locator(".teacher-project-page-composite").evaluate((node) => getComputedStyle(node).flexDirection), "row");
      const imageGeometry = await preview.locator(".teacher-project-page-composite img").evaluateAll((images) => images.map((image) => ({ ratio: Number.parseFloat(image.style.width) / Number.parseFloat(image.style.height), naturalRatio: image.naturalWidth / image.naturalHeight, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: image.style.width, height: image.style.height, complete: image.complete })));
      const readerGeometry = await pageStage.evaluate((node) => ({ clientWidth: node.clientWidth, clientHeight: node.clientHeight, parentWidth: node.parentElement?.clientWidth, parentHeight: node.parentElement?.clientHeight, mainWidth: node.closest("main")?.clientWidth, mainHeight: node.closest("main")?.clientHeight }));
      assert.equal(imageGeometry.length, 2);
      imageGeometry.forEach((geometry) => { assert.ok(Number.isFinite(geometry.ratio), JSON.stringify({ viewport, imageGeometry, readerGeometry })); assert.ok(Math.abs(geometry.ratio - geometry.naturalRatio) < .01); });
    }
    await pageStage.dispatchEvent("wheel", { deltaY: -100 }); await pageStage.waitFor(); assert.equal(await pageStage.getAttribute("data-zoom"), "1.20");
    const stageBox = await pageStage.boundingBox();
    await pageStage.dispatchEvent("pointerdown", { pointerId: 11, clientX: stageBox.x + stageBox.width / 2, clientY: stageBox.y + stageBox.height / 2 });
    await pageStage.dispatchEvent("pointermove", { pointerId: 11, clientX: stageBox.x + stageBox.width / 2 + 60, clientY: stageBox.y + stageBox.height / 2 + 35 });
    await page.waitForTimeout(32); await pageStage.dispatchEvent("pointerup", { pointerId: 11 });
    assert.doesNotMatch(await preview.locator(".teacher-project-page-composite").getAttribute("style"), /translate3d\(0px, 0px, 0\)/);
    await preview.getByRole("button", { name: "Previous page" }).click(); await preview.getByRole("button", { name: "Back" }).click(); assert.equal(await preview.locator(".teacher-project-overview-card").count(), 3); await preview.getByRole("button", { name: "Home" }).click(); await preview.getByRole("button", { name: "Unit 1", exact: true }).waitFor();
    await page.getByRole("link", { name: "Back to projects" }).click(); await page.getByRole("heading", { name: "Teacher APK Projects", exact: true }).waitFor();
    const b3 = page.locator(".studio-project-card").filter({ hasText: "Ultimate B3" }); await b3.getByRole("button", { name: "Duplicate" }).click();
    await page.getByLabel("New project name").fill("Ultimate B4"); await page.getByLabel("New project slug / ID").fill("ultimate-b4"); await page.getByRole("button", { name: "Create duplicate" }).click();
    await page.getByText(/ultimate-b4 · Revision 1/).waitFor(); await page.getByRole("button", { name: /^Units \d+ missing$/ }).click(); await page.getByRole("heading", { name: "Units", exact: true }).waitFor(); assert.notEqual(await page.locator(".teacher-project-control-row").filter({ hasText: "Unit 1" }).first().locator("select").inputValue(), "");
    await page.getByRole("button", { name: /^Sounds & Assets/ }).click(); const unitQa = page.locator(".teacher-qa-list article").filter({ hasText: "Unit 1" }).first(); await unitQa.locator("button").first().click();
    await page.locator(".teacher-project-qa-focus").waitFor(); await unitQa.getByRole("button", { name: "Simulate active" }).click(); await page.locator(".teacher-project-qa-active").waitFor();
    for (const viewport of runtimeViewports) { await page.setViewportSize(viewport); await assertNoOverflow(page); }
    const b3Manifest = JSON.parse(await fs.readFile(path.join(fixture.workspace, "teacher-projects", "ultimate-b3", "teacher-project.json"), "utf8"));
    const b4Manifest = JSON.parse(await fs.readFile(path.join(fixture.workspace, "teacher-projects", "ultimate-b4", "teacher-project.json"), "utf8"));
    assert.equal(b4Manifest.revision, 1); assert.deepEqual(b4Manifest.shell, b3Manifest.shell); assert.deepEqual(b4Manifest.content, b3Manifest.content); assert.deepEqual(Object.keys(b4Manifest.assets).sort(), Object.keys(b3Manifest.assets).sort()); assert.doesNotMatch(JSON.stringify([b3Manifest, b4Manifest, ...networkBodies]), /[A-Za-z]:\\(?:Users|AppData)|\/(?:Users|home)\//i);
    assert.deepEqual(await fs.readdir(path.join(fixture.workspace, "teacher-projects", "ultimate-b4", "exports")), []); await assert.rejects(() => fs.access(path.join(fixture.workspace, "teacher-projects", "ultimate-b4", ".build")));
    process.stdout.write(`${JSON.stringify({ status: "teacher-project-authoring-safe", flows: 38, viewports: 5, sourceRevision: b3Manifest.revision, duplicateRevision: b4Manifest.revision, pageEntries: b3Manifest.content.studentsBook.units[0].entries.length }, null, 2)}\n`);
  } finally { await browser?.close(); await studio.server.close(); await fixture.cleanup(); }
}

run().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
