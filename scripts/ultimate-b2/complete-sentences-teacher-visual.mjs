import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4187";
const artifactRoot = "test-results/ultimate-b2-complete-sentences-teacher";
const activityId = "ultimate-b2-sb-u1-p2-o4";
const expectedBlanks = [{ x: 498, y: 143, width: 165, height: 27 }, { x: 358, y: 193, width: 164, height: 27 }, { x: 603, y: 240, width: 164, height: 27 }, { x: 252, y: 289, width: 132, height: 27 }, { x: 239, y: 338, width: 164, height: 27 }, { x: 702, y: 387, width: 164, height: 27 }, { x: 88, y: 466, width: 164, height: 27 }, { x: 88, y: 514, width: 164, height: 27 }];
const expectedRows = [{ x: 57, y: 143, width: 834, height: 29 }, { x: 57, y: 192, width: 903, height: 29 }, { x: 57, y: 240, width: 849, height: 29 }, { x: 57, y: 290, width: 953, height: 29 }, { x: 57, y: 339, width: 862, height: 29 }, { x: 57, y: 387, width: 864, height: 29 }, { x: 57, y: 466, width: 912, height: 29 }, { x: 57, y: 515, width: 950, height: 29 }];
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4187"], { cwd: process.cwd(), env: { ...process.env, VITE_APP_MODE: "android-teacher-offline", VITE_ANDROID_APP_MODE: "teacher-presentation-offline", VITE_OFFLINE_BOOK_SLUG: "ultimate-b2" }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) { try { if ((await fetch(baseURL)).ok) return; } catch { /* starting */ } await new Promise((resolve) => setTimeout(resolve, 250)); }
  throw new Error("Focused Complete the Sentences Teacher preview did not start.");
}
const closeTo = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1.1, `${label}: expected ${expected}, got ${actual}`);
function assertBox(actual, expected, label) { for (const key of ["x", "y", "width", "height"]) closeTo(actual[key], expected[key], `${label}.${key}`); }

let browser;
try {
  await rm(artifactRoot, { recursive: true, force: true }); await mkdir(artifactRoot, { recursive: true }); await waitForServer();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } }); page.setDefaultNavigationTimeout(120_000);
  const consoleErrors = []; const externalRequests = [];
  page.on("console", (message) => { if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text()); });
  page.on("request", (request) => { if (!request.url().startsWith(baseURL)) externalRequests.push(request.url()); });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const intro = page.getByRole("dialog", { name: "Ultimate B2 opening" }); if (await intro.count()) await intro.locator("video").evaluate((video) => video.dispatchEvent(new Event("ended")));
  await page.locator(".legacy-home-launcher").waitFor(); await page.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await page.evaluate(() => { const current = window.history.state || {}; const next = { teacherOffline: true, view: "book", location: { ...(current.location || {}), unitNumber: 1, tab: "exercises", pageId: "" } }; window.history.replaceState(next, "", "#book"); window.dispatchEvent(new PopStateEvent("popstate", { state: next })); });
  const row = page.locator(".teacher-offline-lessons article").filter({ hasText: /Reading.*Complete the sentences/i }).first(); await row.getByRole("button", { name: "Present" }).click();
  const root = page.locator(`[data-complete-sentences-activity="${activityId}"]`); await root.waitFor();
  await page.waitForFunction((id) => [...document.querySelectorAll(`[data-complete-sentences-activity="${id}"] img`)].every((image) => image.complete && image.naturalWidth), activityId);
  const navigation = page.locator("[data-teacher-book-navigation]"); const toolbar = page.locator(".classroom-teaching-toolbar"); const chromeBefore = { navigation: await navigation.boundingBox(), toolbar: await toolbar.boundingBox() };
  const metrics = await root.evaluate((element) => {
    const rootBox = element.getBoundingClientRect();
    const box = (target) => { const bounds = target.getBoundingClientRect(); return { x: (bounds.left - rootBox.left) / rootBox.width * 1024, y: (bounds.top - rootBox.top) / rootBox.height * 582, width: bounds.width / rootBox.width * 1024, height: bounds.height / rootBox.height * 582 }; };
    const instruction = element.querySelector(".ultimate-b2-exercise-instruction");
    return { instruction: box(instruction), example: box(element.querySelector(".ultimate-b2-complete-sentences-example-answer")), rows: [...element.querySelectorAll(".ultimate-b2-complete-sentence")].map(box), blanks: [...element.querySelectorAll("button[data-blank-id]")].map(box), stretchedInstruction: Math.abs(instruction.getBoundingClientRect().width / instruction.getBoundingClientRect().height - instruction.naturalWidth / instruction.naturalHeight) > .01 };
  });
  assertBox(metrics.instruction, { x: 93, y: 18, width: 873, height: 34 }, "instruction"); assertBox(metrics.example, { x: 116, y: 92, width: 153, height: 29 }, "example answer");
  metrics.rows.forEach((box, index) => assertBox(box, expectedRows[index], `Sentence ${index + 2}`)); metrics.blanks.forEach((box, index) => assertBox(box, expectedBlanks[index], `blank ${index + 2}`)); assert.equal(metrics.stretchedInstruction, false);
  const firstBlank = root.locator('button[data-blank-id="blank-2"]'); const secondBlank = root.locator('button[data-blank-id="blank-3"]');
  assert.equal(await firstBlank.getAttribute("aria-label"), "Reveal sentence 2 blank"); assert.equal(await firstBlank.textContent(), ""); assert.equal(await secondBlank.textContent(), ""); await firstBlank.click();
  assert.equal(await firstBlank.textContent(), "binge-watching"); assert.equal(await secondBlank.textContent(), "");
  const revealStyle = await firstBlank.evaluate((button) => { const style = getComputedStyle(button); return { color: style.color, fontFamily: style.fontFamily, fontSize: style.fontSize, clipped: button.scrollWidth > button.clientWidth + 1 || button.scrollHeight > button.clientHeight + 1 }; });
  assert.equal(revealStyle.color, "rgb(228, 0, 131)"); assert.match(revealStyle.fontFamily, /ITC Flora Std Medium/); assert.equal(revealStyle.fontSize, "21px"); assert.equal(revealStyle.clipped, false);
  await page.screenshot({ path: `${artifactRoot}/questions-revealed.png`, animations: "disabled" });
  await page.getByRole("button", { name: "Show Text", exact: true }).click(); await page.locator('[data-show-text-view="open"] img').waitFor(); await page.screenshot({ path: `${artifactRoot}/show-text.png`, animations: "disabled" });
  await page.getByRole("button", { name: "Return to questions", exact: true }).click(); await root.waitFor(); assert.equal(await firstBlank.getAttribute("aria-pressed"), "true");
  assert.deepEqual({ navigation: await navigation.boundingBox(), toolbar: await toolbar.boundingBox() }, chromeBefore); assert.deepEqual(consoleErrors, []); assert.deepEqual(externalRequests, []);
  const report = { status: "passed", activityId, canvas: "1024x582", sentences: 9, interactiveBlanks: 8, revealStyle: { font: "ITC Flora Std Medium", size: 21, color: "#e40083" }, maxGeometryDeviationSourcePx: 1.1, clipping: false, stretchedAssets: false, showTextWorks: true, independentRevealState: true, teacherChromeUnchanged: true, artifactRoot };
  await writeFile(`${artifactRoot}/report.json`, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); server.kill(); }
