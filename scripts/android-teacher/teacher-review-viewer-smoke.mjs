import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "./playwright-launch-options.mjs";

const root = path.resolve(process.env.HHPLMS_VIEWER_DIR || "dist-netlify/ultimate-b2-interactive");
await access(path.join(root, "index.html"));
const hotspots = JSON.parse(await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8"));
const token = `v1.${Buffer.from("viewer-boundary-smoke").toString("base64url")}.${"a".repeat(43)}`;
const uiPath = "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/ui-controller";
const hotspotsPath = "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots";
const mime = { ".css": "text/css", ".gaf": "application/octet-stream", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml" };
const observedPreviewRequests = [];

function sendJson(response, status, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, { "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "application/json" });
  response.end(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/preview/")) observedPreviewRequests.push(url);
  if (url.pathname === uiPath) {
    if (url.searchParams.get("previewAuthorization") !== token) return sendJson(response, 401, { error: "Unauthorized" });
    return sendJson(response, 200, { document: { schemaVersion: "1.0", packageId: "ultimate-b2-students-book", assets: {} } });
  }
  if (url.pathname === hotspotsPath) return sendJson(response, 200, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "hotspots", schemaVersion: "1.0", revision: 43, source: "database", document: hotspots });
  if (url.pathname.startsWith("/preview/")) return sendJson(response, 401, { error: "Unauthorized" });
  const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  let file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`) && file !== path.join(root, "index.html")) return response.writeHead(404).end();
  const details = await stat(file).catch(() => null);
  if (!details?.isFile()) file = path.join(root, "index.html");
  const fallbackDetails = await stat(file);
  response.writeHead(200, { "Cache-Control": url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-store", "Content-Length": fallbackDetails.size, "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" });
  createReadStream(file).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error" && !/favicon|ERR_ABORTED|ERR_CACHE_MISS/i.test(message.text())) consoleErrors.push(message.text()); });

  const requestCheckpoint = () => observedPreviewRequests.length;
  const requestsSince = (checkpoint) => observedPreviewRequests.slice(checkpoint);
  const waitForLibrary = () => page.locator(".legacy-home-launcher").waitFor();

  let checkpoint = requestCheckpoint();
  await page.goto(`${origin}/#library`, { waitUntil: "domcontentloaded" });
  await waitForLibrary();
  assert.equal(await page.title(), "Ultimate B2 Viewer");
  assert.deepEqual(requestsSince(checkpoint).map((url) => url.pathname), [], "Bare Viewer must not request any preview endpoint.");
  assert.equal(requestsSince(checkpoint).filter((url) => /native-activities|native-draft|\/assets\//.test(url.pathname)).length, 0, "Bare Viewer must make zero native draft or draft asset requests.");
  assert.equal(await page.getByText("Publisher answer", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: /Show all answers|Reveal model answer/i }).count(), 0);

  checkpoint = requestCheckpoint();
  const authorized = new URL(origin);
  authorized.search = new URLSearchParams({ builderPreview: "1", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", previewAuthorization: token, view: "library" });
  await page.goto(authorized.toString(), { waitUntil: "domcontentloaded" });
  await waitForLibrary();
  const authorizedRequests = requestsSince(checkpoint);
  const uiRequest = authorizedRequests.find((url) => url.pathname === uiPath);
  assert.equal(uiRequest?.searchParams.get("previewAuthorization"), token);
  assert.ok(authorizedRequests.some((url) => url.pathname === hotspotsPath), "Authorized Builder preview must load saved hotspot preview state.");
  assert.equal(authorizedRequests.filter((url) => /teacher-solution|native-teacher|open-response-teacher/.test(url.pathname)).length, 0, "Teacher answer endpoints must remain on-demand.");
  assert.equal(authorizedRequests.filter((url) => /native-activities/.test(url.pathname)).length, 0, "Library preview must not receive native draft access.");

  for (const search of [
    new URLSearchParams({ builderPreview: "1", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", view: "library" }),
    new URLSearchParams({ builderPreview: "1", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", previewAuthorization: "malformed", view: "library" }),
  ]) {
    checkpoint = requestCheckpoint();
    await page.goto(`${origin}/?${search}`, { waitUntil: "domcontentloaded" });
    await page.locator('main[role="alert"], .teacher-offline-pack-error').first().waitFor();
    assert.deepEqual(requestsSince(checkpoint).map((url) => url.pathname), [], "Invalid preview authorization must fail before preview requests.");
    assert.equal(await page.getByText("Publisher answer", { exact: true }).count(), 0);
  }

  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({ status: "public-viewer-boundary-safe", barePreviewRequests: 0, authorizedUiRequest: uiRequest.pathname, authorizedUiToken: "present", authorizedHotspots: true, unauthorizedPreviewRequests: 0, consoleErrors: 0 }, null, 2));
  await context.close();
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
