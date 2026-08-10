import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4186";
const artifactRoot = "test-results/ultimate-b2-debate-club-teacher";
const activityId = "ultimate-b2-sb-u1-p2-o5";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4186"], {
  cwd: process.cwd(), env: { ...process.env, VITE_APP_MODE: "android-teacher-offline", VITE_ANDROID_APP_MODE: "teacher-presentation-offline", VITE_OFFLINE_BOOK_SLUG: "ultimate-b2" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(baseURL)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Focused Debate Club Teacher preview did not start.");
}

async function sourceMetrics(root) {
  return root.evaluate((element) => {
    const rootBox = element.getBoundingClientRect();
    const box = (selector) => {
      const target = element.querySelector(selector); if (!target) return null;
      const bounds = target.getBoundingClientRect();
      return { x: (bounds.left - rootBox.left) / rootBox.width * 1024, y: (bounds.top - rootBox.top) / rootBox.height * 582, width: bounds.width / rootBox.width * 1024, height: bounds.height / rootBox.height * 582 };
    };
    const region = element.querySelector(".ultimate-b2-debate-response-region");
    const text = region.querySelector(".response-region-text");
    return {
      canvas: { width: rootBox.width, height: rootBox.height }, part: Number(element.dataset.debatePart),
      badge: box(".ultimate-b2-debate-badge"), instruction: box(".ultimate-b2-exercise-instruction"), prompt: box("h2"),
      argument: box(".ultimate-b2-debate-argument-image"), photo: box(".ultimate-b2-debate-part-image"), response: box(".ultimate-b2-debate-response-region"),
      lineLayers: (getComputedStyle(region).backgroundImage.match(/linear-gradient/g) || []).length,
      revealed: region.dataset.revealed, revealText: text.textContent, revealColor: getComputedStyle(region).color,
      revealFont: getComputedStyle(text).fontFamily, clipped: text.scrollHeight > region.clientHeight + 1 || text.scrollWidth > region.clientWidth + 1,
      brokenImages: [...element.querySelectorAll("img")].filter((image) => !image.complete || !image.naturalWidth).length,
      stretchedImages: [...element.querySelectorAll("img")].filter((image) => Math.abs(image.getBoundingClientRect().width / image.getBoundingClientRect().height - image.naturalWidth / image.naturalHeight) > .01).length,
    };
  });
}

const closeTo = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1.1, `${label}: expected ${expected}, got ${actual}`);
function assertBox(actual, expected, label) { assert.ok(actual, `${label} exists`); for (const key of ["x", "y", "width", "height"]) closeTo(actual[key], expected[key], `${label}.${key}`); }

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true }); await mkdir(artifactRoot, { recursive: true }); await waitForServer();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.setDefaultNavigationTimeout(120_000);
  const consoleErrors = []; const externalRequests = [];
  page.on("console", (message) => { if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text()); });
  page.on("request", (request) => { if (!request.url().startsWith(baseURL)) externalRequests.push(request.url()); });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const intro = page.getByRole("dialog", { name: "Ultimate B2 opening" });
  if (await intro.count()) await intro.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));
  await page.locator(".legacy-home-launcher").waitFor();
  await page.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await page.evaluate(() => {
    const current = window.history.state || {};
    const next = { teacherOffline: true, view: "book", location: { ...(current.location || {}), unitNumber: 1, tab: "exercises", pageId: "" } };
    window.history.replaceState(next, "", "#book"); window.dispatchEvent(new PopStateEvent("popstate", { state: next }));
  });
  const row = page.locator(".teacher-offline-lessons article").filter({ hasText: /Reading.*Debate club/i }).first();
  await row.getByRole("button", { name: "Present" }).click();
  const root = page.locator(`[data-debate-club-activity="${activityId}"]`); await root.waitFor();
  await page.waitForFunction((id) => [...document.querySelectorAll(`[data-debate-club-activity="${id}"] img`)].every((image) => image.complete && image.naturalWidth), activityId);
  const navigation = page.locator("[data-teacher-book-navigation]"); const toolbar = page.locator(".classroom-teaching-toolbar");
  const chromeBefore = { navigation: await navigation.boundingBox(), toolbar: await toolbar.boundingBox() };
  const previous = navigation.getByRole("button", { name: "Previous activity part" }); const next = navigation.getByRole("button", { name: "Next activity part" });
  assert.equal(await previous.isDisabled(), true); assert.equal(await next.isDisabled(), false);

  const part1Before = await sourceMetrics(root);
  assertBox(part1Before.badge, { x: 5, y: 18, width: 250, height: 105 }, "part1 badge");
  assertBox(part1Before.instruction, { x: 263, y: 45, width: 646, height: 60 }, "part1 instruction");
  assertBox(part1Before.prompt, { x: 111, y: 132, width: 841, height: 29 }, "part1 prompt");
  assertBox(part1Before.argument, { x: 665, y: 264, width: 336, height: 123 }, "part1 argument");
  assertBox(part1Before.photo, { x: 727, y: 387, width: 250, height: 166 }, "part1 photo");
  assertBox(part1Before.response, { x: 70, y: 272, width: 776, height: 296 }, "part1 response");
  assert.deepEqual({ lines: part1Before.lineLayers, revealed: part1Before.revealed, text: part1Before.revealText, broken: part1Before.brokenImages, stretched: part1Before.stretchedImages }, { lines: 10, revealed: "false", text: "", broken: 0, stretched: 0 });
  await root.locator(".ultimate-b2-debate-response-region").click();
  const part1Revealed = await sourceMetrics(root); assert.equal(part1Revealed.revealed, "true"); assert.equal(part1Revealed.revealText.split("\n").length, 10); assert.equal(part1Revealed.revealColor, "rgb(228, 0, 131)"); assert.match(part1Revealed.revealFont, /ITC Flora Std Medium/); assert.equal(part1Revealed.clipped, false);
  await page.screenshot({ path: `${artifactRoot}/part-1-revealed.png`, animations: "disabled" });

  await next.click(); await page.waitForFunction((id) => document.querySelector(`[data-debate-club-activity="${id}"]`)?.dataset.debatePart === "2", activityId);
  assert.equal(await previous.isDisabled(), false); assert.equal(await next.isDisabled(), true);
  const part2Before = await sourceMetrics(root);
  assert.equal(part2Before.badge, null); assert.equal(part2Before.instruction, null); assert.equal(part2Before.prompt, null);
  assertBox(part2Before.argument, { x: 60, y: 264, width: 268, height: 99 }, "part2 argument");
  assertBox(part2Before.photo, { x: 60, y: 350, width: 259, height: 172 }, "part2 photo");
  assertBox(part2Before.response, { x: 390, y: 242, width: 634, height: 236 }, "part2 response");
  assert.deepEqual({ lines: part2Before.lineLayers, revealed: part2Before.revealed, text: part2Before.revealText, broken: part2Before.brokenImages, stretched: part2Before.stretchedImages }, { lines: 8, revealed: "false", text: "", broken: 0, stretched: 0 });
  await root.locator(".ultimate-b2-debate-response-region").click();
  const part2Revealed = await sourceMetrics(root); assert.equal(part2Revealed.revealText.split("\n").length, 8); assert.equal(part2Revealed.clipped, false);
  await page.screenshot({ path: `${artifactRoot}/part-2-revealed.png`, animations: "disabled" });

  await previous.click(); await page.waitForFunction((id) => document.querySelector(`[data-debate-club-activity="${id}"]`)?.dataset.debatePart === "1", activityId);
  assert.equal((await sourceMetrics(root)).revealed, "true", "Part 1 reveal state persists independently");
  assert.deepEqual({ navigation: await navigation.boundingBox(), toolbar: await toolbar.boundingBox() }, chromeBefore);
  assert.deepEqual(consoleErrors, []); assert.deepEqual(externalRequests, []);
  const report = { status: "passed", activityId, canvas: "1024x582", parts: 2, lineCounts: [10, 8], revealStyle: { font: "ITC Flora Std Medium", size: 21, color: "#e40083" }, maxGeometryDeviationSourcePx: 1.1, clipping: false, stretchedAssets: false, independentRevealState: true, teacherChromeUnchanged: true, artifactRoot };
  await writeFile(`${artifactRoot}/report.json`, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); server.kill(); }
