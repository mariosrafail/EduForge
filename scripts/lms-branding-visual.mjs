import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

import { FORBIDDEN_VISIBLE_BRANDING_PATTERN } from "./_branding-audit.mjs";
import { localPlaywrightLaunchOptions } from "./android-teacher/playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4181";
const artifactRoot = "test-results/lms-branding-visual";
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4181"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

async function waitForPreview() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      if ((await fetch(baseURL)).ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("LMS preview did not start.");
}

async function assertCleanBranding(page, expectedTitle, label) {
  const visibleText = await page.locator("body").innerText();
  assert.equal(await page.title(), expectedTitle, `${label} document title`);
  assert.doesNotMatch(visibleText, FORBIDDEN_VISIBLE_BRANDING_PATTERN, `${label} visible branding`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false, `${label} horizontal overflow`);
}

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  await waitForPreview();
  browser = await chromium.launch(localPlaywrightLaunchOptions());

  for (const viewport of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "mobile" }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    await page.goto(`${baseURL}/#home`, { waitUntil: "networkidle" });
    await page.locator(".role-selection-screen").waitFor({ timeout: 10_000 }).catch(async () => {
      throw new Error(`Public shell did not render: ${JSON.stringify({ runtimeErrors, body: (await page.locator("body").innerText()).slice(0, 500) })}`);
    });
    await page.locator(".app-intro-overlay").waitFor({ state: "hidden" });
    await page.waitForTimeout(700);
    await assertCleanBranding(page, "Hamilton House LMS", `${viewport.name} public shell`);
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}-public-shell.png`, fullPage: true });

    await page.goto(`${baseURL}/#auth-teacher`, { waitUntil: "networkidle" });
    await page.locator(".auth-screen").waitFor();
    await page.getByRole("heading", { name: "Teacher access" }).waitFor();
    await page.locator(".app-intro-overlay").waitFor({ state: "hidden" });
    await page.waitForTimeout(700);
    await assertCleanBranding(page, "Hamilton House LMS", `${viewport.name} teacher login`);
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}-teacher-login.png`, fullPage: true });

    await page.goto(`${baseURL}/platform-admin/`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Platform Administration" }).waitFor();
    await assertCleanBranding(page, "Platform Administration · Hamilton House", `${viewport.name} Platform Admin login`);
    await page.screenshot({ path: `${artifactRoot}/${viewport.name}-platform-admin-login.png`, fullPage: true });

    assert.deepEqual(runtimeErrors, [], `${viewport.name} runtime errors`);
    await context.close();
  }

  console.log(JSON.stringify({ status: "passed", screenshots: 6, artifactRoot }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
