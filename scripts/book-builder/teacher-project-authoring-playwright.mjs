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
    await page.getByRole("button", { name: /^Units/ }).click(); await page.getByText("unit-01-normal.png").waitFor();
    await page.getByRole("button", { name: /^Sounds & Assets/ }).click(); await page.locator(".teacher-sound-bulk select").first().selectOption({ label: "button.wav" }); await page.getByRole("button", { name: "Apply sound" }).click();
    await page.locator(".teacher-project-editor-header").getByRole("button", { name: "Save", exact: true }).click(); await page.getByText(/Saved revision/).waitFor();
    await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("heading", { name: "Overview" }).waitFor(); await page.getByRole("button", { name: /^Units/ }).click();
    assert.equal(await page.locator(".teacher-project-control-row").filter({ hasText: "Unit 1" }).first().locator("select").inputValue() !== "", true);
    await page.getByRole("link", { name: "Back to projects" }).click(); await page.getByRole("heading", { name: "Teacher APK Projects", exact: true }).waitFor();
    const b3 = page.locator(".studio-project-card").filter({ hasText: "Ultimate B3" }); await b3.getByRole("button", { name: "Duplicate" }).click();
    await page.getByLabel("New project name").fill("Ultimate B4"); await page.getByLabel("New project slug / ID").fill("ultimate-b4"); await page.getByRole("button", { name: "Create duplicate" }).click();
    await page.getByText(/ultimate-b4 · Revision 1/).waitFor(); await page.getByRole("button", { name: /^Units/ }).click(); await page.getByText("unit-01-normal.png").waitFor();
    await page.getByRole("button", { name: /^Sounds & Assets/ }).click(); await page.locator(".teacher-qa-list article").filter({ hasText: "Unit 1" }).first().locator("button").first().click();
    await page.locator(".teacher-project-qa-focus").waitFor();
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 1280, height: 800 }]) { await page.setViewportSize(viewport); await assertNoOverflow(page); }
    const b3Manifest = JSON.parse(await fs.readFile(path.join(fixture.workspace, "teacher-projects", "ultimate-b3", "teacher-project.json"), "utf8"));
    const b4Manifest = JSON.parse(await fs.readFile(path.join(fixture.workspace, "teacher-projects", "ultimate-b4", "teacher-project.json"), "utf8"));
    assert.equal(b4Manifest.revision, 1); assert.deepEqual(b4Manifest.shell, b3Manifest.shell); assert.deepEqual(Object.keys(b4Manifest.assets).sort(), Object.keys(b3Manifest.assets).sort()); assert.doesNotMatch(JSON.stringify([b3Manifest, b4Manifest, ...networkBodies]), /[A-Za-z]:\\(?:Users|AppData)|\/(?:Users|home)\//i);
    assert.deepEqual(await fs.readdir(path.join(fixture.workspace, "teacher-projects", "ultimate-b4", "exports")), []); await assert.rejects(() => fs.access(path.join(fixture.workspace, "teacher-projects", "ultimate-b4", ".build")));
    process.stdout.write(`${JSON.stringify({ status: "teacher-project-authoring-safe", flows: 14, viewports: 3, sourceRevision: b3Manifest.revision, duplicateRevision: b4Manifest.revision }, null, 2)}\n`);
  } finally { await browser?.close(); await studio.server.close(); await fixture.cleanup(); }
}

run().catch((error) => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
