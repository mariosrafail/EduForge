import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4186";
const preview = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4186"],
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
  throw new Error("Teacher intro preview did not start.");
}

async function waitForLauncher(page) {
  await page.locator(".legacy-home-launcher").waitFor();
  assert.equal(await page.locator(".teacher-startup-intro").count(), 0);
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch(localPlaywrightLaunchOptions());

  const skipContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const skipPage = await skipContext.newPage();
  await skipPage.goto(baseURL, { waitUntil: "networkidle" });
  const intro = skipPage.getByRole("dialog", { name: "Ultimate B2 opening" });
  await intro.waitFor();
  assert.equal(await intro.getByRole("button", { name: "Skip intro" }).isVisible(), true);
  assert.match(await intro.locator("video").getAttribute("src"), /ultimate-b2-startup-intro-.*\.mp4$/);
  await intro.getByRole("button", { name: "Skip intro" }).click();
  await waitForLauncher(skipPage);
  await skipPage.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await skipPage.locator(".teacher-offline-book").waitFor();
  await skipPage.goBack();
  await waitForLauncher(skipPage);
  await skipPage.reload({ waitUntil: "networkidle" });
  await skipPage.getByRole("dialog", { name: "Ultimate B2 opening" }).waitFor();
  await skipPage.getByRole("button", { name: "Skip intro" }).click();
  await waitForLauncher(skipPage);
  await skipContext.close();

  const completionContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const completionPage = await completionContext.newPage();
  await completionPage.goto(baseURL, { waitUntil: "networkidle" });
  const completionVideo = completionPage.locator(".teacher-startup-intro video");
  await completionVideo.waitFor();
  const duration = await completionVideo.evaluate(async (video) => {
    video.muted = true;
    video.currentTime = 0;
    await video.play();
    return video.duration;
  });
  assert.ok(duration >= 5.7 && duration <= 6, `Unexpected intro duration: ${duration}`);
  await waitForLauncher(completionPage);
  await completionContext.close();

  const failureContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const failurePage = await failureContext.newPage();
  await failurePage.route("**/*.mp4", (route) => route.abort("failed"));
  await failurePage.goto(baseURL, { waitUntil: "domcontentloaded" });
  await waitForLauncher(failurePage);
  await failureContext.close();

  const blockedContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await blockedContext.addInitScript(() => {
    globalThis.__introPlayAttempts = 0;
    globalThis.__allowIntroPlayback = false;
    HTMLMediaElement.prototype.play = function play() {
      globalThis.__introPlayAttempts += 1;
      return globalThis.__allowIntroPlayback
        ? Promise.resolve()
        : Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
    };
  });
  const blockedPage = await blockedContext.newPage();
  await blockedPage.goto(baseURL, { waitUntil: "networkidle" });
  const playIntro = blockedPage.getByRole("button", { name: "Play intro" });
  await playIntro.waitFor();
  assert.equal(await playIntro.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2) === button;
  }), true, "Play intro must be the topmost pointer target.");
  await playIntro.evaluate((button) => {
    globalThis.__allowIntroPlayback = true;
    button.click();
  });
  await playIntro.waitFor({ state: "hidden" });
  assert.ok(await blockedPage.evaluate(() => globalThis.__introPlayAttempts >= 2));
  await blockedPage.getByRole("button", { name: "Skip intro" }).click();
  await waitForLauncher(blockedPage);
  await blockedContext.close();

  const reducedContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const reducedPage = await reducedContext.newPage();
  const mediaRequests = [];
  reducedPage.on("request", (request) => {
    if (/ultimate-b2-startup-intro-.*\.mp4$/.test(request.url())) mediaRequests.push(request.url());
  });
  await reducedPage.goto(baseURL, { waitUntil: "networkidle" });
  await waitForLauncher(reducedPage);
  assert.deepEqual(mediaRequests, [], "Reduced-motion startup must not request the intro video.");
  await reducedContext.close();

  console.log(JSON.stringify({
    status: "passed",
    scenarios: ["skip", "in-session-return", "fresh-reload", "natural-completion", "load-failure", "autoplay-blocked", "reduced-motion"],
    durationSeconds: Number(duration.toFixed(3)),
  }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
