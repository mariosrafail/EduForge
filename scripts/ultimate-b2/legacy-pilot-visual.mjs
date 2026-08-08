import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4181";
const artifactRoot = "test-results/ultimate-b2-legacy-pilot/visual";
const targets = [
  { name: "compact-804x360", width: 804, height: 360 },
  { name: "full-hd-1920x1080", width: 1920, height: 1080 },
  { name: "4k-3840x2160", width: 3840, height: 2160 },
];
const activities = [
  { id: "ultimate-b2-sb-u1-p2-o1", label: /Reading.*Exercise 1/ },
  { id: "ultimate-b2-sb-u1-p2-o2", label: /Reading.*Exercise 2/ },
  { id: "ultimate-b2-sb-u1-p2-o3", label: /Reading.*Exercise 3/ },
  { id: "ultimate-b2-sb-u1-p2-o4", label: /Reading.*Exercise 4/ },
  { id: "ultimate-b2-sb-u1-p2-o5", label: /Reading.*Debate club/i },
];

function legacyPilotActivityUnit(activityId) {
  const unitMatch = /-u([0-9]+)-/.exec(activityId);
  return unitMatch ? Number(unitMatch[1]) : Number.NaN;
}

function legacyPilotActivityUnitLabel(unitNumber) {
  return new RegExp(`^Open Unit ${unitNumber}:`);
}

function targetUnitsFromActivities() {
  const units = activities.map((activity) => legacyPilotActivityUnit(activity.id));
  assert.ok(units.every(Number.isInteger), `Legacy pilot activities must include numeric unit ids: ${JSON.stringify(units)}`);
  const uniqueUnits = [...new Set(units)];
  assert.ok(uniqueUnits.length >= 1, "Legacy pilot visual targets must include at least one unit.");
  return uniqueUnits.sort((left, right) => left - right);
}

async function openInternalContents(page, unitNumber) {
  await page.evaluate((selectedUnitNumber) => {
    const current = window.history.state || {};
    const next = {
      teacherOffline: true,
      view: "book",
      location: { ...(current.location || {}), unitNumber: selectedUnitNumber, tab: "exercises", pageId: "" },
    };
    window.history.replaceState(next, "", "#book");
    window.dispatchEvent(new PopStateEvent("popstate", { state: next }));
  }, unitNumber);
  await page.locator(".teacher-offline-lessons").waitFor();
}

async function openPilotBookFromLauncher(page, targetName) {
  const targetUnits = targetUnitsFromActivities();
  if (targetUnits.length !== 1) {
    throw new Error(`${targetName} cannot use single launcher path because target units are ${JSON.stringify(targetUnits)}.`);
  }
  const targetUnit = targetUnits[0];
  const unitButton = page.getByRole("button", { name: legacyPilotActivityUnitLabel(targetUnit) });
  assert.equal(await unitButton.isVisible(), true, `${targetName} expects unit ${targetUnit} launcher button to be visible`);
  assert.equal(await unitButton.isEnabled(), true, `${targetName} expects unit ${targetUnit} launcher button to be enabled`);
  await unitButton.click();
  await page.locator(".teacher-offline-book").waitFor();
  await openInternalContents(page, targetUnit);
}

const preview = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4181"],
  { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);

async function waitForPreview() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Legacy pilot preview did not start.");
}

async function completeStartupIntro(page) {
  const intro = page.getByRole("dialog", { name: "Ultimate B2 opening" });
  if (await intro.count()) {
    assert.equal(await intro.getByRole("button", { name: "Skip intro" }).count(), 0);
    await intro.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));
  }
  await page.locator(".legacy-home-launcher").waitFor();
}

async function screenshot(page, target, objectNumber, state) {
  await page.screenshot({
    path: `${artifactRoot}/${target.name}-obj${objectNumber}-${state}.png`,
    animations: "disabled",
  });
}

async function assertPilotLayout(page, target, id) {
  await page.waitForFunction((activityId) => {
    const root = document.querySelector(`[data-legacy-pilot-activity="${activityId}"]`);
    if (!root) return false;
    return [...root.querySelectorAll("img")]
      .filter((image) => {
        const imageRect = image.getBoundingClientRect();
        return imageRect.width > 0 && imageRect.height > 0;
      })
      .every((image) => image.complete);
  }, id);
  const metrics = await page.locator(".ultimate-b2-legacy-pilot").evaluate((root) => {
    const rect = root.getBoundingClientRect();
    const stageScale = Number(document.querySelector("[data-teacher-stage-scale]")?.dataset.teacherStageScale);
    const fitViewport = root.closest(".teacher-offline-embedded-activity");
    const fitScale = Number(fitViewport?.dataset.fitScale);
    const presentationScale = stageScale * fitScale;
    const images = [...root.querySelectorAll("img")].filter((image) => {
      const imageRect = image.getBoundingClientRect();
      return imageRect.width > 0 && imageRect.height > 0;
    });
    const controls = [...root.querySelectorAll("button, input, textarea, audio, video")]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none"
          && style.visibility !== "hidden"
          && !element.matches('input[type="radio"], input[type="checkbox"]');
      })
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          selector: `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).trim().split(/\s+/).join(".")}` : ""}`,
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
          name: element.getAttribute("aria-label") || element.textContent?.trim() || "",
          width: bounds.width / presentationScale,
          height: bounds.height / presentationScale,
          renderedWidth: bounds.width,
          renderedHeight: bounds.height,
        };
      })
      .filter((control) => control.width && control.height);
    const smallestControl = controls.reduce((smallest, control) => (
      Math.min(control.width, control.height) < Math.min(smallest.width, smallest.height) ? control : smallest
    ));
    const fitContent = root.closest(".teacher-offline-embedded-activity-content");
    const fitStyle = fitContent ? getComputedStyle(fitContent) : null;
    const viewportStyle = fitViewport ? getComputedStyle(fitViewport) : null;
    return {
      activityId: root.dataset.legacyPilotActivity,
      stageScale,
      presentationScale,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      rootWidth: rect.width,
      rootInViewport: rect.left >= -1 && rect.right <= innerWidth + 1,
      brokenImages: images.filter((image) => !image.complete || image.naturalWidth === 0).length,
      brokenImageSources: images
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => ({ source: image.currentSrc || image.src, complete: image.complete, naturalWidth: image.naturalWidth })),
      minimumTarget: Math.min(smallestControl.width, smallestControl.height),
      smallestControl,
      fitScale,
      fitTransform: fitStyle?.transform || null,
      fitContentSize: fitContent ? {
        clientWidth: fitContent.clientWidth,
        clientHeight: fitContent.clientHeight,
        scrollWidth: fitContent.scrollWidth,
        scrollHeight: fitContent.scrollHeight,
      } : null,
      fitViewportSize: fitViewport ? {
        clientWidth: fitViewport.clientWidth,
        clientHeight: fitViewport.clientHeight,
        padding: viewportStyle?.padding,
        overflow: viewportStyle?.overflow,
      } : null,
      rasterUpscale: images.map((image) => ({
        source: image.currentSrc.split("/").at(-1),
        scale: Number((image.getBoundingClientRect().width / presentationScale / image.naturalWidth).toFixed(3)),
      })),
    };
  });
  assert.equal(metrics.activityId, id, `${target.name} activity identity`);
  assert.ok(metrics.documentOverflow <= 1, `${target.name} document overflow ${metrics.documentOverflow}px`);
  assert.ok(metrics.rootOverflow <= 1, `${target.name} pilot overflow ${metrics.rootOverflow}px`);
  assert.ok(metrics.rootInViewport, `${target.name} pilot root must remain in viewport`);
  assert.equal(metrics.brokenImages, 0, `${target.name} publisher images: ${JSON.stringify(metrics.brokenImageSources)}`);
  assert.ok(Number.isFinite(metrics.stageScale) && metrics.stageScale > 0, `${target.name} fixed-stage scale: ${metrics.stageScale}`);
  assert.ok(Number.isFinite(metrics.fitScale) && metrics.fitScale > 0, `${target.name} activity-fit scale: ${metrics.fitScale}`);
  assert.ok(metrics.minimumTarget >= 38, `${target.name} authored minimum target ${metrics.minimumTarget}px: ${JSON.stringify(metrics)}`);
  assert.ok(
    metrics.rasterUpscale.every((image) => image.scale <= 1.05),
    `${target.name} must not enlarge publisher rasters: ${JSON.stringify(metrics.rasterUpscale)}`,
  );
  return metrics;
}

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  await waitForPreview();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const results = [];

  for (const target of targets) {
    const context = await browser.newContext({ viewport: { width: target.width, height: target.height } });
    const page = await context.newPage();
    const consoleErrors = [];
    const externalRequests = [];
    const failedRequests = [];
    const requestCounts = new Map();
    page.on("console", (message) => {
      if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
    });
    page.on("request", (request) => {
      if (!request.url().startsWith(baseURL)) externalRequests.push(request.url());
      else requestCounts.set(request.url(), (requestCounts.get(request.url()) || 0) + 1);
    });
    page.on("requestfailed", (request) => {
      if (request.failure()?.errorText !== "net::ERR_ABORTED") {
        failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`);
      }
    });

    await page.goto(baseURL, { waitUntil: "networkidle" });
    await completeStartupIntro(page);
    assert.equal(await page.locator(".teacher-offline-library").count(), 1, `${target.name} requires teacher offline build`);
    await openPilotBookFromLauncher(page, target.name);
    await page.locator(".teacher-offline-lessons").waitFor();
    assert.equal(await page.locator(".teacher-offline-lessons article").count(), 38, `${target.name} Unit 1 count`);

    for (const [index, activity] of activities.entries()) {
      const objectNumber = index + 1;
      const row = page.locator(".teacher-offline-lessons article").filter({ hasText: activity.label }).first();
      await row.getByRole("button", { name: "Present" }).click();
      await page.locator(`[data-legacy-pilot-activity="${activity.id}"]`).waitFor();
      const initial = await assertPilotLayout(page, target, activity.id);
      await screenshot(page, target, objectNumber, "initial");

      if (objectNumber === 1) {
        const video = page.locator(".ultimate-b2-legacy-pilot video");
        await video.waitFor();
        await video.evaluate(async (element) => {
          element.muted = true;
          await element.play();
          element.currentTime = Math.min(1, element.duration || 1);
        });
        await page.waitForTimeout(180);
        await screenshot(page, target, objectNumber, "media");
        await video.evaluate((element) => element.pause());
      }

      if (objectNumber === 2) {
        await page.getByRole("button", { name: "Show text" }).click();
        await page.locator(".legacy-pilot-reading-image").waitFor();
        const segment = page.locator(".legacy-pilot-highlight-player audio").first();
        await segment.evaluate(async (element) => {
          element.muted = true;
          await element.play();
        });
        await page.locator(".legacy-pilot-highlight-region").first().waitFor();
        await screenshot(page, target, objectNumber, "text-and-highlight");
        await segment.evaluate((element) => element.pause());
        await page.locator(".legacy-pilot-write-question textarea").first().fill("A partially completed teacher response");
        await screenshot(page, target, objectNumber, "partial");
        await page.getByRole("button", { name: "Show answer" }).first().click();
        await page.getByText("Open response — no single correct answer.", { exact: true }).waitFor();
        await screenshot(page, target, objectNumber, "teacher-open-response");
      }

      if (objectNumber === 3) {
        await page.locator(".legacy-pilot-choice-grid input").first().check();
        await screenshot(page, target, objectNumber, "partial");
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await page.locator(".legacy-pilot-result").first().waitFor();
        await screenshot(page, target, objectNumber, "feedback");
        await page.getByRole("button", { name: "Show all answers" }).click();
        await page.getByText("Publisher answer", { exact: true }).first().waitFor();
        await screenshot(page, target, objectNumber, "teacher-reveal");
      }

      if (objectNumber === 4) {
        await page.locator(".legacy-pilot-write-question input").first().fill("not the answer");
        await screenshot(page, target, objectNumber, "partial");
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await page.locator(".legacy-pilot-result").first().waitFor();
        await screenshot(page, target, objectNumber, "feedback");
        await page.getByRole("button", { name: "Show all answers" }).click();
        await page.getByText("Publisher answer", { exact: true }).first().waitFor();
        await screenshot(page, target, objectNumber, "teacher-reveal");
      }

      if (objectNumber === 5) {
        await page.locator(".legacy-pilot-write-question textarea").fill("I agree because…");
        await screenshot(page, target, objectNumber, "partial");
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await page.getByText("Open response — no single correct answer.", { exact: true }).waitFor();
        assert.ok(await page.getByRole("button", { name: "Check", exact: true }).isDisabled(), "Open response must not auto-score");
        await screenshot(page, target, objectNumber, "teacher-open-response");
      }

      results.push({
        target: target.name,
        activityId: activity.id,
        minimumTarget: initial.minimumTarget,
        maximumRasterScale: Math.max(...initial.rasterUpscale.map((image) => image.scale)),
        overflow: Math.max(initial.documentOverflow, initial.rootOverflow),
      });
      await openInternalContents(page, legacyPilotActivityUnit(activity.id));
    }

    assert.deepEqual(consoleErrors, [], `${target.name} console errors`);
    assert.deepEqual(externalRequests, [], `${target.name} external requests`);
    assert.deepEqual(failedRequests, [], `${target.name} failed requests`);
    assert.deepEqual(
      [...requestCounts].filter(([url, count]) => (
        (/\/assets\/highlight_/.test(url) && count > 4)
        || (/\/assets\/unit-1-reading/.test(url) && count > 8)
      )),
      [],
      `${target.name} media retry loops`,
    );
    await context.close();
  }

  const report = {
    schemaVersion: "1.0",
    status: "passed",
    generatedAt: new Date().toISOString(),
    targets,
    activities: activities.map((activity) => activity.id),
    results,
    artifactRoot,
  };
  await writeFile(`${artifactRoot}/visual-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
