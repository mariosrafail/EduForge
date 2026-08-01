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

async function waitForUnitOverview(page) {
  await page.locator(".teacher-offline-unit-overview").waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll(".teacher-unit-page-thumb img")]
    .every((image) => image.complete && image.naturalWidth > 0));
  await page.locator(".teacher-unit-page-thumb img").evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
}

const canonicalOverview = {
  1: ["pg 5", "pg 6-7", "pg 8-9", "pg 10-11", "pg 12", "pg 13", "pg 14-15", "pg 16", "pg 17-18"],
  2: ["pg 19", "pg 20-21", "pg 22-23", "pg 24-25", "pg 26", "pg 27", "pg 28-29", "pg 30", "pg 31-32", "pg 33-34"],
};

async function assertLegacyUnitOverview(page, unit, label) {
  await waitForUnitOverview(page);
  const overview = page.locator(".teacher-offline-unit-overview");
  const entries = overview.locator("[data-overview-entry]");
  assert.equal(await entries.count(), canonicalOverview[unit].length, `${label} entry count`);
  assert.deepEqual(await entries.locator(".teacher-unit-page-copy b").allTextContents(), canonicalOverview[unit], `${label} page labels`);
  const pageIds = await entries.evaluateAll((nodes) => nodes.flatMap((node) => node.dataset.pageIds.split(",")));
  assert.equal(pageIds.length, unit === 1 ? 10 : 12, `${label} real page count`);
  assert.equal(new Set(pageIds).size, pageIds.length, `${label} unique real pages`);
  assert.equal(await overview.getByText(/activities$/i).count(), 0, `${label} activity counts hidden`);
  assert.equal(await overview.locator("img").count(), unit === 1 ? 10 : 12, `${label} thumbnail count`);
  if (unit === 2) assert.equal(await overview.locator('[data-page-ids="reading-19"] strong').count(), 0, `${label} pg 19 heading omitted`);
  await assertScreen(page, label);
}

async function openPage(page, label) {
  await page.locator(".teacher-unit-page-card").filter({ hasText: label }).first().click();
  await waitForPageImage(page);
}

async function openActivity(page, unit, title) {
  if (await page.locator(".teacher-offline-presentation").count()) await page.getByRole("button", { name: "Back to book" }).click();
  if (await page.locator(".teacher-offline-pages-viewer").count()) await page.getByRole("button", { name: "Contents and exercises" }).click();
  await page.getByRole("button", { name: `Unit ${unit}`, exact: true }).click();
  await page.getByRole("button", { name: "Contents and exercises" }).click();
  const row = page.locator(".teacher-offline-lessons article").filter({ hasText: title }).first();
  await row.getByRole("button", { name: "Present" }).click();
  await page.locator(".teacher-offline-presentation").waitFor();
}

async function assertScreen(page, label) {
  await page.waitForFunction(() => [...document.images]
    .every((image) => image.complete && image.naturalWidth > 0));
  const metrics = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    missingImages: [...document.images].filter((image) => !image.complete || !image.naturalWidth).map((image) => image.src),
  }));
  assert.equal(metrics.overflow, 0, `${label} horizontal overflow`);
  assert.deepEqual(metrics.missingImages, [], `${label} missing images`);
}

async function assertLegacyLauncher(page, label) {
  const metrics = await page.evaluate(() => {
    const visible = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return Boolean(rect?.width && rect?.height);
    };
    return {
      launcher: visible(".legacy-home-launcher"),
      unitColumns: document.querySelectorAll(".legacy-home-unit-column").length,
      units: document.querySelectorAll(".legacy-home-unit").length,
      lockedUnits: document.querySelectorAll(".legacy-home-unit .legacy-home-lock").length,
      books: document.querySelectorAll(".legacy-home-book-button").length,
      lockedBooks: document.querySelectorAll(".legacy-home-book-button .legacy-home-lock").length,
      toolbar: visible(".legacy-home-classroom-toolbar"),
      settings: visible(".legacy-classroom-settings-trigger"),
    };
  });
  assert.deepEqual(metrics, {
    launcher: true,
    unitColumns: 2,
    units: 10,
    lockedUnits: 8,
    books: 4,
    lockedBooks: 3,
    toolbar: true,
    settings: true,
  }, `${label} launcher composition`);
}

async function assertLegacyPageViewer(page, label) {
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector(".teacher-offline-page-reader")?.getBoundingClientRect();
    const image = document.querySelector(".teacher-offline-page-image")?.getBoundingClientRect();
    const visible = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return Boolean(rect?.width && rect?.height);
    };
    return {
      panelExists: visible(".teacher-offline-page-reader"),
      headingExists: visible(".legacy-page-heading"),
      navigationExists: visible(".legacy-page-navigation"),
      toolsExist: visible(".legacy-classroom-viewer-toolbar"),
      bookHeaderVisible: visible(".teacher-offline-book-header"),
      centered: panel && image ? Math.abs((image.left + image.width / 2) - (panel.left + panel.width / 2)) < 3 : false,
      contained: panel && image ? image.left >= panel.left - 4 && image.right <= panel.right + 4 && image.top >= panel.top - 4 && image.bottom <= panel.bottom + 4 : false,
      panel: panel ? { left: panel.left, top: panel.top, right: panel.right, bottom: panel.bottom } : null,
      image: image ? { left: image.left, top: image.top, right: image.right, bottom: image.bottom } : null,
    };
  });
  assert.equal(metrics.panelExists, true, `${label} legacy panel`);
  assert.equal(metrics.headingExists, true, `${label} legacy heading`);
  assert.equal(metrics.navigationExists, true, `${label} lower navigation`);
  assert.equal(metrics.toolsExist, true, `${label} viewer tools`);
  assert.equal(metrics.bookHeaderVisible, false, `${label} web-style book header hidden`);
  assert.equal(metrics.centered, true, `${label} page centered`);
  assert.equal(metrics.contained, true, `${label} page contained: ${JSON.stringify({ panel: metrics.panel, image: metrics.image })}`);
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
    await assertScreen(page, "home-launcher-1920x1080");
    await assertLegacyLauncher(page, "home-launcher-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/home-launcher-1920x1080.png` });
    await page.getByRole("button", { name: "Open classroom settings" }).click();
    const settingsDialog = page.getByRole("dialog", { name: "Classroom settings" });
    await settingsDialog.waitFor();
    assert.equal(await settingsDialog.getByRole("tab").count(), 4, "Settings tab count");
    await assertScreen(page, "settings-audio-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/settings-audio-1920x1080.png` });
    await settingsDialog.getByRole("tab", { name: "Content" }).click();
    await settingsDialog.locator('[data-settings-panel="content"]').waitFor();
    await page.screenshot({ path: `${artifactRoot}/settings-content-1920x1080.png` });
    await settingsDialog.getByRole("tab", { name: "Graphics" }).click();
    await settingsDialog.locator('[data-settings-panel="graphics"]').waitFor();
    await page.screenshot({ path: `${artifactRoot}/settings-graphics-1920x1080.png` });
    await settingsDialog.getByRole("tab", { name: "About" }).click();
    await settingsDialog.getByText("Version 0.1.0", { exact: true }).waitFor();
    await page.screenshot({ path: `${artifactRoot}/settings-about-1920x1080.png` });
    await settingsDialog.getByRole("button", { name: "Close settings" }).click();
    const soundToggle = page.getByRole("button", { name: "Mute classroom interface sounds" });
    await soundToggle.click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Enable classroom interface sounds" }).click();
    await openBook(page);
    await page.getByRole("button", { name: "Unit 1", exact: true }).click();
    await assertLegacyUnitOverview(page, 1, "students-book-unit1-overview-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit1-overview-1920x1080.png` });
    await page.getByRole("button", { name: "Unit 2", exact: true }).click();
    await assertLegacyUnitOverview(page, 2, "students-book-unit2-overview-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit2-overview-1920x1080.png` });
    await page.getByRole("button", { name: "Unit 1", exact: true }).click();
    await openPage(page, "pg 5");
    await assertScreen(page, "page-viewer-unit1-page5-1920x1080");
    await assertLegacyPageViewer(page, "page-viewer-unit1-page5-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page5-1920x1080.png` });
    await page.getByRole("button", { name: "Pen tool" }).click();
    const overlayBox = await page.locator(".classroom-tools-overlay").boundingBox();
    await page.mouse.move(overlayBox.x + 260, overlayBox.y + 210);
    await page.mouse.down();
    await page.mouse.move(overlayBox.x + 470, overlayBox.y + 300, { steps: 10 });
    await page.mouse.up();
    await page.locator(".classroom-tools-overlay path[data-annotation-id]").waitFor();
    await page.screenshot({ path: `${artifactRoot}/classroom-tools-pen-1920x1080.png` });
    await page.getByRole("button", { name: "Undo annotation" }).click();
    await page.getByRole("button", { name: "Pen tool" }).click();
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
    await assertScreen(page, "home-launcher-1280x720");
    await assertLegacyLauncher(page, "home-launcher-1280x720");
    await page.screenshot({ path: `${artifactRoot}/home-launcher-1280x720.png` });
    await openBook(page);
    await page.getByRole("button", { name: "Unit 1", exact: true }).click();
    await assertLegacyUnitOverview(page, 1, "students-book-unit1-overview-1280x720");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit1-overview-1280x720.png` });
    await page.getByRole("button", { name: "Unit 2", exact: true }).click();
    await assertLegacyUnitOverview(page, 2, "students-book-unit2-overview-1280x720");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit2-overview-1280x720.png` });
    await page.getByRole("button", { name: "Unit 1", exact: true }).click();
    await openPage(page, "pg 5");
    await assertScreen(page, "page-viewer-unit1-page5-1280x720");
    await assertLegacyPageViewer(page, "page-viewer-unit1-page5-1280x720");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page5-1280x720.png` });
  });

  await capture({ width: 800, height: 360 }, async (page) => {
    await assertScreen(page, "home-launcher-800x360");
    await assertLegacyLauncher(page, "home-launcher-800x360");
    await page.screenshot({ path: `${artifactRoot}/home-launcher-800x360.png` });
    await page.getByRole("button", { name: "Open classroom settings" }).click();
    await page.getByRole("dialog", { name: "Classroom settings" }).waitFor();
    await page.screenshot({ path: `${artifactRoot}/settings-audio-800x360.png` });
    await page.getByRole("button", { name: "Close settings" }).click();
    await openBook(page);
    await assertLegacyUnitOverview(page, 1, "students-book-unit1-overview-800x360");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit1-overview-800x360.png` });
    await page.getByRole("button", { name: "Unit 2", exact: true }).click();
    await assertLegacyUnitOverview(page, 2, "students-book-unit2-overview-800x360");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit2-overview-800x360.png` });
    await page.getByRole("button", { name: "Unit 1", exact: true }).click();
    await openPage(page, "pg 5");
    await assertScreen(page, "page-viewer-unit1-page5-800x360");
    await assertLegacyPageViewer(page, "page-viewer-unit1-page5-800x360");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page5-800x360.png` });
  });

  await capture({ width: 3840, height: 2160 }, async (page) => {
    await assertScreen(page, "home-launcher-3840x2160");
    await assertLegacyLauncher(page, "home-launcher-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/home-launcher-3840x2160.png` });
    await page.getByRole("button", { name: "Open classroom settings" }).click();
    await page.getByRole("dialog", { name: "Classroom settings" }).waitFor();
    await page.screenshot({ path: `${artifactRoot}/settings-audio-3840x2160.png` });
    await page.getByRole("button", { name: "Close settings" }).click();
    await openBook(page);
    await page.getByRole("button", { name: "Unit 1", exact: true }).click();
    await assertLegacyUnitOverview(page, 1, "students-book-unit1-overview-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit1-overview-3840x2160.png` });
    await page.getByRole("button", { name: "Unit 2", exact: true }).click();
    await assertLegacyUnitOverview(page, 2, "students-book-unit2-overview-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit2-overview-3840x2160.png` });
    await page.getByRole("button", { name: "Unit 1", exact: true }).click();
    await openPage(page, "pg 5");
    await assertScreen(page, "page-viewer-unit1-page5-3840x2160");
    await assertLegacyPageViewer(page, "page-viewer-unit1-page5-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page5-3840x2160.png` });
  });

  console.log(JSON.stringify({ status: "passed", screenshots: 27, artifactRoot }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
