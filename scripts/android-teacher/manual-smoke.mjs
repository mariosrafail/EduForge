import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

import teacherSolutions from "../../android-content-packs/ultimate-b2-students-book/teacher-solutions.json" with { type: "json" };

const baseURL = "http://127.0.0.1:4178";
const preview = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4178"],
  {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
  },
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
  throw new Error("Teacher offline preview did not start.");
}

function exerciseRow(page, title) {
  return page.locator(".teacher-offline-lessons article").filter({ hasText: title }).first();
}

async function assertLauncherPressedArtwork(page, button, label) {
  const artwork = button.locator(".legacy-menu-button-art");
  const normal = artwork.locator(".normal");
  const pressed = artwork.locator(".hover-pressed");
  assert.equal(await normal.evaluate((image) => getComputedStyle(image).opacity), "1", `${label} starts with normal artwork`);
  assert.equal(await pressed.evaluate((image) => getComputedStyle(image).opacity), "0", `${label} starts without pressed artwork`);

  const box = await button.boundingBox();
  assert.ok(box, `${label} must have a visible press target`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(50);
  assert.equal(await normal.evaluate((image) => getComputedStyle(image).opacity), "0", `${label} press hides normal artwork`);
  assert.equal(await pressed.evaluate((image) => getComputedStyle(image).opacity), "1", `${label} press shows recovered pressed artwork`);
  await page.mouse.move(1, 1);
  await page.mouse.up();
  assert.equal(await normal.evaluate((image) => getComputedStyle(image).opacity), "1", `${label} release restores normal artwork`);
  assert.equal(await pressed.evaluate((image) => getComputedStyle(image).opacity), "0", `${label} release hides pressed artwork`);
}

const canonicalOverview = {
  1: [
    ["pg 5", "ub2-sb-unit-1-part-1"],
    ["pg 6-7", "ub2-sb-unit-1-part-2"],
    ["pg 8-9", "ub2-sb-unit-1-part-3"],
    ["pg 10-11", "ub2-sb-unit-1-part-4"],
    ["pg 12", "ub2-sb-unit-1-part-5"],
    ["pg 13", "ub2-sb-unit-1-part-6"],
    ["pg 14-15", "ub2-sb-unit-1-part-7"],
    ["pg 16", "ub2-sb-unit-1-part-8"],
    ["pg 17-18", "ub2-sb-unit-1-part-9,ub2-sb-unit-1-part-10"],
  ],
  2: [
    ["pg 19", "reading-19"],
    ["pg 20-21", "reading-20-21"],
    ["pg 22-23", "vocabulary-22-23"],
    ["pg 24-25", "grammar-24-25"],
    ["pg 26", "listening-26"],
    ["pg 27", "speaking-27"],
    ["pg 28-29", "writing-28-29"],
    ["pg 30", "review-30"],
    ["pg 31-32", "practice-31,practice-32"],
    ["pg 33-34", "progress-check-33,progress-check-34"],
  ],
};

async function assertCanonicalUnitOverview(page, unit) {
  const overview = page.locator(".teacher-offline-unit-overview");
  await overview.waitFor();
  const entries = overview.locator("[data-overview-entry]");
  assert.equal(await entries.count(), canonicalOverview[unit].length);
  assert.deepEqual(await entries.evaluateAll((nodes) => nodes.map((node) => [
    node.querySelector(".teacher-unit-page-copy b")?.textContent,
    node.dataset.pageIds,
  ])), canonicalOverview[unit]);
  await page.waitForFunction(() => [...document.querySelectorAll(".teacher-unit-page-thumb img")]
    .every((image) => image.complete && image.naturalWidth > 0));
  assert.equal(await overview.getByText(/activities$/i).count(), 0);
  const representedIds = (await entries.evaluateAll((nodes) => nodes.flatMap((node) => node.dataset.pageIds.split(","))));
  assert.equal(new Set(representedIds).size, representedIds.length);
}

async function openExercises(page, unitNumber) {
  const unitTabs = page.locator(".teacher-offline-unit-tabs");
  if (!await unitTabs.isVisible()) await page.getByRole("button", { name: "Contents and exercises" }).click();
  await unitTabs.getByRole("button", { name: `Unit ${unitNumber}`, exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".teacher-unit-page-thumb img")]
    .every((image) => image.complete && image.naturalWidth > 0));
  await page.getByRole("button", { name: "Contents and exercises" }).click();
}

async function backToBook(page) {
  await page.getByRole("button", { name: "Back to page" }).click();
  await page.locator(".teacher-offline-page-image").waitFor();
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    globalThis.__teacherSoundPlays = [];
    localStorage.setItem("interactive-classroom:annotations:v1", JSON.stringify({
      "migration-probe": [
        { id: "legacy-stroke", type: "stroke", points: [{ x: .1, y: .1 }, { x: .2, y: .2 }], color: "#111827", strokeWidth: 3 },
        { id: "legacy-text", type: "text", x: .2, y: .3, value: "Saved", color: "#111827", fontSize: 26 },
        { id: "legacy-cover", type: "cover", x: .3, y: .3, width: .2, height: .2 },
        { id: "legacy-spotlight", type: "spotlight", x: .4, y: .4, width: .2, height: .2 },
      ],
    }));
    HTMLMediaElement.prototype.play = function play() {
      globalThis.__teacherSoundPlays.push({ source: this.currentSrc || this.src, volume: this.volume });
      return Promise.resolve();
    };
  });
  const requests = [];
  const consoleErrors = [];
  page.on("request", (request) => requests.push({ url: request.url(), type: request.resourceType() }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const startupStartedAt = performance.now();
  await page.goto(baseURL, { waitUntil: "networkidle" });
  const startupIntro = page.getByRole("dialog", { name: "Ultimate B2 opening" });
  await startupIntro.waitFor();
  assert.equal(await startupIntro.getByRole("button", { name: "Skip intro" }).count(), 0, "Cold startup must not expose an intro skip control");
  assert.match(await startupIntro.locator("video").getAttribute("src"), /ultimate-b2-startup-intro-.*\.mp4$/, "Teacher startup must use the recovered MP4 intro");
  await startupIntro.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));
  await page.locator(".legacy-home-launcher").waitFor();
  const migratedMarkup = await page.evaluate(() => JSON.parse(localStorage.getItem("interactive-classroom:annotations:v1"))["migration-probe"]);
  assert.deepEqual(migratedMarkup.drawing.map(({ type }) => type), ["stroke", "text"], "Legacy drawing elements must migrate into drawing history");
  assert.deepEqual(migratedMarkup.covers.map(({ type }) => type), ["cover"], "Legacy covers must migrate outside drawing history");
  assert.equal(migratedMarkup.spotlight.type, "spotlight", "Legacy spotlight must migrate outside drawing history");
  const settingsSurface = page.locator(".teacher-offline-settings-surface");
  assert.equal(await settingsSurface.getAttribute("data-teacher-display-scale"), "1", "1280x720 must retain the 1080p baseline scale");
  assert.equal(Number(await settingsSurface.evaluate((surface) => getComputedStyle(surface).getPropertyValue("--teacher-ui-scale"))), 1, "1280x720 effective UI scale must remain 1");
  assert.equal(await settingsSurface.getAttribute("data-teacher-theme"), "legacy", "Legacy must be the active teacher theme");
  assert.equal(await settingsSurface.getAttribute("data-teacher-motion"), "on", "Motion must default on");
  assert.equal(await page.getByRole("button", { name: /Open Unit/ }).count(), 2, "Only Units 1 and 2 may be available");
  for (const unit of [1, 2]) {
    assert.equal(await page.getByRole("button", { name: new RegExp(`^Open Unit ${unit}:`) }).isEnabled(), true);
  }
  for (const unit of [3, 4, 5, 6, 7, 8, 9, 10]) {
    const placeholderUnit = page.getByRole("button", { name: new RegExp(`^Unit ${unit}:`) });
    assert.equal(await placeholderUnit.getAttribute("disabled"), null, `Unit ${unit} must retain full-strength native button artwork`);
    assert.equal(await placeholderUnit.getAttribute("aria-disabled"), "true", `Unit ${unit} must remain an inert placeholder`);
    assert.deepEqual(await placeholderUnit.evaluate((button) => {
      const style = getComputedStyle(button);
      return { opacity: style.opacity, filter: style.filter, notAllowed: style.cursor === "not-allowed" };
    }), { opacity: "1", filter: "none", notAllowed: false }, `Unit ${unit} must render at full visual strength`);
  }
  assert.equal(await page.locator(".legacy-home-unit.locked, .legacy-home-unit .legacy-home-lock").count(), 0);
  for (const book of ["Workbook", "Grammar Book", "Extras"]) {
    const placeholderBook = page.getByRole("button", { name: book, exact: true });
    assert.equal(await placeholderBook.getAttribute("disabled"), null, `${book} must retain full-strength native button artwork`);
    assert.equal(await placeholderBook.getAttribute("aria-disabled"), "true", `${book} must remain an inert placeholder`);
    assert.deepEqual(await placeholderBook.evaluate((button) => {
      const style = getComputedStyle(button);
      return { opacity: style.opacity, filter: style.filter, notAllowed: style.cursor === "not-allowed" };
    }), { opacity: "1", filter: "none", notAllowed: false }, `${book} must render at full visual strength`);
  }
  assert.equal(await page.locator(".legacy-home-book-button.locked, .legacy-home-book-button .legacy-home-lock").count(), 0);
  const settingsButton = page.getByRole("button", { name: "Open classroom settings" });
  assert.equal(await page.locator(".legacy-home-classroom-toolbar").count(), 0, "Launcher must not render its former locked teaching-tool row");
  assert.equal(await page.locator(".teacher-offline-library .classroom-teaching-toolbar").count(), 1, "Launcher must retain the legacy classroom toolbar");
  assert.equal(await page.locator(".teacher-offline-library .legacy-teacher-tool-button").count(), 18, "Launcher must render the complete recovered icon row");
  await page.locator(".legacy-home-publisher-logo").waitFor();
  assert.equal(await page.locator(".legacy-home-publisher-logo").evaluate((image) => image.complete && image.naturalWidth === 272 && image.naturalHeight === 40), true, "Exact Hamilton House logo must render");
  await page.waitForFunction(() => document.querySelector(".legacy-menu-title-animation canvas")?.dataset.animationState === "playing");
  assert.equal(await page.locator(".legacy-menu-title-animation canvas").evaluate((canvas) => canvas.width > 0 && canvas.height > 0), true, "Recovered menu title timeline must render");
  for (const [label, button] of [
    ["Unit 1", page.getByRole("button", { name: /^Open Unit 1:/ })],
    ["Unit 2", page.getByRole("button", { name: /^Open Unit 2:/ })],
    ["Unit 3", page.getByRole("button", { name: /^Unit 3:/ })],
    ["Unit 10", page.getByRole("button", { name: /^Unit 10:/ })],
    ["Workbook", page.getByRole("button", { name: "Workbook", exact: true })],
    ["Grammar Book", page.getByRole("button", { name: "Grammar Book", exact: true })],
    ["Extras", page.getByRole("button", { name: "Extras", exact: true })],
  ]) await assertLauncherPressedArtwork(page, button, label);
  assert.equal(await page.getByRole("button", { name: /Minimize/i }).count(), 0, "Launcher must not expose minimize");
  assert.equal(await page.getByRole("button", { name: "Close application" }).isVisible(), true, "Launcher close control must remain visible");
  assert.equal(await page.locator(".legacy-home-topbar").count(), 0, "Launcher must not render a horizontal top bar");
  assert.equal(await page.locator(".legacy-classroom-settings-trigger").count(), 0, "Launcher must not retain the bottom-right settings gear");
  assert.equal(await settingsButton.isVisible(), true, "Settings must be visible on the launcher");
  assert.equal(await settingsButton.evaluate((button) => Boolean(button.closest(".legacy-home-floating-chrome"))), true, "Launcher settings must float at the top-right");
  const launcherChrome = await page.evaluate(() => {
    const launcher = getComputedStyle(document.querySelector(".legacy-home-launcher"));
    const chrome = getComputedStyle(document.querySelector(".legacy-home-floating-chrome"));
    return {
      launcherBackground: launcher.backgroundImage,
      launcherBorder: launcher.borderTopWidth,
      launcherRadius: launcher.borderTopLeftRadius,
      launcherShadow: launcher.boxShadow,
      chromeBackground: chrome.backgroundColor,
      chromeBorder: chrome.borderBottomWidth,
      chromeShadow: chrome.boxShadow,
    };
  });
  assert.deepEqual(launcherChrome, {
    launcherBackground: "none",
    launcherBorder: "0px",
    launcherRadius: "0px",
    launcherShadow: "none",
    chromeBackground: "rgba(0, 0, 0, 0)",
    chromeBorder: "0px",
    chromeShadow: "none",
  }, "Launcher artwork must float directly on the recovered background");
  const launcherUnitHeights = await page.locator(".legacy-home-unit").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
  assert.ok(Math.min(...launcherUnitHeights) >= 44, `Launcher units must remain touch-safe: ${launcherUnitHeights}`);
  assert.ok(Math.max(...launcherUnitHeights) <= 94, `Launcher units must stay compact: ${launcherUnitHeights}`);
  await settingsButton.click();
  await page.getByRole("dialog", { name: "Classroom settings" }).waitFor();
  assert.equal(await page.getByRole("tab").count(), 4, "All four legacy settings tabs must render");
  await page.getByRole("slider", { name: "Button sound effects volume" }).fill("63");
  await page.getByRole("switch", { name: "Button sound effects" }).click();
  assert.equal(await page.getByRole("switch", { name: "Button sound effects" }).getAttribute("aria-checked"), "false");
  const buttonSoundCountWhileOff = await page.evaluate(() => globalThis.__teacherSoundPlays.length);
  await page.getByRole("tab", { name: "Content" }).click();
  assert.equal(await page.evaluate(() => globalThis.__teacherSoundPlays.length), buttonSoundCountWhileOff, "Button sounds must stay silent while their category is off");
  await page.getByRole("switch", { name: "Show left navbar buttons" }).click();
  await page.getByRole("switch", { name: "Show right navbar buttons" }).click();
  assert.equal(await page.getByRole("slider", { name: "Menu buttons auto-hide delay" }).count(), 0, "Obsolete menu delay must not be visible");
  assert.equal(await page.getByRole("switch", { name: "Menu buttons auto-hide" }).count(), 0, "Obsolete auto-hide must not be visible");
  await page.getByText(/left group remains available/i).waitFor();
  await page.getByRole("tab", { name: "Graphics" }).click();
  assert.equal(await page.getByRole("group", { name: "Interface style" }).count(), 0, "Interface style switcher must be unavailable");
  await page.getByRole("switch", { name: "Animations" }).click();
  assert.equal(await settingsSurface.getAttribute("data-teacher-motion"), "off", "Animation setting must apply live");
  const stoppedTransitionSeconds = await page.getByRole("switch", { name: "Animations" }).evaluate((button) => parseFloat(getComputedStyle(button).transitionDuration));
  assert.ok(stoppedTransitionSeconds <= 0.001, "Motion off must remove representative control transitions");
  await page.getByRole("switch", { name: "Animations" }).click();
  await page.getByRole("slider", { name: "Interface size" }).fill("105");
  await page.getByRole("slider", { name: "Colour intensity" }).fill("80");
  await page.getByRole("switch", { name: "Visual effects" }).click();
  assert.equal(await page.locator(".teacher-offline-settings-surface").getAttribute("class"), "teacher-offline-settings-surface teacher-effects-off");
  assert.equal(await page.evaluate(() => document.documentElement.style.fontSize), "16.8px");
  await page.getByRole("tab", { name: "About" }).click();
  await page.getByText("Hamilton House LMS", { exact: true }).waitFor();
  await page.getByText("Version 0.1.0", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Close settings" }).click();
  await settingsButton.click();
  await page.getByRole("tab", { name: "Audio" }).click();
  assert.equal(await page.getByRole("slider", { name: "Button sound effects volume" }).inputValue(), "63", "Audio value must persist across reopen");
  assert.equal(await page.getByRole("switch", { name: "Button sound effects" }).getAttribute("aria-checked"), "false", "Audio toggle must persist across reopen");
  await page.getByRole("switch", { name: "Button sound effects" }).click();
  await page.getByRole("slider", { name: "Navigation sound effects volume" }).fill("37");
  await page.getByRole("slider", { name: "Toolbar sound effects volume" }).fill("52");
  await page.getByRole("tab", { name: "Graphics" }).click();
  await page.getByRole("slider", { name: "Interface size" }).fill("100");
  await page.getByRole("slider", { name: "Colour intensity" }).fill("100");
  await page.getByRole("switch", { name: "Visual effects" }).click();
  await page.getByRole("switch", { name: "Animations" }).click();
  await page.getByRole("tab", { name: "Content" }).click();
  assert.equal(await page.getByRole("switch", { name: "Show left navbar buttons" }).getAttribute("aria-checked"), "false");
  assert.equal(await page.getByRole("switch", { name: "Show right navbar buttons" }).getAttribute("aria-checked"), "false");
  await page.getByRole("switch", { name: "Show left navbar buttons" }).click();
  await page.getByRole("switch", { name: "Show right navbar buttons" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".legacy-home-launcher").waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("teacher-offline:ultimate-b2:settings:v2")).graphics.appearanceMode), "modern", "Stored modern preference must be retained for later re-enablement");
  assert.equal(await settingsSurface.getAttribute("data-teacher-theme"), "legacy", "Stored modern preference must not activate the modern theme");
  assert.equal(await settingsSurface.getAttribute("data-teacher-motion-preference"), "off", "Motion OFF must persist across reload");
  assert.equal(await settingsSurface.getAttribute("data-teacher-motion"), "off", "Persisted motion OFF must remain effective");
  await settingsButton.click();
  await page.getByRole("tab", { name: "Graphics" }).click();
  assert.equal(await page.getByRole("switch", { name: "Animations" }).getAttribute("aria-checked"), "false");
  await page.getByRole("switch", { name: "Animations" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  assert.equal(await settingsSurface.getAttribute("data-teacher-motion-preference"), "on", "Motion ON must persist independently");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => document.querySelector(".teacher-offline-settings-surface")?.dataset.teacherMotion === "off");
  assert.equal(await settingsSurface.getAttribute("data-teacher-motion"), "off", "prefers-reduced-motion must disable effective motion");
  assert.equal(await settingsSurface.getAttribute("data-teacher-motion-preference"), "on", "Reduced motion must not overwrite the saved preference");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForFunction(() => document.querySelector(".teacher-offline-settings-surface")?.dataset.teacherMotion === "on");
  assert.equal(await settingsSurface.getAttribute("data-teacher-motion"), "on", "Effective motion must resume when the OS preference allows it");
  await settingsButton.click();
  await page.getByRole("tab", { name: "Audio" }).click();
  assert.equal(await page.getByRole("slider", { name: "Navigation sound effects volume" }).inputValue(), "37", "Settings must persist across app reload");
  await page.getByRole("tab", { name: "Content" }).click();
  assert.equal(await page.getByRole("switch", { name: "Menu buttons auto-hide" }).count(), 0);
  await page.getByRole("button", { name: "Close settings" }).click();
  const initialHash = await page.evaluate(() => location.hash);
  await page.getByRole("button", { name: /^Unit 3:/ }).evaluate((button) => button.click());
  await page.getByRole("button", { name: "Workbook", exact: true }).evaluate((button) => button.click());
  assert.equal(await page.evaluate(() => location.hash), initialHash, "Placeholder launcher controls must not navigate");
  assert.equal(await page.locator(".legacy-home-launcher").isVisible(), true);
  const coldStartupMs = Math.round(performance.now() - startupStartedAt);
  const bookOpenStartedAt = performance.now();
  await page.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await page.locator(".teacher-offline-book").waitFor();
  const bookOpenMs = Math.round(performance.now() - bookOpenStartedAt);

  assert.equal(await page.locator(".legacy-classroom-sound-toggle, .legacy-classroom-settings-trigger").count(), 0, "Book views must not render floating sound or settings controls");
  assert.equal(await page.locator(".legacy-overview-unit-switcher").count(), 0, "Overview top-left unit switcher must be absent");
  assert.equal(await page.getByRole("heading", { name: "Unit 1", exact: true }).isVisible(), true, "Unit 1 title must remain visible");
  assert.equal(await page.getByRole("button", { name: "Previous unit", exact: true }).count(), 0, "Unit 1 must not expose a previous-unit target");
  const nextUnitControl = page.getByRole("button", { name: "Next unit", exact: true });
  assert.equal(await nextUnitControl.count(), 1, "Unit 1 must expose one next-unit arrow");
  assert.equal(await nextUnitControl.getAttribute("data-unit-target"), "2", "Next-unit arrow must target the installed Unit 2");
  assert.ok(await nextUnitControl.evaluate((button) => parseFloat(getComputedStyle(button).transitionDuration)) >= 0.08, "Motion ON must animate the unit arrow");
  await nextUnitControl.hover();
  assert.notEqual(await nextUnitControl.evaluate((button) => getComputedStyle(button).transform), "none", "Fine-pointer hover enhancement must be available");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(() => document.querySelector(".teacher-offline-settings-surface")?.dataset.teacherMotion === "off");
  assert.ok(await nextUnitControl.evaluate((button) => parseFloat(getComputedStyle(button).transitionDuration)) <= 0.001, "Reduced motion must disable unit transitions");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForFunction(() => document.querySelector(".teacher-offline-settings-surface")?.dataset.teacherMotion === "on");

  await page.waitForTimeout(1200);
  assert.equal(await page.getByRole("button", { name: "Show classroom tools" }).count(), 0, "Toolbar must never auto-hide behind a reveal button");

  await assertCanonicalUnitOverview(page, 1);
  await page.locator('[data-page-ids="ub2-sb-unit-1-part-9,ub2-sb-unit-1-part-10"]').click();
  await page.locator(".teacher-offline-pages-viewer").waitFor();
  assert.equal(await page.locator(".legacy-page-heading strong").textContent(), "Practice");
  assert.equal(await page.locator(".legacy-page-location").count(), 0, "Page location pill must be removed");
  await page.getByRole("button", { name: "Next page" }).click();
  assert.equal(await page.locator(".legacy-page-heading strong").textContent(), "Practice");
  const navigationSoundPlays = await page.evaluate(() => globalThis.__teacherSoundPlays);
  assert.equal(navigationSoundPlays.some((play) => /page-turn/i.test(play.source) && Math.abs(play.volume - 0.37) < 0.001), true, `Navigation sounds must use navigation volume: ${JSON.stringify(navigationSoundPlays)}`);
  await page.getByRole("button", { name: "Unit overview" }).click();
  await page.getByRole("button", { name: "Next unit", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Unit 2", exact: true }).isVisible(), true, "Next-unit arrow must stay in overview mode and open Unit 2");
  assert.equal(await page.locator(".teacher-offline-pages-viewer").count(), 0, "Unit switching must not open a page");
  assert.equal(await page.getByRole("button", { name: "Next unit", exact: true }).count(), 0, "Unit 2 must not expose Unit 3 navigation");
  assert.equal(await page.getByRole("button", { name: "Previous unit", exact: true }).getAttribute("data-unit-target"), "1", "Previous-unit arrow must target Unit 1");
  await assertCanonicalUnitOverview(page, 2);
  await page.getByRole("button", { name: "Previous unit", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Unit 1", exact: true }).isVisible(), true, "Previous-unit arrow must return to Unit 1 overview");
  await page.getByRole("button", { name: "Next unit", exact: true }).click();
  await assertCanonicalUnitOverview(page, 2);
  assert.equal(await page.locator('[data-page-ids="reading-19"] .teacher-unit-page-copy strong').count(), 0, "pg 19 must visually omit Reading");
  await page.locator('[data-page-ids="reading-20-21"]').click();
  assert.equal(await page.locator(".legacy-page-heading strong").textContent(), "Reading");
  await page.getByRole("button", { name: "Unit overview" }).click();
  await page.locator('[data-page-ids="practice-31,practice-32"]').click();
  assert.equal(await page.locator(".legacy-page-heading strong").textContent(), "Practice 2");
  await page.getByRole("button", { name: "Next page" }).click();
  assert.equal(await page.locator(".legacy-page-heading strong").textContent(), "Practice 2");
  await page.getByRole("button", { name: "Unit overview" }).click();
  await page.locator('[data-page-ids="progress-check-33,progress-check-34"]').click();
  assert.equal(await page.locator(".legacy-page-heading strong").textContent(), "Progress check 1");
  await page.getByRole("button", { name: "Next page" }).click();
  assert.equal(await page.locator(".legacy-page-heading strong").textContent(), "Progress check 1");
  await page.getByRole("button", { name: "Unit overview" }).click();
  await page.getByRole("button", { name: "Contents and exercises" }).click();
  await page.getByRole("button", { name: "Unit 1", exact: true }).click();
  await assertCanonicalUnitOverview(page, 1);

  await page.locator(".teacher-unit-page-card").filter({ hasText: "pg 5" }).first().click();
  const toolbarButtons = page.locator(".classroom-teaching-toolbar .legacy-teacher-tool-button");
  assert.deepEqual(await toolbarButtons.evaluateAll((buttons) => buttons.map((button) => button.dataset.teacherTool)), [
    "mouse", "pencil", "marker", "eraser", "clear", "zoom", "hide", "show", "undo",
    "redo", "text", "annotations", "url", "save", "load", "timer", "score", "print",
  ]);
  assert.equal(await page.locator('.classroom-teaching-toolbar [aria-pressed="true"]').count(), 1, "Toolbar selection must be exclusive");
  assert.equal(await toolbarButtons.evaluateAll((buttons) => buttons.every((button) => !button.disabled && button.getAttribute("aria-disabled") === null)), true, "All recovered toolbar buttons must be enabled");
  assert.equal(await page.locator(".classroom-teaching-toolbar .legacy-home-lock, .classroom-teaching-toolbar .lock-badge").count(), 0, "Toolbar icons must not show locks");
  assert.equal(await page.getByRole("button", { name: "Pencil", exact: true }).evaluate((button) => getComputedStyle(button).cursor), "pointer", "Toolbar buttons must use the hand cursor");
  await page.waitForTimeout(10_200);
  assert.equal(await page.locator(".classroom-teaching-toolbar").isVisible(), true, "Page toolbar must remain visible");

  const overlay = page.locator(".classroom-tools-overlay");
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
  await page.getByText("PEN MODE", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Pencil", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await overlay.getAttribute("data-active-classroom-tool"), "pen");
  assert.equal(await page.evaluate(() => globalThis.__teacherSoundPlays.some((play) => /button/i.test(play.source) && Math.abs(play.volume - 0.52) < 0.001)), true, "Toolbar sounds must use toolbar volume");
  const overlayBox = await overlay.boundingBox();
  await page.mouse.move(overlayBox.x + 120, overlayBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 240, overlayBox.y + 170, { steps: 8 });
  await page.mouse.up();
  await overlay.locator("path[data-drawing-id]").waitFor();
  assert.equal(await overlay.locator("path[data-drawing-id]").count(), 1, "Pencil must add a stroke");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await overlay.locator("path[data-drawing-id]").count(), 0, "Undo must remove the stroke");
  assert.equal(await page.getByRole("button", { name: "Pencil", exact: true }).getAttribute("aria-pressed"), "true", "Momentary Undo must preserve the active Pencil mode");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal(await overlay.locator("path[data-drawing-id]").count(), 1, "Redo must restore the stroke");

  await page.getByRole("button", { name: "Text", exact: true }).click();
  assert.equal(await overlay.getAttribute("data-active-classroom-tool"), "text");
  await overlay.click({ position: { x: 360, y: 150 } });
  await page.getByRole("textbox", { name: "Annotation text" }).fill("Class note");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await overlay.locator("text", { hasText: "Class note" }).waitFor();
  await page.getByRole("button", { name: "Eraser", exact: true }).click();
  assert.equal(await overlay.getAttribute("data-active-classroom-tool"), "eraser");
  await overlay.locator("text", { hasText: "Class note" }).click({ force: true });
  assert.equal(await overlay.locator("text", { hasText: "Class note" }).count(), 0, "Eraser must remove drawing text");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await overlay.locator("text", { hasText: "Class note" }).waitFor();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "Show on-screen keyboard" }).click();
  const keyboardInput = page.getByRole("textbox", { name: "Annotation text" });
  await keyboardInput.waitFor();
  assert.equal(await keyboardInput.evaluate((input) => document.activeElement === input), true, "Keyboard action must focus the annotation input");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Mouse", exact: true }).click();
  assert.equal(await overlay.getAttribute("data-active-classroom-tool"), "pointer", "Mouse must exit text mode");
  assert.equal(await page.getByRole("button", { name: "Mouse", exact: true }).getAttribute("aria-pressed"), "true");

  await page.getByRole("button", { name: "Hide screen", exact: true }).click();
  await page.getByText("COVER MODE", { exact: true }).waitFor();
  for (const [startX, startY, endX, endY] of [[470, 110, 650, 230], [720, 280, 850, 390]]) {
    await page.mouse.move(overlayBox.x + startX, overlayBox.y + startY);
    await page.mouse.down();
    await page.mouse.move(overlayBox.x + endX, overlayBox.y + endY, { steps: 6 });
    await page.mouse.up();
  }
  await overlay.locator(".classroom-cover").first().waitFor();
  assert.equal(await overlay.locator(".classroom-cover").count(), 2, "Hide must support multiple covers");
  await page.getByRole("button", { name: "Mouse", exact: true }).click();
  await overlay.locator(".classroom-cover").first().click({ force: true });
  await page.getByRole("button", { name: "Delete selected cover" }).click();
  assert.equal(await overlay.locator(".classroom-cover").count(), 1, "Cover delete must remove only the selected cover");
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await overlay.locator(".classroom-cover").count(), 1, "Drawing Undo must not remove a cover");
  await page.getByRole("button", { name: "Mouse", exact: true }).click();

  await page.getByRole("button", { name: "Show screen", exact: true }).click();
  await page.getByText("SPOTLIGHT MODE", { exact: true }).waitFor();
  await page.mouse.move(overlayBox.x + 180, overlayBox.y + 90);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 410, overlayBox.y + 240, { steps: 6 });
  await page.mouse.up();
  await overlay.locator("mask").waitFor({ state: "attached" });
  const firstSpotlightX = await overlay.locator('rect[stroke="#f4e84a"]').getAttribute("x");
  await page.mouse.move(overlayBox.x + 260, overlayBox.y + 160);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 500, overlayBox.y + 330, { steps: 6 });
  await page.mouse.up();
  assert.equal(await overlay.locator("mask").count(), 1, "A second Show region must replace the first");
  assert.notEqual(await overlay.locator('rect[stroke="#f4e84a"]').getAttribute("x"), firstSpotlightX);
  await page.getByRole("button", { name: "Pencil", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal(await overlay.locator("mask").count(), 1, "Drawing Undo must not remove the spotlight");
  await page.getByRole("button", { name: "Mouse", exact: true }).click();

  await page.getByRole("button", { name: "Clear screen", exact: true }).click();
  await page.getByRole("complementary", { name: "Clear current view" }).waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "All classroom markup", exact: true }).click();
  assert.equal(await overlay.locator("[data-drawing-id], .classroom-cover, mask").count(), 0, "Clear must remove all classroom markup");
  assert.equal(await page.getByRole("button", { name: "Mouse", exact: true }).getAttribute("aria-pressed"), "true", "Clear completion must return to Mouse");

  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  await page.getByText("ZOOM MODE", { exact: true }).waitFor();
  await page.mouse.move(overlayBox.x + 160, overlayBox.y + 90);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 510, overlayBox.y + 270, { steps: 6 });
  await page.mouse.up();
  await page.locator(".classroom-stage-transform.region-zoom-active").waitFor();
  assert.ok(Number(await page.locator(".classroom-stage-transform").getAttribute("data-region-zoom-scale")) > 1);
  assert.equal(await page.getByRole("button", { name: "Zoom", exact: true }).getAttribute("aria-pressed"), "true", "Region zoom must keep Zoom selected");
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  assert.equal(await page.locator(".classroom-stage-transform.region-zoom-active").count(), 0, "A second Zoom activation must restore the page");
  assert.equal(await page.getByRole("button", { name: "Mouse", exact: true }).getAttribute("aria-pressed"), "true");

  await page.getByRole("button", { name: "Timer", exact: true }).click();
  await page.getByRole("complementary", { name: "Classroom timer" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Timer", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "1 min" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".classroom-timer-panel output")?.textContent !== "01:00");
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Close timer" }).click();
  assert.equal(await page.getByRole("button", { name: "Mouse", exact: true }).getAttribute("aria-pressed"), "true", "Closing Timer must restore Mouse");
  await page.getByRole("button", { name: "Scoreboard", exact: true }).click();
  await page.getByRole("complementary", { name: "Two-team scoreboard" }).waitFor();
  await page.getByRole("button", { name: "Add point to Team A" }).click();
  assert.equal(await page.getByLabel("Team A score").textContent(), "1");
  await page.getByRole("button", { name: "Close scoreboard" }).click();
  assert.equal(await page.getByRole("button", { name: "Mouse", exact: true }).getAttribute("aria-pressed"), "true", "Closing Scoreboard must restore Mouse");

  await page.evaluate(() => { globalThis.__teacherPrintCalls = 0; globalThis.print = () => { globalThis.__teacherPrintCalls += 1; }; });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  assert.equal(await page.evaluate(() => globalThis.__teacherPrintCalls), 1, "Print must remain wired to the safe browser print path");

  await page.waitForTimeout(100);
  const uiOnlyStorageBefore = await page.evaluate(() => localStorage.getItem("interactive-classroom:annotations:v1"));
  const uiOnlyRequestCountBefore = requests.length;
  for (const label of ["Marker", "Annotations", "URL", "Save", "Load"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    assert.equal(await page.getByRole("button", { name: label, exact: true }).getAttribute("aria-pressed"), "true", `${label} must be selectable`);
    assert.equal(await page.locator('.classroom-teaching-toolbar [aria-pressed="true"]').count(), 1, `${label} selection must remain exclusive`);
    assert.equal(await overlay.getAttribute("data-active-classroom-tool"), "pointer", `${label} must remain a safe no-op`);
  }
  await page.waitForTimeout(100);
  assert.equal(requests.length, uiOnlyRequestCountBefore, "UI-only tools must not make requests");
  assert.equal(await page.evaluate(() => localStorage.getItem("interactive-classroom:annotations:v1")), uiOnlyStorageBefore, "UI-only tools must not write classroom data");
  await page.getByRole("button", { name: "Mouse", exact: true }).click();
  await page.getByRole("button", { name: "Contents and exercises" }).click();

  await openExercises(page, 1);
  assert.equal(await page.locator(".teacher-offline-lessons article").count(), 38);
  const activityOpenStartedAt = performance.now();
  await exerciseRow(page, "Reading · Exercise 3").getByRole("button", { name: "Present" }).click();
  await page.locator(".teacher-offline-embedded-activity").waitFor();
  assert.equal(await page.locator(".teacher-offline-pages-viewer .classroom-teaching-toolbar").count(), 1, "Activity toolbar should render exactly once");
  assert.equal(await page.locator(".teacher-offline-pages-viewer .classroom-tools-overlay").count(), 1, "Activity overlay should render");
  assert.equal(await page.locator(".teacher-offline-presentation").count(), 0, "Standalone activity chrome should not render");
  await page.waitForTimeout(10_200);
  assert.equal(await page.locator(".teacher-offline-pages-viewer .classroom-teaching-toolbar").isVisible(), true, "Activity toolbar must remain visible");
  assert.equal(await page.getByRole("button", { name: "Show classroom tools" }).count(), 0, "Activity toolbar must not use a reveal button");
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  const activityOverlayBox = await page.locator(".teacher-offline-pages-viewer .classroom-tools-overlay").boundingBox();
  await page.mouse.move(activityOverlayBox.x + 120, activityOverlayBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(activityOverlayBox.x + 520, activityOverlayBox.y + 300, { steps: 6 });
  await page.mouse.up();
  await page.locator(".teacher-offline-pages-viewer .classroom-stage-transform.region-zoom-active").waitFor();
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  assert.equal(await page.locator(".teacher-offline-pages-viewer .classroom-stage-transform.region-zoom-active").count(), 0, "Activity region zoom must reset");
  const activityOpenMs = Math.round(performance.now() - activityOpenStartedAt);
  const multipleChoiceSolution = teacherSolutions.solutions["ultimate-b2-sb-u1-p2-o3"];
  const firstMultipleChoice = Object.values(multipleChoiceSolution.questions)[0];
  const firstMultipleChoiceRadios = page.locator(".legacy-pilot-choice-question").first().getByRole("radio");
  const firstMultipleChoiceValues = await firstMultipleChoiceRadios.evaluateAll((radios) => radios.map((radio) => radio.value));
  const correctMultipleChoiceIndex = firstMultipleChoiceValues.indexOf(firstMultipleChoice.acceptedAnswers[0]);
  assert.ok(correctMultipleChoiceIndex >= 0, "Publisher multiple-choice answer must remain available in the pilot controls");
  await firstMultipleChoiceRadios.nth(correctMultipleChoiceIndex).check();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByText("Correct", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Show answer", exact: true }).first().click();
  await page.getByText("Publisher answer", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Show all answers" }).click();
  await page.getByRole("button", { name: "Hide answers" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  assert.equal(await firstMultipleChoiceRadios.nth(correctMultipleChoiceIndex).isChecked(), false);
  await backToBook(page);

  await openExercises(page, 2);
  assert.equal(await page.locator(".teacher-offline-lessons article").count(), 40);
  await exerciseRow(page, "Vocabulary in Use · Exercise 4").getByRole("button", { name: "Present" }).click();
  const typedSolution = teacherSolutions.solutions["ultimate-b2-sb-u2-p3-o4"];
  const typedQuestion = Object.values(typedSolution.questions).find((question) => question.acceptedAnswers.includes("off"));
  const typedIndex = Object.values(typedSolution.questions).indexOf(typedQuestion);
  await page.locator(".unit2-normalized-question input").nth(typedIndex).fill("off");
  const solutionRequests = () => requests.filter(({ type }) => ["fetch", "xhr", "eventsource", "websocket"].includes(type));
  const requestsBeforeOfflineSolution = solutionRequests().length;
  await context.setOffline(true);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByText("Correct", { exact: true }).first().waitFor();
  assert.equal(solutionRequests().length, requestsBeforeOfflineSolution, "Offline solution reveal must not make a request");
  await context.setOffline(false);
  await backToBook(page);

  await openExercises(page, 1);
  await exerciseRow(page, "Unit opener · Exercise 1").getByRole("button", { name: "Present" }).click();
  await page.getByRole("button", { name: "Show publisher model answer for question 1" }).click();
  await page.getByRole("button", { name: "Publisher model answer for question 1" }).waitFor();
  await backToBook(page);

  await openExercises(page, 1);
  await exerciseRow(page, "Writing · Exercise 4").getByRole("button", { name: "Present" }).click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByText("No verified answer is available for this activity.").waitFor();
  await backToBook(page);

  const bookPagesTab = page.getByRole("tab", { name: "Book pages" });
  if (await bookPagesTab.count()) await bookPagesTab.click();
  if (!await page.locator(".teacher-offline-unit-overview").count()) {
    await page.getByRole("button", { name: "Unit overview" }).click();
  }
  await page.locator(".teacher-unit-page-card").filter({ hasText: "pg 6-7" }).first().click();
  await page.getByRole("button", { name: "Page activities" }).click();
  await page.getByRole("button", { name: "Reading · Exercise 1", exact: true }).last().click();
  const video = page.locator("video").first();
  await video.waitFor();
  assert.match(await video.getAttribute("src"), /^(?:http:\/\/127\.0\.0\.1:4178)?\/assets\//);
  await page.goBack();
  await page.locator(".teacher-offline-book").waitFor();
  await page.getByRole("button", { name: "Page activities" }).click();
  await page.getByRole("button", { name: "Unit 1 extra video 1", exact: true }).click();
  await page.locator(".teacher-offline-media").waitFor();
  assert.equal(await page.locator(".teacher-offline-media .classroom-teaching-toolbar").count(), 1, "Media toolbar should render");
  assert.equal(await page.locator(".teacher-offline-media .classroom-tools-overlay").count(), 1, "Media overlay should render");
  await page.waitForTimeout(10_200);
  assert.equal(await page.locator(".teacher-offline-media .classroom-teaching-toolbar").isVisible(), true, "Media toolbar must remain visible");
  assert.equal(await page.getByRole("button", { name: "Show classroom tools" }).count(), 0, "Media toolbar must not use a reveal button");
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  const mediaOverlayBox = await page.locator(".teacher-offline-media .classroom-tools-overlay").boundingBox();
  await page.mouse.move(mediaOverlayBox.x + 160, mediaOverlayBox.y + 90);
  await page.mouse.down();
  await page.mouse.move(mediaOverlayBox.x + 560, mediaOverlayBox.y + 320, { steps: 6 });
  await page.mouse.up();
  await page.locator(".teacher-offline-media .classroom-stage-transform.region-zoom-active").waitFor();
  await page.getByRole("button", { name: "Zoom", exact: true }).click();
  assert.equal(await page.locator(".teacher-offline-media .classroom-stage-transform.region-zoom-active").count(), 0, "Media region zoom must reset");
  const standaloneVideo = page.locator(".teacher-offline-standalone-media");
  await standaloneVideo.waitFor();
  assert.match(await standaloneVideo.getAttribute("src"), /^(?:http:\/\/127\.0\.0\.1:4178)?\/assets\//);
  await page.goBack();
  await page.locator(".teacher-offline-book").waitFor();

  const forbiddenRequests = requests.filter(({ url, type }) => (
    !url.startsWith(baseURL)
    || (["fetch", "xhr", "eventsource", "websocket"].includes(type) && !/^http:\/\/127\.0\.0\.1:4178\/assets\/logo-[\w-]+\.gaf$/.test(url))
    || /\.netlify\/functions|teacher-activity-solutions|submit-/i.test(url)
  ));
  const unexpectedConsoleErrors = consoleErrors.filter((message) => !/favicon|ERR_INTERNET_DISCONNECTED/i.test(message));
  assert.deepEqual(forbiddenRequests, []);
  assert.deepEqual(unexpectedConsoleErrors, []);

  console.log(JSON.stringify({
    status: "passed",
    viewport: "1280x720",
    unit1Activities: 38,
    unit2Activities: 40,
    offlineSolutionRequests: 0,
    forbiddenRequests: forbiddenRequests.length,
    consoleErrors: unexpectedConsoleErrors.length,
    coldStartupMs,
    bookOpenMs,
    activityOpenMs,
  }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
