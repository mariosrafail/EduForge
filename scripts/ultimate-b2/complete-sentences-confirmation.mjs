import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const baseURL = "http://127.0.0.1:4184";
const artifactRoot = "test-results/ultimate-b2-complete-sentences-confirmation";
const activityId = "ultimate-b2-sb-u1-p2-o4";
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4184", "--strictPort"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

async function waitForVite() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(baseURL)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Complete Sentences confirmation harness did not start.");
}

function harnessUrl(parameters = {}) {
  return `${baseURL}/${artifactRoot}/harness.html?${new URLSearchParams({ activityId, ...parameters })}`;
}

async function placeAllAnswers(page) {
  const root = page.locator(`[data-student-complete-sentences="${activityId}"]`);
  await root.waitFor();
  const words = root.locator("[data-word-id]");
  const targets = root.locator("[data-drop-question-id]");
  assert.equal(await words.count(), 8);
  assert.equal(await targets.count(), 8);
  for (let index = 0; index < 8; index += 1) {
    await words.nth(index).click();
    await targets.nth(index).click();
  }
  return root;
}

let browser;
try {
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(`${artifactRoot}/harness.html`, '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/ultimate-b2/legacy-pilot-mode-harness.jsx"></script></body></html>\n');
  await waitForVite();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const teacherSolutionRequests = [];
  await page.route("**/.netlify/functions/book-content?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("action") === "active-component-release") {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "no_publication" }) });
      return;
    }
    if (url.searchParams.get("action") === "teacher-activity-solutions") teacherSolutionRequests.push(url.toString());
    await route.abort("blockedbyclient");
  });

  await page.goto(harnessUrl({ mode: "student", submissionDelayMs: "250" }), { waitUntil: "domcontentloaded" });
  await placeAllAnswers(page);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const legacyHeading = page.getByRole("heading", { name: "Are you sure you want to submit?", exact: true });
  const legacyDialog = page.getByRole("dialog", { name: "Are you sure you want to submit?", exact: true });
  await legacyHeading.waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await legacyHeading.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => globalThis.__legacyPilotSubmissionCount || 0), 0, "Cancel does not submit");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await legacyHeading.waitFor();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  const pendingLegacySubmit = legacyDialog.getByRole("button", { name: "Submitting…", exact: true });
  await pendingLegacySubmit.waitFor();
  assert.equal(await pendingLegacySubmit.isDisabled(), true, "legacy final Submit is disabled while pending");
  await pendingLegacySubmit.evaluate((button) => { button.click(); button.click(); });
  await page.waitForFunction(() => globalThis.__legacyPilotSubmissionCount === 1);
  await legacyHeading.waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => globalThis.__legacyPilotSubmissionCount), 1, "legacy direct mode submits exactly once");

  await page.goto(harnessUrl({ mode: "student", assignmentShell: "1", submissionDelayMs: "250" }), { waitUntil: "domcontentloaded" });
  await placeAllAnswers(page);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "Are you sure you want to submit?", exact: true }).count(), 0, "assigned shell does not nest the legacy dialog");
  await page.getByRole("heading", { name: "Submit this assignment?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Submit final answers", exact: true }).click();
  const pendingShellSubmit = page.getByRole("dialog", { name: "Submit this assignment?", exact: true }).getByRole("button", { name: "Submitting…", exact: true });
  await pendingShellSubmit.waitFor();
  assert.equal(await pendingShellSubmit.isDisabled(), true, "shell final Submit is disabled while pending");
  await pendingShellSubmit.evaluate((button) => { button.click(); button.click(); });
  await page.waitForFunction(() => globalThis.__legacyPilotSubmissionCount === 1);
  assert.equal(await page.evaluate(() => globalThis.__legacyPilotSubmissionCount), 1, "assigned shell submits exactly once");

  await page.goto(harnessUrl({ mode: "student-practice" }), { waitUntil: "domcontentloaded" });
  const practiceRoot = page.locator(`[data-student-complete-sentences="${activityId}"]`);
  await practiceRoot.waitFor();
  assert.equal(await practiceRoot.getByRole("button", { name: "Done", exact: true }).count(), 0, "practice has no final-submit control");
  assert.equal(await page.getByRole("dialog").count(), 0, "practice has no confirmation");
  assert.equal(await page.evaluate(() => globalThis.__legacyPilotSubmissionCount || 0), 0, "practice does not mutate assignments");
  assert.equal(await practiceRoot.locator("[data-word-id]").first().isDisabled(), false, "practice remains editable");

  await page.goto(harnessUrl({ mode: "student-review", review: "1" }), { waitUntil: "domcontentloaded" });
  const reviewRoot = page.locator(`[data-student-complete-sentences="${activityId}"]`);
  await reviewRoot.waitFor();
  assert.equal(await reviewRoot.getByRole("button", { name: "Done", exact: true }).count(), 0, "review has no submit path");
  assert.equal(await reviewRoot.locator("[data-drop-question-id]").first().isDisabled(), true, "review is read-only");
  assert.match(await reviewRoot.locator("[data-drop-question-id]").first().getAttribute("aria-label"), /binge-watching/, "review restores the saved response");
  assert.equal(await page.locator(`[data-complete-sentences-activity="${activityId}"]`).count(), 0, "review excludes the Teacher renderer");
  assert.equal(await page.getByRole("button", { name: /Show answer|Show model response/ }).count(), 0, "review excludes Teacher reveal controls");

  await page.goto(harnessUrl({ mode: "teacher-preview" }), { waitUntil: "domcontentloaded" });
  await page.locator(`[data-complete-sentences-activity="${activityId}"]`).waitFor();
  assert.equal(await page.locator(`[data-student-complete-sentences="${activityId}"]`).count(), 0, "Teacher preview excludes learner controls");
  assert.equal(await page.getByRole("button", { name: /^(Done|Submit)$/ }).count(), 0, "Teacher preview has no learner submission");
  assert.deepEqual(teacherSolutionRequests, [], "student and Teacher preview flows make no protected solution request");

  console.log(JSON.stringify({ status: "complete-sentences-submit-confirmation-safe", flows: ["legacy-direct", "assigned-shell", "practice", "review", "teacher-preview"] }, null, 2));
} finally {
  await browser?.close();
  vite.kill();
}
