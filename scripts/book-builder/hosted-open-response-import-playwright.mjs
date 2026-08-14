import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createBuilderOpenResponseImportHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-open-response-import.js";
import { createUltimateB2HostedOpenResponseSeed } from "../../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { findStudentsBookImplementation } from "../../src/data/ultimate-b2/studentsBookCatalog.js";
import { task6SourceBundle } from "../../tests/fixtures/open-response-task6.js";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const activityId = "ultimate-b2-sb-u2-p1-o1";
const actorId = "10000000-0000-4000-8000-000000000001";
const hotspots = JSON.parse(await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8"));
const mime = { ".css": "text/css", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
const textStates = new Map();
const sessions = new Map();
let currentImport = null;
let forceConflict = false;
let origin = "";

function json(response, statusCode, value, headers = {}) { const body = Buffer.from(JSON.stringify(value)); response.writeHead(statusCode, { "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "application/json", ...headers }); response.end(body); }
async function requestBytes(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks); }
async function staticResponse(root, pathname, response) { const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, ""); let file = path.resolve(root, relative); let details = file.startsWith(`${root}${path.sep}`) ? await stat(file).catch(() => null) : null; if (!details?.isFile()) { file = path.join(root, "index.html"); details = await stat(file); } response.writeHead(200, { "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-store", "Content-Length": details.size, "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" }); createReadStream(file).pipe(response); }

class BrowserMemoryStorage {
  objects = new Map();
  uploadTokens = new Map();
  key(profile, objectKey) { return `${profile}:${objectKey}`; }
  async signedPutUrl(input) { const token = crypto.randomUUID(); this.uploadTokens.set(token, input); return { url: `${origin}/object-upload/${token}`, headers: { "Content-Type": input.contentType }, expiresIn: input.ttlSeconds }; }
  async head({ profile, objectKey }) { const item = this.objects.get(this.key(profile, objectKey)); if (!item) throw Object.assign(new Error("NotFound"), { name: "NotFound", $metadata: { httpStatusCode: 404 } }); return { byteSize: item.body.length, contentType: item.contentType, checksumSha256: item.checksumSha256 || null }; }
  async download({ profile, objectKey }) { return Buffer.from(this.objects.get(this.key(profile, objectKey)).body); }
  async upload(input) { const key = this.key(input.profile, input.objectKey); if (this.objects.has(key)) return { ...(await this.head(input)), reused: true }; this.objects.set(key, { body: Buffer.from(input.body), contentType: input.contentType, checksumSha256: input.checksumSha256 }); return { ...(await this.head(input)), reused: false }; }
  async delete({ profile, objectKey }) { this.objects.delete(this.key(profile, objectKey)); }
  publicUrl(objectKey) { return `${origin}/public-object/${encodeURIComponent(objectKey)}`; }
}
const storage = new BrowserMemoryStorage();

const importHandler = createBuilderOpenResponseImportHandler({
  getDatabase: () => ({}), authorize: async () => ({ builderUser: { id: actorId, role: "developer", status: "active" } }), storage: () => storage,
  prepare: async (_sql, input) => {
    if ((currentImport?.revision || 0) !== input.expectedRevision) return { outcome: "revision_conflict", currentRevision: currentImport?.revision || 0 };
    const existing = [...sessions.values()].find((session) => session.clientMutationId === input.clientMutationId);
    if (existing) return { outcome: "idempotent", uploadId: existing.uploadId, currentRevision: currentImport?.revision || 0, state: existing.state, fileDescriptors: existing.fileDescriptors };
    sessions.set(input.uploadId, { ...input, state: "prepared" });
    return { outcome: "prepared", uploadId: input.uploadId, currentRevision: currentImport?.revision || 0, state: "prepared", fileDescriptors: input.fileDescriptors };
  },
  claim: async (_sql, input) => {
    const session = sessions.get(input.uploadId);
    if (!session || session.clientMutationId !== input.clientMutationId) return { outcome: "session_not_found" };
    if ((currentImport?.revision || 0) !== input.expectedRevision) return { outcome: "revision_conflict", currentRevision: currentImport?.revision || 0 };
    session.state = "finalizing";
    return { outcome: "claimed", currentRevision: input.expectedRevision, state: session.state, activityId: session.activityId, fileDescriptors: session.fileDescriptors };
  },
  commit: async (_sql, input) => {
    if (forceConflict) { forceConflict = false; currentImport = { ...currentImport, revision: currentImport.revision + 1 }; return { outcome: "revision_conflict", currentRevision: currentImport.revision }; }
    currentImport = { revision: input.expectedRevision + 1, fingerprint: input.fingerprint, publicProjection: input.publicProjection, teacherProjection: input.teacherProjection, updatedAt: new Date().toISOString() };
    sessions.get(input.uploadId).state = "succeeded";
    return { outcome: "saved", revision: currentImport.revision, currentRevision: currentImport.revision, fingerprint: input.fingerprint };
  },
  fail: async (_sql, input) => { const session = sessions.get(input.uploadId); if (session) session.state = "failed"; },
  loadCurrent: async () => currentImport,
  logger: { error() {} },
});

function contentEnvelope(activity, state) { return { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "open-response", documentKey: activity.stableNormalizedId, schemaVersion: "1.0", revision: state?.revision || 0, source: state ? "database" : "repository", document: state?.document || createUltimateB2HostedOpenResponseSeed(activity) }; }

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/builder/api/auth" && url.searchParams.get("action") === "me") return json(response, 200, { authenticated: true, builderUser: { id: actorId, full_name: "Task 6 Browser", role: "developer", status: "active" } });
  if (url.pathname === "/test/force-conflict" && request.method === "POST") { forceConflict = true; return json(response, 200, { ok: true }); }
  if (url.pathname.startsWith("/object-upload/") && request.method === "PUT") { const token = url.pathname.split("/").at(-1); const authorization = storage.uploadTokens.get(token); if (!authorization) return json(response, 403, { error: "invalid_upload_token" }); const body = await requestBytes(request); storage.objects.set(storage.key("private", authorization.objectKey), { body, contentType: request.headers["content-type"] || "application/octet-stream" }); storage.uploadTokens.delete(token); response.writeHead(200).end(); return; }
  const contentMatch = url.pathname.match(/\/builder\/api\/content\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/open-response\/([a-z0-9-]+)$/);
  if (contentMatch) {
    const activity = findStudentsBookImplementation(contentMatch[1]); if (!activity) return json(response, 404, { error: "not_found" });
    const current = textStates.get(contentMatch[1]);
    if (request.method === "GET") return json(response, 200, contentEnvelope(activity, current));
    const body = JSON.parse((await requestBytes(request)).toString("utf8"));
    if ((current?.revision || 0) !== body.expectedRevision) return json(response, 409, { error: "revision_conflict", currentRevision: current?.revision || 0 });
    const next = { revision: (current?.revision || 0) + 1, document: body.document, mutationId: body.clientMutationId }; textStates.set(contentMatch[1], next);
    return json(response, 200, { ...contentEnvelope(activity, next), currentRevision: next.revision, idempotent: false });
  }
  if (url.pathname.startsWith("/builder/api/open-response-import/")) {
    if (url.pathname.endsWith("/finalize")) await new Promise((resolve) => setTimeout(resolve, 700));
    const bytes = await requestBytes(request);
    const result = await importHandler({ httpMethod: request.method, path: url.pathname, headers: request.headers, body: bytes.toString("utf8") });
    response.writeHead(result.statusCode, result.headers || {}); response.end(result.body || ""); return;
  }
  return staticResponse(builderRoot, url.pathname, response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
origin = `http://127.0.0.1:${server.address().port}`;

const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "hhplms-task6-browser-"));
async function writeBundle(bundle, suffix = "") { const entries = []; for (const file of bundle) { const target = path.join(fixtureDirectory, `${suffix}${file.name}`); await writeFile(target, file.bytes); entries.push({ name: file.name, mimeType: mime[path.extname(file.name)] || "application/xml", buffer: file.bytes }); } return entries; }

let browser;
try {
  const goodFiles = await writeBundle(await task6SourceBundle());
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "hotspots", schemaVersion: "1.0", revision: 1, source: "database", document: hotspots }) });
    const textMatch = url.pathname.match(/\/preview\/content\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/open-response\/([a-z0-9-]+)$/);
    if (textMatch) { const activity = findStudentsBookImplementation(textMatch[1]); const state = textStates.get(textMatch[1]); return state ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(contentEnvelope(activity, state)) }) : route.fulfill({ status: 404, contentType: "application/json", body: "{}" }); }
    if (url.pathname === `/preview/open-response-import/${activityId}`) return currentImport ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ activityId, revision: currentImport.revision, fingerprint: currentImport.fingerprint, document: currentImport.publicProjection }) }) : route.fulfill({ status: 404, body: "{}" });
    if (url.pathname === `/preview/open-response-teacher/${activityId}`) return currentImport ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ activityId, revision: currentImport.revision, fingerprint: currentImport.fingerprint, document: currentImport.teacherProjection }) }) : route.fulfill({ status: 404, body: "{}" });
    const assetMatch = url.pathname.match(/\/preview\/open-response-assets\/([a-f0-9]{64})\.(png|jpg|webp)$/); if (assetMatch) { const item = [...storage.objects.entries()].find(([key]) => key.startsWith("public:") && key.endsWith(`${assetMatch[1]}.${assetMatch[2]}`))?.[1]; return item ? route.fulfill({ status: 200, contentType: item.contentType, body: item.body }) : route.fulfill({ status: 404, body: "" }); }
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, ""); let file = path.resolve(viewerRoot, relative); let details = file.startsWith(`${viewerRoot}${path.sep}`) ? await stat(file).catch(() => null) : null; if (!details?.isFile()) file = path.join(viewerRoot, "index.html"); return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || "application/octet-stream", body: await readFile(file) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(45_000);
  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/activities`, { waitUntil: "domcontentloaded" });
  const activityTitle = findStudentsBookImplementation(activityId).title;
  const targetActivityButton = () => page.locator(".activity-builder-sidebar section")
    .filter({ has: page.getByRole("heading", { name: "Unit 2", exact: true }) })
    .locator("button")
    .filter({ hasText: activityTitle });
  await targetActivityButton().click();
  let editor = page.locator(".b2-hosted-open-response-editor"); await editor.getByText("Import revision 0", { exact: true }).waitFor();
  const frame = () => page.frameLocator('iframe[title^="Canonical Viewer activity preview"]');
  await editor.locator('input[type="file"]').setInputFiles(goodFiles);
  await editor.getByRole("button", { name: "Upload and import publisher source" }).click();
  await editor.getByText("Validating and finalizing…", { exact: true }).waitFor();
  assert.equal(await frame().getByText("Imported question 1?", { exact: false }).count(), 0, "Viewer changed before commit");
  await editor.getByText("Import committed. The canonical Teacher Review Viewer has refreshed.").waitFor();
  await frame().getByText("Imported question 1?", { exact: false }).waitFor();
  await frame().locator("img.legacy-unit-opener-artwork").waitFor();
  await frame().getByRole("button", { name: "Show model response for question 1" }).click();
  await frame().getByText("Imported model 1.1", { exact: false }).waitFor();
  const fingerprint = currentImport.fingerprint;
  await page.reload({ waitUntil: "domcontentloaded" });
  await targetActivityButton().click();
  editor = page.locator(".b2-hosted-open-response-editor"); await editor.getByText("Import revision 1", { exact: true }).waitFor(); await editor.getByText(fingerprint, { exact: true }).waitFor();
  await editor.getByRole("button", { name: "Edit public authoring" }).click();
  await editor.locator("textarea").nth(1).fill("Task 5 overlay after import");
  assert.equal(await frame().getByText("Task 5 overlay after import", { exact: false }).count(), 0);
  await editor.getByRole("button", { name: "Save draft" }).click();
  await frame().getByText("Task 5 overlay after import", { exact: false }).waitFor();
  await frame().locator("img.legacy-unit-opener-artwork").waitFor();
  const invalidXml = await task6SourceBundle({ primary: { forbidden: "<!DOCTYPE params [<!ENTITY x 'unsafe'>]>" } });
  await editor.locator('input[type="file"]').setInputFiles(await writeBundle(invalidXml, "invalid-"));
  await editor.getByRole("button", { name: "Upload and import publisher source" }).click(); await editor.locator('[role="alert"]').filter({ hasText: "xml_security_rejected" }).waitFor();
  assert.equal(currentImport.fingerprint, fingerprint);
  await editor.locator('input[type="file"]').setInputFiles(goodFiles.slice(0, 2)); await editor.getByRole("button", { name: "Upload and import publisher source" }).click(); await editor.locator('[role="alert"]').filter({ hasText: "referenced_raster_missing" }).waitFor();
  const corrupt = goodFiles.map((file) => file.name === "image_1.png" ? { ...file, buffer: Buffer.alloc(file.buffer.length) } : file); await editor.locator('input[type="file"]').setInputFiles(corrupt); await editor.getByRole("button", { name: "Upload and import publisher source" }).click(); await editor.locator('[role="alert"]').filter({ hasText: "invalid_raster" }).waitFor();
  await page.request.post(`${origin}/test/force-conflict`); await editor.locator('input[type="file"]').setInputFiles(goodFiles); await editor.getByRole("button", { name: "Upload and import publisher source" }).click(); await editor.locator('[role="alert"]').filter({ hasText: "newer publisher-source revision" }).waitFor();
  await page.locator(".activity-builder-sidebar button").filter({ hasText: "Read-only" }).first().click(); await page.getByText("Read-only canonical activity", { exact: true }).waitFor(); assert.equal(await page.locator(".b2-hosted-source-import").count(), 0);
  process.stdout.write(`Task 6 hosted Open Response browser acceptance passed for ${activityId} at fingerprint ${fingerprint}.\n`);
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(fixtureDirectory, { recursive: true, force: true });
}
