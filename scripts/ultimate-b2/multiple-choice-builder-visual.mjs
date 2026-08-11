import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

import { chromium } from "@playwright/test";
import sharp from "sharp";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4182";
const artifactRoot = "test-results/ultimate-b2-multiple-choice-builder";
const openResponseOnly = process.argv.includes("--open-response-only");
const page5AuthoringPaths = [
  "src/data/ultimate-b2/authoring/unit-01-page-5-exercise-1.open-response.json",
  "src/data/ultimate-b2/authoring/unit-01-page-5-exercise-2.image.json",
  "src/data/ultimate-b2/authoring/unit-01-reading-exercise-4.complete-sentences.json",
  "src/data/ultimate-b2/authoring/unit-01-reading-debate-club.open-answer.json",
  "netlify/functions/_ultimate-b2-unit1-opener-model-answers.json",
  "netlify/functions/_ultimate-b2-open-response-model-answers.json",
  "src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-1/obj2/discussion-prompts.svg",
];
const page5AuthoringOriginals = await Promise.all(page5AuthoringPaths.map((filePath) => readFile(filePath)));
const page5ImageOriginal = JSON.parse(page5AuthoringOriginals[1].toString("utf8"));
const generatedOpenResponsePaths = [
  "src/data/ultimate-b2/authoring/unit-02-page-19-exercise-1.open-response.json",
];
const generatedOpenResponseOriginals = await Promise.all(generatedOpenResponsePaths.map(async (filePath) => {
  try { return await readFile(filePath); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}));
const generatedAssetDirectories = [
  "src/assets/books/ultimate-b2/authoring/open-response/ultimate-b2-sb-u1-p1-o1",
  "src/assets/books/ultimate-b2/authoring/open-response/ultimate-b2-sb-u2-p1-o1",
];
const backupRoot = await mkdtemp("tmp/open-response-visual-backup-");
const generatedAssetDirectoryStates = await Promise.all(generatedAssetDirectories.map(async (directory, index) => {
  try {
    if (!(await stat(directory)).isDirectory()) return false;
    await cp(directory, `${backupRoot}/${index}`, { recursive: true });
    return true;
  } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}));
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
  if (!openResponseOnly) {
  await page.getByRole("button", { name: "UI Controller" }).click();
  await page.getByRole("heading", { name: "UI Controller", exact: true }).waitFor();
  await page.getByRole("button", { name: "Book Switch Controls", exact: true }).click();
  assert.deepEqual(await page.locator('.b2-teacher-editor-panel [data-asset-id^="navibar."]').evaluateAll((slots) => slots.map((slot) => slot.dataset.assetId)), [
    "navibar.sb.active", "navibar.gb.active", "navibar.workbook.active",
  ]);
  await page.getByRole("button", { name: "Navibar Assets", exact: true }).click();
  const librarySlots = page.locator('.b2-teacher-editor-panel [data-asset-id^="navibar."]');
  assert.equal(await librarySlots.count(), 49);
  assert.equal(new Set(await librarySlots.evaluateAll((slots) => slots.map((slot) => slot.dataset.assetId))).size, 49);
  assert.equal(await librarySlots.locator('input[type="file"]').count(), 49);
  await page.waitForFunction(() => [...document.querySelectorAll('.b2-teacher-editor-panel [data-asset-id^="navibar."] img')].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: `${artifactRoot}/ui-controller-navibar-assets.png`, animations: "disabled", fullPage: true });
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
  }
  await page.getByRole("button", { name: "Activity Builder" }).click();
  await page.getByRole("heading", { name: "Open Response", exact: true }).waitFor();
  assert.equal(await page.getByText("Unit → Page / Spread → Exercise", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: /Page 5.*Unit opener/ }).count(), 1);
  assert.equal(await page.locator(".activity-builder-exercise").filter({ hasText: "Open Response" }).count(), 1);
  assert.equal(await page.locator(".activity-builder-exercise").filter({ hasText: "Image" }).count(), 1);
  await page.screenshot({ path: `${artifactRoot}/book-hierarchy.png`, animations: "disabled" });

  const visiblePageHeadings = page.locator(".activity-builder-page-heading");
  assert.ok(await visiblePageHeadings.count() > 0);
  assert.equal(await visiblePageHeadings.locator(".activity-builder-page-add").count(), await visiblePageHeadings.count(), "every rendered page row has its own add button");
  const page5CreationRow = page.locator(".activity-builder-page").filter({ hasText: /Page 5.*Unit opener/ });
  const page5ActivityCount = await page5CreationRow.locator(".activity-builder-exercise").count();
  await page5CreationRow.getByRole("button", { name: "Add activity to Page 5", exact: true }).click();
  assert.deepEqual(await page5CreationRow.getByRole("menuitem").allTextContents(), ["Image", "Open Response"]);
  await page.keyboard.press("Escape");
  assert.equal(await page5CreationRow.getByRole("menu").count(), 0);
  assert.equal(await page5CreationRow.locator(".activity-builder-exercise").count(), page5ActivityCount, "closing the menu creates no activity");
  await page5CreationRow.getByRole("button", { name: "Add activity to Page 5", exact: true }).click();
  await page5CreationRow.getByRole("menuitem", { name: "Open Response", exact: true }).click();
  await page.locator('.activity-builder-editor:not([hidden]) code').filter({ hasText: "ultimate-b2-sb-u1-p1-o3" }).waitFor();
  await page5CreationRow.getByRole("button", { name: "Add activity to Page 5", exact: true }).click();
  await page5CreationRow.getByRole("menuitem", { name: "Image", exact: true }).click();
  await page.locator('.activity-builder-editor:not([hidden]) code').filter({ hasText: "ultimate-b2-sb-u1-p1-o4" }).waitFor();
  assert.equal(await page5CreationRow.locator(".activity-builder-exercise").count(), page5ActivityCount + 2);
  await page.screenshot({ path: `${artifactRoot}/publisher-activity-creation-drafts.png`, animations: "disabled", fullPage: true });
  await page5CreationRow.locator(".activity-builder-exercise").filter({ hasText: "Exercise 1" }).click();

  const page5SourceFiles = ["obj_params.xml", "ebook_obj_params.xml", "image_1.png", "image_2.png"].map((name) => `tmp/page5-open-response-source/${name}`);
  await page.locator(".activity-builder-editor:not([hidden])").getByLabel("Open Response publisher source files").setInputFiles(page5SourceFiles);
  await page.getByRole("button", { name: "Validate and Import Publisher Source", exact: true }).click();
  await page.locator(".activity-builder-editor:not([hidden])").getByText("Publisher source imported and saved", { exact: true }).waitFor();
  const importReport = page.getByRole("region", { name: "Publisher source import report" });
  await importReport.getByText("1024 × 582", { exact: true }).waitFor();
  assert.match(await importReport.innerText(), /obj_params\.xml[\s\S]*ebook_obj_params\.xml[\s\S]*image_1\.png[\s\S]*image_2\.png/);
  assert.match(await importReport.innerText(), /3 questions · 3 response regions · 2 images/);
  assert.match(await importReport.innerText(), /VALIDATION\s+valid/);
  const importedCanvas = page.locator('.legacy-unit-opener-paper[data-source-canvas="1024x582"]');
  await importedCanvas.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll(".ultimate-b2-legacy-unit-opener img")].every((image) => image.complete && image.naturalWidth > 0));
  const sourceMeasurements = await importedCanvas.evaluate((canvas) => {
    const canvasBox = canvas.getBoundingClientRect();
    const sourceBox = (selector) => {
      const box = canvas.querySelector(selector).getBoundingClientRect();
      return {
        x: (box.left - canvasBox.left) / canvasBox.width * 1024,
        y: (box.top - canvasBox.top) / canvasBox.height * 582,
        width: box.width / canvasBox.width * 1024,
        height: box.height / canvasBox.height * 582,
      };
    };
    return {
      canvasRatio: canvasBox.width / canvasBox.height,
      instruction: sourceBox(".legacy-unit-opener-instruction"),
      quote: sourceBox(".legacy-unit-opener-quote-art"),
      prompts: [1, 2, 3].map((index) => sourceBox(`.legacy-unit-opener-question.question-${index}`)),
      responses: [1, 2, 3].map((index) => sourceBox(`[data-response-region-id$="q${index}-response"]`)),
      lineLayers: [1, 2, 3].map((index) => (getComputedStyle(canvas.querySelector(`[data-response-region-id$="q${index}-response"]`)).backgroundSize.match(/1px/g) || []).length),
    };
  });
  const closeTo = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1.1, `${label}: expected ${expected}, got ${actual}`);
  closeTo(sourceMeasurements.canvasRatio, 1024 / 582, "publisher canvas ratio");
  for (const [key, expected] of Object.entries({ instruction: { x: 206, y: 18, width: 606, height: 34 }, quote: { x: 696, y: 75, width: 317, height: 507 } })) {
    for (const dimension of Object.keys(expected)) closeTo(sourceMeasurements[key][dimension], expected[dimension], `${key}.${dimension}`);
  }
  const expectedPrompts = [{ x: 54, y: 79, width: 604, height: 29 }, { x: 54, y: 214, width: 571, height: 29 }, { x: 54, y: 372, width: 491, height: 29 }];
  const expectedResponses = [{ x: 73, y: 117, width: 605, height: 73 }, { x: 73, y: 253, width: 605, height: 96 }, { x: 73, y: 410, width: 601, height: 96 }];
  for (const [index, expected] of expectedPrompts.entries()) for (const dimension of Object.keys(expected)) closeTo(sourceMeasurements.prompts[index][dimension], expected[dimension], `prompt${index + 1}.${dimension}`);
  for (const [index, expected] of expectedResponses.entries()) for (const dimension of Object.keys(expected)) closeTo(sourceMeasurements.responses[index][dimension], expected[dimension], `response${index + 1}.${dimension}`);
  assert.deepEqual(sourceMeasurements.lineLayers, [3, 4, 4]);
  const importedRegion = importedCanvas.locator('[data-response-region-id$="q2-response"]');
  assert.equal(await importedRegion.locator(".response-region-text").textContent(), "");
  await importedRegion.click();
  const revealVisual = await importedRegion.evaluate((region) => {
    const text = region.querySelector(".response-region-text");
    const style = getComputedStyle(text);
    return { color: getComputedStyle(region).color, fontFamily: style.fontFamily, fontSize: style.fontSize, whiteSpace: style.whiteSpace, clipped: text.scrollHeight > region.clientHeight + 1 || text.scrollWidth > region.clientWidth + 1 };
  });
  assert.equal(revealVisual.color, "rgb(228, 0, 131)");
  assert.match(revealVisual.fontFamily, /ITC Flora Std Medium/);
  assert.equal(revealVisual.whiteSpace, "pre-wrap");
  assert.equal(revealVisual.clipped, false);
  await page.screenshot({ path: `${artifactRoot}/open-response-publisher-import.png`, animations: "disabled" });

  await page.getByRole("button", { name: "Unit 2", exact: true }).click();
  const unit2OpenerPage = page.locator(".activity-builder-page").filter({ hasText: /Page 19.*Reading/ });
  await unit2OpenerPage.locator(".activity-builder-page-toggle").click();
  await unit2OpenerPage.locator(".activity-builder-exercise").filter({ hasText: "Open Response" }).click();
  await page.getByRole("heading", { name: "Open Response", exact: true }).waitFor();
  await page.getByText("Source bundle required", { exact: true }).waitFor();
  assert.equal(await page.getByText("Not configurable yet", { exact: true }).count(), 0);
  await page.locator(".activity-builder-editor:not([hidden])").getByLabel("Open Response publisher source files").setInputFiles(page5SourceFiles);
  await page.getByRole("button", { name: "Validate and Import Publisher Source", exact: true }).click();
  await page.locator(".activity-builder-editor:not([hidden])").getByText("Publisher source imported and saved", { exact: true }).waitFor();
  const unit2Canvas = page.locator('.activity-builder-editor:not([hidden]) .legacy-unit-opener-paper[data-source-canvas="1024x582"]');
  await unit2Canvas.waitFor();
  assert.equal(await unit2Canvas.locator(".legacy-unit-opener-artwork").count(), 2);
  assert.equal(await unit2Canvas.locator("[data-response-region-id]").count(), 3);
  assert.equal(await page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, 0)), 0);
  await page.screenshot({ path: `${artifactRoot}/unit2-open-response-generic-import.png`, animations: "disabled", fullPage: true });

  const unit1Toggle = page.getByRole("button", { name: "Unit 1", exact: true });
  if (await unit1Toggle.getAttribute("aria-expanded") === "false") await unit1Toggle.click();
  const page5OpenerPage = page.locator(".activity-builder-page").filter({ hasText: /Page 5.*Unit opener/ });
  if (await page5OpenerPage.locator(".activity-builder-page-toggle").getAttribute("aria-expanded") === "false") await page5OpenerPage.locator(".activity-builder-page-toggle").click();
  await page5OpenerPage.locator(".activity-builder-exercise").filter({ hasText: "Exercise 1" }).click();

  await page.getByRole("button", { name: "Content", exact: true }).click();

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
  assert.deepEqual(await page5Region.evaluate((region) => { const style = getComputedStyle(region); return { overflowX: style.overflowX, overflowY: style.overflowY, documentOverflow: Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, 0) }; }), { overflowX: "hidden", overflowY: "hidden", documentOverflow: 0 }, "Manually resized reveal text remains contained inside its authored region");
  await page.waitForFunction(() => [...document.querySelectorAll(".activity-builder-editor:not([hidden]) .ultimate-b2-legacy-unit-opener img")].every((image) => image.complete && image.naturalWidth > 0));
  assert.deepEqual(await page.locator(".activity-builder-editor:not([hidden]) .ultimate-b2-legacy-unit-opener img").evaluateAll((images) => images.map((image) => [image.naturalWidth, image.naturalHeight])), [[606, 34], [317, 507]]);
  await page.screenshot({ path: `${artifactRoot}/open-response-preview.png`, animations: "disabled" });

  await page5OpenerPage.locator(".activity-builder-exercise").filter({ hasText: "Exercise 2" }).click();
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
  await page.getByRole("button", { name: "Publisher Source", exact: true }).click();
  await page.getByRole("button", { name: "Import Publisher Source", exact: true }).click();
  await page.locator(".activity-builder-editor:not([hidden])").getByText("Publisher source imported and saved", { exact: true }).waitFor();
  const completeImportReport = page.getByRole("region", { name: "Complete the Sentences publisher source import report" });
  assert.match(await completeImportReport.innerText(), /obj_params\.xml[\s\S]*1024 × 582[\s\S]*1 example · 8 sentences · 8 reveal answers[\s\S]*Instruction matched · Show Text auxiliary matched[\s\S]*valid/);
  const completeCanvas = page.locator('.ultimate-b2-complete-sentences[data-source-canvas="1024x582"]');
  await completeCanvas.waitFor();
  const completeMeasurements = await completeCanvas.evaluate((canvas) => {
    const canvasBox = canvas.getBoundingClientRect();
    const sourceBox = (element) => {
      const box = element.getBoundingClientRect();
      return { x: (box.left - canvasBox.left) / canvasBox.width * 1024, y: (box.top - canvasBox.top) / canvasBox.height * 582, width: box.width / canvasBox.width * 1024, height: box.height / canvasBox.height * 582 };
    };
    return {
      instruction: sourceBox(canvas.querySelector(".ultimate-b2-exercise-instruction")),
      example: sourceBox(canvas.querySelector(".ultimate-b2-complete-sentences-example-answer")),
      blanks: [...canvas.querySelectorAll("button[data-blank-id]")].map(sourceBox),
    };
  });
  for (const [dimension, expected] of Object.entries({ x: 93, y: 18, width: 873, height: 34 })) closeTo(completeMeasurements.instruction[dimension], expected, `Complete instruction.${dimension}`);
  for (const [dimension, expected] of Object.entries({ x: 116, y: 92, width: 153, height: 29 })) closeTo(completeMeasurements.example[dimension], expected, `Complete example.${dimension}`);
  const expectedCompleteBlanks = [{ x: 498, y: 143, width: 165, height: 27 }, { x: 358, y: 193, width: 164, height: 27 }, { x: 603, y: 240, width: 164, height: 27 }, { x: 252, y: 289, width: 132, height: 27 }, { x: 239, y: 338, width: 164, height: 27 }, { x: 702, y: 387, width: 164, height: 27 }, { x: 88, y: 466, width: 164, height: 27 }, { x: 88, y: 514, width: 164, height: 27 }];
  completeMeasurements.blanks.forEach((blank, index) => Object.entries(expectedCompleteBlanks[index]).forEach(([dimension, expected]) => closeTo(blank[dimension], expected, `Complete blank ${index + 2}.${dimension}`)));
  await page.getByRole("button", { name: "Reveal sentence 2 blank" }).click();
  await page.getByText("binge-watching", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Reveal sentence 3 blank" }).textContent(), "", "unrelated Complete the Sentences blanks remain hidden");
  await page.getByRole("button", { name: "Show Text / Questions", exact: true }).click();
  await page.locator('[data-show-text-view="open"] img').waitFor();
  await page.getByRole("button", { name: "Show Text / Questions", exact: true }).click();
  await completeCanvas.waitFor();
  await page.screenshot({ path: `${artifactRoot}/complete-sentences-preview.png`, animations: "disabled" });

  await page.locator(".activity-builder-page").filter({ hasText: "Pages 6-7" }).locator(".activity-builder-exercise").filter({ hasText: "Open Response" }).click();
  await page.getByRole("heading", { name: "Debate Club", exact: true }).waitFor();
  await page.getByRole("button", { name: "Import Publisher Source", exact: true }).click();
  await page.locator(".activity-builder-editor:not([hidden])").getByText("Publisher source imported and saved", { exact: true }).waitFor();
  const debateImportReport = page.getByRole("region", { name: "Debate Club publisher source import report" });
  assert.match(await debateImportReport.innerText(), /obj_params\.xml[\s\S]*ebook_obj_params\.xml[\s\S]*image_1\.png[\s\S]*image_6\.png/);
  assert.match(await debateImportReport.innerText(), /1024 × 582[\s\S]*2 parts · 6 images · 2 response regions[\s\S]*valid/);
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
  const report = { status: "passed", hierarchy: "Unit → Page / Spread → Exercise", page5Editors: ["Open Response", "Image"], readingEditors: ["Complete the Sentences", "Open Response"], publisherImport: { canvas: "1024x582", artwork: 2, prompts: 3, responseRegions: 3, lineCounts: [3, 4, 4], revealColor: "#e40083", clipping: false }, unit2OpenResponse: { configurable: true, genericEditor: true, sourceBundleUpload: true, canvas: "1024x582", artwork: 2, responseRegions: 3, documentOverflow: 0 }, completeSentencesPublisherImport: { canvas: "1024x582", example: 1, interactiveSentences: 8, revealAnswers: 8, auxiliaryAssetsReused: 2, showTextWorks: true, maxGeometryDeviationSourcePx: 1.1 }, debateClubPublisherImport: { canvas: "1024x582", parts: 2, artwork: 6, responseRegions: 2, lineCounts: [10, 8], revealPrivacy: "public-presentation" }, responseRegionDrawing: true, linesBeforeAndAfterReveal: true, teacherOnlyRevealText: true, customImageUpload: true, imageFit: "contain-full-region", unsavedDraftPreserved: true, sections: 5, questionOneOptionAreas: 4, questionOneHighlightRegions: 2, previewFeedback: ["wrong", "correct"], previewPanel: 2, artifactRoot };
  await writeFile(`${artifactRoot}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill();
  await Promise.all(page5AuthoringPaths.map((filePath, index) => writeFile(filePath, page5AuthoringOriginals[index])));
  await Promise.all(generatedOpenResponsePaths.map((filePath, index) => generatedOpenResponseOriginals[index] == null ? rm(filePath, { force: true }) : writeFile(filePath, generatedOpenResponseOriginals[index])));
  await Promise.all(generatedAssetDirectories.map(async (directory, index) => {
    await rm(directory, { recursive: true, force: true });
    if (generatedAssetDirectoryStates[index]) await cp(`${backupRoot}/${index}`, directory, { recursive: true });
  }));
  await rm(backupRoot, { recursive: true, force: true });
}
