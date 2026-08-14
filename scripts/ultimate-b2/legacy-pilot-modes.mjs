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

async function installProtectedEndpointMocks(page, teacherSolutionRequests, publicationRequests) {
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
      teacherSolutionRequests.push(activityId);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ solution: teacherSolutions.solutions[activityId] }),
      });
      return;
    }
    if (action === "active-component-release") {
      publicationRequests.push(url.toString());
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "no_publication" }),
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

function expectedActivityRoot(page, activityId, mode) {
  if (activityId.endsWith("-o4")) {
    return mode === "student"
      ? page.locator(`[data-student-complete-sentences="${activityId}"]`)
      : page.locator(`[data-complete-sentences-activity="${activityId}"]`);
  }
  if (activityId.endsWith("-o5")) return page.locator(`[data-debate-club-activity="${activityId}"]`);
  return page.locator(`[data-legacy-pilot-activity="${activityId}"]`);
}

async function assertStudentCompleteSentences(page, root, activityId, teacherSolutionRequests, solutionRequestCount) {
  assert.equal(await page.locator(`[data-complete-sentences-activity="${activityId}"]`).count(), 0, `${activityId} Student excludes Teacher renderer`);
  assert.equal(await page.locator(".ultimate-b2-complete-sentence button, .response-region").count(), 0, `${activityId} Student excludes Teacher reveal controls`);
  assert.equal(await page.getByRole("button", { name: /^Show model response/ }).count(), 0, `${activityId} Student excludes model-response controls`);
  assert.equal(await page.getByRole("button", { name: "Check", exact: true }).count(), 0, `${activityId} Student has no local scoring`);

  const wordBank = root.getByRole("region", { name: "Draggable word bank", exact: true });
  const wordButtons = wordBank.locator("[data-word-id]");
  const dropTargets = root.locator("[data-drop-question-id]");
  assert.equal(await wordBank.count(), 1, `${activityId} Student word bank`);
  assert.equal(await wordButtons.count(), 8, `${activityId} Student word count`);
  assert.equal(await dropTargets.count(), 8, `${activityId} Student drop-target count`);
  assert.equal(await wordButtons.first().isDisabled(), false, `${activityId} Student word bank is editable`);
  assert.equal(await dropTargets.first().isDisabled(), false, `${activityId} Student drops are editable`);

  const publicWords = (await wordButtons.allTextContents()).map((value) => value.trim());
  const questionIds = await dropTargets.evaluateAll((elements) => elements.map((element) => element.dataset.dropQuestionId));
  assert.deepEqual(questionIds, publicWords.map((_, index) => `${activityId}-q${index + 1}`), `${activityId} canonical drop identities`);
  const done = page.getByRole("button", { name: "Done", exact: true });
  assert.equal(await done.isDisabled(), true, `${activityId} Done waits for all placements`);
  for (let index = 0; index < publicWords.length; index += 1) {
    await wordButtons.nth(index).click();
    await dropTargets.nth(index).click();
    assert.equal(await wordButtons.nth(index).isDisabled(), true, `${activityId} word ${index + 1} is one-use`);
  }
  assert.equal(await done.isDisabled(), false, `${activityId} Done is enabled after all placements`);
  await done.click();
  await page.getByRole("heading", { name: "Are you sure you want to submit?", exact: true }).waitFor();
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await page.waitForFunction(() => Boolean(globalThis.__legacyPilotSubmission));

  const submission = await page.evaluate(() => globalThis.__legacyPilotSubmission);
  assert.equal(submission.score, null, `${activityId} server-authoritative score`);
  assert.equal(submission.implementationMode, "auto-scored", `${activityId} implementation mode`);
  assert.equal(submission.status, "submitted", `${activityId} submission status`);
  assert.deepEqual(Object.keys(submission.answers), publicWords.map((_, index) => String(index + 1)), `${activityId} numbered submission schema`);
  assert.deepEqual(Object.values(submission.answers).sort(), publicWords.sort(), `${activityId} public word-bank answers`);
  assert.equal(teacherSolutionRequests.length, solutionRequestCount, `${activityId} Student does not request Teacher solutions`);
}

async function assertTeacherCompleteSentences(page, root, activityId, mode, teacherSolutionRequests, solutionRequestCount) {
  assert.equal(await page.locator(`[data-student-complete-sentences="${activityId}"]`).count(), 0, `${activityId} Teacher excludes Student renderer`);
  assert.equal(await page.locator("input, textarea").count(), 0, `${activityId} Teacher has no Student typing fields`);
  assert.equal(await page.getByRole("button", { name: /^(Done|Submit|Check)$/ }).count(), 0, `${activityId} Teacher has no Student submission controls`);
  assert.equal(await root.getAttribute("data-complete-sentences-view"), "questions", `${activityId} Teacher question view`);
  const reveal = root.locator(".ultimate-b2-complete-sentence button").first();
  assert.equal(await reveal.count(), 1, `${activityId} Teacher reveal is available`);
  if (mode === "teacher-preview") {
    assert.equal(await reveal.getAttribute("aria-pressed"), "false", `${activityId} read-only preview remains concealed`);
    assert.equal(teacherSolutionRequests.length, solutionRequestCount, `${activityId} read-only preview does not request Teacher solutions`);
    return;
  }
  await reveal.click();
  await page.waitForFunction((id) => document.querySelector(`[data-complete-sentences-activity="${id}"] .ultimate-b2-complete-sentence button`)?.getAttribute("aria-pressed") === "true", activityId);
  assert.equal(await reveal.getAttribute("aria-pressed"), "true", `${activityId} Teacher reveal persists`);
  assert.equal(teacherSolutionRequests.length, solutionRequestCount + 1, `${activityId} Teacher requests its protected solution`);
  assert.equal(teacherSolutionRequests.at(-1), activityId, `${activityId} Teacher solution identity`);
}

async function assertStudentDebateClub(page, root, activityId, teacherSolutionRequests, solutionRequestCount) {
  assert.equal(await root.getAttribute("data-student-response"), "enabled", `${activityId} Student response mode`);
  assert.equal(await root.locator(".response-region").count(), 0, `${activityId} Student excludes Teacher model response`);
  assert.equal(await page.getByRole("button", { name: /^Show model response for part/ }).count(), 0, `${activityId} Student excludes Teacher reveal controls`);
  assert.equal(await page.getByRole("button", { name: "Submit", exact: true }).count(), 0, `${activityId} Student uses Done submission`);

  const textarea = root.getByRole("textbox", { name: "Part 1 learner response", exact: true });
  assert.equal(await textarea.count(), 1, `${activityId} authored Student textarea label`);
  assert.equal(await textarea.isDisabled(), false, `${activityId} Student response is editable`);
  const response = "A Student-authored response for the mode contract.";
  await textarea.fill(response);
  await page.getByRole("button", { name: "Next part", exact: true }).click();
  await page.locator(`[data-debate-club-activity="${activityId}"][data-debate-part="2"]`).waitFor();
  const partTwoTextarea = root.getByRole("textbox", { name: "Part 2 learner response", exact: true });
  assert.equal(await partTwoTextarea.inputValue(), response, `${activityId} response persists across part navigation`);
  await page.getByRole("button", { name: "Previous part", exact: true }).click();
  await page.locator(`[data-debate-club-activity="${activityId}"][data-debate-part="1"]`).waitFor();
  assert.equal(await textarea.inputValue(), response, `${activityId} response persists after returning to part 1`);

  const done = page.getByRole("button", { name: "Done", exact: true });
  assert.equal(await done.isDisabled(), false, `${activityId} Done is enabled for a response`);
  await done.click();
  await page.waitForFunction(() => Boolean(globalThis.__legacyPilotSubmission));
  const submission = await page.evaluate(() => globalThis.__legacyPilotSubmission);
  assert.equal(submission.score, null, `${activityId} server-authoritative score`);
  assert.equal(submission.implementationMode, "teacher-reviewed", `${activityId} implementation mode`);
  assert.equal(submission.status, "awaiting_review", `${activityId} submission status`);
  assert.deepEqual(Object.values(submission.answers), [response], `${activityId} Student response payload`);
  assert.equal(teacherSolutionRequests.length, solutionRequestCount, `${activityId} Student does not request Teacher solutions`);
}

async function assertTeacherDebateClub(page, root, activityId, mode, teacherSolutionRequests, solutionRequestCount) {
  assert.equal(await root.getAttribute("data-student-response"), null, `${activityId} Teacher excludes Student response mode`);
  assert.equal(await root.locator("textarea").count(), 0, `${activityId} Teacher has no Student textarea`);
  assert.equal(await page.getByRole("button", { name: /^(Done|Submit)$/ }).count(), 0, `${activityId} Teacher has no Student submission controls`);
  assert.equal(await page.getByRole("button", { name: "Reveal the argument for watching a film at home", exact: true }).count(), 0, `${activityId} obsolete Teacher label is absent`);
  const reveal = page.getByRole("button", { name: "Show model response for part 1", exact: true });
  assert.equal(await reveal.count(), 1, `${activityId} contextual Teacher reveal label`);
  if (mode === "teacher-preview") {
    assert.equal(await reveal.getAttribute("aria-pressed"), "false", `${activityId} read-only preview remains concealed`);
    assert.equal(teacherSolutionRequests.length, solutionRequestCount, `${activityId} read-only preview does not request Teacher solutions`);
    return;
  }
  await reveal.click();
  await page.waitForFunction((id) => document.querySelector(`[data-debate-club-activity="${id}"] [data-response-region-id="debate-reveal-1"]`)?.getAttribute("aria-pressed") === "true", activityId);
  assert.equal(await reveal.getAttribute("aria-pressed"), "true", `${activityId} Teacher reveal persists`);
  assert.equal(await reveal.getAttribute("data-revealed"), "true", `${activityId} Teacher model response is revealed`);
  assert.ok((await reveal.locator(".response-region-text").innerText()).trim(), `${activityId} Teacher model response text`);
  assert.equal(teacherSolutionRequests.length, solutionRequestCount + 1, `${activityId} Teacher requests its protected solution`);
  assert.equal(teacherSolutionRequests.at(-1), activityId, `${activityId} Teacher solution identity`);
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
  const unexpectedErrorResponses = [];
  const teacherSolutionRequests = [];
  const publicationRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|server responded with a status of 404 \(Not Found\)/i.test(message.text())) consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    if (!request.url().startsWith(baseURL)) externalRequests.push(request.url());
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && !response.url().includes("action=active-component-release")) unexpectedErrorResponses.push(`${response.status()} ${response.url()}`);
  });
  await installProtectedEndpointMocks(page, teacherSolutionRequests, publicationRequests);
  const results = [];

  for (const mode of modes) {
    for (const activityId of activities) {
      await page.goto(harnessUrl(activityId, mode), { waitUntil: "domcontentloaded" });
      const root = expectedActivityRoot(page, activityId, mode);
      await root.waitFor();
      assert.equal(await root.count(), 1, `${mode} ${activityId} renderer`);
      assert.equal(await page.locator(".ultimate-b2-legacy-pilot, .ultimate-b2-complete-sentences, .ultimate-b2-complete-sentences-student, .ultimate-b2-debate-club").count(), 1, `${mode} ${activityId} exact activity root`);
      assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

      const solutionRequestCount = teacherSolutionRequests.length;
      if (activityId.endsWith("-o4")) {
        if (mode === "student") await assertStudentCompleteSentences(page, root, activityId, teacherSolutionRequests, solutionRequestCount);
        else await assertTeacherCompleteSentences(page, root, activityId, mode, teacherSolutionRequests, solutionRequestCount);
        results.push({ mode, activityId, status: "passed" });
        continue;
      }
      if (activityId.endsWith("-o5")) {
        if (mode === "student") await assertStudentDebateClub(page, root, activityId, teacherSolutionRequests, solutionRequestCount);
        else await assertTeacherDebateClub(page, root, activityId, mode, teacherSolutionRequests, solutionRequestCount);
        results.push({ mode, activityId, status: "passed" });
        continue;
      }

      if (mode === "student") {
        assert.equal(await page.getByRole("button", { name: "Show answer" }).count(), 0, `${activityId} student Show answer`);
        assert.equal(await page.getByRole("button", { name: "Check", exact: true }).count(), 0, `${activityId} student Check`);
        assert.ok(await page.getByRole("button", { name: "Submit", exact: true }).count() > 0, `${activityId} student Submit`);
        const editable = activityId.endsWith("-o1")
          ? page.locator(".legacy-pilot-object-one-question textarea").first()
          : page.locator(".legacy-pilot-question input:not([type=radio]), .legacy-pilot-question textarea, .legacy-pilot-question input[type=radio]").first();
        assert.equal(await editable.isDisabled(), false, `${activityId} student editing`);

        if (activityId.endsWith("-o3")) {
          const fieldsets = page.locator("fieldset");
          for (let index = 0; index < (await fieldsets.count()); index += 1) {
            await fieldsets.nth(index).getByRole("radio").first().check();
          }
        }

        if (activityId.endsWith("-o3")) {
          await page.getByRole("button", { name: "Submit", exact: true }).click();
          await page.waitForFunction(() => Boolean(globalThis.__legacyPilotSubmission));
          const submission = await page.evaluate(() => globalThis.__legacyPilotSubmission);
          assert.equal(submission.score, null, `${activityId} server-authoritative score`);
          assert.equal(
            submission.implementationMode,
            "auto-scored",
            `${activityId} implementation mode`,
          );
          assert.equal(
            submission.status,
            "submitted",
            `${activityId} submission status`,
          );
        }
      }

      if (mode === "teacher-preview") {
        assert.equal(await page.getByRole("button", { name: "Submit", exact: true }).count(), 0);
        assert.equal(await page.getByRole("button", { name: "Show answer" }).count(), 0);
        if (activityId.endsWith("-o1")) {
          assert.equal(await page.locator(".legacy-pilot-object-one-question input, .legacy-pilot-object-one-question textarea").count(), 0, `${activityId} teacher preview has no editable controls`);
          assert.equal(await page.locator(".legacy-unit-opener-answer-lines").count(), 2, `${activityId} teacher preview keeps answer lines`);
        } else {
          const input = page.locator(".legacy-pilot-question input, .legacy-pilot-question textarea").first();
          assert.equal(await input.isDisabled(), true, `${activityId} teacher preview read only`);
        }
      }

      if (mode === "teacher-presentation") {
        assert.equal(await page.getByRole("button", { name: "Submit", exact: true }).count(), 0);
        if (activityId.endsWith("-o1")) {
          assert.equal(await page.getByRole("button", { name: "Check", exact: true }).count(), 0);
          assert.equal(await page.getByRole("button", { name: "Reset", exact: true }).count(), 0);
          assert.equal(await page.getByRole("button", { name: "Show all answers" }).count(), 0);
          await page.getByRole("button", { name: "Show publisher model answer for question 1" }).click();
          await page.getByRole("button", { name: "Publisher model answer for question 1" }).waitFor();
        } else {
          assert.ok(await page.getByRole("button", { name: "Check", exact: true }).count() > 0);
          assert.ok(await page.getByRole("button", { name: "Reset", exact: true }).count() > 0);
          assert.ok(await page.getByRole("button", { name: "Show all answers" }).count() > 0);
          assert.ok(await page.getByRole("button", { name: "Hide answers" }).count() > 0);
        }
        if (activityId.endsWith("-o3")) {
          await page.getByRole("button", { name: "Show all answers" }).click();
          await page.getByText("Publisher answer", { exact: true }).first().waitFor();
          assert.equal(await page.getByText("Publisher answer", { exact: true }).count(), 6);
          await page.getByRole("button", { name: "Hide answers" }).click();
          assert.equal(await page.getByText("Publisher answer", { exact: true }).count(), 0);
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
  assert.deepEqual(unexpectedErrorResponses, [], "web-mode unexpected error responses");
  assert.ok(publicationRequests.length > 0, "web mode checks the normal LMS active release boundary");
  const report = { schemaVersion: "1.0", status: "passed", results, teacherPresentationShell: "passed" };
  await writeFile(`${artifactRoot}/mode-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  vite.kill();
}
