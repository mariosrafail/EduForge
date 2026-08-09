import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";
import sharp from "sharp";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4182";
const artifactRoot = "test-results/ultimate-b2-multiple-choice-builder";
const page5AuthoringPaths = [
  "src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json",
  "src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.image.json",
  "netlify/functions/_ultimate-b2-unit1-opener-model-answers.json",
  "src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj2/discussion-prompts.svg",
];
const page5AuthoringOriginals = await Promise.all(page5AuthoringPaths.map((filePath) => readFile(filePath)));
const page5ImageOriginal = JSON.parse(page5AuthoringOriginals[1].toString("utf8"));
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
  await page.getByRole("button", { name: "UI Controller" }).click();
  await page.getByRole("heading", { name: "UI Controller / Book Setup" }).waitFor();
  await page.getByRole("button", { name: "Editions", exact: true }).click();
  assert.deepEqual(await page.locator('.b2-teacher-editor-panel [data-asset-id^="edition."]').evaluateAll((slots) => slots.map((slot) => slot.dataset.assetId)), [
    "edition.students-book.normal", "edition.students-book.active", "edition.workbook.normal", "edition.workbook.active",
    "edition.grammar-book.normal", "edition.grammar-book.active", "edition.extras.normal", "edition.extras.active",
  ]);
  await page.getByRole("button", { name: "Extras Menu", exact: true }).click();
  assert.equal(await page.locator('.b2-teacher-editor-panel [data-asset-id^="extras."]').count(), 28);
  const teacherPreview = page.locator(".b2-teacher-live-preview");
  assert.equal(await teacherPreview.locator('.legacy-home-book-button[aria-pressed="true"]').getAttribute("aria-label"), "Students Book");
  const previewUnitSignature = () => teacherPreview.locator(".legacy-home-unit").evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { label: button.getAttribute("aria-label"), x: box.x, y: box.y, width: box.width, height: box.height, artwork: [...button.querySelectorAll("img")].map((image) => image.src) };
  }));
  const studentsBookPreviewUnits = await previewUnitSignature();
  await teacherPreview.getByRole("button", { name: "Workbook", exact: true }).click();
  assert.equal(await teacherPreview.locator('.legacy-home-book-button[aria-pressed="true"]').getAttribute("aria-label"), "Workbook");
  assert.deepEqual(await previewUnitSignature(), studentsBookPreviewUnits);
  await teacherPreview.getByRole("button", { name: "Grammar Book", exact: true }).click();
  assert.equal(await teacherPreview.locator('.legacy-home-book-button[aria-pressed="true"]').getAttribute("aria-label"), "Grammar Book");
  assert.deepEqual(await previewUnitSignature(), studentsBookPreviewUnits);
  await teacherPreview.getByRole("button", { name: "Extras", exact: true }).click();
  assert.equal(await teacherPreview.locator(".legacy-home-extra-button").count(), 14);
  await page.screenshot({ path: `${artifactRoot}/teacher-app-extras.png`, animations: "disabled" });
  await teacherPreview.getByRole("button", { name: "Students Book", exact: true }).click();
  assert.equal(await teacherPreview.locator(".legacy-home-unit").count(), 10);
  await page.getByRole("button", { name: "Activity Builder" }).click();
  await page.getByRole("heading", { name: "Open Response", exact: true }).waitFor();
  assert.equal(await page.getByText("Unit → Page / Spread → Exercise", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: /Page 5.*Unit opener/ }).count(), 1);
  assert.equal(await page.locator(".activity-builder-exercise").filter({ hasText: "Open Response" }).count(), 1);
  assert.equal(await page.locator(".activity-builder-exercise").filter({ hasText: "Image" }).count(), 1);
  await page.screenshot({ path: `${artifactRoot}/book-hierarchy.png`, animations: "disabled" });

  const openQuestion = page.getByLabel("Question 1 text");
  await openQuestion.fill("Unsaved Builder draft question?");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Pages 6-7.*Reading/ }).click();
  await page.locator(".activity-builder-exercise").filter({ hasText: "Listening" }).click();
  await page.getByRole("heading", { name: /Listening.*Reading Exercise 2/ }).waitFor();
  await page.locator(".activity-builder-exercise").filter({ hasText: "Open Response" }).first().click();
  assert.equal(await openQuestion.inputValue(), "Unsaved Builder draft question?", "switching editors keeps the open-response draft mounted");
  await page.getByRole("button", { name: "Response Regions", exact: true }).click();
  const openResponseEditor = page.locator(".activity-builder-editor:not([hidden])");
  assert.equal(await openResponseEditor.locator(".open-response-region-editor-stage button.editable-response-region").count(), 3);
  const responseStage = await openResponseEditor.locator(".open-response-region-editor-stage .editable-response-region-layer").boundingBox();
  assert.ok(responseStage);
  await page.mouse.move(responseStage.x + responseStage.width * .72, responseStage.y + responseStage.height * .12);
  await page.mouse.down();
  await page.mouse.move(responseStage.x + responseStage.width * .91, responseStage.y + responseStage.height * .28, { steps: 5 });
  await page.mouse.up();
  await page.getByLabel("Question 1 reveal text").fill("A visual Response Region reveals this Teacher-only response.");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.locator(".legacy-unit-opener-question h3").filter({ hasText: "Unsaved Builder draft question?" }).waitFor();
  const page5Region = page.locator('.legacy-unit-opener-response-region[data-response-region-id="ultimate-b2-sb-u1-p1-o1-q1-response"]');
  assert.equal(await page5Region.getAttribute("data-revealed"), "false");
  assert.equal(await page5Region.locator(".response-region-text").textContent(), "");
  assert.notEqual(await page5Region.evaluate((element) => getComputedStyle(element).backgroundImage), "none", "Writing lines are visible before reveal");
  await page5Region.click();
  await page.getByText("A visual Response Region reveals this Teacher-only response.", { exact: true }).waitFor();
  assert.equal(await page5Region.getAttribute("data-revealed"), "true");
  assert.notEqual(await page5Region.evaluate((element) => getComputedStyle(element).backgroundImage), "none", "Writing lines remain after reveal");
  assert.deepEqual(await page5Region.evaluate((region) => { const style = getComputedStyle(region); return { overflowX: style.overflowX, overflowY: style.overflowY, documentOverflow: Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, 0) }; }), { overflowX: "auto", overflowY: "auto", documentOverflow: 0 }, "Long reveal text remains contained and scrollable inside its authored region");
  await page.waitForFunction(() => [...document.querySelectorAll(".ultimate-b2-legacy-unit-opener img")].every((image) => image.complete && image.naturalWidth > 0));
  assert.deepEqual(await page.locator(".ultimate-b2-legacy-unit-opener img").evaluateAll((images) => images.map((image) => [image.naturalWidth, image.naturalHeight])), [[606, 34], [317, 507]]);
  await page.screenshot({ path: `${artifactRoot}/open-response-preview.png`, animations: "disabled" });

  await page.locator(".activity-builder-exercise").filter({ hasText: "Image" }).click();
  await page.getByRole("heading", { name: "Image activity", exact: true }).waitFor();
  const customImage = await sharp({ create: { width: 640, height: 360, channels: 4, background: "#315f9d" } }).webp().toBuffer();
  await page.getByLabel("Browse your own image").setInputFiles({ name: "custom-landscape.webp", mimeType: "image/webp", buffer: customImage });
  await page.getByLabel("Main image alternative text").fill("Visual draft discussion prompts");
  await page.locator(".activity-builder-editor:not([hidden]) .builder-save-state button").click();
  await page.locator(".activity-builder-editor:not([hidden]) .builder-save-state strong").filter({ hasText: "Saved" }).waitFor();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".ultimate-b2-image-activity img")].every((image) => image.complete && image.naturalWidth > 0));
  const expectedImageDimensions = page5ImageOriginal.visualCapabilities.instructionImage ? [[807, 114], [640, 360]] : [[640, 360]];
  assert.deepEqual(await page.locator(".ultimate-b2-image-activity img").evaluateAll((images) => images.map((image) => [image.naturalWidth, image.naturalHeight])), expectedImageDimensions);
  assert.equal(await page.locator(".ultimate-b2-image-activity li").count(), 0);
  const imageFit = await page.locator(".ultimate-b2-image-activity-main").evaluate((image) => { const imageBox = image.getBoundingClientRect(); const sheet = image.closest(".ultimate-b2-image-activity-sheet").getBoundingClientRect(); return { widthRatio: imageBox.width / sheet.width, heightRatio: imageBox.height / sheet.height, fit: getComputedStyle(image).objectFit, overflow: Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, 0) }; });
  assert.ok(imageFit.widthRatio > .95 && imageFit.heightRatio > .95, "16:9 image uses essentially the full main-image region");
  assert.deepEqual({ fit: imageFit.fit, overflow: imageFit.overflow }, { fit: "contain", overflow: 0 });
  await page.screenshot({ path: `${artifactRoot}/image-activity-preview.png`, animations: "disabled" });

  await page.locator(".activity-builder-exercise").filter({ hasText: "Complete the Sentences" }).click();
  await page.getByRole("heading", { name: "Complete the Sentences", exact: true }).waitFor();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await page.getByRole("button", { name: "Reveal sentence 2 blank" }).click();
  await page.getByText("binge-watching", { exact: true }).waitFor();
  await page.screenshot({ path: `${artifactRoot}/complete-sentences-preview.png`, animations: "disabled" });

  await page.locator(".activity-builder-page").filter({ hasText: "Pages 6-7" }).locator(".activity-builder-exercise").filter({ hasText: "Open Response" }).click();
  await page.getByRole("heading", { name: "Debate Club", exact: true }).waitFor();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const debateRegionOne = page.locator('.ultimate-b2-debate-response-region[data-response-region-id="debate-reveal-1"]');
  assert.equal(await debateRegionOne.getAttribute("data-revealed"), "false");
  assert.notEqual(await debateRegionOne.evaluate((element) => getComputedStyle(element).backgroundImage), "none");
  await debateRegionOne.click();
  assert.equal(await debateRegionOne.getAttribute("data-revealed"), "true");
  await page.getByRole("button", { name: "Next part", exact: true }).click();
  const debateRegionTwo = page.locator('.ultimate-b2-debate-response-region[data-response-region-id="debate-reveal-2"]');
  assert.equal(await debateRegionTwo.getAttribute("data-revealed"), "false", "Debate Club parts preserve independent reveal state");
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
  const report = { status: "passed", hierarchy: "Unit → Page / Spread → Exercise", page5Editors: ["Open Response", "Image"], readingEditors: ["Complete the Sentences", "Open Response"], responseRegionDrawing: true, linesBeforeAndAfterReveal: true, teacherOnlyRevealText: true, customImageUpload: true, imageFit: "contain-full-region", unsavedDraftPreserved: true, sections: 5, questionOneOptionAreas: 4, questionOneHighlightRegions: 2, previewFeedback: ["wrong", "correct"], previewPanel: 2, artifactRoot };
  await writeFile(`${artifactRoot}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await Promise.all(page5AuthoringPaths.map((filePath, index) => writeFile(filePath, page5AuthoringOriginals[index])));
}
