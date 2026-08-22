import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4193";
const artifactRoot = "test-results/android-teacher-reveal-navigation";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4193"], {
  cwd: process.cwd(),
  env: { ...process.env, VITE_APP_MODE: "android-teacher-offline", VITE_ANDROID_APP_MODE: "teacher-presentation-offline", VITE_OFFLINE_BOOK_SLUG: "ultimate-b2" },
  stdio: "ignore",
  windowsHide: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(baseURL)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Focused Teacher reveal-navigation preview did not start.");
}

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  await waitForServer();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.setDefaultNavigationTimeout(120_000);
  const consoleErrors = [];
  const externalRequests = [];
  page.on("console", (message) => { if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text()); });
  page.on("request", (request) => { if (!request.url().startsWith(baseURL)) externalRequests.push(request.url()); });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator('.legacy-home-launcher, [role="dialog"][aria-label="Ultimate B2 opening"]').first().waitFor();
  const intro = page.getByRole("dialog", { name: "Ultimate B2 opening" });
  if (await intro.count()) await intro.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));
  await page.locator(".legacy-home-launcher").waitFor();
  await page.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await page.evaluate(() => {
    const current = window.history.state || {};
    const next = { teacherOffline: true, view: "book", location: { ...(current.location || {}), unitNumber: 1, tab: "exercises", pageId: "" } };
    window.history.replaceState(next, "", "#book");
    window.dispatchEvent(new PopStateEvent("popstate", { state: next }));
  });
  const lessons = page.locator(".teacher-offline-lessons");
  await lessons.waitFor();
  const navigation = page.locator("[data-teacher-book-navigation]");
  const toolbar = page.locator(".classroom-teaching-toolbar");
  let chromeGeometry = null;

  const openActivity = async (text, expectedActivityId) => {
    await lessons.locator("article").filter({ hasText: text }).first().getByRole("button", { name: "Present" }).click();
    await page.locator(`[data-embedded-activity-id="${expectedActivityId}"]`).waitFor();
    await navigation.getByRole("button", { name: "Reload" }).waitFor().catch(async (error) => {
      const diagnostic = await page.evaluate(() => ({
        embedded: document.querySelector("[data-embedded-activity-id]")?.getAttribute("data-embedded-activity-id"),
        activity: document.querySelector("[data-legacy-unit-opener-activity], [data-complete-sentences-activity], [data-debate-club-activity]")?.outerHTML.slice(0, 300),
        buttons: [...document.querySelectorAll("[data-teacher-book-navigation] button")].map((button) => button.getAttribute("aria-label")),
      }));
      throw new Error(`${error.message}\nDiagnostic: ${JSON.stringify(diagnostic)}\nConsole: ${JSON.stringify(consoleErrors)}`);
    });
    const geometry = { navigation: await navigation.boundingBox(), toolbar: await toolbar.boundingBox() };
    if (!chromeGeometry) chromeGeometry = geometry;
    else assert.deepEqual(geometry, chromeGeometry, "Teacher navigation and toolbar geometry stay fixed");
    const order = await navigation.locator("button").evaluateAll((buttons) => buttons.map((button) => button.dataset.teacherControlId).filter(Boolean));
    assert.ok(order.indexOf("reveal:reload") < order.indexOf("book-switch:students-book"));
    assert.ok(order.indexOf("reveal:show-all") < order.indexOf("book-switch:students-book"));
    assert.ok(order.indexOf("reveal:show-next") < order.indexOf("book-switch:students-book"));
  };
  const closeActivity = async () => {
    await navigation.getByRole("button", { name: "Back", exact: true }).click();
    await page.evaluate(() => {
      const current = window.history.state || {};
      const next = { teacherOffline: true, view: "book", activityId: "", location: { ...(current.location || {}), unitNumber: 1, tab: "exercises", pageId: "" } };
      window.history.replaceState(next, "", "#book");
      window.dispatchEvent(new PopStateEvent("popstate", { state: next }));
    });
    await lessons.waitFor();
  };
  const controls = () => ({
    reload: navigation.getByRole("button", { name: "Reload", exact: true }),
    all: navigation.getByRole("button", { name: "Show All", exact: true }),
    next: navigation.getByRole("button", { name: "Show Next", exact: true }),
  });
  const assertIconState = async (button, expected) => {
    const state = await button.locator("img").evaluateAll((images) => ({
      broken: images.filter((image) => !image.complete || !image.naturalWidth).map((image) => image.dataset.iconState),
      visible: images.filter((image) => getComputedStyle(image).display !== "none").map((image) => image.dataset.iconState),
    }));
    assert.deepEqual(state.broken, []);
    assert.deepEqual(state.visible, [expected]);
  };

  await openActivity(/Unit opener.*Exercise 1/i, "ultimate-b2-sb-u1-p1-o1");
  let current = controls();
  const page5 = page.locator('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"]');
  const page5Regions = page5.locator("[data-response-region-id]");
  await page5Regions.first().waitFor();
  assert.equal(await current.reload.isDisabled(), true);
  await assertIconState(current.reload, "disabled");
  await assertIconState(current.next, "active");
  assert.equal(await page5Regions.evaluateAll((regions) => regions.filter((region) => region.dataset.revealed === "true").length), 0);
  const showNextBox = await current.next.boundingBox();
  await page.mouse.move(showNextBox.x + showNextBox.width / 2, showNextBox.y + showNextBox.height / 2);
  await page.mouse.down();
  await assertIconState(current.next, "pressed");
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelectorAll('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"] [data-revealed="true"]').length === 1);
  await page5Regions.nth(2).click();
  await current.next.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"] [data-response-region-id]')].every((region) => region.dataset.revealed === "true"));
  await page.waitForFunction(() => document.querySelector('[data-teacher-control-id="reveal:show-next"]')?.disabled === true);
  assert.equal(await current.next.isDisabled(), true);
  await assertIconState(current.next, "disabled");
  await current.reload.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"] [data-response-region-id]')].every((region) => region.dataset.revealed === "false"));
  await page.waitForFunction(() => document.querySelector('[data-teacher-control-id="reveal:reload"]')?.disabled === true);
  assert.equal(await current.reload.isDisabled(), true);
  await current.next.click();
  await page.waitForFunction(() => document.querySelectorAll('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"] [data-revealed="true"]').length === 1);
  await current.next.click();
  await page.waitForFunction(() => document.querySelectorAll('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"] [data-revealed="true"]').length === 2);
  await current.all.click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"] [data-response-region-id]')].every((region) => region.dataset.revealed === "true"));
  await page.screenshot({ path: `${artifactRoot}/page5-show-all.png`, animations: "disabled" });
  await closeActivity();

  const unsupported = lessons.locator("article").filter({ hasText: /Unit opener.*Exercise 2/i }).first();
  await unsupported.getByRole("button", { name: "Present" }).click();
  await page.locator('[data-embedded-activity-id="ultimate-b2-sb-u1-p1-o2"]').waitFor();
  const unsupportedControls = controls();
  assert.equal(await unsupportedControls.reload.count(), 1);
  assert.equal(await unsupportedControls.reload.isDisabled(), false);
  assert.equal(await unsupportedControls.all.isDisabled(), true);
  assert.equal(await unsupportedControls.next.isDisabled(), true);
  await assertIconState(unsupportedControls.all, "disabled");
  await assertIconState(unsupportedControls.next, "disabled");
  await unsupportedControls.reload.click();
  await page.locator('[data-embedded-activity-id="ultimate-b2-sb-u1-p1-o2"]').waitFor();
  assert.deepEqual({ navigation: await navigation.boundingBox(), toolbar: await toolbar.boundingBox() }, chromeGeometry, "Unsupported activity keeps the fixed Teacher chrome geometry");
  await closeActivity();

  await openActivity(/Reading.*Exercise 4/i, "ultimate-b2-sb-u1-p2-o4");
  current = controls();
  const complete = page.locator('[data-complete-sentences-activity="ultimate-b2-sb-u1-p2-o4"]');
  await complete.waitFor();
  await navigation.getByRole("button", { name: "Show Text", exact: true }).click();
  await page.locator('[data-show-text-view="open"]').waitFor();
  await current.next.click();
  await complete.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-complete-sentences-activity="ultimate-b2-sb-u1-p2-o4"] button[data-blank-id].revealed').length === 1);
  for (let count = 2; count <= 8; count += 1) {
    await current.next.click();
    await page.waitForFunction((expected) => document.querySelectorAll('[data-complete-sentences-activity="ultimate-b2-sb-u1-p2-o4"] button[data-blank-id].revealed').length === expected, count);
  }
  await page.waitForFunction(() => document.querySelector('[data-teacher-control-id="reveal:show-next"]')?.disabled === true);
  assert.equal(await current.next.isDisabled(), true);
  await current.reload.click();
  await page.waitForFunction(() => document.querySelectorAll('[data-complete-sentences-activity="ultimate-b2-sb-u1-p2-o4"] button[data-blank-id].revealed').length === 0);
  await navigation.getByRole("button", { name: "Show Text", exact: true }).click();
  await page.locator('[data-show-text-view="open"]').waitFor();
  assert.equal(await current.reload.isDisabled(), false);
  await current.reload.click();
  await complete.waitFor();
  await current.all.click();
  await page.waitForFunction(() => document.querySelectorAll('[data-complete-sentences-activity="ultimate-b2-sb-u1-p2-o4"] button[data-blank-id].revealed').length === 8);
  await page.screenshot({ path: `${artifactRoot}/complete-sentences-show-all.png`, animations: "disabled" });
  await closeActivity();

  await openActivity(/Reading.*Debate club/i, "ultimate-b2-sb-u1-p2-o5");
  current = controls();
  const debate = page.locator('[data-debate-club-activity="ultimate-b2-sb-u1-p2-o5"]');
  await debate.waitFor();
  await current.next.click();
  await page.waitForFunction(() => document.querySelector('[data-debate-club-activity="ultimate-b2-sb-u1-p2-o5"]')?.dataset.debatePart === "1" && document.querySelector('.ultimate-b2-debate-response-region')?.dataset.revealed === "true");
  await current.next.click();
  await page.waitForFunction(() => document.querySelector('[data-debate-club-activity="ultimate-b2-sb-u1-p2-o5"]')?.dataset.debatePart === "2" && document.querySelector('.ultimate-b2-debate-response-region')?.dataset.revealed === "true");
  await page.waitForFunction(() => document.querySelector('[data-teacher-control-id="reveal:show-next"]')?.disabled === true);
  assert.equal(await current.next.isDisabled(), true);
  await current.reload.click();
  await page.waitForFunction(() => document.querySelector('[data-debate-club-activity="ultimate-b2-sb-u1-p2-o5"]')?.dataset.debatePart === "1" && document.querySelector('.ultimate-b2-debate-response-region')?.dataset.revealed === "false");
  await current.all.click();
  await page.waitForFunction(() => document.querySelector('[data-teacher-control-id="reveal:show-all"]')?.disabled === true);
  assert.equal(await current.all.isDisabled(), true);
  await navigation.getByRole("button", { name: "Next activity part" }).click();
  await page.waitForFunction(() => document.querySelector('[data-debate-club-activity="ultimate-b2-sb-u1-p2-o5"]')?.dataset.debatePart === "2" && document.querySelector('.ultimate-b2-debate-response-region')?.dataset.revealed === "true");
  await navigation.getByRole("button", { name: "Previous activity part" }).click();
  await page.waitForFunction(() => document.querySelector('[data-debate-club-activity="ultimate-b2-sb-u1-p2-o5"]')?.dataset.debatePart === "1" && document.querySelector('.ultimate-b2-debate-response-region')?.dataset.revealed === "true");
  await page.screenshot({ path: `${artifactRoot}/debate-show-all-part1.png`, animations: "disabled" });

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(externalRequests, []);
  const report = {
    status: "passed",
    activities: ["ultimate-b2-sb-u1-p1-o1", "ultimate-b2-sb-u1-p2-o4", "ultimate-b2-sb-u1-p2-o5"],
    commands: ["Reload", "Show All", "Show Next"],
    canonicalOrder: "reveal controls before SB/GB/WB",
    canonicalArtworkStates: ["active", "pressed", "disabled"],
    sequentialCounts: { page5: 3, completeSentences: 8, debateClubParts: 2 },
    unsupportedActivityControls: { reload: "active", showAll: "disabled", showNext: "disabled" },
    teacherChromeUnchanged: true,
    artifactRoot,
  };
  await writeFile(`${artifactRoot}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
