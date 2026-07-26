import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const baseURL = "http://127.0.0.1:4179";
const artifactRoot = "test-results/android-teacher-viewport";
const viewports = [
  { name: "phone-800x360", width: 800, height: 360, dpr: 1, profile: "compact-landscape", screenshot: true },
  { name: "phone-915x412-high-dpr", width: 915, height: 412, dpr: 3, profile: "compact-landscape" },
  { name: "small-tablet-1024x600", width: 1024, height: 600, dpr: 1, profile: "medium-landscape" },
  { name: "expanded-1180x820", width: 1180, height: 820, dpr: 1, profile: "expanded-classroom" },
  { name: "hd-1280x720", width: 1280, height: 720, dpr: 1, profile: "large-classroom" },
  { name: "tablet-1280x800", width: 1280, height: 800, dpr: 1, profile: "large-classroom" },
  { name: "laptop-1366x768", width: 1366, height: 768, dpr: 1, profile: "large-classroom" },
  { name: "full-hd-1920x1080", width: 1920, height: 1080, dpr: 1, profile: "extra-large-classroom", screenshot: true },
  { name: "qhd-2560x1440", width: 2560, height: 1440, dpr: 1, profile: "extra-large-classroom", screenshot: true },
  { name: "4k-3840x2160", width: 3840, height: 2160, dpr: 1, profile: "extra-large-classroom", screenshot: true },
];

const preview = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4179"],
  { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);

async function waitForPreview() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Teacher viewport preview did not start.");
}

function assertNear(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}±${tolerance}, received ${actual}`);
}

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  await waitForPreview();
  browser = await chromium.launch({ headless: true });
  const results = [];

  for (const target of viewports) {
    process.stdout.write(`Checking ${target.name}…\n`);
    const context = await browser.newContext({
      viewport: { width: target.width, height: target.height },
      deviceScaleFactor: target.dpr,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const forbiddenRequests = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    });
    page.on("request", (request) => {
      if (!request.url().startsWith(baseURL)) forbiddenRequests.push(request.url());
    });

    await page.goto(baseURL, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".teacher-offline-library").count(), 1, `${target.name} library`);
    assert.equal(await page.locator(".teacher-offline-book-card").count(), 1, `${target.name} book card`);
    await page.getByRole("button", { name: "Open Students Book" }).click();
    await page.locator(".teacher-offline-book").waitFor();
    await page.getByRole("button", { name: "Unit 2", exact: true }).click();
    await page.locator(".teacher-offline-pages aside button").filter({ hasText: "pg 20-21" }).evaluate((button) => button.click());
    await page.waitForFunction(() => {
      const image = document.querySelector(".teacher-offline-page-image img");
      return image?.naturalWidth > 0 && image.getBoundingClientRect().width > 0;
    });

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const shell = document.querySelector(".teacher-offline-book");
      const header = document.querySelector(".teacher-offline-book-header");
      const stage = document.querySelector(".teacher-offline-page-stage");
      const image = document.querySelector(".teacher-offline-page-image");
      const stageRect = stage.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const buttons = [...document.querySelectorAll(".teacher-offline-page-reader > header button")]
        .filter((button) => getComputedStyle(button).display !== "none")
        .map((button) => button.getBoundingClientRect());
      return {
        profile: root.dataset.teacherViewport,
        documentOverflow: root.scrollWidth - root.clientWidth,
        shellOverflow: shell.scrollWidth - shell.offsetWidth,
        headerHeight: header.getBoundingClientRect().height,
        stage: { width: stageRect.width, height: stageRect.height },
        image: { width: imageRect.width, height: imageRect.height, fit: image.dataset.fitMode },
        imageCount: document.querySelectorAll(".teacher-offline-page-image img").length,
        hotspotCount: image.querySelectorAll(".teacher-offline-page-hotspot").length,
        minControlHeight: Math.min(...buttons.map((rect) => rect.height)),
        controlsInViewport: buttons.every((rect) => rect.left >= -1 && rect.right <= innerWidth + 1),
        hotspotContained: [...image.querySelectorAll(".teacher-offline-page-hotspot")].every((hotspot) => {
          const rect = hotspot.getBoundingClientRect();
          return rect.left >= imageRect.left - 1 && rect.right <= imageRect.right + 1
            && rect.top >= imageRect.top - 1 && rect.bottom <= imageRect.bottom + 1;
        }),
      };
    });

    if (layout.documentOverflow > 1 || layout.shellOverflow > 1) {
      await page.screenshot({ path: `${artifactRoot}/${target.name}-overflow-debug.png` });
    }
    assert.equal(layout.profile, target.profile, `${target.name} profile`);
    assert.ok(layout.documentOverflow <= 1, `${target.name} document overflowed by ${layout.documentOverflow}px`);
    assert.ok(layout.shellOverflow <= 1, `${target.name} shell overflowed by ${layout.shellOverflow}px`);
    assert.ok(layout.headerHeight / target.height < 0.19, `${target.name} header consumes too much height`);
    assert.equal(layout.imageCount, 1, `${target.name} must mount one page image`);
    assert.ok(layout.hotspotCount > 0, `${target.name} hotspot page must expose positioned actions`);
    assert.ok(layout.controlsInViewport, `${target.name} page controls must remain in the viewport`);
    assert.ok(layout.minControlHeight >= 43, `${target.name} controls are too small`);
    assert.ok(layout.hotspotContained, `${target.name} hotspots must remain aligned to the page`);
    assert.equal(
      layout.image.fit,
      target.profile === "compact-landscape" ? "fit-width" : "fit-page",
      `${target.name} default fit`,
    );
    if (layout.image.fit === "fit-page") {
      assert.ok(layout.image.width <= layout.stage.width + 1 && layout.image.height <= layout.stage.height + 1);
    }

    await page.locator('[title="Fit width"]').click();
    const widthFit = await page.evaluate(() => {
      const stage = document.querySelector(".teacher-offline-page-stage").getBoundingClientRect();
      const image = document.querySelector(".teacher-offline-page-image").getBoundingClientRect();
      return { stageWidth: stage.width, imageWidth: image.width };
    });
    assertNear(widthFit.imageWidth, widthFit.stageWidth - 16, 2, `${target.name} fit width`);

    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    const stageBox = await page.locator(".teacher-offline-page-stage").boundingBox();
    const transformBefore = await page.locator(".teacher-offline-page-image").evaluate((node) => node.style.transform);
    await page.mouse.move(stageBox.x + 4, stageBox.y + stageBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(stageBox.x + 64, stageBox.y + stageBox.height / 2 - 40, { steps: 4 });
    await page.waitForTimeout(25);
    await page.mouse.up();
    const transformAfter = await page.locator(".teacher-offline-page-image").evaluate((node) => node.style.transform);
    assert.notEqual(transformAfter, transformBefore, `${target.name} zoomed page should pan`);
    await page.getByRole("button", { name: "Reset zoom" }).click();

    await page.locator('[title="Contents and exercises"]').click();
    assert.equal(await page.locator(".teacher-offline-lessons article").count(), 40, `${target.name} Unit 2 contents`);
    const firstActivity = page.locator(".teacher-offline-lessons article").filter({
      hasText: target.name === "4k-3840x2160" ? /Reading.*Exercise 3/ : /Reading/,
    }).first();
    await firstActivity.getByRole("button", { name: "Present" }).click();
    await page.locator(".teacher-offline-presentation").waitFor();
    const activityMetrics = await page.evaluate(() => {
      const card = document.querySelector(".teacher-presentation-activity").getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cardWidth: card.width,
        inViewport: card.left >= -1 && card.right <= innerWidth + 1,
      };
    });
    assert.ok(activityMetrics.overflow <= 1, `${target.name} activity overflow`);
    assert.ok(activityMetrics.inViewport, `${target.name} activity card must remain in viewport`);
    assert.equal(await page.locator(".unit2-normalized-activity").count(), 1, `${target.name} active renderer count`);

    if (target.name === "full-hd-1920x1080") {
      const video = page.locator("video");
      await video.waitFor();
      assert.match(await video.getAttribute("src"), /^(?:http:\/\/127\.0\.0\.1:4179)?\/assets\//);
      await page.screenshot({ path: `${artifactRoot}/${target.name}-activity.png` });
    }
    if (target.name === "4k-3840x2160") {
      await page.screenshot({ path: `${artifactRoot}/${target.name}-activity.png` });
      await page.getByRole("button", { name: "Show all answers" }).click();
      await page.getByText("Publisher answer", { exact: true }).first().waitFor();
      await page.screenshot({ path: `${artifactRoot}/${target.name}-answers.png` });
    }
    await page.getByRole("button", { name: "Back to book" }).click();

    if (target.name === "tablet-1280x800") {
      const typedActivity = page.locator(".teacher-offline-lessons article").filter({ hasText: /Vocabulary in Use.*Exercise 4/ }).first();
      await typedActivity.getByRole("button", { name: "Present" }).click();
      await page.locator(".teacher-offline-presentation input").first().fill("test");
      assert.equal(await page.locator(".teacher-offline-presentation input").first().inputValue(), "test");
      await page.getByRole("button", { name: "Back to book" }).click();
    }

    if (target.name === "full-hd-1920x1080") {
      const answerActivity = page.locator(".teacher-offline-lessons article").filter({ hasText: /Reading.*Exercise 3/ }).first();
      await answerActivity.getByRole("button", { name: "Present" }).click();
      await page.getByRole("button", { name: "Show all answers" }).click();
      await page.getByText("Publisher answer", { exact: true }).first().waitFor();
      await page.screenshot({ path: `${artifactRoot}/${target.name}-answers.png` });
      await page.getByRole("button", { name: "Back to book" }).click();
      await page.getByRole("button", { name: "Unit 1", exact: true }).click();
      const matchingActivity = page.locator(".teacher-offline-lessons article").filter({ hasText: /Vocabulary in Use.*Exercise 1/ }).first();
      await matchingActivity.getByRole("button", { name: "Present" }).click();
      assert.ok(await page.locator(".teacher-offline-presentation select").count() > 0, "Normalized matching activity must render choices");
      const activityLabel = page.locator(".teacher-offline-presentation > header small");
      const beforeNext = await activityLabel.textContent();
      await page.getByRole("button", { name: "Next" }).click();
      assert.notEqual(await activityLabel.textContent(), beforeNext, "Presentation Next must navigate");
      await page.getByRole("button", { name: "Previous" }).click();
      assert.equal(await page.locator(".unit2-normalized-activity").count(), 1, "Presentation must retain one renderer");
      await page.getByRole("button", { name: "Back to book" }).click();
      await page.getByRole("button", { name: "Unit 2", exact: true }).click();
    }

    if (target.name === "qhd-2560x1440") {
      const audioActivity = page.locator(".teacher-offline-lessons article").filter({ hasText: /Reading.*Exercise 2/ }).first();
      await audioActivity.getByRole("button", { name: "Present" }).click();
      const audio = page.locator("audio");
      await audio.waitFor();
      assert.equal(await audio.getAttribute("preload"), "metadata");
      assert.match(await audio.getAttribute("src"), /^(?:http:\/\/127\.0\.0\.1:4179)?\/assets\//);
      await page.getByRole("button", { name: "Back to book" }).click();
    }

    await page.locator('[title="Book pages"]').click();
    if (target.screenshot) {
      await page.locator(".teacher-offline-pages aside button").filter({ hasText: "pg 20-21" }).evaluate((button) => button.click());
      await page.waitForFunction(() => {
        const image = document.querySelector(".teacher-offline-page-image img");
        return image?.naturalWidth > 0 && image.getBoundingClientRect().width > 0;
      });
      const screenshotFit = target.profile === "compact-landscape" ? "fit-width" : "fit-page";
      await page.locator(`[title="${screenshotFit === "fit-width" ? "Fit width" : "Fit page"}"]`).click();
      await page.waitForFunction(
        (fit) => document.querySelector(".teacher-offline-page-image")?.dataset.fitMode === fit,
        screenshotFit,
      );
      await page.screenshot({ path: `${artifactRoot}/${target.name}-page.png` });
    }

    assert.deepEqual(consoleErrors, [], `${target.name} console errors`);
    assert.deepEqual(forbiddenRequests, [], `${target.name} forbidden requests`);
    results.push({
      viewport: `${target.width}x${target.height}@${target.dpr}`,
      profile: target.profile,
      pageStage: `${Math.round(layout.stage.width)}x${Math.round(layout.stage.height)}`,
      headerHeight: Math.round(layout.headerHeight),
      minimumControlHeight: Math.round(layout.minControlHeight),
      horizontalOverflow: Math.max(layout.documentOverflow, layout.shellOverflow),
      consoleErrors: consoleErrors.length,
      forbiddenRequests: forbiddenRequests.length,
    });
    await context.close();
  }

  console.log(JSON.stringify({ status: "passed", results, artifacts: artifactRoot }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
