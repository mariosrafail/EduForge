import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4186";
const geometryTargets = [
  { name: "compact-landscape", width: 800, height: 360 },
  { name: "small-tablet", width: 1024, height: 600 },
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd", width: 2560, height: 1440 },
  { name: "4k", width: 3840, height: 2160 },
  { name: "narrow-portrait", width: 390, height: 844 },
];
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

async function installBlockedAutoplay(context, { controllable = false } = {}) {
  await context.addInitScript((canControl) => {
    globalThis.__introPlayAttempts = 0;
    globalThis.__allowIntroPlayback = false;
    HTMLMediaElement.prototype.play = function play() {
      globalThis.__introPlayAttempts += 1;
      return canControl && globalThis.__allowIntroPlayback
        ? Promise.resolve()
        : Promise.reject(new DOMException("Autoplay blocked", "NotAllowedError"));
    };
  }, controllable);
}

async function installDelayedPackValidation(context) {
  await context.addInitScript(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    globalThis.__packValidationDigestCalls = 0;
    globalThis.__releasePackValidation = () => release();
    Object.defineProperty(crypto.subtle, "digest", {
      configurable: true,
      value: async (...args) => {
        globalThis.__packValidationDigestCalls += 1;
        await gate;
        return digest(...args);
      },
    });
  });
}

async function installInvalidPackValidation(context) {
  await context.addInitScript(() => {
    Object.defineProperty(crypto.subtle, "digest", {
      configurable: true,
      value: async () => new Uint8Array(32).buffer,
    });
  });
}

async function assertIntroGeometry(page, target) {
  const intro = page.getByRole("dialog", { name: "Ultimate B2 opening" });
  const video = intro.locator("video");
  await intro.waitFor();
  await video.evaluate(async (element) => {
    if (element.readyState < 1) {
      await new Promise((resolve) => element.addEventListener("loadedmetadata", resolve, { once: true }));
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const metrics = await intro.evaluate((stage) => {
    const element = stage.querySelector("video");
    const stageBounds = stage.getBoundingClientRect();
    const videoBounds = element.getBoundingClientRect();
    const stageStyle = getComputedStyle(stage);
    const videoStyle = getComputedStyle(element);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      startupBackgrounds: {
        html: getComputedStyle(document.documentElement).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
        root: getComputedStyle(document.querySelector("#root")).backgroundColor,
        host: getComputedStyle(document.querySelector("[data-teacher-stage-host]")).backgroundColor,
        fixedStage: getComputedStyle(document.querySelector("[data-teacher-stage]")).backgroundColor,
        settingsSurface: getComputedStyle(document.querySelector(".teacher-offline-settings-surface")).backgroundColor,
        view: getComputedStyle(document.querySelector(".teacher-offline-view-transition")).backgroundColor,
      },
      stage: {
        left: stageBounds.left,
        top: stageBounds.top,
        right: stageBounds.right,
        bottom: stageBounds.bottom,
        background: stageStyle.backgroundColor,
        height: stageStyle.height,
        minHeight: stageStyle.minHeight,
        padding: stageStyle.padding,
        boxSizing: stageStyle.boxSizing,
        gridTemplateRows: stageStyle.gridTemplateRows,
        alignContent: stageStyle.alignContent,
        alignItems: stageStyle.alignItems,
      },
      video: {
        left: videoBounds.left,
        top: videoBounds.top,
        right: videoBounds.right,
        bottom: videoBounds.bottom,
        width: videoBounds.width,
        height: videoBounds.height,
        naturalWidth: element.videoWidth,
        naturalHeight: element.videoHeight,
        objectFit: videoStyle.objectFit,
        background: videoStyle.backgroundColor,
        position: videoStyle.position,
        margin: videoStyle.margin,
        inset: videoStyle.inset,
        alignSelf: videoStyle.alignSelf,
        gridRow: videoStyle.gridRow,
        transform: videoStyle.transform,
      },
      overflow: {
        horizontal: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        vertical: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      },
      launcherCount: document.querySelectorAll(".legacy-home-launcher").length,
      toolbarCount: document.querySelectorAll(".classroom-teaching-toolbar").length,
      skipCount: [...document.querySelectorAll("button")]
        .filter((button) => button.textContent?.trim() === "Skip intro").length,
    };
  });
  const horizontalCenter = (metrics.video.left + metrics.video.right) / 2;
  const verticalCenter = (metrics.video.top + metrics.video.bottom) / 2;
  const margins = [
    metrics.video.left,
    metrics.viewport.width - metrics.video.right,
    metrics.video.top,
    metrics.viewport.height - metrics.video.bottom,
  ];
  const renderedRatio = metrics.video.width / metrics.video.height;
  const naturalRatio = metrics.video.naturalWidth / metrics.video.naturalHeight;
  const stageScale = Math.min(target.width / 1920, target.height / 1080);
  assert.deepEqual(metrics.viewport, { width: target.width, height: target.height }, `${target.name} viewport`);
  assert.ok(Object.values(metrics.startupBackgrounds).every((background) => background === "rgb(254, 254, 254)"), `${target.name} physical startup layers: ${JSON.stringify(metrics.startupBackgrounds)}`);
  assert.equal(metrics.stage.background, "rgb(254, 254, 254)", `${target.name} authored near-white stage`);
  assert.equal(metrics.video.background, "rgb(254, 254, 254)", `${target.name} authored near-white video backing`);
  assert.equal(metrics.video.objectFit, "contain", `${target.name} contain fit`);
  assert.equal(metrics.video.naturalWidth, 1024, `${target.name} source width`);
  assert.equal(metrics.video.naturalHeight, 768, `${target.name} source height`);
  assert.ok(Math.abs(renderedRatio - naturalRatio) <= 0.01, `${target.name} aspect ratio: ${JSON.stringify(metrics)}`);
  assert.ok(Math.abs(horizontalCenter - target.width / 2) <= 2, `${target.name} horizontal center: ${JSON.stringify(metrics)}`);
  assert.ok(Math.abs(verticalCenter - target.height / 2) <= 2, `${target.name} vertical center: ${JSON.stringify(metrics)}`);
  assert.ok(margins.every((margin) => margin >= 15), `${target.name} near-white margins: ${JSON.stringify(margins)}`);
  assert.ok(metrics.video.width <= (1024 * stageScale) + 1, `${target.name} stage-scaled width bound`);
  assert.ok(metrics.video.height <= (768 * stageScale) + 1, `${target.name} stage-scaled height bound`);
  assert.ok(metrics.video.left >= 0 && metrics.video.right <= target.width, `${target.name} horizontal containment`);
  assert.ok(metrics.video.top >= 0 && metrics.video.bottom <= target.height, `${target.name} vertical containment`);
  assert.ok(metrics.overflow.horizontal <= 1 && metrics.overflow.vertical <= 1, `${target.name} overflow: ${JSON.stringify(metrics.overflow)}`);
  assert.equal(metrics.launcherCount, 0, `${target.name} launcher hidden`);
  assert.equal(metrics.toolbarCount, 0, `${target.name} toolbar hidden`);
  assert.equal(metrics.skipCount, 0, `${target.name} skip absent`);
  assert.doesNotMatch(await page.locator("body").innerText(), /Checking classroom content/i, `${target.name} has no pre-intro pack message`);
  return metrics;
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch(localPlaywrightLaunchOptions());

  const geometryResults = [];
  for (const target of geometryTargets) {
    const context = await browser.newContext({ viewport: { width: target.width, height: target.height } });
    await installBlockedAutoplay(context);
    const page = await context.newPage();
    await page.goto(baseURL, { waitUntil: "networkidle" });
    const playIntro = page.getByRole("button", { name: "Play intro" });
    await playIntro.waitFor();
    assert.equal(await page.getByRole("button").count(), 1, `${target.name} has only the playback action`);
    geometryResults.push({ target: target.name, ...await assertIntroGeometry(page, target) });
    await context.close();
  }

  const pendingPackContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await installDelayedPackValidation(pendingPackContext);
  const pendingPackPage = await pendingPackContext.newPage();
  await pendingPackPage.goto(baseURL, { waitUntil: "domcontentloaded" });
  await pendingPackPage.waitForFunction(() => globalThis.__packValidationDigestCalls > 0);
  const pendingIntro = pendingPackPage.getByRole("dialog", { name: "Ultimate B2 opening" });
  await pendingIntro.waitFor();
  assert.equal(await pendingPackPage.locator(".legacy-home-launcher").count(), 0, "Launcher must not render while intro and pack validation are pending.");
  assert.doesNotMatch(await pendingPackPage.locator("body").innerText(), /Checking classroom content/i, "Pack validation must not replace the intro with a loading message.");
  await pendingIntro.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));
  await pendingPackPage.locator('[data-teacher-view="pack-wait"]').waitFor();
  assert.equal((await pendingPackPage.locator("body").innerText()).trim(), "", "Post-intro pack wait must remain visually plain.");
  assert.equal(await pendingPackPage.locator("[data-teacher-stage-host]").evaluate((host) => getComputedStyle(host).backgroundColor), "rgb(254, 254, 254)");
  await pendingPackPage.evaluate(() => globalThis.__releasePackValidation());
  await waitForLauncher(pendingPackPage);
  await pendingPackContext.close();

  const invalidPackContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await installInvalidPackValidation(invalidPackContext);
  const invalidPackPage = await invalidPackContext.newPage();
  await invalidPackPage.goto(baseURL, { waitUntil: "domcontentloaded" });
  const invalidPackIntro = invalidPackPage.getByRole("dialog", { name: "Ultimate B2 opening" });
  await invalidPackIntro.waitFor();
  assert.equal(await invalidPackPage.getByRole("alert").count(), 0, "Pack failure must stay behind the intro.");
  assert.doesNotMatch(await invalidPackPage.locator("body").innerText(), /Content pack unavailable or damaged/i);
  await invalidPackIntro.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));
  const packFailure = invalidPackPage.getByRole("alert");
  await packFailure.waitFor();
  assert.match(await packFailure.innerText(), /Content pack unavailable or damaged[\s\S]*Reinstall the verified classroom application/);
  await invalidPackContext.close();

  const interactionContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await installBlockedAutoplay(interactionContext, { controllable: true });
  const interactionPage = await interactionContext.newPage();
  await interactionPage.goto(baseURL, { waitUntil: "networkidle" });
  const interactionIntro = interactionPage.getByRole("dialog", { name: "Ultimate B2 opening" });
  const interactionVideo = interactionIntro.locator("video");
  const playIntro = interactionPage.getByRole("button", { name: "Play intro" });
  await playIntro.waitFor();
  assert.equal(await interactionPage.getByRole("button", { name: "Skip intro" }).count(), 0);
  await interactionIntro.click({ position: { x: 8, y: 8 } });
  await interactionVideo.evaluate((video) => video.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await interactionPage.keyboard.press("Escape");
  assert.equal(await interactionIntro.isVisible(), true, "Background, video, and Escape cannot dismiss the intro.");
  assert.equal(await interactionPage.locator(".legacy-home-launcher").count(), 0);
  await interactionPage.evaluate(() => { globalThis.__allowIntroPlayback = true; });
  const playTarget = await playIntro.evaluate((button) => {
    const bounds = button.getBoundingClientRect();
    const target = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    const style = getComputedStyle(button);
    return {
      isButton: target === button,
      target: `${target?.tagName}.${target?.className}`,
      bounds: { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height },
      pointerEvents: style.pointerEvents,
      zIndex: style.zIndex,
      position: style.position,
    };
  });
  assert.equal(playTarget.isButton, true, `Play intro must be the topmost pointer target: ${JSON.stringify(playTarget)}`);
  await playIntro.click();
  await playIntro.waitFor({ state: "hidden" });
  assert.equal(await interactionIntro.isVisible(), true, "Play intro starts playback rather than skipping it.");
  assert.ok(await interactionPage.evaluate(() => globalThis.__introPlayAttempts >= 2));
  await interactionVideo.evaluate((video) => video.dispatchEvent(new Event("ended")));
  await waitForLauncher(interactionPage);
  await interactionContext.close();

  const completionContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const completionPage = await completionContext.newPage();
  await completionPage.goto(baseURL, { waitUntil: "networkidle" });
  const completionIntro = completionPage.getByRole("dialog", { name: "Ultimate B2 opening" });
  const completionVideo = completionIntro.locator("video");
  await completionIntro.waitFor();
  assert.equal(await completionPage.getByRole("button", { name: "Skip intro" }).count(), 0);
  assert.match(await completionVideo.getAttribute("src"), /ultimate-b2-startup-intro-.*\.mp4$/);
  const duration = await completionVideo.evaluate(async (video) => {
    if (video.readyState < 1) {
      await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
    }
    video.muted = true;
    video.currentTime = 0;
    await video.play();
    return video.duration;
  });
  assert.ok(duration >= 5.7 && duration <= 6, `Unexpected intro duration: ${duration}`);
  await waitForLauncher(completionPage);
  await completionPage.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await completionPage.locator(".teacher-offline-book").waitFor();
  await completionPage.goBack();
  await waitForLauncher(completionPage);
  await completionPage.reload({ waitUntil: "networkidle" });
  await completionPage.getByRole("dialog", { name: "Ultimate B2 opening" }).waitFor();
  assert.equal(await completionPage.getByRole("button", { name: "Skip intro" }).count(), 0, "Fresh reload shows a non-skippable intro.");
  await completionContext.close();

  const failureContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const failurePage = await failureContext.newPage();
  await failurePage.route("**/*.mp4", (route) => route.abort("failed"));
  await failurePage.goto(baseURL, { waitUntil: "domcontentloaded" });
  await waitForLauncher(failurePage);
  await failureContext.close();

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

  const appSource = await readFile("src/apps/android-teacher-offline/TeacherOfflineApp.jsx", "utf8");
  assert.match(appSource, /if \(startupIntroPendingRef\.current\)\s*\{\s*return;\s*\}/, "Native Back must be consumed while the intro is active.");
  assert.doesNotMatch(appSource, /if \(startupIntroPendingRef\.current\)\s*\{\s*setStartupIntroPending\(false\)/);

  console.log(JSON.stringify({
    status: "passed",
    scenarios: [
      "responsive-geometry",
      "intro-first-during-pack-validation",
      "plain-post-intro-pack-wait",
      "post-intro-pack-failure",
      "no-manual-bypass",
      "natural-completion",
      "in-session-return",
      "fresh-reload",
      "load-failure",
      "autoplay-blocked",
      "reduced-motion",
      "native-back-consumed",
    ],
    geometryTargets: geometryResults.map(({ target, video }) => ({
      target,
      rendered: `${Number(video.width.toFixed(2))}x${Number(video.height.toFixed(2))}`,
      source: `${video.naturalWidth}x${video.naturalHeight}`,
    })),
    durationSeconds: Number(duration.toFixed(3)),
  }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
