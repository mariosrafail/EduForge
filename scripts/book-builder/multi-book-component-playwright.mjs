import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const hotspots = await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8");
const mime = { ".css": "text/css", ".gaf": "application/x-gaf", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
const studentsIdentity = "builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book";

async function staticFile(root, pathname, response) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  let file = path.resolve(root, relative);
  let details = file.startsWith(`${root}${path.sep}`) ? await stat(file).catch(() => null) : null;
  if (!details?.isFile()) { file = path.join(root, "index.html"); details = await stat(file); }
  response.writeHead(200, { "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-store", "Content-Length": details.size, "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" });
  createReadStream(file).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/builder/api/auth" && url.searchParams.get("action") === "me") {
    const body = JSON.stringify({ authenticated: true, builderUser: { id: "task-8", full_name: "Task 8 Browser", role: "developer", status: "active" } });
    response.writeHead(200, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }); response.end(body); return;
  }
  await staticFile(builderRoot, url.pathname, response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "hotspots", schemaVersion: "1.0", revision: 0, source: "repository", document: JSON.parse(hotspots) }) });
    }
    if (url.pathname.startsWith("/preview/")) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let file = path.resolve(viewerRoot, relative);
    let details = file.startsWith(`${viewerRoot}${path.sep}`) ? await stat(file).catch(() => null) : null;
    if (!details?.isFile()) file = path.join(viewerRoot, "index.html");
    return route.fulfill({ status: 200, contentType: mime[path.extname(file).toLowerCase()] || "application/octet-stream", body: await readFile(file) });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });

  await page.goto(`${origin}/#/books`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Book Builder" }).waitFor();
  for (const title of ["Ultimate English B1", "Ultimate English B1+", "Ultimate B2"]) await page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(await page.locator(".hosted-builder-book-card .hosted-builder-cover-placeholder").count(), 2);
  assert.equal(await page.locator('.hosted-builder-book-card:has-text("Ultimate English B1") img').count(), 0);

  await page.goto(`${origin}/#/books/ultimate-b2`, { waitUntil: "domcontentloaded" });
  for (const title of ["Students Book", "Workbook", "Grammar Book", "Test Book"]) await page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(await page.locator(".hosted-builder-component-card[data-available]").count(), 1);
  assert.equal(await page.locator('.hosted-builder-component-card:has-text("Workbook") a:has-text("Open workspace")').count(), 0);

  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-component-adapter="ultimate-b2-students-book"]').waitFor();
  for (const tab of ["Hotspot Builder", "Activity Builder", "UI Controller"]) await page.getByRole("link", { name: new RegExp(tab) }).waitFor();

  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/activities`, { waitUntil: "domcontentloaded" });
  const frame = page.locator('iframe[title^="Canonical Viewer activity preview"]');
  await frame.waitFor();
  const frameUrl = new URL(await frame.getAttribute("src"));
  assert.equal(frameUrl.searchParams.get("bookSlug"), "ultimate-b2");
  assert.equal(frameUrl.searchParams.get("componentSlug"), "ultimate-b2-students-book");
  assert.ok(frameUrl.searchParams.get("activityId"));

  await page.goto(`https://hhplms-viewer.netlify.app/?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-workbook&view=activity&activityId=ultimate-b2-sb-u1-p1-o1`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Preview unavailable" }).waitFor();
  assert.equal(await page.locator(".teacher-offline-page-stage").count(), 0);
  await page.goto(`https://hhplms-viewer.netlify.app/?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-workbook&view=library`, { waitUntil: "domcontentloaded" });
  await page.getByText(/registered but its content is not installed/i).waitFor();

  await page.goto(`https://hhplms-viewer.netlify.app/?${studentsIdentity}&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1`, { waitUntil: "domcontentloaded" });
  await page.locator(".teacher-offline-page-stage, .teacher-viewer-preview-invalid, .teacher-viewer-startup-error").first().waitFor();
  assert.equal(await page.locator(".teacher-offline-page-stage").count(), 1, await page.locator("body").innerText());
  const studentsSwitch = page.locator('.teacher-book-navigation-book-switch[data-book-id="students-book"]');
  await studentsSwitch.waitFor();
  assert.equal(await studentsSwitch.getAttribute("aria-current"), "page");
  consoleErrors.length = 0;
  await page.locator('.teacher-book-navigation-book-switch[data-book-id="workbook"]').click();
  await page.getByText(/Workbook content is registered but not installed/i).waitFor();
  assert.equal(await studentsSwitch.getAttribute("aria-current"), "page");
  assert.equal(await page.locator(".teacher-offline-page-stage").count(), 1);
  assert.deepEqual(consoleErrors, []);
  process.stdout.write("Task 8 multi-book/component Builder and Viewer browser acceptance passed.\n");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
