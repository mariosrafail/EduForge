import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

import { FORBIDDEN_BRAND_PATTERN, FORBIDDEN_VISIBLE_BRANDING_PATTERN } from "../_branding-audit.mjs";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4181";
const artifactRoot = "test-results/legacy-classroom-visual";
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "4181"], {
  cwd: process.cwd(),
  stdio: ["ignore", "inherit", "inherit"],
  windowsHide: true,
});

async function waitForPreview() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
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
  await page.getByRole("button", { name: /^Open Unit 1:/ }).click();
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

async function selectOverviewUnit(page, unit) {
  await waitForUnitOverview(page);
  const currentUnit = Number((await page.locator(".legacy-overview-heading h2").textContent()).match(/\d+/)?.[0]);
  if (currentUnit === unit) return;
  await page.getByRole("button", { name: unit > currentUnit ? "Next unit" : "Previous unit", exact: true }).click();
  await page.getByRole("heading", { name: `Unit ${unit}`, exact: true }).waitFor();
  await waitForUnitOverview(page);
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
  assert.equal(await overview.evaluate((element) => getComputedStyle(element).backgroundSize), "cover", `${label} overview background covers the frame`);
  const overviewFonts = await entries.locator(".teacher-unit-page-copy").evaluateAll((nodes) => nodes
    .filter((node) => node.querySelector("strong"))
    .slice(0, 2)
    .map((node) => ({
      heading: getComputedStyle(node.querySelector("strong")).fontFamily,
      page: getComputedStyle(node.querySelector("b")).fontFamily,
      headingWeight: getComputedStyle(node.querySelector("strong")).fontWeight,
      pageWeight: getComputedStyle(node.querySelector("b")).fontWeight,
    })));
  for (const font of overviewFonts) {
    assert.match(font.heading, /PF Stiele Futura Medium/, `${label} uses the recovered overview heading family`);
    assert.match(font.page, /PF Stiele Futura Medium/, `${label} uses the recovered overview page-label family`);
    assert.equal(font.headingWeight, "400", `${label} overview heading keeps publisher normal weight`);
    assert.equal(font.pageWeight, "400", `${label} overview page label keeps publisher normal weight`);
  }
  if (unit === 2) assert.equal(await overview.locator('[data-page-ids="reading-19"] strong').count(), 0, `${label} pg 19 heading omitted`);
  assert.equal(await page.locator(".legacy-overview-unit-switcher").count(), 0, `${label} top-left unit switcher absent`);
  assert.equal(await page.getByRole("heading", { name: `Unit ${unit}`, exact: true }).isVisible(), true, `${label} centered unit title`);
  const visibleArrowLabel = unit === 1 ? "Next unit" : "Previous unit";
  const hiddenArrowLabel = unit === 1 ? "Previous unit" : "Next unit";
  assert.equal(await page.getByRole("button", { name: hiddenArrowLabel, exact: true }).count(), 0, `${label} unavailable edge hidden`);
  const arrow = page.getByRole("button", { name: visibleArrowLabel, exact: true });
  assert.equal(await arrow.getAttribute("data-unit-target"), unit === 1 ? "2" : "1", `${label} installed-unit target`);
  const arrowLayout = await arrow.evaluate((button) => {
    const arrowRect = button.getBoundingClientRect();
    const panelRect = document.querySelector(".teacher-offline-unit-overview").getBoundingClientRect();
    const entries = [...document.querySelectorAll("[data-overview-entry]")].map((entry) => entry.getBoundingClientRect());
    return {
      size: arrowRect.width,
      centerDelta: Math.abs((arrowRect.top + arrowRect.height / 2) - (panelRect.top + panelRect.height / 2)),
      overlapsEntry: entries.some((entry) => arrowRect.left < entry.right && arrowRect.right > entry.left && arrowRect.top < entry.bottom && arrowRect.bottom > entry.top),
      displayScale: Number(document.querySelector(".teacher-offline-settings-surface").dataset.teacherDisplayScale),
      compact: innerWidth <= 1100 || innerHeight <= 650,
    };
  });
  const expectedArrowSize = arrowLayout.compact ? 44 : 60 * arrowLayout.displayScale;
  assert.ok(Math.abs(arrowLayout.size - expectedArrowSize) <= 1, `${label} proportional arrow touch size: ${JSON.stringify(arrowLayout)}`);
  assert.ok(arrowLayout.centerDelta <= 1, `${label} arrow vertical alignment`);
  assert.equal(arrowLayout.overlapsEntry, false, `${label} arrow keeps thumbnails clear`);
  await assertScreen(page, label);
}

async function openPage(page, label) {
  await page.locator(".teacher-unit-page-card").filter({ hasText: label }).first().click();
  await waitForPageImage(page);
}

async function openActivity(page, unit, title) {
  if (await page.locator(".teacher-offline-embedded-activity").count()) await page.getByRole("button", { name: "Back to page" }).click();
  if (await page.locator(".teacher-offline-pages-viewer").count()) await page.getByRole("button", { name: "Contents and exercises" }).click();
  await page.getByRole("button", { name: `Unit ${unit}`, exact: true }).click();
  await page.getByRole("button", { name: "Contents and exercises" }).click();
  const row = page.locator(".teacher-offline-lessons article").filter({ hasText: title }).first();
  await row.getByRole("button", { name: "Present" }).click();
  await page.locator(".teacher-offline-embedded-activity").waitFor();
  await assertEmbeddedActivity(page, `${title} embedded`);
}

async function assertEmbeddedActivity(page, label) {
  const metrics = await page.evaluate(() => {
    const visible = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return Boolean(rect?.width && rect?.height);
    };
    const reader = document.querySelector(".teacher-offline-page-reader")?.getBoundingClientRect();
    const host = document.querySelector(".teacher-offline-embedded-activity");
    const hostRect = host?.getBoundingClientRect();
    const content = document.querySelector(".teacher-offline-embedded-activity-content")?.getBoundingClientRect();
    return {
      heading: visible(".legacy-page-heading"),
      reader: visible(".teacher-offline-page-reader"),
      backgroundSize: document.querySelector(".teacher-offline-page-reader") ? getComputedStyle(document.querySelector(".teacher-offline-page-reader")).backgroundSize : "",
      navigation: visible(".legacy-page-navigation"),
      toolbarCount: document.querySelectorAll(".teacher-offline-pages-viewer .classroom-teaching-toolbar").length,
      standaloneChrome: document.querySelectorAll(".teacher-offline-presentation").length,
      pageImages: document.querySelectorAll(".teacher-offline-page-image").length,
      pageContext: document.querySelector(".legacy-page-heading strong")?.textContent?.trim(),
      locationPills: document.querySelectorAll(".legacy-page-location").length,
      floatingControls: document.querySelectorAll(".legacy-classroom-sound-toggle, .legacy-classroom-settings-trigger").length,
      fitScale: Number(document.querySelector(".teacher-offline-embedded-activity")?.dataset.fitScale),
      edgeToEdgeHost: reader && hostRect
        ? hostRect.left <= reader.left + 7 && hostRect.right >= reader.right - 7
          && hostRect.top <= reader.top + 7 && hostRect.bottom >= reader.bottom - 7
        : false,
      neutralHostCanvas: host ? getComputedStyle(host).backgroundColor === "rgb(255, 255, 255)" : false,
      fillsReaderWidth: reader && content ? content.width >= reader.width - 8 : false,
      contained: reader && content
        ? content.left >= reader.left - 1 && content.right <= reader.right + 1
          && content.top >= reader.top - 1 && content.bottom <= reader.bottom + 1
        : false,
    };
  });
  assert.equal(metrics.heading, true, `${label} keeps unit heading`);
  assert.equal(metrics.reader, true, `${label} keeps purple reader`);
  assert.equal(metrics.backgroundSize, "cover", `${label} activity background matches overview cover fitting`);
  assert.equal(metrics.navigation, true, `${label} keeps legacy navigation`);
  assert.equal(metrics.toolbarCount, 1, `${label} has one toolbar`);
  assert.equal(metrics.standaloneChrome, 0, `${label} removes standalone presentation chrome`);
  assert.equal(metrics.pageImages, 0, `${label} replaces page image`);
  assert.doesNotMatch(metrics.pageContext, /pg \d/, `${label} omits the page number from the heading`);
  assert.equal(metrics.locationPills, 0, `${label} removes the lower page location pill`);
  assert.equal(metrics.floatingControls, 0, `${label} has no floating controls`);
  assert.ok(metrics.fitScale > 0 && metrics.fitScale <= 1, `${label} uses bounded fit scale`);
  assert.equal(metrics.edgeToEdgeHost, true, `${label} host fills the reader interior: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.neutralHostCanvas, true, `${label} masks the reader background behind activity corners`);
  assert.equal(metrics.fillsReaderWidth, true, `${label} uses the available reader width: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.contained, true, `${label} content fits reader`);
}

async function assertPublisherImageCanvas(page, label) {
  const styles = await page.locator(".ultimate-b2-publisher-image-display, .ultimate-b2-publisher-image-display-sheet").evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderWidth, radius: style.borderRadius, shadow: style.boxShadow };
  }));
  assert.deepEqual(styles, [
    { background: "rgb(255, 255, 255)", border: "0px", radius: "0px", shadow: "none" },
    { background: "rgb(255, 255, 255)", border: "0px", radius: "0px", shadow: "none" },
  ], `${label} uses a continuous white canvas`);
}

async function assertScreen(page, label) {
  await page.waitForFunction(() => [...document.querySelectorAll(".teacher-offline-view-transition, .teacher-offline-unit-overview-screen, .teacher-offline-pages-viewer")]
    .every((element) => Number.parseFloat(getComputedStyle(element).opacity) >= 0.99));
  await page.waitForFunction(() => [...document.images]
    .every((image) => image.complete && image.naturalWidth > 0));
  const metrics = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    missingImages: [...document.images].filter((image) => !image.complete || !image.naturalWidth).map((image) => image.src),
  }));
  assert.equal(metrics.overflow, 0, `${label} horizontal overflow`);
  assert.deepEqual(metrics.missingImages, [], `${label} missing images`);
  assert.doesNotMatch(await page.locator("body").innerText(), FORBIDDEN_BRAND_PATTERN, `${label} visible branding`);
}

async function assertCleanAbout(page, label) {
  const dialog = page.getByRole("dialog", { name: "Classroom settings" });
  const text = await dialog.innerText();
  assert.match(text, /Hamilton House LMS/);
  assert.match(text, /Version 0\.1\.0/);
  assert.doesNotMatch(text, /Ultimate English B2 interactive classroom content/i, `${label} generic title`);
  assert.doesNotMatch(text, FORBIDDEN_VISIBLE_BRANDING_PATTERN, `${label} branding`);
  await assertScreen(page, label);
}

async function completeStartupIntro(page) {
  const intro = page.getByRole("dialog", { name: "Ultimate B2 opening" });
  if (await intro.count()) {
    assert.equal(await intro.getByRole("button", { name: "Skip intro" }).count(), 0);
    await intro.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));
  }
  await page.locator(".legacy-home-launcher").waitFor();
}

async function assertLegacyLauncher(page, label) {
  const metrics = await page.evaluate(() => {
    const visible = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return Boolean(rect?.width && rect?.height);
    };
    const unitHeights = [...document.querySelectorAll(".legacy-home-unit")].map((button) => button.getBoundingClientRect().height);
    const settings = document.querySelector(".legacy-home-settings-button");
    return {
      launcher: visible(".legacy-home-launcher"),
      unitColumns: document.querySelectorAll(".legacy-home-unit-column").length,
      units: document.querySelectorAll(".legacy-home-unit").length,
      lockedUnits: document.querySelectorAll(".legacy-home-unit.locked, .legacy-home-unit .legacy-home-lock").length,
      disabledUnits: document.querySelectorAll(".legacy-home-unit:disabled").length,
      books: document.querySelectorAll(".legacy-home-book-button").length,
      lockedBooks: document.querySelectorAll(".legacy-home-book-button.locked, .legacy-home-book-button .legacy-home-lock").length,
      disabledBooks: document.querySelectorAll(".legacy-home-book-button:disabled").length,
      toolbar: visible(".legacy-home-classroom-toolbar"),
      teachingToolbar: visible(".teacher-offline-library .classroom-teaching-toolbar"),
      settings: visible(".legacy-home-settings-button"),
      settingsInFloatingChrome: Boolean(settings?.closest(".legacy-home-floating-chrome")),
      bottomSettings: visible(".legacy-classroom-settings-trigger"),
      floatingSound: visible(".legacy-classroom-sound-toggle"),
      close: visible(".legacy-home-close-button"),
      minimize: document.querySelectorAll('[aria-label^="Minimize"]').length,
      horizontalTopbars: document.querySelectorAll(".legacy-home-topbar").length,
      floatingChromeBackground: getComputedStyle(document.querySelector(".legacy-home-floating-chrome")).backgroundColor,
      launcherBackground: getComputedStyle(document.querySelector(".legacy-home-launcher")).backgroundImage,
      launcherBorder: getComputedStyle(document.querySelector(".legacy-home-launcher")).borderTopWidth,
      launcherRadius: getComputedStyle(document.querySelector(".legacy-home-launcher")).borderTopLeftRadius,
      minimumUnitHeight: Math.min(...unitHeights),
      maximumUnitHeight: Math.max(...unitHeights),
      displayScale: Number(document.querySelector(".teacher-offline-settings-surface").dataset.teacherDisplayScale),
    };
  });
  assert.deepEqual({ ...metrics, minimumUnitHeight: undefined, maximumUnitHeight: undefined, displayScale: undefined }, {
    launcher: true,
    unitColumns: 2,
    units: 10,
    lockedUnits: 0,
    disabledUnits: 0,
    books: 3,
    lockedBooks: 0,
    disabledBooks: 0,
    toolbar: false,
    teachingToolbar: true,
    settings: true,
    settingsInFloatingChrome: true,
    bottomSettings: false,
    floatingSound: false,
    close: true,
    minimize: 0,
    horizontalTopbars: 0,
    floatingChromeBackground: "rgba(0, 0, 0, 0)",
    launcherBackground: "none",
    launcherBorder: "0px",
    launcherRadius: "0px",
    minimumUnitHeight: undefined,
    maximumUnitHeight: undefined,
    displayScale: undefined,
  }, `${label} launcher composition`);
  assert.ok(metrics.minimumUnitHeight >= 44, `${label} unit touch target: ${metrics.minimumUnitHeight}`);
  assert.ok(metrics.maximumUnitHeight <= (94 * metrics.displayScale) + 1, `${label} proportional unit height: ${metrics.maximumUnitHeight}`);
}

async function assertLegacyPageViewer(page, label, expectedPageTitle = "Unit opener") {
  const metrics = await page.evaluate(() => {
    const reader = document.querySelector(".teacher-offline-page-reader");
    const panel = reader?.getBoundingClientRect();
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
      backgroundSize: reader ? getComputedStyle(reader).backgroundSize : "",
      backgroundPosition: reader ? getComputedStyle(reader).backgroundPosition : "",
      pageContext: document.querySelector(".legacy-page-heading strong")?.textContent?.trim(),
      locationPills: document.querySelectorAll(".legacy-page-location").length,
      floatingControls: document.querySelectorAll(".legacy-classroom-sound-toggle, .legacy-classroom-settings-trigger").length,
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
  assert.equal(metrics.backgroundSize, "cover", `${label} page background matches overview cover fitting`);
  assert.match(metrics.backgroundPosition, /50%/, `${label} page background remains centered`);
  assert.equal(metrics.pageContext, expectedPageTitle, `${label} heading shows only the current page title`);
  assert.equal(metrics.locationPills, 0, `${label} removes the lower page location pill`);
  assert.equal(metrics.floatingControls, 0, `${label} has no floating controls`);
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
    await completeStartupIntro(page);
    await run(page);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(forbiddenRequests, []);
    await context.close();
  };

  await capture({ width: 1920, height: 1080 }, async (page) => {
    await assertScreen(page, "home-launcher-1920x1080");
    await assertLegacyLauncher(page, "home-launcher-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/home-launcher-1920x1080.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-home-1920x1080.png` });
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
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${artifactRoot}/settings-graphics-1920x1080.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-settings-graphics-1920x1080.png` });
    await settingsDialog.getByRole("tab", { name: "About" }).click();
    await settingsDialog.getByText("Version 0.1.0", { exact: true }).waitFor();
    await assertCleanAbout(page, "modern-about-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/settings-about-1920x1080.png` });
    await settingsDialog.getByRole("button", { name: "Close settings" }).click();
    await openBook(page);
    await selectOverviewUnit(page, 1);
    await assertLegacyUnitOverview(page, 1, "students-book-unit1-overview-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit1-overview-1920x1080.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-unit1-overview-1920x1080.png` });
    await selectOverviewUnit(page, 2);
    await assertLegacyUnitOverview(page, 2, "students-book-unit2-overview-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit2-overview-1920x1080.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-unit2-overview-1920x1080.png` });
    await selectOverviewUnit(page, 1);
    await openPage(page, "pg 5");
    await assertScreen(page, "page-viewer-unit1-page5-1920x1080");
    await assertLegacyPageViewer(page, "page-viewer-unit1-page5-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page5-1920x1080.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-page-viewer-1920x1080.png` });
    await page.screenshot({ path: `${artifactRoot}/normal-toolbar-1920x1080.png` });
    await page.getByRole("button", { name: "Unit overview" }).click();
    await page.locator('[data-page-ids="ub2-sb-unit-1-part-4"]').click();
    await waitForPageImage(page);
    await assertLegacyPageViewer(page, "page-viewer-unit1-page10-11-1920x1080", "Grammar in Use");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page10-11-1920x1080.png` });
    await page.getByRole("button", { name: "Unit overview" }).click();
    await page.locator('[data-page-ids="ub2-sb-unit-1-part-7"]').click();
    await waitForPageImage(page);
    await assertLegacyPageViewer(page, "page-viewer-unit1-page14-15-1920x1080", "Writing");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page14-15-1920x1080.png` });
    await page.getByRole("button", { name: "Unit overview" }).click();
    await openPage(page, "pg 5");
    const unselectedToolGaps = await page.locator(".classroom-teaching-toolbar .legacy-teacher-tool-icon-stack").evaluateAll((icons) => {
      const unselected = icons.slice(1);
      return unselected.slice(1).map((icon, index) => icon.getBoundingClientRect().left - unselected[index].getBoundingClientRect().right);
    });
    assert.ok(unselectedToolGaps.every((gap) => gap >= 3 && gap <= 6), `toolbar artwork gaps must remain subtle: ${unselectedToolGaps}`);
    const pencil = page.getByRole("button", { name: "Pencil", exact: true });
    await pencil.hover();
    await page.waitForTimeout(140);
    assert.equal(await pencil.locator(".legacy-teacher-tool-icon-active").evaluate((icon) => getComputedStyle(icon).opacity), "1");
    assert.equal(await pencil.evaluate((button) => getComputedStyle(button).cursor), "pointer");
    await page.screenshot({ path: `${artifactRoot}/toolbar-hover-1920x1080.png` });
    await pencil.click();
    await page.waitForTimeout(140);
    assert.equal(await page.locator('.classroom-teaching-toolbar [aria-pressed="true"]').count(), 1);
    assert.equal(await pencil.getAttribute("aria-pressed"), "true");
    await page.screenshot({ path: `${artifactRoot}/toolbar-selected-1920x1080.png` });
    const pencilBox = await pencil.boundingBox();
    await page.mouse.move(pencilBox.x + pencilBox.width / 2, pencilBox.y + pencilBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(70);
    assert.equal(await pencil.locator(".legacy-teacher-tool-icon-active").evaluate((icon) => getComputedStyle(icon).opacity), "1");
    await page.screenshot({ path: `${artifactRoot}/toolbar-pressed-1920x1080.png` });
    await page.mouse.up();
    const overlay = page.locator(".classroom-tools-overlay");
    assert.equal(await overlay.getAttribute("data-active-classroom-tool"), "pen");
    const overlayBox = await overlay.boundingBox();
    await page.mouse.move(overlayBox.x + 260, overlayBox.y + 210);
    await page.mouse.down();
    await page.mouse.move(overlayBox.x + 470, overlayBox.y + 300, { steps: 10 });
    await page.mouse.up();
    await overlay.locator("path[data-drawing-id]").waitFor();
    await page.screenshot({ path: `${artifactRoot}/classroom-tools-pen-1920x1080.png` });
    await page.getByRole("button", { name: "Text", exact: true }).click();
    await overlay.click({ position: { x: 520, y: 220 } });
    await page.getByRole("textbox", { name: "Annotation text" }).fill("Class note");
    await page.screenshot({ path: `${artifactRoot}/text-mode-1920x1080.png` });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Mouse", exact: true }).click();
    await page.getByRole("button", { name: "Hide screen", exact: true }).click();
    await page.mouse.move(overlayBox.x + 520, overlayBox.y + 160);
    await page.mouse.down();
    await page.mouse.move(overlayBox.x + 760, overlayBox.y + 330, { steps: 8 });
    await page.mouse.up();
    await overlay.locator(".classroom-cover").waitFor();
    await page.screenshot({ path: `${artifactRoot}/cover-mode-1920x1080.png` });
    await page.getByRole("button", { name: "Mouse", exact: true }).click();
    await page.getByRole("button", { name: "Show screen", exact: true }).click();
    await page.mouse.move(overlayBox.x + 300, overlayBox.y + 140);
    await page.mouse.down();
    await page.mouse.move(overlayBox.x + 700, overlayBox.y + 380, { steps: 8 });
    await page.mouse.up();
    await overlay.locator("mask").waitFor({ state: "attached" });
    await page.screenshot({ path: `${artifactRoot}/spotlight-mode-1920x1080.png` });
    await page.getByRole("button", { name: "Mouse", exact: true }).click();
    await page.getByRole("button", { name: "Zoom", exact: true }).click();
    await page.mouse.move(overlayBox.x + 280, overlayBox.y + 130);
    await page.mouse.down();
    await page.mouse.move(overlayBox.x + 760, overlayBox.y + 410, { steps: 8 });
    await page.screenshot({ path: `${artifactRoot}/zoom-region-selection-1920x1080.png` });
    await page.mouse.up();
    await page.locator(".classroom-stage-transform.region-zoom-active").waitFor();
    await page.screenshot({ path: `${artifactRoot}/zoom-region-active-1920x1080.png` });
    await page.getByRole("button", { name: "Zoom", exact: true }).click();
    await page.getByRole("button", { name: "Timer", exact: true }).click();
    await page.getByRole("complementary", { name: "Classroom timer" }).waitFor();
    await page.screenshot({ path: `${artifactRoot}/timer-1920x1080.png` });
    await page.getByRole("button", { name: "Close timer" }).click();
    await page.getByRole("button", { name: "Scoreboard", exact: true }).click();
    await page.getByRole("complementary", { name: "Two-team scoreboard" }).waitFor();
    await page.screenshot({ path: `${artifactRoot}/scoreboard-1920x1080.png` });
    await page.getByRole("button", { name: "Close scoreboard" }).click();
    await page.getByRole("button", { name: "Clear screen", exact: true }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "All classroom markup", exact: true }).click();
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

  await capture({ width: 1920, height: 1080 }, async (page) => {
    await page.getByRole("button", { name: "Open classroom settings" }).click();
    await page.getByRole("tab", { name: "Graphics" }).click();
    assert.equal(await page.locator(".teacher-offline-settings-surface").getAttribute("data-teacher-theme"), "legacy");
    assert.equal(await page.getByRole("group", { name: "Interface style" }).count(), 0);
    await page.screenshot({ path: `${artifactRoot}/legacy-settings-1920x1080.png` });
    await page.getByRole("tab", { name: "About" }).click();
    await assertCleanAbout(page, "legacy-about-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/legacy-about-1920x1080.png` });
    await page.getByRole("button", { name: "Close settings" }).click();
    await assertScreen(page, "legacy-home-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/legacy-home-1920x1080.png` });
    await openBook(page);
    await selectOverviewUnit(page, 1);
    await waitForUnitOverview(page);
    await assertScreen(page, "legacy-unit1-overview-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/legacy-unit1-overview-1920x1080.png` });
    await openPage(page, "pg 5");
    await page.waitForFunction(() => document.querySelector(".teacher-offline-page-image img")?.getBoundingClientRect().width > innerWidth * 0.2);
    await assertScreen(page, "legacy-page-viewer-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/legacy-page-viewer-1920x1080.png` });
    await openActivity(page, 1, "Unit opener · Exercise 2");
    await assertEmbeddedActivity(page, "publisher-image-1920x1080");
    await assertPublisherImageCanvas(page, "publisher-image-1920x1080");
    await page.screenshot({ path: `${artifactRoot}/publisher-image-1920x1080.png` });
  });

  await capture({ width: 1280, height: 720 }, async (page) => {
    await assertScreen(page, "home-launcher-1280x720");
    await assertLegacyLauncher(page, "home-launcher-1280x720");
    await page.screenshot({ path: `${artifactRoot}/home-launcher-1280x720.png` });
    await openBook(page);
    await selectOverviewUnit(page, 1);
    await assertLegacyUnitOverview(page, 1, "students-book-unit1-overview-1280x720");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit1-overview-1280x720.png` });
    await selectOverviewUnit(page, 2);
    await assertLegacyUnitOverview(page, 2, "students-book-unit2-overview-1280x720");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit2-overview-1280x720.png` });
    await selectOverviewUnit(page, 1);
    await openPage(page, "pg 5");
    await assertScreen(page, "page-viewer-unit1-page5-1280x720");
    await assertLegacyPageViewer(page, "page-viewer-unit1-page5-1280x720");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page5-1280x720.png` });
  });

  await capture({ width: 1366, height: 768 }, async (page) => {
    await openBook(page);
    await selectOverviewUnit(page, 1);
    await openPage(page, "pg 5");
    await page
      .locator('.teacher-offline-page-hotspot[aria-label="Unit opener · Exercise 1"]')
      .click();
    await page.locator(".teacher-offline-embedded-activity").waitFor();
    await assertEmbeddedActivity(page, "unit-opener-1366x768");
    assert.equal(await page.locator(".legacy-page-heading strong").textContent(), "Unit opener", "unit opener keeps its parent page title");
    for (const question of [1, 2, 3]) {
      await page.getByRole("button", { name: `Show publisher model answer for question ${question}` }).click();
    }
    await page.getByRole("button", { name: "Publisher model answer for question 3" }).waitFor();
    const unitOpenerFonts = await page.evaluate(() => ({
      question: getComputedStyle(document.querySelector(".legacy-unit-opener-question h3")).fontFamily,
      answer: getComputedStyle(document.querySelector(".legacy-unit-opener-answer-lines.revealed > span")).fontFamily,
      answerWeight: getComputedStyle(document.querySelector(".legacy-unit-opener-answer-lines.revealed > span")).fontWeight,
    }));
    assert.match(unitOpenerFonts.question, /Fira Sans/, "unit opener question uses the recovered Fira Sans family");
    assert.match(unitOpenerFonts.answer, /ITC Flora Std Medium/, "unit opener answer uses the recovered ITC Flora family");
    assert.equal(unitOpenerFonts.answerWeight, "400", "unit opener answer keeps publisher normal weight");
    await page.screenshot({ path: `${artifactRoot}/embedded-unit-opener-1366x768.png` });
    await page.getByRole("button", { name: "Back to page" }).click();
    await waitForPageImage(page);
    await page
      .locator('.teacher-offline-page-hotspot[aria-label="Unit opener · Exercise 1"]')
      .click();
    await page.locator(".teacher-offline-embedded-activity").waitFor();
    await page.goBack();
    await waitForPageImage(page);
  });

  await capture({ width: 800, height: 360 }, async (page) => {
    await assertScreen(page, "home-launcher-800x360");
    await assertLegacyLauncher(page, "home-launcher-800x360");
    await page.screenshot({ path: `${artifactRoot}/home-launcher-800x360.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-home-800x360.png` });
    await page.getByRole("button", { name: "Open classroom settings" }).click();
    await page.getByRole("dialog", { name: "Classroom settings" }).waitFor();
    await page.screenshot({ path: `${artifactRoot}/settings-audio-800x360.png` });
    await page.getByRole("tab", { name: "About" }).click();
    await assertCleanAbout(page, "modern-about-800x360");
    await page.screenshot({ path: `${artifactRoot}/modern-about-800x360.png` });
    await page.getByRole("button", { name: "Close settings" }).click();
    await openBook(page);
    await assertLegacyUnitOverview(page, 1, "students-book-unit1-overview-800x360");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit1-overview-800x360.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-unit1-overview-800x360.png` });
    await selectOverviewUnit(page, 2);
    await assertLegacyUnitOverview(page, 2, "students-book-unit2-overview-800x360");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit2-overview-800x360.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-unit2-overview-800x360.png` });
    await selectOverviewUnit(page, 1);
    await openPage(page, "pg 5");
    await assertScreen(page, "page-viewer-unit1-page5-800x360");
    await assertLegacyPageViewer(page, "page-viewer-unit1-page5-800x360");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page5-800x360.png` });
    await page.screenshot({ path: `${artifactRoot}/normal-toolbar-800x360.png` });
  });

  await capture({ width: 2560, height: 1440 }, async (page) => {
    await assertScreen(page, "home-launcher-2560x1440");
    await assertLegacyLauncher(page, "home-launcher-2560x1440");
    await page.screenshot({ path: `${artifactRoot}/home-launcher-2560x1440.png` });
  });

  await capture({ width: 3840, height: 2160 }, async (page) => {
    await assertScreen(page, "home-launcher-3840x2160");
    await assertLegacyLauncher(page, "home-launcher-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/home-launcher-3840x2160.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-home-3840x2160.png` });
    await page.getByRole("button", { name: "Open classroom settings" }).click();
    await page.getByRole("dialog", { name: "Classroom settings" }).waitFor();
    await page.screenshot({ path: `${artifactRoot}/settings-audio-3840x2160.png` });
    await page.getByRole("tab", { name: "Graphics" }).click();
    await page.locator('[data-settings-panel="graphics"]').waitFor();
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${artifactRoot}/settings-graphics-3840x2160.png` });
    await page.getByRole("tab", { name: "About" }).click();
    await assertCleanAbout(page, "modern-about-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/modern-about-3840x2160.png` });
    await page.getByRole("button", { name: "Close settings" }).click();
    await openBook(page);
    await selectOverviewUnit(page, 1);
    await assertLegacyUnitOverview(page, 1, "students-book-unit1-overview-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit1-overview-3840x2160.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-unit1-overview-3840x2160.png` });
    await selectOverviewUnit(page, 2);
    await assertLegacyUnitOverview(page, 2, "students-book-unit2-overview-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/students-book-unit2-overview-3840x2160.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-unit2-overview-3840x2160.png` });
    await selectOverviewUnit(page, 1);
    await openPage(page, "pg 5");
    await assertScreen(page, "page-viewer-unit1-page5-3840x2160");
    await assertLegacyPageViewer(page, "page-viewer-unit1-page5-3840x2160");
    await page.screenshot({ path: `${artifactRoot}/page-viewer-unit1-page5-3840x2160.png` });
    await page.screenshot({ path: `${artifactRoot}/modern-page-viewer-3840x2160.png` });
    await page.screenshot({ path: `${artifactRoot}/normal-toolbar-3840x2160.png` });
  });

  console.log(JSON.stringify({ status: "passed", screenshots: 49, artifactRoot }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
