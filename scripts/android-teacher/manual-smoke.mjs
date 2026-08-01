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
  await page.getByRole("button", { name: `Unit ${unitNumber}`, exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".teacher-unit-page-thumb img")]
    .every((image) => image.complete && image.naturalWidth > 0));
  await page.getByRole("button", { name: "Contents and exercises" }).click();
}

async function backToBook(page) {
  await page.getByRole("button", { name: "Back to book" }).click();
  await page.locator(".teacher-offline-book").waitFor();
}

let browser;
try {
  await waitForPreview();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const requests = [];
  const consoleErrors = [];
  page.on("request", (request) => requests.push({ url: request.url(), type: request.resourceType() }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const startupStartedAt = performance.now();
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".legacy-home-launcher").waitFor();
  assert.equal(await page.getByRole("button", { name: /Open Unit/ }).count(), 2, "Only Units 1 and 2 may be available");
  for (const unit of [1, 2]) {
    assert.equal(await page.getByRole("button", { name: new RegExp(`^Open Unit ${unit}:`) }).isEnabled(), true);
  }
  for (const unit of [3, 4, 5, 6, 7, 8, 9, 10]) {
    const lockedUnit = page.getByRole("button", { name: new RegExp(`^Unit ${unit}:.*Locked$`) });
    assert.equal(await lockedUnit.isDisabled(), true, `Unit ${unit} must be locked`);
  }
  assert.equal(await page.locator(".legacy-home-unit .legacy-home-lock").count(), 8);
  assert.equal(await page.getByRole("button", { name: "Open Students Book" }).isEnabled(), true);
  for (const book of ["Workbook", "Grammar Book", "Extras"]) {
    assert.equal(await page.getByRole("button", { name: `${book} — Locked` }).isDisabled(), true, `${book} must be locked`);
  }
  assert.equal(await page.locator(".legacy-home-book-button .legacy-home-lock").count(), 3);
  const initialHash = await page.evaluate(() => location.hash);
  await page.getByRole("button", { name: /^Unit 3:.*Locked$/ }).evaluate((button) => button.click());
  await page.getByRole("button", { name: "Workbook — Locked" }).evaluate((button) => button.click());
  assert.equal(await page.evaluate(() => location.hash), initialHash, "Locked launcher controls must not navigate");
  assert.equal(await page.locator(".legacy-home-launcher").isVisible(), true);
  const coldStartupMs = Math.round(performance.now() - startupStartedAt);
  const bookOpenStartedAt = performance.now();
  await page.getByRole("button", { name: "Open Students Book" }).click();
  await page.locator(".teacher-offline-book").waitFor();
  const bookOpenMs = Math.round(performance.now() - bookOpenStartedAt);

  await assertCanonicalUnitOverview(page, 1);
  await page.locator('[data-page-ids="ub2-sb-unit-1-part-9,ub2-sb-unit-1-part-10"]').click();
  await page.locator(".teacher-offline-pages-viewer").waitFor();
  assert.match(await page.locator(".legacy-page-location").textContent(), /pg 17$/);
  await page.getByRole("button", { name: "Next page" }).click();
  assert.match(await page.locator(".legacy-page-location").textContent(), /pg 18$/);
  await page.getByRole("button", { name: "Unit overview" }).click();
  await page.getByRole("button", { name: "Unit 2", exact: true }).click();
  await assertCanonicalUnitOverview(page, 2);
  assert.equal(await page.locator('[data-page-ids="reading-19"] .teacher-unit-page-copy strong').count(), 0, "pg 19 must visually omit Reading");
  await page.locator('[data-page-ids="reading-20-21"]').click();
  assert.match(await page.locator(".legacy-page-location").textContent(), /pg 20-21$/);
  await page.getByRole("button", { name: "Unit overview" }).click();
  await page.locator('[data-page-ids="practice-31,practice-32"]').click();
  assert.match(await page.locator(".legacy-page-location").textContent(), /pg 31$/);
  await page.getByRole("button", { name: "Next page" }).click();
  assert.match(await page.locator(".legacy-page-location").textContent(), /pg 32$/);
  await page.getByRole("button", { name: "Unit overview" }).click();
  await page.locator('[data-page-ids="progress-check-33,progress-check-34"]').click();
  assert.match(await page.locator(".legacy-page-location").textContent(), /pg 33$/);
  await page.getByRole("button", { name: "Next page" }).click();
  assert.match(await page.locator(".legacy-page-location").textContent(), /pg 34$/);
  await page.getByRole("button", { name: "Unit overview" }).click();
  await page.getByRole("button", { name: "Contents and exercises" }).click();
  await page.getByRole("tab", { name: "Book pages" }).click();
  await page.getByRole("button", { name: "Unit 1", exact: true }).click();
  await assertCanonicalUnitOverview(page, 1);

  await page.locator(".teacher-unit-page-card").filter({ hasText: "pg 5" }).first().click();
  const overlay = page.locator(".classroom-tools-overlay");
  await page.getByRole("button", { name: "Pen tool" }).click();
  assert.equal(await overlay.getAttribute("data-active-classroom-tool"), "pen");
  const overlayBox = await overlay.boundingBox();
  await page.mouse.move(overlayBox.x + 120, overlayBox.y + 100);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 240, overlayBox.y + 170, { steps: 8 });
  await page.mouse.up();
  await overlay.locator("path[data-annotation-id]").waitFor();
  assert.equal(await overlay.locator("path[data-annotation-id]").count(), 1, "Pen stroke should be added");
  await page.getByRole("button", { name: "Undo annotation" }).click();
  assert.equal(await overlay.locator("path[data-annotation-id]").count(), 0, "Undo should remove the stroke");
  await page.getByRole("button", { name: "Redo annotation" }).click();
  assert.equal(await overlay.locator("path[data-annotation-id]").count(), 1, "Redo should restore the stroke");

  await page.getByRole("button", { name: "Text tool" }).click();
  await overlay.click({ position: { x: 360, y: 150 } });
  await page.getByRole("textbox", { name: "Annotation text" }).fill("Class note");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByText("Class note", { exact: true }).waitFor();
  await page.getByRole("button", { name: "More classroom tools" }).click();
  await page.getByRole("button", { name: "Show on-screen keyboard" }).click();
  const keyboardInput = page.getByRole("textbox", { name: "Annotation text" });
  await keyboardInput.waitFor();
  assert.equal(await keyboardInput.evaluate((input) => document.activeElement === input), true, "Keyboard action should focus text input");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: "More classroom tools" }).click();
  await page.getByRole("button", { name: "Spotlight reveal tool" }).click();
  await page.mouse.move(overlayBox.x + 180, overlayBox.y + 90);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 410, overlayBox.y + 240, { steps: 6 });
  await page.mouse.up();
  await overlay.locator("mask").waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Eraser tool" }).click();
  await overlay.click({ position: { x: 30, y: 30 } });
  await overlay.locator("mask").waitFor({ state: "detached" });
  assert.equal(await overlay.locator("mask").count(), 0, "Eraser should remove spotlight");

  await page.getByRole("button", { name: "More classroom tools" }).click();
  await page.getByRole("button", { name: "Cover area tool" }).click();
  await page.mouse.move(overlayBox.x + 470, overlayBox.y + 110);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 650, overlayBox.y + 230, { steps: 6 });
  await page.mouse.up();
  await overlay.locator('rect[data-annotation-id]').waitFor();
  await page.getByRole("button", { name: "Eraser tool" }).click();
  await overlay.click({ position: { x: 550, y: 170 } });
  await overlay.locator('rect[data-annotation-id]').waitFor({ state: "detached" });
  assert.equal(await overlay.locator('rect[data-annotation-id]').count(), 0, "Eraser should remove cover mask");

  await page.getByRole("button", { name: "More classroom tools" }).click();
  await page.getByRole("button", { name: "Open timer" }).click();
  await page.getByRole("complementary", { name: "Classroom timer" }).waitFor();
  await page.getByRole("button", { name: "1 min" }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForFunction(() => document.querySelector(".classroom-timer-panel output")?.textContent !== "01:00");
  assert.match(await page.locator(".classroom-timer-panel output").textContent(), /^00:5[89]$/);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(await page.locator(".classroom-timer-panel output").textContent(), "01:00");
  await page.getByRole("button", { name: "Close timer" }).click();
  await page.getByRole("button", { name: "More classroom tools" }).click();
  await page.getByRole("button", { name: "Open scoreboard" }).click();
  await page.getByRole("complementary", { name: "Two-team scoreboard" }).waitFor();
  await page.getByRole("button", { name: "Add point to Team A" }).click();
  assert.equal(await page.getByLabel("Team A score").textContent(), "1");
  await page.getByRole("button", { name: "Close scoreboard" }).click();
  await page.getByRole("button", { name: "More classroom tools" }).click();
  assert.equal(await page.getByRole("button", { name: "Print current view" }).isVisible(), true);
  await page.getByRole("button", { name: "Stop active tool" }).click();
  await page.getByRole("button", { name: "Contents and exercises" }).click();

  await openExercises(page, 1);
  assert.equal(await page.locator(".teacher-offline-lessons article").count(), 37);
  const activityOpenStartedAt = performance.now();
  await exerciseRow(page, "Reading · Exercise 3").getByRole("button", { name: "Present" }).click();
  await page.getByText(/Activity \d+ of 77/).waitFor();
  assert.equal(await page.locator(".teacher-offline-presentation .classroom-teaching-toolbar").count(), 1, "Activity toolbar should render");
  assert.equal(await page.locator(".teacher-offline-presentation .classroom-tools-overlay").count(), 1, "Activity overlay should render");
  await page.getByRole("button", { name: "More classroom tools" }).click();
  await page.getByRole("button", { name: "Magnify current view" }).click();
  assert.equal(await page.locator(".teacher-offline-presentation-stage.classroom-magnified").count(), 1, "Activity magnify should toggle");
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
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByText("Open response — no single correct answer.").waitFor();
  await backToBook(page);

  await openExercises(page, 1);
  await exerciseRow(page, "Writing · Exercise 4").getByRole("button", { name: "Present" }).click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByText("No verified answer is available for this activity.").waitFor();
  await backToBook(page);

  await page.getByRole("tab", { name: "Book pages" }).click();
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
  const standaloneVideo = page.locator(".teacher-offline-standalone-media");
  await standaloneVideo.waitFor();
  assert.match(await standaloneVideo.getAttribute("src"), /^(?:http:\/\/127\.0\.0\.1:4178)?\/assets\//);
  await page.goBack();
  await page.locator(".teacher-offline-book").waitFor();

  const forbiddenRequests = requests.filter(({ url, type }) => (
    !url.startsWith(baseURL)
    || ["fetch", "xhr", "eventsource", "websocket"].includes(type)
    || /\.netlify\/functions|teacher-activity-solutions|submit-/i.test(url)
  ));
  const unexpectedConsoleErrors = consoleErrors.filter((message) => !/favicon|ERR_INTERNET_DISCONNECTED/i.test(message));
  assert.deepEqual(forbiddenRequests, []);
  assert.deepEqual(unexpectedConsoleErrors, []);

  console.log(JSON.stringify({
    status: "passed",
    viewport: "1280x720",
    unit1Activities: 37,
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
