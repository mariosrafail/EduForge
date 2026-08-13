import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

const root = path.resolve(process.env.HHPLMS_TEACHER_REVIEW_DIR || "dist-netlify/ultimate-b2-interactive");
await access(path.join(root, "index.html"));
const hotspots = JSON.parse(await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8"));
const mime = { ".css": "text/css", ".gaf": "application/octet-stream", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml" };

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots") {
    const body = Buffer.from(JSON.stringify({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "hotspots", schemaVersion: "1.0", revision: 43, source: "database", document: hotspots }));
    response.writeHead(200, { "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "application/json" });
    response.end(body);
    return;
  }
  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`) && file !== path.join(root, "index.html")) return response.writeHead(404).end();
  const details = await stat(file).catch(() => null);
  if (!details?.isFile()) return response.writeHead(404).end();
  response.writeHead(200, {
    "Cache-Control": url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-store",
    "Content-Length": details.size,
    "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
  });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  const consoleErrors = [];
  const forbiddenRequests = [];
  page.on("console", (message) => { if (message.type() === "error" && !/favicon|ERR_ABORTED|ERR_CACHE_MISS/i.test(message.text())) consoleErrors.push(message.text()); });
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== origin || /^\/(?:\.netlify\/functions|api|auth)\//.test(requestUrl.pathname)) forbiddenRequests.push(request.url());
  });

  const open = async (search, ready) => {
    await page.goto(`${origin}/${search}`, { waitUntil: "domcontentloaded" });
    await page.locator(ready).waitFor();
  };
  await open("?builderPreview=1&view=library", ".legacy-home-launcher");
  assert.equal(await page.title(), "Ultimate B2 Teacher Review");
  assert.equal(await page.getByText(/sign in|log in/i).count(), 0);

  await open("?builderPreview=1&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-2", ".teacher-offline-page-stage");
  assert.equal(await page.locator(".teacher-offline-page-hotspot").count() > 0, true);

  const activityUrl = (id) => `?builderPreview=1&view=activity&activityId=${id}`;
  await open(activityUrl("ultimate-b2-sb-u1-p2-o1"), '[data-embedded-activity-id="ultimate-b2-sb-u1-p2-o1"]');
  assert.equal(await page.locator('.teacher-presentation-activity[data-legacy-pilot-activity="ultimate-b2-sb-u1-p2-o1"]').count(), 1);
  const readingObjectOneAnswer = page.locator('[data-legacy-pilot-activity="ultimate-b2-sb-u1-p2-o1"] .legacy-unit-opener-answer-lines').first();
  await readingObjectOneAnswer.click();
  await page.locator('[data-legacy-pilot-activity="ultimate-b2-sb-u1-p2-o1"] .legacy-unit-opener-answer-lines.revealed').waitFor();

  await open(activityUrl("ultimate-b2-sb-u1-p1-o1"), '[data-embedded-activity-id="ultimate-b2-sb-u1-p1-o1"]');
  const navigation = page.locator("[data-teacher-book-navigation]");
  await navigation.getByRole("button", { name: "Show Next", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"] [data-revealed="true"]').length === 1);
  await navigation.getByRole("button", { name: "Show All", exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"] [data-response-region-id]')].every((region) => region.dataset.revealed === "true"));
  await navigation.getByRole("button", { name: "Reload", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-legacy-unit-opener-activity="ultimate-b2-sb-u1-p1-o1"] [data-revealed="true"]').length === 0);

  await open(activityUrl("ultimate-b2-sb-u1-p2-o4"), '[data-complete-sentences-activity="ultimate-b2-sb-u1-p2-o4"]');
  await navigation.getByRole("button", { name: "Show Next", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-complete-sentences-activity="ultimate-b2-sb-u1-p2-o4"] button[data-blank-id].revealed').length === 1);
  await navigation.getByRole("button", { name: "Show All", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-complete-sentences-activity="ultimate-b2-sb-u1-p2-o4"] button[data-blank-id].revealed').length === 8);
  await navigation.getByRole("button", { name: "Reload", exact: true }).click();

  await open(activityUrl("ultimate-b2-sb-u2-p3-o4"), '[data-embedded-activity-id="ultimate-b2-sb-u2-p3-o4"]');
  const activity = page.locator('[data-embedded-activity-id="ultimate-b2-sb-u2-p3-o4"]');
  await activity.getByRole("button", { name: "Show answer" }).first().click();
  await activity.getByText("Publisher answer", { exact: true }).waitFor();
  assert.equal(await activity.getByText("out", { exact: true }).count() > 0, true);
  await activity.getByRole("button", { name: "Hide answers", exact: true }).click();
  assert.equal(await activity.getByText("Publisher answer", { exact: true }).count(), 0);
  await activity.locator("input").first().fill("wrong");
  await activity.getByRole("button", { name: "Check", exact: true }).click();
  await activity.getByText("Try again", { exact: true }).waitFor();
  await activity.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(await activity.locator("input").first().inputValue(), "");

  await open(activityUrl("ultimate-b2-sb-u1-p2-o3"), '[data-multiple-choice-view="questions"]');
  const showText = navigation.getByRole("button", { name: "Show Text", exact: true });
  if (!await showText.count()) {
    const buttons = await navigation.locator("button").evaluateAll((items) => items.map((item) => item.getAttribute("aria-label")));
    throw new Error(`Object 3 Show Text control is missing: ${JSON.stringify(buttons)}`);
  }
  await showText.click();
  await page.locator('[data-multiple-choice-view="text"]').waitFor();
  await navigation.getByRole("button", { name: "Return to questions", exact: true }).click();
  await page.locator('[data-multiple-choice-view="questions"]').waitFor();
  await navigation.getByRole("button", { name: "Next activity part" }).click();
  await page.locator('[data-multiple-choice-panel="2"]').waitFor();
  await navigation.getByRole("button", { name: "Previous activity part" }).click();
  await page.locator('[data-multiple-choice-panel="1"]').waitFor();

  await page.goto(`${origin}/?builderPreview=1&view=activity&activityId=unknown-activity`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Preview unavailable" }).waitFor();
  assert.match(await page.locator("main[role=alert]").textContent(), /invalid or unavailable/);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(forbiddenRequests, []);
  console.log(JSON.stringify({ status: "teacher-review-viewer-safe", activities: ["ultimate-b2-sb-u1-p2-o1", "ultimate-b2-sb-u1-p1-o1", "ultimate-b2-sb-u1-p2-o4", "ultimate-b2-sb-u2-p3-o4", "ultimate-b2-sb-u1-p2-o3"], intents: ["library", "page", "activity", "invalid"], controls: ["response-region reveal", "Show Next", "Show All", "Reload", "Show answer", "Hide answers", "Check", "Reset", "Show Text", "internal parts"], consoleErrors: 0, forbiddenRequests: 0 }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
