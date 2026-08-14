import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const activityId = "ultimate-b2-sb-u1-p1-o1";
const hotspots = JSON.parse(await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8"));
const canonical = Object.freeze({
  schemaVersion: "1.0",
  activityId,
  visibleInstructionText: "Read the quote and discuss these questions with a partner.",
  questions: [
    { id: `${activityId}-q1`, prompt: "In what ways are films an art form?" },
    { id: `${activityId}-q2`, prompt: "Why is theatre life?" },
    { id: `${activityId}-q3`, prompt: "Do you agree that TV is furniture?" },
  ],
});
const mime = { ".css": "text/css", ".gaf": "application/octet-stream", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml" };
let saved = null;
let revision = 0;
let mutationId = "";

function contentEnvelope(document, source, currentRevision = revision) {
  return { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "open-response", documentKey: activityId, schemaVersion: "1.0", revision: currentRevision, source, document };
}

function json(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, { "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "application/json" });
  response.end(body);
}

async function staticResponse(root, pathname, response, fallback = "index.html") {
  const relative = pathname === "/" ? fallback : decodeURIComponent(pathname).replace(/^\/+/, "");
  let file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`) && file !== path.join(root, fallback)) return response.writeHead(404).end();
  let details = await stat(file).catch(() => null);
  if (!details?.isFile()) {
    file = path.join(root, fallback);
    details = await stat(file).catch(() => null);
  }
  if (!details?.isFile()) return response.writeHead(404).end();
  response.writeHead(200, { "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-store", "Content-Length": details.size, "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" });
  createReadStream(file).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/builder/api/auth" && url.searchParams.get("action") === "me") return json(response, 200, { authenticated: true, builderUser: { id: "smoke", full_name: "Builder Smoke", role: "developer", status: "active" } });
  if (url.pathname === `/builder/api/open-response-import/status/${activityId}`) return json(response, 200, { activityId, revision: 0, fingerprint: null, updatedAt: null });
  if (url.pathname === `/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/open-response/${activityId}`) {
    if (request.method === "GET") return json(response, 200, contentEnvelope(saved || canonical, saved ? "database" : "repository"));
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.expectedRevision !== revision) return json(response, 409, { error: "revision_conflict", currentRevision: revision });
    if (mutationId === body.clientMutationId) return json(response, 200, { ...contentEnvelope(saved, "database"), currentRevision: revision, idempotent: true });
    revision += 1;
    mutationId = body.clientMutationId;
    saved = structuredClone(body.document);
    return json(response, 200, { ...contentEnvelope(saved, "database"), currentRevision: revision, idempotent: false });
  }
  return staticResponse(builderRoot, url.pathname, response, "index.html");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots") {
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "hotspots", schemaVersion: "1.0", revision: 1, source: "database", document: hotspots }) });
    }
    if (url.pathname === `/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/open-response/${activityId}`) {
      if (!saved) return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "builder_preview_document_not_found" }) });
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "Cache-Control": "no-store" }, body: JSON.stringify(contentEnvelope(saved, "database")) });
    }
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let file = path.resolve(viewerRoot, relative);
    let details = file.startsWith(`${viewerRoot}${path.sep}`) || file === path.join(viewerRoot, "index.html") ? await stat(file).catch(() => null) : null;
    if (!details?.isFile()) {
      file = path.join(viewerRoot, "index.html");
      details = await stat(file);
    }
    return route.fulfill({ status: 200, contentType: mime[path.extname(file).toLowerCase()] || "application/octet-stream", body: await readFile(file) });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/activities`, { waitUntil: "domcontentloaded" });
  const editor = page.locator('.b2-hosted-open-response-editor');
  await editor.getByText("Canonical baseline", { exact: true }).waitFor();
  const frame = () => page.frameLocator('iframe[title^="Canonical Viewer activity preview"]');
  await frame().locator('[data-legacy-unit-opener-activity] h3').filter({ hasText: canonical.questions[0].prompt }).waitFor();

  await editor.getByRole("button", { name: "Edit public authoring" }).click();
  const firstPrompt = editor.locator("textarea").nth(1);
  await firstPrompt.fill("Unsaved prompt must stay in Builder");
  await editor.getByText("Unsaved changes", { exact: true }).waitFor();
  assert.equal(await frame().locator('[data-legacy-unit-opener-activity] h3').filter({ hasText: "Unsaved prompt must stay in Builder" }).count(), 0);
  await editor.getByRole("button", { name: "Save draft" }).click();
  await editor.getByText("Saved", { exact: true }).waitFor();
  await frame().locator('[data-legacy-unit-opener-activity] h3').filter({ hasText: "Unsaved prompt must stay in Builder" }).waitFor();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('.b2-hosted-open-response-editor').getByText("Saved draft", { exact: true }).waitFor();
  assert.equal(await page.locator('.b2-hosted-open-response-editor textarea').nth(1).inputValue(), "Unsaved prompt must stay in Builder");

  const reloadedEditor = page.locator('.b2-hosted-open-response-editor');
  await reloadedEditor.getByRole("button", { name: "Edit public authoring" }).click();
  await reloadedEditor.locator("textarea").nth(1).fill("Conflicting local prompt");
  revision += 1;
  saved = { ...saved, questions: saved.questions.map((question, index) => index === 0 ? { ...question, prompt: "Externally saved prompt" } : question) };
  await reloadedEditor.getByRole("button", { name: "Save draft" }).click();
  await reloadedEditor.getByText("Conflict — unsaved changes retained", { exact: true }).waitFor();
  assert.equal(await reloadedEditor.locator("textarea").nth(1).inputValue(), "Conflicting local prompt");
  assert.equal(await frame().locator('[data-legacy-unit-opener-activity] h3').filter({ hasText: "Conflicting local prompt" }).count(), 0);
  await reloadedEditor.getByRole("button", { name: "Reload latest saved" }).click();
  await reloadedEditor.getByText("Saved draft", { exact: true }).waitFor();
  assert.equal(await reloadedEditor.locator("textarea").nth(1).inputValue(), "Externally saved prompt");

  await page.locator('.activity-builder-sidebar button').filter({ hasText: "Read-only" }).first().click();
  await page.getByText("Read-only canonical activity", { exact: true }).waitFor();
  assert.equal(await page.locator('.b2-hosted-open-response-editor').count(), 0);
  process.stdout.write(`Hosted Open Response Playwright acceptance passed at revision ${revision}.\n`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
