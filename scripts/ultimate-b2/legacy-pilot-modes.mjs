import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

import teacherSolutions from "../../android-content-packs/ultimate-b2-students-book/teacher-solutions.json" with { type: "json" };

const baseURL = "http://127.0.0.1:4182";
const artifactRoot = "test-results/ultimate-b2-legacy-pilot/web-modes";
const activities = [1, 2, 3, 4, 5].map((number) => `ultimate-b2-sb-u1-p2-o${number}`);
const modes = ["student", "teacher-preview", "teacher-presentation"];
const mediaPaths = {
  "ultimate-b2.students-book.unit-1.reading.video-intro": "/src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj1/video/obj1.mp4",
  "ultimate-b2.students-book.unit-1.reading.text-audio": "/src/assets/books/ultimate-b2/teacher-offline-media/unit-1-reading-text.mp3",
};

const vite = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4182"],
  { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);

async function waitForVite() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Legacy pilot web-mode harness did not start.");
}

function localMediaPath(logicalKey) {
  if (mediaPaths[logicalKey]) return mediaPaths[logicalKey];
  const highlight = logicalKey.match(/^ultimate-b2\.legacy-pilot\.unit-1\.part-2\.(obj[23])\.highlight-(\d)$/);
  return highlight
    ? `/src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/${highlight[1]}/audio/highlight_${highlight[2]}.mp3`
    : null;
}

async function installProtectedEndpointMocks(page) {
  await page.route("**/.netlify/functions/book-content?*", async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action");
    if (action === "asset-access") {
      const logicalKey = url.searchParams.get("logicalKey");
      const localPath = localMediaPath(logicalKey);
      assert.ok(localPath, `Unexpected logical asset request: ${logicalKey}`);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          asset: { logicalKey, role: "pilot-test-media", accessLevel: "entitled" },
          url: localPath,
          expiresAt: null,
        }),
      });
      return;
    }
    if (action === "teacher-activity-solutions") {
      const activityId = url.searchParams.get("stableActivityId");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ solution: teacherSolutions.solutions[activityId] }),
      });
      return;
    }
    await route.abort("blockedbyclient");
  });
}

function harnessUrl(activityId, mode, shell = false) {
  const query = new URLSearchParams({ activityId, mode, ...(shell ? { shell: "1" } : {}) });
  return `${baseURL}/test-results/ultimate-b2-legacy-pilot/web-modes/harness.html?${query}`;
}

let browser;
try {
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(
    `${artifactRoot}/harness.html`,
    '<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scripts/ultimate-b2/legacy-pilot-mode-harness.jsx"></script></body></html>\n',
  );
  await waitForVite();
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120_000);
  const consoleErrors = [];
  const externalRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (!request.url().startsWith(baseURL)) externalRequests.push(request.url());
  });
  await installProtectedEndpointMocks(page);
  const results = [];

  for (const mode of modes) {
    for (const activityId of activities) {
      await page.goto(harnessUrl(activityId, mode), { waitUntil: "domcontentloaded" });
      const root = page.locator(`[data-legacy-pilot-activity="${activityId}"]`);
      await root.waitFor();
      assert.equal(await root.count(), 1, `${mode} ${activityId} renderer`);
      assert.equal(await page.locator(".ultimate-b2-legacy-pilot").count(), 1, `${mode} ${activityId} exact pilot root`);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

      if (mode === "student") {
        assert.equal(await page.getByRole("button", { name: "Show answer" }).count(), 0, `${activityId} student Show answer`);
        assert.equal(await page.getByRole("button", { name: "Check", exact: true }).count(), 0, `${activityId} student Check`);
        assert.ok(await page.getByRole("button", { name: "Submit", exact: true }).count() > 0, `${activityId} student Submit`);
        const editable = page.locator(".legacy-pilot-question input:not([type=radio]), .legacy-pilot-question textarea, .legacy-pilot-question input[type=radio]").first();
        assert.equal(await editable.isDisabled(), false, `${activityId} student editing`);

        if (activityId.endsWith("-o3")) {
          const fieldsets = page.locator("fieldset");
          for (let index = 0; index < (await fieldsets.count()); index += 1) {
            await fieldsets.nth(index).getByRole("radio").first().check();
          }
        } else if (activityId.endsWith("-o4")) {
          const inputs = page.locator('input[type="text"]');
          for (let index = 0; index < (await inputs.count()); index += 1) {
            await inputs.nth(index).fill(`response ${index + 1}`);
          }
        } else if (activityId.endsWith("-o5")) {
          await page.getByRole("textbox").fill("A teacher-reviewed response.");
        }

        if (activityId.endsWith("-o3") || activityId.endsWith("-o4") || activityId.endsWith("-o5")) {
          await page.getByRole("button", { name: "Submit", exact: true }).click();
          await page.waitForFunction(() => Boolean(globalThis.__legacyPilotSubmission));
          const submission = await page.evaluate(() => globalThis.__legacyPilotSubmission);
          assert.equal(submission.score, null, `${activityId} server-authoritative score`);
          assert.equal(
            submission.implementationMode,
            activityId.endsWith("-o5") ? "teacher-reviewed" : "auto-scored",
            `${activityId} implementation mode`,
          );
          assert.equal(
            submission.status,
            activityId.endsWith("-o5") ? "awaiting_review" : "submitted",
            `${activityId} submission status`,
          );
        }
      }

      if (mode === "teacher-preview") {
        assert.equal(await page.getByRole("button", { name: "Submit", exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Show answer" }).count(), 0);
        const input = page.locator(".legacy-pilot-question input, .legacy-pilot-question textarea").first();
        assert.equal(await input.isDisabled(), true, `${activityId} teacher preview read only`);
      }

      if (mode === "teacher-presentation") {
        assert.equal(await page.getByRole("button", { name: "Submit", exact: true }).count(), 0);
        assert.ok(await page.getByRole("button", { name: "Check", exact: true }).count() > 0);
        assert.ok(await page.getByRole("button", { name: "Reset", exact: true }).count() > 0);
        assert.ok(await page.getByRole("button", { name: "Show all answers" }).count() > 0);
        assert.ok(await page.getByRole("button", { name: "Hide answers" }).count() > 0);
        if (activityId.endsWith("-o3")) {
          await page.getByRole("button", { name: "Show all answers" }).click();
          await page.getByText("Publisher answer", { exact: true }).first().waitFor();
          assert.equal(await page.getByText("Publisher answer", { exact: true }).count(), 6);
          await page.getByRole("button", { name: "Hide answers" }).click();
          assert.equal(await page.getByText("Publisher answer", { exact: true }).count(), 0);
        }
        if (activityId.endsWith("-o4")) {
          const input = page.locator(".legacy-pilot-write-question input").first();
          await input.fill("incorrect");
          await page.getByRole("button", { name: "Check", exact: true }).click();
          await page.locator(".legacy-pilot-result").first().waitFor();
          await page.getByRole("button", { name: "Reset", exact: true }).click();
          assert.equal(await input.inputValue(), "");
        }
      }

      if (activityId.endsWith("-o2")) {
        await page.screenshot({ path: `${artifactRoot}/${mode}-obj2.png`, animations: "disabled" });
      }
      results.push({ mode, activityId, status: "passed" });
    }
  }

  await page.goto(harnessUrl("ultimate-b2-sb-u1-p2-o2", "teacher-presentation", true), { waitUntil: "domcontentloaded" });
  await page.locator(".teacher-presentation-shell").waitFor();
  assert.ok(await page.getByRole("button", { name: "Fullscreen" }).count() > 0);
  await page.getByRole("button", { name: "Back to book" }).click();
  assert.equal(await page.evaluate(() => globalThis.__legacyPilotNavigation), "/teacher/books/ultimate-b2/components/students-book/exercises");

  assert.deepEqual(consoleErrors, [], "web-mode console errors");
  assert.deepEqual(externalRequests, [], "web-mode external requests");
  const report = { schemaVersion: "1.0", status: "passed", results, teacherPresentationShell: "passed" };
  await writeFile(`${artifactRoot}/mode-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  vite.kill();
}
