import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4182";
const artifactRoot = "test-results/ultimate-b2-multiple-choice-builder";
const page5AuthoringPaths = [
  "src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json",
  "src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.image.json",
  "netlify/functions/_ultimate-b2-unit1-opener-model-answers.json",
];
const page5AuthoringOriginals = await Promise.all(page5AuthoringPaths.map((filePath) => readFile(filePath)));
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4182"], {
  cwd: process.cwd(),
  env: { ...process.env, VITE_APP_MODE: "android-teacher-offline", VITE_ANDROID_APP_MODE: "teacher-presentation-offline", VITE_OFFLINE_BOOK_SLUG: "ultimate-b2" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${baseURL}/ultimate-b2-builder.html`)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Multiple Choice builder preview did not start.");
}

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  await waitForServer();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.setDefaultNavigationTimeout(120_000);
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text()); });
  await page.goto(`${baseURL}/ultimate-b2-builder.html`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Activity Builder" }).click();
  await page.getByRole("heading", { name: "Open response", exact: true }).waitFor();
  assert.equal(await page.getByText("Unit → Page / Spread → Exercise", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: /Page 5.*Unit opener/ }).count(), 1);
  assert.equal(await page.locator(".activity-builder-exercise").filter({ hasText: "Open response" }).count(), 1);
  assert.equal(await page.locator(".activity-builder-exercise").filter({ hasText: "Image" }).count(), 1);
  await page.screenshot({ path: `${artifactRoot}/book-hierarchy.png`, animations: "disabled" });

  const openQuestion = page.getByLabel("Question 1 text");
  await openQuestion.fill("Unsaved Builder draft question?");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Pages 6-7.*Reading/ }).click();
  await page.locator(".activity-builder-exercise").filter({ hasText: "Listening" }).click();
  await page.getByRole("heading", { name: /Listening.*Reading Exercise 2/ }).waitFor();
  await page.locator(".activity-builder-exercise").filter({ hasText: "Open response" }).click();
  assert.equal(await openQuestion.inputValue(), "Unsaved Builder draft question?", "switching editors keeps the open-response draft mounted");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.locator(".legacy-unit-opener-question h3").filter({ hasText: "Unsaved Builder draft question?" }).waitFor();
  await page.getByRole("button", { name: "Show publisher model answer for question 1" }).click();
  await page.getByRole("button", { name: "Publisher model answer for question 1" }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll(".ultimate-b2-legacy-unit-opener img")].every((image) => image.complete && image.naturalWidth > 0));
  assert.deepEqual(await page.locator(".ultimate-b2-legacy-unit-opener img").evaluateAll((images) => images.map((image) => [image.naturalWidth, image.naturalHeight])), [[606, 34], [317, 507]]);
  await page.screenshot({ path: `${artifactRoot}/open-response-preview.png`, animations: "disabled" });

  await page.locator(".activity-builder-exercise").filter({ hasText: "Image" }).click();
  await page.getByRole("heading", { name: "Image activity", exact: true }).waitFor();
  await page.getByLabel("Main image alternative text").fill("Visual draft discussion prompts");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".ultimate-b2-image-activity img")].every((image) => image.complete && image.naturalWidth > 0));
  assert.deepEqual(await page.locator(".ultimate-b2-image-activity img").evaluateAll((images) => images.map((image) => [image.naturalWidth, image.naturalHeight])), [[807, 114], [1200, 460]]);
  assert.equal(await page.locator(".ultimate-b2-image-activity li").count(), 0);
  await page.screenshot({ path: `${artifactRoot}/image-activity-preview.png`, animations: "disabled" });

  await page.locator(".activity-builder-exercise").filter({ hasText: "Complete the Sentences" }).click();
  await page.getByRole("heading", { name: "Complete the Sentences", exact: true }).waitFor();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Reveal sentence 2 blank" }).click();
  await page.getByText("binge-watching", { exact: true }).waitFor();
  await page.screenshot({ path: `${artifactRoot}/complete-sentences-preview.png`, animations: "disabled" });

  await page.locator(".activity-builder-exercise").filter({ hasText: "Open Answer" }).click();
  await page.getByRole("heading", { name: "Debate Club", exact: true }).waitFor();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Reveal the argument for watching a film at home" }).click();
  await page.screenshot({ path: `${artifactRoot}/debate-club-preview.png`, animations: "disabled" });

  await page.locator(".activity-builder-exercise").filter({ hasText: "Multiple Choice" }).click();
  await page.getByRole("heading", { name: "Multiple Choice · Reading Exercise 3" }).waitFor();
  const waitForImages = () => page.waitForFunction(() => [...document.querySelectorAll(".multiple-choice-builder img")].every((image) => image.complete && image.naturalWidth > 0));
  await waitForImages();
  await page.screenshot({ path: `${artifactRoot}/overview.png`, animations: "disabled" });

  for (const section of ["Panels / Parts", "Questions & Answers", "Highlight Audio / Text Links", "Preview"]) {
    await page.getByRole("button", { name: section, exact: true }).click();
    await waitForImages();
    await page.screenshot({ path: `${artifactRoot}/${section.toLowerCase().replaceAll(/[^a-z]+/g, "-").replace(/-$/, "")}.png`, animations: "disabled" });
  }
  await page.getByRole("button", { name: "Questions & Answers", exact: true }).click();
  assert.equal(await page.locator(".multiple-choice-area-editor .editable-hotspot-box").count(), 4, "Question 1 has four structured option areas");
  await page.getByRole("button", { name: "Highlight Audio / Text Links", exact: true }).click();
  assert.equal(await page.locator(".multiple-choice-area-editor .editable-hotspot-box").count(), 2, "Question 1 has two source text regions");

  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = page.locator(".multiple-choice-runtime-preview");
  await preview.getByRole("button", { name: /Question 1 option A:/ }).click();
  assert.equal(await preview.getByRole("button", { name: /Question 1 option A:/ }).getAttribute("data-answer-state"), "wrong");
  await preview.getByRole("button", { name: /Question 1 option B:/ }).click();
  assert.equal(await preview.getByRole("button", { name: /Question 1 option B:/ }).getAttribute("data-answer-state"), "correct");
  await page.getByRole("button", { name: "Next part", exact: true }).click();
  await preview.locator('[data-multiple-choice-panel="2"]').waitFor();
  await page.screenshot({ path: `${artifactRoot}/preview-panel-2.png`, animations: "disabled" });
  assert.deepEqual(consoleErrors, []);
  const report = { status: "passed", hierarchy: "Unit → Page / Spread → Exercise", page5Editors: ["Open response", "Image"], readingEditors: ["Complete the Sentences", "Open Answer"], unsavedDraftPreserved: true, sections: 5, questionOneOptionAreas: 4, questionOneHighlightRegions: 2, previewFeedback: ["wrong", "correct"], previewPanel: 2, artifactRoot };
  await writeFile(`${artifactRoot}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await Promise.all(page5AuthoringPaths.map((filePath, index) => writeFile(filePath, page5AuthoringOriginals[index])));
}
