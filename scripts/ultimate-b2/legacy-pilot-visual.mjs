import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

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

async function screenshot(page, target, objectNumber, state) {
  await page.screenshot({
    path: `${artifactRoot}/${target.name}-obj${objectNumber}-${state}.png`,
    animations: "disabled",
  });
}

async function assertPilotLayout(page, target, id) {
  const metrics = await page.locator(".ultimate-b2-legacy-pilot").evaluate((root) => {
    const rect = root.getBoundingClientRect();
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
      .map((element) => element.getBoundingClientRect())
      .filter((control) => control.width && control.height);
    return {
      activityId: root.dataset.legacyPilotActivity,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      rootWidth: rect.width,
      rootInViewport: rect.left >= -1 && rect.right <= innerWidth + 1,
      brokenImages: images.filter((image) => !image.complete || image.naturalWidth === 0).length,
      minimumTarget: Math.min(...controls.map((control) => Math.min(control.width, control.height))),
      rasterUpscale: images.map((image) => ({
        source: image.currentSrc.split("/").at(-1),
        scale: Number((image.getBoundingClientRect().width / image.naturalWidth).toFixed(3)),
      })),
    };
  });
  assert.equal(metrics.activityId, id, `${target.name} activity identity`);
  assert.ok(metrics.documentOverflow <= 1, `${target.name} document overflow ${metrics.documentOverflow}px`);
  assert.ok(metrics.rootOverflow <= 1, `${target.name} pilot overflow ${metrics.rootOverflow}px`);
  assert.ok(metrics.rootInViewport, `${target.name} pilot root must remain in viewport`);
  assert.equal(metrics.brokenImages, 0, `${target.name} publisher images`);
  assert.ok(metrics.minimumTarget >= 38, `${target.name} minimum target ${metrics.minimumTarget}px`);
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
  browser = await chromium.launch({ headless: true });
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
    assert.equal(await page.locator(".teacher-offline-library").count(), 1, `${target.name} requires teacher offline build`);
    await page.getByRole("button", { name: "Open Students Book" }).click();
    await page.getByRole("button", { name: "Unit 1", exact: true }).click();
    await page.locator('[title="Contents and exercises"]').click();
    assert.equal(await page.locator(".teacher-offline-lessons article").count(), 37, `${target.name} Unit 1 count`);

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
      await page.getByRole("button", { name: "Back to book" }).click();
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
