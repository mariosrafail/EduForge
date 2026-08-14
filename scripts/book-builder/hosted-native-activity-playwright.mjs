import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createUltimateB2HostedOpenResponseSeed } from "../../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { findStudentsBookImplementation } from "../../src/data/ultimate-b2/studentsBookCatalog.js";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const contentRoot = "/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book";
const nativeCreatePath = "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/create";
const previewToken = `v1.${Buffer.from('{"fixture":true}').toString("base64url")}.${"a".repeat(43)}`;
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const nativeDocuments = new Map();
let indexRevision = 0;
let nativeIndex = { schemaVersion: "1.0", activities: [] };
const requestedPaths = [];

function json(response, statusCode, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, { "Cache-Control": "no-store", "Content-Length": bytes.length, "Content-Type": "application/json" });
  response.end(bytes);
}

async function requestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function envelope(resource, documentKey, revision, document) {
  return { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource, documentKey, schemaVersion: "1.0", revision, source: revision ? "database" : "repository", document };
}

function nativeDocument(activityId, kind, pageId, title) {
  return {
    schemaVersion: "1.0",
    activityId,
    kind,
    metadata: { title, visibleInstructionText: "" },
    placement: { pageId },
    assets: [],
    parts: [{ id: "part-1", interaction: kind === "open-response"
      ? { kind, surface: { width: 1024, height: 582 }, artwork: [], questions: [] }
      : { kind, image: null, altText: "" } }],
  };
}

async function staticResponse(pathname, response) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  let file = path.resolve(builderRoot, relative);
  let details = file.startsWith(`${builderRoot}${path.sep}`) ? await stat(file).catch(() => null) : null;
  if (!details?.isFile()) { file = path.join(builderRoot, "index.html"); details = await stat(file); }
  response.writeHead(200, { "Content-Length": details.size, "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" });
  createReadStream(file).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  requestedPaths.push(url.pathname);
  if (url.pathname === "/builder/api/auth" && url.searchParams.get("action") === "me") return json(response, 200, { authenticated: true, builderUser: { id: "phase-2-browser", full_name: "Phase 2 Browser", role: "developer", status: "active" } });
  if (url.pathname === "/builder/api/preview-authorization" && request.method === "POST") return json(response, 200, { token: previewToken, expiresAt: "2099-01-01T00:00:00.000Z" });
  if (url.pathname === `${contentRoot}/native-activity-index` && request.method === "GET") return json(response, 200, envelope("native-activity-index", "default", indexRevision, nativeIndex));
  if (url.pathname === nativeCreatePath && request.method === "POST") {
    const body = await requestJson(request);
    const activityId = `ultimate-b2-sb-u1-p1-o${90 + nativeIndex.activities.length}`;
    const title = body.title.trim() || `New ${body.kind === "image" ? "Image" : "Open Response"}`;
    const document = nativeDocument(activityId, body.kind, body.pageId, title);
    nativeDocuments.set(activityId, { revision: 1, document });
    indexRevision += 1;
    nativeIndex = { schemaVersion: "1.0", activities: [...nativeIndex.activities, { activityId, kind: body.kind, placement: { pageId: body.pageId }, sortOrder: indexRevision }] };
    return json(response, 200, { outcome: "created", activityId, indexRevision, publicRevision: 1, teacherRevision: 1, kind: body.kind, placement: { pageId: body.pageId }, idempotent: false });
  }
  const nativeMatch = url.pathname.match(new RegExp(`^${contentRoot}/native-activity-public/([a-z0-9-]+)$`));
  if (nativeMatch) {
    const state = nativeDocuments.get(nativeMatch[1]);
    if (!state) return json(response, 404, { error: "builder_resource_not_found" });
    if (request.method === "GET") return json(response, 200, envelope("native-activity-public", nativeMatch[1], state.revision, state.document));
    const body = await requestJson(request);
    if (body.expectedRevision !== state.revision) return json(response, 409, { error: "revision_conflict", currentRevision: state.revision });
    state.revision += 1; state.document = structuredClone(body.document);
    return json(response, 200, { ...envelope("native-activity-public", nativeMatch[1], state.revision, state.document), currentRevision: state.revision, idempotent: false });
  }
  const canonicalMatch = url.pathname.match(new RegExp(`^${contentRoot}/open-response/([a-z0-9-]+)$`));
  if (canonicalMatch && request.method === "GET") {
    const activity = findStudentsBookImplementation(canonicalMatch[1]);
    if (!activity) return json(response, 404, { error: "builder_resource_not_found" });
    return json(response, 200, envelope("open-response", canonicalMatch[1], 0, createUltimateB2HostedOpenResponseSeed(activity)));
  }
  if (url.pathname.startsWith("/builder/api/open-response-import/status/") && request.method === "GET") return json(response, 200, { activityId: url.pathname.split("/").at(-1), revision: 0, fingerprint: null, updatedAt: null });
  return staticResponse(url.pathname, response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/" || url.pathname.endsWith(".html")) return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Viewer fixture</title>" });
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/activities`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add Activity" }).waitFor();
  await page.locator(".b2-hosted-open-response-editor").waitFor();

  await page.getByRole("button", { name: "Add Activity" }).click();
  await page.getByLabel("Activity kind").selectOption("open-response");
  await page.getByLabel("Initial title (optional)").fill("Browser native response");
  await page.getByRole("button", { name: "Create native draft" }).click();
  const openResponseId = "ultimate-b2-sb-u1-p1-o90";
  await page.getByRole("heading", { name: "Browser native response" }).waitFor();
  await page.getByText(openResponseId, { exact: true }).first().waitFor();
  await page.getByText("Part 1", { exact: true }).waitFor();
  await page.getByText("Native Open Response content editing arrives in Phase 3.", { exact: true }).waitFor();
  await page.getByText("Native draft · not included in publication v1", { exact: true }).waitFor();
  await page.getByLabel("Activity title").fill("Persisted browser response");
  await page.getByLabel("Visible instruction").fill("Respond in complete sentences.");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await page.getByText("Draft saved.", { exact: true }).waitFor();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: new RegExp(openResponseId) }).click();
  assert.equal(await page.getByLabel("Activity title").inputValue(), "Persisted browser response");
  assert.equal(await page.getByLabel("Visible instruction").inputValue(), "Respond in complete sentences.");
  await page.getByRole("button", { name: "Add Activity" }).click();
  await page.getByLabel("Activity kind").selectOption("image");
  await page.getByRole("button", { name: "Create native draft" }).click();
  const imageId = "ultimate-b2-sb-u1-p1-o91";
  await page.getByText(imageId, { exact: true }).first().waitFor();
  await page.getByText("Native Image content editing arrives in Phase 4.", { exact: true }).waitFor();
  assert.notEqual(imageId, openResponseId);
  assert.equal(requestedPaths.some((value) => /xml|iwb|import\/prepare/i.test(value)), false);
  process.stdout.write(`Hosted native activity Playwright acceptance passed for ${openResponseId} and ${imageId}.\n`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
