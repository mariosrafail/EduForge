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

async function openExercises(page, unitNumber) {
  await page.getByRole("button", { name: `Unit ${unitNumber}`, exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".teacher-unit-page-thumb img")]
    .every((image) => image.complete && image.naturalWidth > 0));
  await page.getByRole("tab", { name: "Contents / Exercises" }).click();
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
  const coldStartupMs = Math.round(performance.now() - startupStartedAt);
  const bookOpenStartedAt = performance.now();
  await page.getByRole("button", { name: "Open Students Book" }).click();
  await page.locator(".teacher-offline-book").waitFor();
  const bookOpenMs = Math.round(performance.now() - bookOpenStartedAt);

  await openExercises(page, 1);
  assert.equal(await page.locator(".teacher-offline-lessons article").count(), 37);
  const activityOpenStartedAt = performance.now();
  await exerciseRow(page, "Reading · Exercise 3").getByRole("button", { name: "Present" }).click();
  await page.getByText(/Activity \d+ of 77/).waitFor();
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
