import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4182";
const artifactRoot = "test-results/android-teacher-fixed-stage";
const viewports = [
  { width: 800, height: 360 },
  { width: 1024, height: 600 },
  { width: 1280, height: 720 },
  { width: 1280, height: 800 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
];

const preview = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4182"],
  { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);

async function waitForPreview() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(baseURL)).ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Teacher fixed-stage preview did not start.");
}

function near(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +/- ${tolerance}, received ${actual}`);
}

async function completeStartupIntro(page) {
  const intro = page.getByRole("dialog", { name: "Ultimate B2 opening" });
  if (await intro.count()) await intro.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));
  await page.locator(".legacy-home-launcher").waitFor();
}

async function readGeometry(page) {
  return page.evaluate(() => {
    const stage = document.querySelector("[data-teacher-stage]");
    const host = document.querySelector("[data-teacher-stage-host]");
    const stageRect = stage.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const scale = Number(stage.dataset.teacherStageScale);
    const logicalRect = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        x: (rect.left - stageRect.left) / scale,
        y: (rect.top - stageRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
      };
    };
    return {
      scale,
      logicalStage: { width: stage.offsetWidth, height: stage.offsetHeight },
      renderedStage: { left: stageRect.left, top: stageRect.top, width: stageRect.width, height: stageRect.height },
      host: { left: hostRect.left, top: hostRect.top, width: hostRect.width, height: hostRect.height },
      launcher: logicalRect(".legacy-home-launcher"),
      firstUnit: logicalRect(".legacy-home-unit"),
      title: logicalRect(".legacy-menu-title-animation"),
      toolbar: logicalRect(".teacher-offline-library > .classroom-teaching-toolbar"),
      document: {
        widthOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        heightOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        bodyWidthOverflow: document.body.scrollWidth - document.body.clientWidth,
        bodyHeightOverflow: document.body.scrollHeight - document.body.clientHeight,
      },
    };
  });
}

async function logicalRects(page, selectors) {
  return page.evaluate((requested) => {
    const stage = document.querySelector("[data-teacher-stage]");
    const stageRect = stage.getBoundingClientRect();
    const scale = Number(stage.dataset.teacherStageScale);
    return Object.fromEntries(Object.entries(requested).map(([key, selector]) => {
      const element = document.querySelector(selector);
      const rect = element.getBoundingClientRect();
      return [key, {
        x: (rect.left - stageRect.left) / scale,
        y: (rect.top - stageRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
        offsetWidth: element.offsetWidth,
        offsetHeight: element.offsetHeight,
      }];
    }));
  }, selectors);
}

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  await waitForPreview();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const results = [];
  let canonicalLauncher;

  for (const target of viewports) {
    const context = await browser.newContext({ viewport: target });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await completeStartupIntro(page);

    const geometry = await readGeometry(page);
    const expectedScale = Math.min(target.width / 1920, target.height / 1080);
    near(geometry.scale, expectedScale, 0.00001, `${target.width}x${target.height} scale`);
    assert.deepEqual(geometry.logicalStage, { width: 1920, height: 1080 }, `${target.width}x${target.height} intrinsic stage`);
    near(geometry.renderedStage.width, 1920 * expectedScale, 1, `${target.width}x${target.height} rendered width`);
    near(geometry.renderedStage.height, 1080 * expectedScale, 1, `${target.width}x${target.height} rendered height`);
    near(geometry.renderedStage.left + geometry.renderedStage.width / 2, geometry.host.left + geometry.host.width / 2, 1, `${target.width}x${target.height} horizontal center`);
    near(geometry.renderedStage.top + geometry.renderedStage.height / 2, geometry.host.top + geometry.host.height / 2, 1, `${target.width}x${target.height} vertical center`);
    assert.ok(geometry.renderedStage.left >= geometry.host.left - 1 && geometry.renderedStage.top >= geometry.host.top - 1, `${target.width}x${target.height} leading stage bounds`);
    assert.ok(geometry.renderedStage.left + geometry.renderedStage.width <= geometry.host.left + geometry.host.width + 1, `${target.width}x${target.height} horizontal containment`);
    assert.ok(geometry.renderedStage.top + geometry.renderedStage.height <= geometry.host.top + geometry.host.height + 1, `${target.width}x${target.height} vertical containment`);
    assert.deepEqual(geometry.document, { widthOverflow: 0, heightOverflow: 0, bodyWidthOverflow: 0, bodyHeightOverflow: 0 }, `${target.width}x${target.height} document overflow`);

    await page.getByRole("button", { name: /^Open Unit 1:/ }).click();
    await page.locator(".teacher-offline-unit-overview").waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll(".teacher-unit-page-thumb img")].every((image) => image.complete && image.naturalWidth > 0));
    const overview = await logicalRects(page, {
      screen: ".teacher-offline-unit-overview-screen",
      heading: ".legacy-overview-heading",
      frame: ".teacher-offline-unit-overview",
      firstEntry: ".teacher-unit-page-card",
      toolbar: ".teacher-offline-unit-overview-screen > .classroom-teaching-toolbar",
    });
    await page.locator(".teacher-unit-page-card").first().click();
    await page.waitForFunction(() => {
      const image = document.querySelector(".teacher-offline-page-image img");
      return image?.naturalWidth > 0 && image.getBoundingClientRect().width > 0;
    });
    const pageView = await logicalRects(page, {
      screen: ".teacher-offline-pages-viewer",
      heading: ".legacy-page-heading",
      reader: ".teacher-offline-page-reader",
      stage: ".teacher-offline-page-stage",
      image: ".teacher-offline-page-image",
      toolbar: ".teacher-offline-pages-viewer > .classroom-teaching-toolbar",
    });
    const pageSafety = await page.evaluate(() => {
      const image = document.querySelector(".teacher-offline-page-image").getBoundingClientRect();
      const hotspots = [...document.querySelectorAll(".teacher-offline-page-hotspot")].map((element) => element.getBoundingClientRect());
      return {
        hotspotCount: hotspots.length,
        hotspotsContained: hotspots.every((rect) => rect.left >= image.left - 1 && rect.right <= image.right + 1 && rect.top >= image.top - 1 && rect.bottom <= image.bottom + 1),
        image: { left: image.left, right: image.right, top: image.top, bottom: image.bottom },
        hotspots: hotspots.map(({ left, right, top, bottom }) => ({ left, right, top, bottom })),
        documentWidthOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        documentHeightOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      };
    });
    assert.ok(pageSafety.hotspotCount > 0, `${target.width}x${target.height} page hotspots`);
    assert.equal(pageSafety.hotspotsContained, true, `${target.width}x${target.height} hotspot containment: ${JSON.stringify(pageSafety)}`);
    assert.equal(pageSafety.documentWidthOverflow, 0, `${target.width}x${target.height} page horizontal overflow`);
    assert.equal(pageSafety.documentHeightOverflow, 0, `${target.width}x${target.height} page vertical overflow`);

    let interaction = null;
    if ([[1280, 720], [1920, 1080], [2560, 1440]].some(([width, height]) => width === target.width && height === target.height)) {
      await page.locator('[data-teacher-tool="pencil"]').click();
      const overlayBox = await page.locator(".classroom-tools-overlay").boundingBox();
      const start = { x: overlayBox.x + overlayBox.width * .25, y: overlayBox.y + overlayBox.height * .4 };
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(start.x + overlayBox.width * .05, start.y + overlayBox.height * .05, { steps: 4 });
      await page.mouse.up();
      const annotation = await page.evaluate(() => {
        const overlay = document.querySelector(".classroom-tools-overlay");
        const path = [...overlay.querySelectorAll("path[data-drawing-id]")].at(-1);
        const match = path?.getAttribute("d")?.match(/^M\s+([\d.]+)\s+([\d.]+)/);
        return { x: Number(match?.[1]) / overlay.clientWidth, y: Number(match?.[2]) / overlay.clientHeight };
      });
      near(annotation.x, .25, .015, `${target.width}x${target.height} normalized pencil x`);
      near(annotation.y, .4, .015, `${target.width}x${target.height} normalized pencil y`);

      await page.locator('[data-teacher-tool="mouse"]').click();
      for (let index = 0; index < 5; index += 1) {
        await page.locator(".teacher-offline-page-stage").dispatchEvent("wheel", { deltaY: -100, ctrlKey: true });
        await page.waitForFunction((minimum) => Number(document.querySelector(".teacher-offline-page-image")?.dataset.zoom) >= minimum, 1.19 + index * .2);
      }
      await page.waitForFunction(() => Number(document.querySelector(".teacher-offline-page-image")?.dataset.zoom) >= 1.8);
      const panBox = await page.locator(".teacher-offline-page-stage").boundingBox();
      const panStart = { x: panBox.x + panBox.width * .05, y: panBox.y + panBox.height * .45 };
      await page.mouse.move(panStart.x, panStart.y);
      await page.mouse.down();
      await page.mouse.move(panStart.x, panStart.y + 60, { steps: 5 });
      await page.mouse.up();
      const panY = await page.locator(".teacher-offline-page-image").evaluate((element) => Number(element.style.transform.match(/translate3d\([^,]+,\s*([\d.-]+)px/)?.[1]));
      near(panY, 60 / expectedScale, 3, `${target.width}x${target.height} logical page-pan delta`);
      interaction = { annotation, renderedPanDelta: 60, logicalPanDelta: panY };
      await page.mouse.click(panStart.x, panStart.y);
    }

    await page.locator(".teacher-offline-page-hotspot").first().click({ force: true });
    await page.locator(".teacher-offline-embedded-activity").waitFor();
    await page.waitForFunction(() => document.querySelector(".teacher-offline-embedded-activity")?.dataset.fitScale);
    const activity = await page.evaluate(() => {
      const host = document.querySelector(".teacher-offline-embedded-activity");
      const content = document.querySelector(".teacher-offline-embedded-activity-content");
      const hostRect = host.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      return {
        id: host.dataset.embeddedActivityId,
        mode: host.dataset.fitMode,
        scale: Number(host.dataset.fitScale),
        contained: contentRect.left >= hostRect.left - 1 && contentRect.right <= hostRect.right + 1 && contentRect.top >= hostRect.top - 1 && contentRect.bottom <= hostRect.bottom + 1,
        documentWidthOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        documentHeightOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      };
    });
    assert.equal(activity.mode, "scale", `${target.width}x${target.height} activity fit mode`);
    assert.ok(activity.scale > 0 && activity.scale <= 1, `${target.width}x${target.height} activity fit scale`);
    assert.equal(activity.contained, true, `${target.width}x${target.height} activity containment`);
    assert.equal(activity.documentWidthOverflow, 0, `${target.width}x${target.height} activity horizontal overflow`);
    assert.equal(activity.documentHeightOverflow, 0, `${target.width}x${target.height} activity vertical overflow`);

    const currentCanonical = { launcher: geometry.launcher, firstUnit: geometry.firstUnit, title: geometry.title, toolbar: geometry.toolbar, overview, pageView };
    if (target.width === 1920 && target.height === 1080) canonicalLauncher = currentCanonical;
    results.push({ viewport: `${target.width}x${target.height}`, expectedScale, ...geometry, overview, pageView, pageSafety, activity, interaction, consoleErrors });
    await context.close();
  }

  for (const result of results) {
    for (const key of ["launcher", "firstUnit", "title", "toolbar"]) {
      for (const field of ["x", "y", "width", "height"]) {
        near(result[key][field], canonicalLauncher[key][field], 1, `${result.viewport} ${key}.${field} canonical geometry`);
      }
    }
    for (const screen of ["overview", "pageView"]) {
      for (const key of Object.keys(canonicalLauncher[screen])) {
        for (const field of ["x", "y", "width", "height", "offsetWidth", "offsetHeight"]) {
          near(result[screen][key][field], canonicalLauncher[screen][key][field], 1, `${result.viewport} ${screen}.${key}.${field} canonical geometry`);
        }
      }
    }
    assert.deepEqual(result.consoleErrors, [], `${result.viewport} console errors`);
  }

  const nonWide = results.find(({ viewport }) => viewport === "1280x800");
  near(nonWide.renderedStage.top, 40, 1, "1280x800 vertical letterbox");
  near(nonWide.renderedStage.left, 0, 1, "1280x800 no horizontal pillarbox");

  await writeFile(`${artifactRoot}/matrix.json`, `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify({
    status: "passed",
    viewports: results.map(({ viewport, expectedScale, renderedStage }) => ({ viewport, expectedScale, renderedStage })),
    artifacts: artifactRoot,
  }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
