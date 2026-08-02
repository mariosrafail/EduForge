import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

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

function expectedDisplayScale({ width, height }) {
  return Math.min(2, Math.max(1, Math.min(width / 1920, height / 1080)));
}

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  await waitForPreview();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
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
    const settingsSurface = page.locator(".teacher-offline-settings-surface");
    const displayScale = expectedDisplayScale(target);
    assert.equal(await settingsSurface.getAttribute("data-teacher-theme"), "modern", `${target.name} modern default`);
    assertNear(Number(await settingsSurface.getAttribute("data-teacher-display-scale")), displayScale, .001, `${target.name} display scale attribute`);
    const initialScaleVariables = await settingsSurface.evaluate((surface) => ({
      display: Number(getComputedStyle(surface).getPropertyValue("--teacher-display-scale")),
      effective: Number(getComputedStyle(surface).getPropertyValue("--teacher-ui-scale")),
    }));
    assertNear(initialScaleVariables.display, displayScale, .001, `${target.name} display scale variable`);
    assertNear(initialScaleVariables.effective, displayScale, .001, `${target.name} effective scale variable`);
    assert.equal(await page.locator(".teacher-offline-library").count(), 1, `${target.name} library`);
    assert.equal(await page.locator(".legacy-home-launcher").count(), 1, `${target.name} launcher`);
    assert.equal(await page.locator(".legacy-home-unit.available").count(), 2, `${target.name} available units`);
    const launcherLayout = await page.evaluate(() => {
      const units = [...document.querySelectorAll(".legacy-home-unit")].map((button) => button.getBoundingClientRect());
      const settings = document.querySelector(".legacy-home-settings-button");
      const close = document.querySelector(".legacy-home-close-button");
      const sound = document.querySelector(".legacy-classroom-sound-toggle-home");
      const controls = [sound, settings, close].map((control) => control?.getBoundingClientRect()).filter(Boolean);
      const overlaps = controls.some((first, index) => controls.slice(index + 1).some((second) => (
        first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top
      )));
      return {
        teachingToolbars: document.querySelectorAll(".teacher-offline-library :is(.legacy-home-classroom-toolbar, .classroom-teaching-toolbar)").length,
        settingsInHeader: Boolean(settings?.closest(".legacy-home-topbar")),
        closeInHeader: Boolean(close?.closest(".legacy-home-topbar")),
        headerControlsOverlap: overlaps,
        minimizeControls: document.querySelectorAll('[aria-label^="Minimize"]').length,
        centeredTitles: document.querySelectorAll(".legacy-home-topbar .teacher-offline-eyebrow").length,
        bottomSettings: document.querySelectorAll(".legacy-classroom-settings-trigger").length,
        minimumUnitHeight: Math.min(...units.map((rect) => rect.height)),
        maximumUnitHeight: Math.max(...units.map((rect) => rect.height)),
        topbarHeight: document.querySelector(".legacy-home-topbar").getBoundingClientRect().height,
        unitTitleFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".legacy-home-unit span")).fontSize),
        bookButtonHeight: document.querySelector(".legacy-home-book-button").getBoundingClientRect().height,
        bookButtonFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".legacy-home-book-button")).fontSize),
        publisherFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".legacy-home-publisher strong")).fontSize),
        identityTitleFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".legacy-home-title i")).fontSize),
        settingsButtonWidth: settings.getBoundingClientRect().width,
        launcherWidth: document.querySelector(".legacy-home-launcher").getBoundingClientRect().width,
        bookRowWidth: document.querySelector(".legacy-home-book-row").getBoundingClientRect().width,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.equal(launcherLayout.teachingToolbars, 0, `${target.name} launcher tools removed`);
    assert.equal(launcherLayout.settingsInHeader, true, `${target.name} settings in header`);
    assert.equal(launcherLayout.closeInHeader, true, `${target.name} close in header`);
    assert.equal(launcherLayout.headerControlsOverlap, false, `${target.name} launcher header controls do not overlap`);
    assert.equal(launcherLayout.minimizeControls, 0, `${target.name} minimize removed`);
    assert.equal(launcherLayout.centeredTitles, 0, `${target.name} centered title removed`);
    assert.equal(launcherLayout.bottomSettings, 0, `${target.name} bottom settings removed`);
    assert.ok(launcherLayout.minimumUnitHeight >= 44, `${target.name} unit touch targets: ${JSON.stringify(launcherLayout)}`);
    assert.ok(launcherLayout.maximumUnitHeight <= (84 * displayScale) + 1, `${target.name} proportional unit sizing: ${JSON.stringify(launcherLayout)}`);
    assert.ok(launcherLayout.overflow <= 1, `${target.name} launcher overflow: ${JSON.stringify(launcherLayout)}`);
    await page.getByRole("button", { name: "Open classroom settings" }).click();
    await page.waitForTimeout(250);
    const settingsLayout = await page.evaluate(() => {
      const dialog = document.querySelector(".legacy-settings-dialog")?.getBoundingClientRect();
      const close = document.querySelector(".legacy-settings-close")?.getBoundingClientRect();
      const tabs = [...document.querySelectorAll(".legacy-settings-tabs button")].map((button) => button.getBoundingClientRect());
      return {
        dialogContained: Boolean(dialog && dialog.left >= -1 && dialog.right <= innerWidth + 1 && dialog.top >= -1 && dialog.bottom <= innerHeight + 1),
        closeVisible: Boolean(close?.width && close?.height && close.right <= innerWidth + 1 && close.top >= -1),
        tabCount: tabs.length,
        minimumTabHeight: Math.min(...tabs.map((rect) => rect.height)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    assert.equal(settingsLayout.dialogContained, true, `${target.name} settings dialog contained`);
    assert.equal(settingsLayout.closeVisible, true, `${target.name} settings close visible`);
    assert.equal(settingsLayout.tabCount, 4, `${target.name} settings tabs`);
    assert.ok(settingsLayout.minimumTabHeight >= 43, `${target.name} settings tab touch targets`);
    assert.ok(settingsLayout.overflow <= 1, `${target.name} settings overflow`);
    await page.getByRole("tab", { name: "Graphics" }).click();
    await page.locator('[data-settings-panel="graphics"]').waitFor();
    if (target.name === "4k-3840x2160") {
      await page.getByRole("slider", { name: "Interface size" }).fill("90");
      await page.waitForFunction(() => Math.abs(Number(getComputedStyle(document.querySelector(".teacher-offline-settings-surface")).getPropertyValue("--teacher-ui-scale")) - 1.8) < .001);
      assertNear(Number(await settingsSurface.evaluate((surface) => getComputedStyle(surface).getPropertyValue("--teacher-ui-scale"))), 1.8, .001, "4K Interface Size multiplies automatic scale");
      await page.getByRole("slider", { name: "Interface size" }).fill("100");
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".teacher-offline-settings-surface")).getPropertyValue("--teacher-ui-scale")) === 2);
    }
    await page.getByRole("button", { name: "Legacy", exact: true }).click();
    assert.equal(await page.locator(".teacher-offline-settings-surface").getAttribute("data-teacher-theme"), "legacy", `${target.name} live legacy theme`);
    assert.equal(await page.getByRole("dialog", { name: "Classroom settings" }).isVisible(), true, `${target.name} legacy dialog remains open`);
    await page.getByRole("button", { name: "Modern", exact: true }).click();
    assert.equal(await page.locator(".teacher-offline-settings-surface").getAttribute("data-teacher-theme"), "modern", `${target.name} live modern theme`);
    await page.getByRole("button", { name: "Close settings" }).click();
    await page.getByRole("button", { name: "Open Students Book" }).click();
    await page.locator(".teacher-offline-book").waitFor();
    await page.getByRole("button", { name: "Contents and exercises" }).click();
    const bookShellUnitSwitcher = await page.locator(".teacher-offline-unit-tabs button").evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        height: rect.height,
        left: rect.left,
        right: rect.right,
        title: button.dataset.unitTitle,
        contained: rect.left >= -1 && rect.right <= innerWidth + 1,
      };
    }));
    assert.equal(bookShellUnitSwitcher.length, 2, `${target.name} book-shell unit switcher count`);
    assert.deepEqual(bookShellUnitSwitcher.map((button) => button.title), ["Lights, Camera, Action!", "Journeys of Discovery"], `${target.name} book-shell unit titles`);
    assert.ok(bookShellUnitSwitcher.every((button) => button.height >= 44 && button.contained), `${target.name} book-shell touch targets contained: ${JSON.stringify(bookShellUnitSwitcher)}`);
    assert.ok(bookShellUnitSwitcher[0].right < bookShellUnitSwitcher[1].left, `${target.name} book-shell unit controls do not overlap`);
    await page.getByRole("tab", { name: "Book pages" }).click();
    await page.locator(".teacher-offline-unit-overview").waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll(".teacher-unit-page-thumb img")]
      .every((image) => image.complete && image.naturalWidth > 0));
    assert.equal(await page.locator(".legacy-overview-unit-switcher").count(), 0, `${target.name} overview top-left unit switcher absent`);
    assert.equal(await page.getByRole("heading", { name: "Unit 1", exact: true }).isVisible(), true, `${target.name} Unit 1 overview title`);
    assert.equal(await page.getByRole("button", { name: "Previous unit", exact: true }).count(), 0, `${target.name} Unit 1 previous edge hidden`);
    const readSideArrow = async (label) => page.getByRole("button", { name: label, exact: true }).evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const panel = document.querySelector(".teacher-offline-unit-overview").getBoundingClientRect();
      const entries = [...document.querySelectorAll("[data-overview-entry]")].map((entry) => entry.getBoundingClientRect());
      return {
        size: rect.width,
        left: rect.left,
        right: rect.right,
        centerDelta: Math.abs((rect.top + rect.height / 2) - (panel.top + panel.height / 2)),
        overlapsEntry: entries.some((entry) => rect.left < entry.right && rect.right > entry.left && rect.top < entry.bottom && rect.bottom > entry.top),
        target: button.dataset.unitTarget,
      };
    });
    const nextArrow = await readSideArrow("Next unit");
    const compactArrow = target.width <= 1100 || target.height <= 650;
    const expectedArrowSize = compactArrow ? 44 : 60 * displayScale;
    assert.ok(Math.abs(nextArrow.size - expectedArrowSize) <= 1, `${target.name} next-unit arrow size: ${JSON.stringify(nextArrow)}`);
    assert.ok(target.width - nextArrow.right <= (compactArrow ? 9 : (20 * displayScale) + 1), `${target.name} next-unit arrow near right safe edge`);
    assert.ok(nextArrow.centerDelta <= 1, `${target.name} next-unit arrow vertically centered`);
    assert.equal(nextArrow.overlapsEntry, false, `${target.name} next-unit arrow does not cover thumbnails`);
    assert.equal(nextArrow.target, "2", `${target.name} next-unit target`);
    await page.getByRole("button", { name: "Next unit", exact: true }).click();
    await page.getByRole("heading", { name: "Unit 2", exact: true }).waitFor();
    await page.locator(".teacher-offline-unit-overview-screen").evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    assert.equal(await page.getByRole("button", { name: "Next unit", exact: true }).count(), 0, `${target.name} Unit 2 next edge hidden`);
    const previousArrow = await readSideArrow("Previous unit");
    assert.ok(Math.abs(previousArrow.size - expectedArrowSize) <= 1, `${target.name} previous-unit arrow size: ${JSON.stringify(previousArrow)}`);
    assert.ok(previousArrow.left <= (compactArrow ? 9 : (20 * displayScale) + 1), `${target.name} previous-unit arrow near left safe edge: ${JSON.stringify(previousArrow)}`);
    assert.ok(previousArrow.centerDelta <= 1, `${target.name} previous-unit arrow vertically centered`);
    assert.equal(previousArrow.overlapsEntry, false, `${target.name} previous-unit arrow does not cover thumbnails`);
    assert.equal(previousArrow.target, "1", `${target.name} previous-unit target`);
    await page.getByRole("button", { name: "Previous unit", exact: true }).click();
    await page.getByRole("heading", { name: "Unit 1", exact: true }).waitFor();
    await page.locator(".teacher-offline-unit-overview-screen").evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    assert.equal(await page.locator(".teacher-offline-pages-viewer").count(), 0, `${target.name} previous-unit arrow stays in overview mode`);
    await page.getByRole("button", { name: "Next unit", exact: true }).click();
    await page.getByRole("heading", { name: "Unit 2", exact: true }).waitFor();
    await page.locator(".teacher-offline-unit-overview-screen").evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    const overviewLayout = await page.evaluate(() => {
      const panel = document.querySelector(".teacher-offline-unit-overview").getBoundingClientRect();
      const entries = [...document.querySelectorAll("[data-overview-entry]")];
      const images = [...document.querySelectorAll(".teacher-unit-page-thumb img")];
      return {
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        entries: entries.length,
        images: images.length,
        minimumEntryHeight: Math.min(...entries.map((entry) => entry.getBoundingClientRect().height)),
        titleFontSize: Number.parseFloat(getComputedStyle(document.querySelector(".legacy-overview-heading h2")).fontSize),
        toolbarHeight: document.querySelector(".classroom-teaching-toolbar").getBoundingClientRect().height,
        entriesContained: entries.every((entry) => {
          const rect = entry.getBoundingClientRect();
          return rect.left >= panel.left - 2 && rect.right <= panel.right + 2 && rect.top >= panel.top - 2 && rect.bottom <= panel.bottom + 2;
        }),
      };
    });
    assert.ok(overviewLayout.documentOverflow <= 1, `${target.name} overview document overflow`);
    assert.equal(overviewLayout.entries, 10, `${target.name} Unit 2 overview entries`);
    assert.equal(overviewLayout.images, 12, `${target.name} Unit 2 real thumbnails`);
    assert.ok(overviewLayout.minimumEntryHeight >= 44, `${target.name} overview touch targets`);
    assert.equal(overviewLayout.entriesContained, true, `${target.name} overview entries contained`);
    await page.locator(".teacher-unit-page-card").filter({ hasText: "pg 20-21" }).first().click();
    await page.waitForFunction(() => {
      const image = document.querySelector(".teacher-offline-page-image img");
      return image?.naturalWidth > 0 && image.getBoundingClientRect().width > 0;
    });
    await page.waitForFunction(() => {
      const image = document.querySelector(".teacher-offline-page-image");
      if (!image) return false;
      const imageRect = image.getBoundingClientRect();
      const hotspots = [...image.querySelectorAll(".teacher-offline-page-hotspot")];
      return hotspots.length > 0 && hotspots.every((hotspot) => {
        const rect = hotspot.getBoundingClientRect();
        return rect.left >= imageRect.left - 1 && rect.right <= imageRect.right + 1
          && rect.top >= imageRect.top - 1 && rect.bottom <= imageRect.bottom + 1;
      });
    });
    await page.locator(".teacher-offline-pages-viewer").evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));

    const layout = await page.evaluate(() => {
      const root = document.documentElement;
      const shell = document.querySelector(".teacher-offline-book");
      const header = document.querySelector(".legacy-page-heading");
      const stage = document.querySelector(".teacher-offline-page-stage");
      const image = document.querySelector(".teacher-offline-page-image");
      const stageRect = stage.getBoundingClientRect();
      const imageRect = image.getBoundingClientRect();
      const buttons = [...document.querySelectorAll(".legacy-page-navigation button, .legacy-classroom-viewer-toolbar button")]
        .map((button) => button.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
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
        toolbarButtonSize: document.querySelector(".classroom-teaching-toolbar button").getBoundingClientRect().height,
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
      "fit-page",
      `${target.name} default fit`,
    );
    if (layout.image.fit === "fit-page") {
      assert.ok(layout.image.width <= layout.stage.width + 1 && layout.image.height <= layout.stage.height + 1);
    }

    const toolbarButtons = page.locator(".classroom-teaching-toolbar.normal-mode button");
    assert.equal(await toolbarButtons.count(), 8, `${target.name} normal toolbar button count`);
    assert.equal(await page.getByRole("button", { name: "More classroom tools" }).count(), 0);
    if (target.name === "4k-3840x2160") {
      const overlay = page.locator(".classroom-tools-overlay");
      const overlayBox = await overlay.boundingBox();
      const start = { x: overlayBox.x + overlayBox.width * .24, y: overlayBox.y + overlayBox.height * .22 };
      const end = { x: overlayBox.x + overlayBox.width * .46, y: overlayBox.y + overlayBox.height * .4 };

      await page.getByRole("button", { name: "Pen tool" }).click();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 6 });
      await page.mouse.up();
      const strokeBox = await overlay.locator("path[data-drawing-id]").last().boundingBox();
      assertNear(strokeBox.x, start.x, 4, "4K pen start x");
      assertNear(strokeBox.y, start.y, 4, "4K pen start y");
      assertNear(strokeBox.width, end.x - start.x, 8, "4K pen width");
      assertNear(strokeBox.height, end.y - start.y, 8, "4K pen height");
      await page.getByRole("button", { name: "Exit pen mode" }).click();

      await page.getByRole("button", { name: "Cover area tool" }).click();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 6 });
      await page.mouse.up();
      const cover = overlay.locator(".classroom-cover").last();
      const coverBox = await cover.boundingBox();
      assertNear(coverBox.x, start.x, 3, "4K cover start x");
      assertNear(coverBox.y, start.y, 3, "4K cover start y");
      assertNear(coverBox.width, end.x - start.x, 4, "4K cover width");
      assertNear(coverBox.height, end.y - start.y, 4, "4K cover height");
      await page.getByRole("button", { name: "Exit cover mode" }).first().click();
      await cover.click({ force: true });
      const deleteBox = await page.getByRole("button", { name: "Delete selected cover" }).boundingBox();
      assert.ok(deleteBox.x >= coverBox.x - deleteBox.width && deleteBox.x <= coverBox.x + coverBox.width, "4K cover delete aligned horizontally");
      assert.ok(deleteBox.y >= coverBox.y - deleteBox.height && deleteBox.y <= coverBox.y + coverBox.height, "4K cover delete aligned vertically");
      await page.getByRole("button", { name: "Delete selected cover" }).click();

      await page.getByRole("button", { name: "Spotlight reveal tool" }).click();
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 6 });
      await page.mouse.up();
      const spotlightBox = await overlay.locator('rect[stroke="#f4e84a"]').boundingBox();
      assertNear(spotlightBox.x, start.x, 4, "4K spotlight start x");
      assertNear(spotlightBox.y, start.y, 4, "4K spotlight start y");
      assertNear(spotlightBox.width, end.x - start.x, 5, "4K spotlight width");
      assertNear(spotlightBox.height, end.y - start.y, 5, "4K spotlight height");
      await page.getByRole("button", { name: "Exit spotlight mode" }).first().click();
    }
    await page.getByRole("button", { name: "Zoom region" }).click();
    const overlayBox = await page.locator(".classroom-tools-overlay").boundingBox();
    await page.mouse.move(overlayBox.x + overlayBox.width * .2, overlayBox.y + overlayBox.height * .2);
    await page.mouse.down();
    await page.mouse.move(overlayBox.x + overlayBox.width * .7, overlayBox.y + overlayBox.height * .72, { steps: 5 });
    await page.mouse.up();
    const zoomLayer = page.locator(".classroom-stage-transform.region-zoom-active");
    await zoomLayer.waitFor();
    assert.ok(Number(await zoomLayer.getAttribute("data-region-zoom-scale")) > 1, `${target.name} region zoom scale`);
    await page.getByRole("button", { name: "Zoom out" }).click();
    assert.equal(await page.locator(".classroom-stage-transform.region-zoom-active").count(), 0, `${target.name} region zoom reset`);

    await page.getByRole("button", { name: "Contents and exercises" }).click();
    assert.equal(await page.locator(".teacher-offline-lessons article").count(), 40, `${target.name} Unit 2 contents`);
    const firstActivity = page.locator(".teacher-offline-lessons article").filter({
      hasText: target.name === "4k-3840x2160" ? /Reading.*Exercise 3/ : /Reading/,
    }).first();
    await firstActivity.getByRole("button", { name: "Present" }).click();
    await page.locator(".teacher-offline-embedded-activity").waitFor();
    await page.waitForTimeout(220);
    const activityMetrics = await page.evaluate(() => {
      const reader = document.querySelector(".teacher-offline-page-reader").getBoundingClientRect();
      const embedded = document.querySelector(".teacher-offline-embedded-activity-content").getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        inViewport: embedded.left >= reader.left - 1 && embedded.right <= reader.right + 1
          && embedded.top >= reader.top - 1 && embedded.bottom <= reader.bottom + 1,
        fitScale: Number(document.querySelector(".teacher-offline-embedded-activity").dataset.fitScale),
        heading: Boolean(document.querySelector(".legacy-page-heading")),
        navigation: Boolean(document.querySelector(".legacy-page-navigation")),
        reader: Boolean(document.querySelector(".teacher-offline-page-reader")),
        pageImages: document.querySelectorAll(".teacher-offline-page-image").length,
        toolbars: document.querySelectorAll(".teacher-offline-pages-viewer .classroom-teaching-toolbar").length,
        standalonePresentation: document.querySelectorAll(".teacher-offline-presentation").length,
      };
    });
    assert.ok(activityMetrics.overflow <= 1, `${target.name} activity overflow`);
    assert.ok(activityMetrics.inViewport, `${target.name} activity card must remain in viewport`);
    assert.ok(activityMetrics.fitScale > 0 && activityMetrics.fitScale <= 1, `${target.name} activity fit scale`);
    assert.equal(activityMetrics.heading, true, `${target.name} activity keeps unit heading`);
    assert.equal(activityMetrics.navigation, true, `${target.name} activity keeps page navigation`);
    assert.equal(activityMetrics.reader, true, `${target.name} activity stays in purple reader`);
    assert.equal(activityMetrics.pageImages, 0, `${target.name} activity replaces page image`);
    assert.equal(activityMetrics.toolbars, 1, `${target.name} activity keeps exactly one toolbar`);
    assert.equal(activityMetrics.standalonePresentation, 0, `${target.name} standalone presentation chrome removed`);
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
    await page.getByRole("button", { name: "Back to page" }).click();
    await page.locator(".teacher-offline-page-image").waitFor();

    if (target.name === "tablet-1280x800") {
      await page.getByRole("button", { name: "Contents and exercises" }).click();
      const typedActivity = page.locator(".teacher-offline-lessons article").filter({ hasText: /Vocabulary in Use.*Exercise 4/ }).first();
      await typedActivity.getByRole("button", { name: "Present" }).click();
      await page.locator(".teacher-offline-embedded-activity input").first().fill("test");
      assert.equal(await page.locator(".teacher-offline-embedded-activity input").first().inputValue(), "test");
      await page.getByRole("button", { name: "Back to page" }).click();
    }

    if (target.name === "full-hd-1920x1080") {
      await page.getByRole("button", { name: "Contents and exercises" }).click();
      const answerActivity = page.locator(".teacher-offline-lessons article").filter({ hasText: /Reading.*Exercise 3/ }).first();
      await answerActivity.getByRole("button", { name: "Present" }).click();
      await page.getByRole("button", { name: "Show all answers" }).click();
      await page.getByText("Publisher answer", { exact: true }).first().waitFor();
      await page.screenshot({ path: `${artifactRoot}/${target.name}-answers.png` });
      await page.getByRole("button", { name: "Back to page" }).click();
      await page.getByRole("button", { name: "Contents and exercises" }).click();
      await page.getByRole("button", { name: "Unit 1", exact: true }).click();
      await page.getByRole("button", { name: "Contents and exercises" }).click();
      const matchingActivity = page.locator(".teacher-offline-lessons article").filter({ hasText: /Vocabulary in Use.*Exercise 1/ }).first();
      await matchingActivity.getByRole("button", { name: "Present" }).click();
      assert.ok(await page.locator(".teacher-offline-embedded-activity select").count() > 0, "Normalized matching activity must render choices");
      await page.getByRole("button", { name: "Next page" }).click();
      await page.locator(".teacher-offline-page-image").waitFor();
      assert.equal(await page.locator(".teacher-offline-embedded-activity").count(), 0, "Next page closes the old activity");
      await page.getByRole("button", { name: "Contents and exercises" }).click();
      await page.getByRole("button", { name: "Unit 2", exact: true }).click();
    }

    if (target.name === "qhd-2560x1440") {
      await page.getByRole("button", { name: "Contents and exercises" }).click();
      const audioActivity = page.locator(".teacher-offline-lessons article").filter({ hasText: /Reading.*Exercise 2/ }).first();
      await audioActivity.getByRole("button", { name: "Present" }).click();
      const audio = page.locator("audio");
      await audio.waitFor();
      assert.equal(await audio.getAttribute("preload"), "metadata");
      assert.match(await audio.getAttribute("src"), /^(?:http:\/\/127\.0\.0\.1:4179)?\/assets\//);
      await page.getByRole("button", { name: "Back to page" }).click();
    }

    const bookPagesTab = page.locator('[title="Book pages"]');
    if (await bookPagesTab.isVisible()) await bookPagesTab.click();
    if (target.screenshot) {
      if (!await page.locator(".teacher-offline-unit-overview").count()) {
        await page.getByRole("button", { name: "Unit overview" }).click();
      }
      await page.locator(".teacher-unit-page-card").filter({ hasText: "pg 20-21" }).first().click();
      await page.waitForFunction(() => {
        const image = document.querySelector(".teacher-offline-page-image img");
        return image?.naturalWidth > 0 && image.getBoundingClientRect().width > 0;
      });
      await page.screenshot({ path: `${artifactRoot}/${target.name}-page.png` });
    }

    assert.deepEqual(consoleErrors, [], `${target.name} console errors`);
    assert.deepEqual(forbiddenRequests, [], `${target.name} forbidden requests`);
    results.push({
      viewport: `${target.width}x${target.height}@${target.dpr}`,
      profile: target.profile,
      displayScale,
      launcher: launcherLayout,
      settingsTabHeight: settingsLayout.minimumTabHeight,
      overviewTitleFontSize: overviewLayout.titleFontSize,
      overviewToolbarHeight: overviewLayout.toolbarHeight,
      pageStage: `${Math.round(layout.stage.width)}x${Math.round(layout.stage.height)}`,
      headerHeight: Math.round(layout.headerHeight),
      minimumControlHeight: Math.round(layout.minControlHeight),
      toolbarButtonSize: layout.toolbarButtonSize,
      horizontalOverflow: Math.max(layout.documentOverflow, layout.shellOverflow),
      consoleErrors: consoleErrors.length,
      forbiddenRequests: forbiddenRequests.length,
    });
    await context.close();
  }

  const baseline = results.find((result) => result.viewport.startsWith("1920x1080"));
  for (const [prefix, expectedRatio] of [["2560x1440", 4 / 3], ["3840x2160", 2]]) {
    const large = results.find((result) => result.viewport.startsWith(prefix));
    for (const [label, read] of [
      ["launcher unit height", (result) => result.launcher.maximumUnitHeight],
      ["launcher unit font", (result) => result.launcher.unitTitleFontSize],
      ["launcher top chrome", (result) => result.launcher.topbarHeight],
      ["launcher book button", (result) => result.launcher.bookButtonHeight],
      ["launcher book button font", (result) => result.launcher.bookButtonFontSize],
      ["launcher publisher font", (result) => result.launcher.publisherFontSize],
      ["launcher identity title", (result) => result.launcher.identityTitleFontSize],
      ["launcher settings control", (result) => result.launcher.settingsButtonWidth],
      ["settings tab", (result) => result.settingsTabHeight],
      ["overview title", (result) => result.overviewTitleFontSize],
      ["overview toolbar", (result) => result.overviewToolbarHeight],
      ["page toolbar control", (result) => result.toolbarButtonSize],
    ]) {
      assertNear(read(large) / read(baseline), expectedRatio, .12, `${prefix} ${label} ratio`);
    }
    const viewportWidth = Number(prefix.split("x")[0]);
    const baselineLauncherShare = baseline.launcher.launcherWidth / 1920;
    const baselineBookRowShare = baseline.launcher.bookRowWidth / 1920;
    assert.ok(large.launcher.launcherWidth / viewportWidth >= .78, `${prefix} launcher uses substantial viewport width`);
    assert.ok(large.launcher.bookRowWidth / viewportWidth >= .65, `${prefix} book row uses substantial viewport width`);
    assertNear(large.launcher.launcherWidth / viewportWidth, baselineLauncherShare, .09, `${prefix} launcher relative width`);
    assertNear(large.launcher.bookRowWidth / viewportWidth, baselineBookRowShare, .09, `${prefix} book row relative width`);
  }

  console.log(JSON.stringify({ status: "passed", results, artifacts: artifactRoot }, null, 2));
} finally {
  await browser?.close();
  preview.kill();
}
