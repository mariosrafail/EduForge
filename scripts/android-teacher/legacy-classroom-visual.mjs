import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4180";
const artifactRoot = "test-results/legacy-classroom-visual";
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4180"], {
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
  throw new Error("Teacher offline preview did not start.");
}

async function openBook(page) {
  await page.getByRole("button", { name: "Open Students Book" }).click();
  await page.locator(".teacher-offline-book").waitFor();
}

async function waitForPageImage(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector(".teacher-offline-page-image img");
    return image?.complete && image.naturalWidth > 0 && image.getBoundingClientRect().width > 0;
  });
}

async function openActivity(page, unit, title) {
  if (await page.locator(".teacher-offline-presentation").count()) await page.getByRole("button", { name: "Back to book" }).click();
  await page.getByRole("button", { name: `Unit ${unit}`, exact: true }).click();
  await page.locator(".teacher-offline-view-tabs button").nth(1).click();
  const row = page.locator(".teacher-offline-lessons article").filter({ hasText: title }).first();
  await row.getByRole("button", { name: "Present" }).click();
  await page.locator(".teacher-offline-presentation").waitFor();
}

async function assertScreen(page, label) {
  const metrics = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    missingImages: [...document.images].filter((image) => !image.complete || !image.naturalWidth).map((image) => image.src),
  }));
  assert.equal(metrics.overflow, 0, `${label} horizontal overflow`);
  assert.deepEqual(metrics.missingImages, [], `${label} missing images`);
}

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  await waitForPreview();
  browser = await chromium.launch(localPlaywrightLaunchOptions());

  const capture = async ({ width, height }, run) => {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    const forbiddenRequests = [];
    page.on("console", (message) => { if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text()); });
    page.on("request", (request) => { if (!request.url().startsWith(baseURL)) forbiddenRequests.push(request.url()); });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await run(page);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(forbiddenRequests, []);
    await context.close();
  };

  await capture({ width: 1920, height: 1080 }, async (page) => {
    await assertScreen(page, "library-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/library-1920x1080.png` });
    const soundToggle = page.getByRole("button", { name: "Mute classroom interface sounds" });
    await soundToggle.click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Enable classroom interface sounds" }).click();
    await openBook(page);
    await page.getByRole("button", { name: "Unit 2", exact: true }).click();
    await page.locator(".teacher-offline-pages aside button").filter({ hasText: "pg 20-21" }).evaluate((button) => button.click());
    await waitForPageImage(page);
    await assertScreen(page, "page-viewer-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-1920x1080.png` });
    await openActivity(page, 1, "Reading · Exercise 3");
    await assertScreen(page, "multiple-choice-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/multiple-choice-1920x1080.png` });
    await page.getByRole("button", { name: "Show all answers" }).click();
    await page.getByText("Publisher answer", { exact: true }).first().waitFor();
    await page.screenshot({ path: `${artifactRoot}/teacher-answer-reveal-1920x1080.png` });
    await openActivity(page, 2, "Vocabulary in Use · Exercise 4");
    await assertScreen(page, "text-gap-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/text-gap-1920x1080.png` });
    await openActivity(page, 1, "Listening · Exercise 3");
    await page.locator("audio").first().waitFor();
    await assertScreen(page, "media-listening-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/media-listening-1920x1080.png` });
  });

  await capture({ width: 1280, height: 720 }, async (page) => {
    await openBook(page);
    await page.getByRole("button", { name: "Unit 2", exact: true }).click();
    await page.locator(".teacher-offline-pages aside button").filter({ hasText: "pg 20-21" }).evaluate((button) => button.click());
    await waitForPageImage(page);
    await assertScreen(page, "page-viewer-1280x720");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-1280x720.png` });
  });

  await capture({ width: 800, height: 360 }, async (page) => {
    await openBook(page);
    await openActivity(page, 1, "Reading · Exercise 3");
    await assertScreen(page, "activity-800x360");
    await page.screenshot({ path: `${artifactRoot}/activity-800x360.png` });
  });

  await capture({ width: 3840, height: 2160 }, async (page) => {
    await openBook(page);
    await openActivity(page, 2, "Vocabulary in Use · Exercise 4");
    await assertScreen(page, "activity-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/activity-3840x2160.png` });
  });

  console.log(JSON.stringify({ status: "passed", screenshots: 9, artifactRoot }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
