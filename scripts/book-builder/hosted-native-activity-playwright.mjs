import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import sharp from "sharp";
import { VIEWER_EXIT_FULLSCREEN_MESSAGE } from "../../src/shared/viewerPresentationProtocol.js";
import { createEmptyHostedTeacherUiDocument } from "../../src/data/ultimate-b2/hostedTeacherUiDocument.js";
import { createUltimateB2HostedOpenResponseSeed } from "../../src/data/ultimate-b2/hostedOpenResponseDraft.js";
import { findStudentsBookImplementation } from "../../src/data/ultimate-b2/studentsBookCatalog.js";
import repositoryHotspots from "../../src/data/ultimate-b2/authoring/studentsBookHotspots.json" with { type: "json" };
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const contentRoot = "/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book";
const nativeRoot = "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book";
const previewToken = `v2.${Buffer.from('{"fixture":true}').toString("base64url")}.${"a".repeat(43)}`;
const publicationRoot = "/builder/api/publication/books/ultimate-b2/components/ultimate-b2-students-book";
const mime = { ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const onePixelPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFgAI/ScL4WQAAAABJRU5ErkJggg==", "base64");
const secondPixelPng = Buffer.concat([onePixelPng, Buffer.from([0])]);
const tallReadablePng = await sharp({ create: { width: 1000, height: 1800, channels: 4, background: { r: 247, g: 244, b: 232, alpha: 1 } } }).png().toBuffer();
const replacementTallReadablePng = Buffer.concat([tallReadablePng, Buffer.from([0])]);
const nativeDocuments = new Map(); const nativeAssets = new Map(); const nativeUploads = new Map(); const nativeAssetByContent = new Map(); const requestedPaths = []; const viewerRequests = []; const authorizationIntents = [];
let indexRevision = 0; let nativeIndex = { schemaVersion: "1.0", activities: [] }; let origin = "";
let hotspotRevision = 0; let hotspotManifest = structuredClone(repositoryHotspots);
let uploadSequence = 10;
const legacyActivityId = "ultimate-b2-sb-u1-p1-o89";

function json(response, statusCode, value) { const bytes = Buffer.from(JSON.stringify(value)); response.writeHead(statusCode, { "Cache-Control": "no-store", "Content-Length": bytes.length, "Content-Type": "application/json" }); response.end(bytes); }
async function requestBytes(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks); }
async function requestJson(request) { return JSON.parse((await requestBytes(request)).toString("utf8")); }
function envelope(resource, documentKey, revision, document) { return { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource, documentKey, schemaVersion: "1.0", revision, source: revision ? "database" : "repository", document }; }

async function verifyReadableTextStartsOffAndBlocksIncompleteSave(page) {
  const toggle = page.getByRole("switch", { name: "Readable Text" });
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
  await toggle.click();
  await page.getByText("Upload a readable-text image.", { exact: true }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), true);
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
}

async function uploadReadableText(page, buffer, name, altText) {
  const toggle = page.getByRole("switch", { name: "Readable Text" });
  if (await toggle.getAttribute("aria-checked") === "false") await toggle.click();
  await page.locator(".native-readable-text-editor input[type=file]").setInputFiles({ name, mimeType: "image/png", buffer });
  await page.locator(".native-readable-text-editor img").waitFor();
  await page.getByText(/^1000 . 1800px$/).waitFor();
  await page.getByLabel("Accessibility label").fill(altText);
}

function nativeDocumentPair(activityId, kind, pageId, title) {
  const interaction = kind === "open-response" ? { kind, surface: { width: 1024, height: 582 }, artwork: [], questions: [] }
    : kind === "image" ? { kind, surface: { width: 1024, height: 582 }, images: [] }
      : { kind, questions: [] };
  const solution = kind === "open-response" ? { kind, modelAnswers: [] } : kind === "single-choice" ? { kind, correctAnswers: [] } : { kind };
  const publicDocument = { schemaVersion: "1.0", activityId, kind, metadata: { title, visibleInstructionText: "" }, placement: { pageId }, assets: [], parts: [{ id: "part-1", interaction }] };
  const teacherDocument = { schemaVersion: "1.0", activityId, kind, parts: [{ id: "part-1", solution }] };
  return { publicRevision: 1, teacherRevision: 1, publicDocument, teacherDocument };
}

const legacyPair = nativeDocumentPair(legacyActivityId, "open-response", "ub2-sb-unit-1-part-1", "Legacy checksum fixture");
const legacyAssetId = "10000000-0000-4000-8000-000000000009";
legacyPair.publicDocument.assets = [{ assetId: legacyAssetId, checksumSha256: "9".repeat(64), role: "activity_artwork", slot: "legacy-background" }];
legacyPair.publicDocument.parts[0].interaction.artwork = [{ id: `art-${"9".repeat(32)}`, assetSlot: "legacy-background", area: { x: 0, y: 0, width: 1024, height: 582 }, order: 0, altText: "Legacy background", decorative: false, fit: "cover" }];
nativeDocuments.set(legacyActivityId, legacyPair);
nativeAssets.set(legacyAssetId, { activityId: legacyActivityId, slot: "legacy-background", bytes: onePixelPng });
indexRevision = 1;
nativeIndex = { schemaVersion: "1.0", activities: [{ activityId: legacyActivityId, kind: "open-response", placement: { pageId: "ub2-sb-unit-1-part-1" }, sortOrder: 1 }] };

async function staticResponse(pathname, response) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, ""); let file = path.resolve(builderRoot, relative);
  let details = file.startsWith(`${builderRoot}${path.sep}`) ? await stat(file).catch(() => null) : null;
  if (!details?.isFile()) { file = path.join(builderRoot, "index.html"); details = await stat(file); }
  response.writeHead(200, { "Content-Length": details.size, "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream" }); createReadStream(file).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1"); requestedPaths.push(url.pathname);
  if (url.pathname === "/builder/api/auth" && url.searchParams.get("action") === "me") return json(response, 200, { authenticated: true, builderUser: { id: "phase-3-browser", full_name: "Phase 3 Browser", role: "developer", status: "active" } });
  if (url.pathname === "/builder/api/preview-authorization" && request.method === "POST") { authorizationIntents.push(await requestJson(request)); return json(response, 200, { token: previewToken, expiresAt: "2099-01-01T00:00:00.000Z" }); }
  if (url.pathname === `${contentRoot}/hotspots` && request.method === "GET") return json(response, 200, envelope("hotspots", "default", hotspotRevision, hotspotManifest));
  if (url.pathname === `${contentRoot}/hotspots` && request.method === "PUT") { const body = await requestJson(request); hotspotRevision += 1; hotspotManifest = structuredClone(body.document); return json(response, 200, { ...envelope("hotspots", "default", hotspotRevision, hotspotManifest), currentRevision: hotspotRevision, idempotent: false }); }
  if (url.pathname === `${contentRoot}/ui-controller` && request.method === "GET") return json(response, 200, envelope("ui-controller", "default", 0, createEmptyHostedTeacherUiDocument()));
  if (url.pathname === publicationRoot && request.method === "GET") return json(response, 200, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", compilerId: "ultimate-b2-students-book-v2", releaseSchemaVersion: "2.0", currentSourceSha256: "1".repeat(64), headRevision: 0, published: null, releases: [] });
  if (url.pathname === `${contentRoot}/native-activity-index` && request.method === "GET") return json(response, 200, envelope("native-activity-index", "default", indexRevision, nativeIndex));
  if (url.pathname === `${nativeRoot}/catalog` && request.method === "GET") return json(response, 200, { schemaVersion: "1.0", activities: nativeIndex.activities.map((entry) => ({ ...entry, title: nativeDocuments.get(entry.activityId)?.publicDocument.metadata.title || entry.activityId, ready: true, issues: [] })) });
  if (url.pathname === `${nativeRoot}/create` && request.method === "POST") {
    const body = await requestJson(request); const activityId = `ultimate-b2-sb-u1-p1-o${89 + nativeIndex.activities.length}`; const title = body.title.trim() || `New ${body.kind === "image" ? "Image" : body.kind === "single-choice" ? "Multiple Choice" : "Open Response"}`;
    nativeDocuments.set(activityId, nativeDocumentPair(activityId, body.kind, body.pageId, title)); indexRevision += 1;
    nativeIndex = { schemaVersion: "1.0", activities: [...nativeIndex.activities, { activityId, kind: body.kind, placement: { pageId: body.pageId }, sortOrder: indexRevision }] };
    return json(response, 200, { outcome: "created", activityId, indexRevision, publicRevision: 1, teacherRevision: 1, kind: body.kind, placement: { pageId: body.pageId }, idempotent: false });
  }
  const nativeMatch = url.pathname.match(new RegExp(`^${contentRoot}/native-activity-(public|teacher)/([a-z0-9-]+)$`));
  if (nativeMatch) {
    const state = nativeDocuments.get(nativeMatch[2]); if (!state) return json(response, 404, { error: "builder_resource_not_found" });
    if (request.method === "GET") return json(response, 200, envelope(`native-activity-${nativeMatch[1]}`, nativeMatch[2], state[`${nativeMatch[1]}Revision`], state[`${nativeMatch[1]}Document`]));
    if (request.method === "PUT" && nativeMatch[1] === "public" && state.publicDocument.kind === "image") { const body = await requestJson(request); if (body.expectedRevision !== state.publicRevision) return json(response, 409, { error: "revision_conflict", currentRevision: state.publicRevision }); state.publicRevision += 1; state.publicDocument = structuredClone(body.document); return json(response, 200, { ...envelope("native-activity-public", nativeMatch[2], state.publicRevision, state.publicDocument), currentRevision: state.publicRevision, idempotent: false }); }
    return json(response, 405, { error: "method_not_allowed" });
  }
  const pairMatch = url.pathname.match(new RegExp(`^${nativeRoot}/activities/([a-z0-9-]+)/save$`));
  if (pairMatch && request.method === "POST") {
    const state = nativeDocuments.get(pairMatch[1]); const body = await requestJson(request);
    if (body.expectedPublicRevision !== state.publicRevision || body.expectedTeacherRevision !== state.teacherRevision) return json(response, 409, { error: "revision_conflict", currentPublicRevision: state.publicRevision, currentTeacherRevision: state.teacherRevision });
    state.publicRevision += 1; state.teacherRevision += 1; state.publicDocument = structuredClone(body.publicDocument); state.teacherDocument = structuredClone(body.teacherDocument);
    return json(response, 200, { activityId: pairMatch[1], publicRevision: state.publicRevision, teacherRevision: state.teacherRevision, publicDocument: state.publicDocument, teacherDocument: state.teacherDocument, idempotent: false });
  }
  const prepareMatch = url.pathname.match(new RegExp(`^${nativeRoot}/activities/([a-z0-9-]+)/assets/prepare$`));
  if (prepareMatch && request.method === "POST") { const body = await requestJson(request); const uploadId = `10000000-0000-4000-8000-${String(uploadSequence++).padStart(12, "0")}`; nativeUploads.set(uploadId, { activityId: prepareMatch[1], slot: body.assetSlot, name: body.name, bytes: null }); return json(response, 200, { uploadId, expiresIn: 900, authorization: { url: `${origin}/fixture-upload/${uploadId}`, headers: { "Content-Type": body.type }, expiresIn: 900 }, idempotent: false }); }
  if (url.pathname.startsWith("/fixture-upload/") && request.method === "PUT") { const upload = nativeUploads.get(url.pathname.split("/").at(-1)); upload.bytes = await requestBytes(request); response.writeHead(200); return response.end(); }
  const finalizeMatch = url.pathname.match(new RegExp(`^${nativeRoot}/activities/([a-z0-9-]+)/assets/finalize$`));
  if (finalizeMatch && request.method === "POST") {
    const body = await requestJson(request); const upload = nativeUploads.get(body.uploadId); const checksumSha256 = createHash("sha256").update(upload.bytes).digest("hex"); const contentIdentity = `${upload.activityId}:${checksumSha256}`;
    let assetId = nativeAssetByContent.get(contentIdentity); let asset = assetId ? nativeAssets.get(assetId) : null;
    if (!asset) { assetId = `10000000-0000-4000-8000-${String(uploadSequence++).padStart(12, "0")}`; asset = { ...upload, checksumSha256 }; nativeAssets.set(assetId, asset); nativeAssetByContent.set(contentIdentity, assetId); }
    const dimensions = upload.name.startsWith("readable-") ? { width: 1000, height: 1800 } : { width: 1200, height: 800 };
    return json(response, 200, { reference: { assetId, checksumSha256, role: "activity_artwork", slot: asset.slot }, previewUrl: `${nativeRoot}/activities/${finalizeMatch[1]}/assets/${assetId}/preview`, metadata: { mimeType: "image/png", byteSize: upload.bytes.length, ...dimensions }, idempotent: false });
  }
  const assetPreviewMatch = url.pathname.match(new RegExp(`^${nativeRoot}/activities/([a-z0-9-]+)/assets/([0-9a-f-]+)/preview$`));
  if (assetPreviewMatch && request.method === "GET") { const bytes = nativeAssets.get(assetPreviewMatch[2])?.bytes || Buffer.alloc(0); response.writeHead(200, { "Content-Type": "image/png", "Content-Length": bytes.length }); return response.end(bytes); }
  const canonicalMatch = url.pathname.match(new RegExp(`^${contentRoot}/open-response/([a-z0-9-]+)$`));
  if (canonicalMatch && request.method === "GET") { const activity = findStudentsBookImplementation(canonicalMatch[1]); if (!activity) return json(response, 404, { error: "builder_resource_not_found" }); return json(response, 200, envelope("open-response", canonicalMatch[1], 0, createUltimateB2HostedOpenResponseSeed(activity))); }
  if (url.pathname.startsWith("/builder/api/open-response-import/status/") && request.method === "GET") return json(response, 200, { activityId: url.pathname.split("/").at(-1), revision: 0, fingerprint: null, updatedAt: null });
  return staticResponse(url.pathname, response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch(localPlaywrightLaunchOptions()); const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    let fullscreenElement = null; let requestCount = 0; let exitCount = 0; let lastRequestedElement = null; let rejectNextRequest = false;
    const signal = () => document.dispatchEvent(new Event("fullscreenchange"));
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { configurable: true, value: async function requestFullscreen() { requestCount += 1; lastRequestedElement = this; if (rejectNextRequest) { rejectNextRequest = false; throw new DOMException("Fullscreen request rejected", "NotAllowedError"); } fullscreenElement = this; signal(); } });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: async () => { exitCount += 1; fullscreenElement = null; signal(); } });
    Object.defineProperty(globalThis, "__hhplmsFullscreenTest", { configurable: true, value: Object.freeze({
      externalExit() { fullscreenElement = null; signal(); },
      rejectNextRequest() { rejectNextRequest = true; },
      snapshot() { return { requestCount, exitCount, requestedTagName: lastRequestedElement?.tagName || null }; },
    }) });
  });
  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const viewerRequest = route.request(); const url = new URL(viewerRequest.url());
    viewerRequests.push({ pathname: url.pathname, search: url.search, headers: viewerRequest.headers(), method: viewerRequest.method() });
    if (url.pathname === "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "hotspots", schemaVersion: "1.0", revision: hotspotRevision, source: hotspotRevision ? "database" : "repository", document: hotspotManifest }) });
    if (url.pathname === "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/ui-controller") return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    const nativePreview = url.pathname.match(/^\/preview\/native-activities\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/activities\/([a-z0-9-]+)\/(public|teacher)$/);
    if (nativePreview) {
      const state = nativeDocuments.get(nativePreview[1]); const audience = nativePreview[2];
      if (!state || (audience === "teacher" && !["open-response", "single-choice"].includes(state.publicDocument.kind))) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      const document = state[`${audience}Document`]; const revision = state[`${audience}Revision`];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activityId: nativePreview[1], kind: state.publicDocument.kind, audience, schemaVersion: "1.0", revision, document }) });
    }
    const nativeAsset = url.pathname.match(/^\/preview\/native-activities\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/activities\/([a-z0-9-]+)\/assets\/([0-9a-f-]+)$/);
    if (nativeAsset) { const asset = nativeAssets.get(nativeAsset[2]); if (!asset || asset.activityId !== nativeAsset[1]) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" }); return route.fulfill({ status: 200, contentType: "image/png", body: asset.bytes }); }
    if (url.pathname.startsWith("/preview/")) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let file = path.resolve(viewerRoot, relative); let details = file.startsWith(`${viewerRoot}${path.sep}`) ? await stat(file).catch(() => null) : null;
    if (!details?.isFile() && viewerRequest.resourceType() === "document") { file = path.join(viewerRoot, "index.html"); details = await stat(file).catch(() => null); }
    if (!details?.isFile()) return route.fulfill({ status: 404, body: "" });
    return route.fulfill({ status: 200, contentType: mime[path.extname(file).toLowerCase()] || "application/octet-stream", body: await readFile(file) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(45_000); await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/activities`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add Activity" }).waitFor(); await page.locator(".b2-hosted-open-response-editor").waitFor();
  const search = page.getByPlaceholder("Search title, type, or ID"); await search.fill("does-not-exist"); await page.getByText("The selected activity is hidden by the current filters.", { exact: false }).waitFor(); assert.equal(await page.locator(".b2-hosted-open-response-editor").count(), 1); await search.fill("");
  await page.getByLabel("Access").selectOption("native"); await page.locator(".activity-navigation-tree > section").waitFor(); assert.equal(await page.locator(".activity-navigation-tree > section").count(), 1); await page.getByLabel("Access").selectOption("all");
  const firstUnitToggle = page.locator(".activity-navigation-tree .activity-tree-toggle").first(); assert.equal(await firstUnitToggle.getAttribute("aria-expanded"), "true"); await firstUnitToggle.click(); assert.equal(await firstUnitToggle.getAttribute("aria-expanded"), "false"); assert.equal(await page.locator(".b2-hosted-open-response-editor").count(), 1); await firstUnitToggle.click();
  assert.equal(await page.getByRole("button", { name: "Review", exact: true }).count(), 1); assert.equal(await page.locator(".unified-builder-review-dialog iframe").count(), 0);
  const firstPageToggle = page.locator(".activity-tree-page .activity-tree-toggle").first(); if (await firstPageToggle.getAttribute("aria-expanded") === "false") await firstPageToggle.click();
  await page.getByRole("button", { name: new RegExp(legacyActivityId) }).click(); await page.getByRole("heading", { name: "Legacy checksum fixture" }).waitFor(); assert.equal(await page.getByText("builder_content_failed", { exact: true }).count(), 0); await page.getByRole("tab", { name: "Layout" }).click(); await page.locator(".native-or-layers button").filter({ hasText: "Legacy background" }).click(); assert.equal(await page.getByLabel("Lock position and size").isChecked(), false);
  await page.getByRole("button", { name: "Add Activity" }).click(); const addDialog = page.getByRole("dialog", { name: "Add activity" }); await addDialog.waitFor(); assert.equal(await addDialog.evaluate((element) => element.contains(document.activeElement)), true); await page.keyboard.press("Escape"); await addDialog.waitFor({ state: "detached" }); assert.equal(await page.getByRole("button", { name: "Add Activity" }).evaluate((element) => element === document.activeElement), true);
  const screenshotRoot = path.resolve("test-results/hosted-builder-ui"); await mkdir(screenshotRoot, { recursive: true }); await page.waitForTimeout(250); await page.screenshot({ path: path.join(screenshotRoot, "activity-builder-1440.png"), fullPage: true });
  await page.getByRole("button", { name: "Add Activity" }).click(); await page.getByRole("radio", { name: /Open Response/ }).check(); await page.getByLabel(/Initial title/).fill("Browser native response"); await page.getByRole("button", { name: "Create activity" }).click();
  const openResponseId = "ultimate-b2-sb-u1-p1-o90"; await page.getByRole("heading", { name: "Browser native response" }).waitFor(); await page.getByText(openResponseId, { exact: true }).first().waitFor(); await page.getByText("Content incomplete", { exact: true }).first().waitFor(); await verifyReadableTextStartsOffAndBlocksIncompleteSave(page);
  await page.getByLabel("Activity title").fill("Persisted browser response"); await page.getByLabel("Visible instruction").fill("Respond in complete sentences.");
  await page.getByRole("button", { name: new RegExp(legacyActivityId) }).click(); await page.getByRole("dialog", { name: "Discard unsaved changes?" }).waitFor(); await page.getByRole("button", { name: "Keep editing" }).click(); assert.equal(await page.getByLabel("Activity title").inputValue(), "Persisted browser response");
  await page.getByRole("button", { name: "Review", exact: true }).click(); await page.getByRole("heading", { name: "Review · Saved Draft", exact: true }).waitFor(); await page.locator(".unified-builder-review-dialog iframe").waitFor(); assert.equal(await page.locator(".unified-builder-review-dialog iframe").count(), 1); assert.equal(await page.getByRole("button", { name: "Fullscreen", exact: true }).count(), 0); await page.getByText("Unsaved changes are not included in Review. Save them first.", { exact: true }).waitFor(); const unsavedViewer = page.frameLocator(".unified-builder-review-dialog iframe"); await unsavedViewer.locator(".native-or-surface").waitFor(); assert.equal(await unsavedViewer.getByText("Browser native response", { exact: true }).count(), 0); assert.equal(await unsavedViewer.getByText("Persisted browser response", { exact: true }).count(), 0); const firstReviewAuthorizationCount = authorizationIntents.length;
  const activityAuthorizationCount = authorizationIntents.length;
  const [activityPlayer] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "Open Player", exact: true }).click(),
  ]);
  await activityPlayer.getByRole("heading", { name: "Player Review", exact: true }).waitFor();
  const activityPlayerUrl = new URL(activityPlayer.url());
  assert.equal(activityPlayerUrl.origin, origin);
  assert.equal(activityPlayerUrl.pathname, "/");
  assert.equal(activityPlayerUrl.search, "");
  assert.match(activityPlayerUrl.hash, /^#\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/review\?view=activity&activityId=ultimate-b2-sb-u1-p1-o90&unitNumber=1&pageId=ub2-sb-unit-1-part-1$/);
  assert.doesNotMatch(activityPlayer.url(), /previewAuthorization|token|secret/i);
  await activityPlayer.locator(".hosted-builder-review-page iframe").waitFor();
  const activityPlayerFrameUrl = new URL(await activityPlayer.locator(".hosted-builder-review-page iframe").getAttribute("src"));
  assert.equal(activityPlayerFrameUrl.origin, "https://hhplms-viewer.netlify.app");
  assert.equal(activityPlayerFrameUrl.searchParams.get("view"), "activity");
  assert.equal(activityPlayerFrameUrl.searchParams.get("activityId"), openResponseId);
  assert.equal(await activityPlayer.locator(".hosted-builder-review-page iframe").getAttribute("referrerpolicy"), "no-referrer");
  assert.equal(await activityPlayer.locator(".hosted-viewer-preview iframe").evaluate((iframe) => iframe.parentElement?.classList.contains("hosted-viewer-preview")), true);
  assert.ok(authorizationIntents.length > activityAuthorizationCount);
  const activityViewer = activityPlayer.frameLocator(".hosted-builder-review-page iframe");
  await activityViewer.locator(".native-or-surface").waitFor();
  assert.equal(await activityViewer.getByRole("button", { name: "Show Text", exact: true }).count(), 0);
  assert.equal(await activityViewer.getByText("Browser native response", { exact: true }).count(), 0);
  await activityViewer.getByRole("button", { name: "Minimize application", exact: true }).waitFor();
  await activityPlayer.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await activityPlayer.getByRole("button", { name: "Exit Fullscreen", exact: true }).waitFor();
  assert.equal(await activityPlayer.getByRole("button", { name: "Exit Fullscreen", exact: true }).getAttribute("aria-pressed"), "true");
  assert.deepEqual(await activityPlayer.evaluate(() => ({
    activeIframe: document.fullscreenElement === document.querySelector(".hosted-viewer-preview iframe"),
    activeWrapper: document.fullscreenElement === document.querySelector(".hosted-viewer-preview"),
    toolbarOutsideFullscreen: !document.fullscreenElement?.contains(document.querySelector(".hosted-viewer-preview > header")),
    statusOutsideFullscreen: !document.fullscreenElement?.contains(document.querySelector(".hosted-viewer-preview-state")),
    ...globalThis.__hhplmsFullscreenTest.snapshot(),
  })), { activeIframe: true, activeWrapper: false, toolbarOutsideFullscreen: true, statusOutsideFullscreen: true, requestCount: 1, exitCount: 0, requestedTagName: "IFRAME" });

  await activityPlayer.evaluate((message) => window.postMessage(message, window.origin), VIEWER_EXIT_FULLSCREEN_MESSAGE);
  await activityPlayer.waitForTimeout(50);
  assert.equal((await activityPlayer.evaluate(() => globalThis.__hhplmsFullscreenTest.snapshot())).exitCount, 0, "top-window sender must be ignored");
  await activityViewer.locator("body").evaluate(() => window.parent.postMessage("HHPLMS_VIEWER_EXIT_FULLSCREEN_WRONG", "*"));
  await activityPlayer.waitForTimeout(50);
  assert.equal((await activityPlayer.evaluate(() => globalThis.__hhplmsFullscreenTest.snapshot())).exitCount, 0, "wrong Viewer message must be ignored");

  await activityViewer.getByRole("button", { name: "Minimize application", exact: true }).click();
  await activityPlayer.getByRole("button", { name: "Fullscreen", exact: true }).waitFor();
  assert.equal((await activityPlayer.evaluate(() => globalThis.__hhplmsFullscreenTest.snapshot())).exitCount, 1);
  assert.equal(await activityPlayer.evaluate(() => document.fullscreenElement), null);
  assert.equal(await activityPlayer.getByRole("heading", { name: "Player Review", exact: true }).count(), 1);

  await activityViewer.getByRole("button", { name: "Minimize application", exact: true }).click();
  await activityPlayer.waitForTimeout(50);
  assert.equal((await activityPlayer.evaluate(() => globalThis.__hhplmsFullscreenTest.snapshot())).exitCount, 1, "valid message outside iframe fullscreen must be ignored");

  await activityPlayer.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await activityPlayer.getByRole("button", { name: "Exit Fullscreen", exact: true }).waitFor();
  await activityPlayer.evaluate(() => globalThis.__hhplmsFullscreenTest.externalExit());
  await activityPlayer.getByRole("button", { name: "Fullscreen", exact: true }).waitFor();
  assert.equal(await activityPlayer.getByRole("button", { name: "Fullscreen", exact: true }).getAttribute("aria-pressed"), "false");
  assert.equal(await activityPlayer.getByRole("button", { name: "Fullscreen", exact: true }).evaluate((element) => element === document.activeElement), true);
  await activityPlayer.evaluate(() => globalThis.__hhplmsFullscreenTest.rejectNextRequest());
  await activityPlayer.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await activityPlayer.getByText("Fullscreen could not be changed.", { exact: true }).waitFor();
  assert.equal(await activityPlayer.getByRole("button", { name: "Fullscreen", exact: true }).getAttribute("aria-pressed"), "false");
  assert.equal(await activityPlayer.locator(".hosted-viewer-preview iframe").count(), 1);
  await activityPlayer.close();
  await page.keyboard.press("Escape"); await page.locator(".unified-builder-review-dialog iframe").waitFor({ state: "detached" }); assert.equal(await page.getByRole("button", { name: "Review", exact: true }).evaluate((element) => element === document.activeElement), true);
  await page.getByRole("button", { name: "Add Question", exact: true }).click(); const firstQuestionId = await page.locator(".native-or-question-workspace aside button").nth(1).locator("code").textContent(); await page.getByLabel("Prompt").fill("First prompt"); await page.getByLabel(/Private model answer/).fill("First private model answer");
  await page.getByRole("button", { name: "Add Question", exact: true }).click(); const secondQuestionId = await page.locator(".native-or-question-workspace aside button").nth(2).locator("code").textContent(); assert.notEqual(firstQuestionId, secondQuestionId); await page.getByLabel("Prompt").fill("Second prompt"); await page.getByLabel(/Private model answer/).fill("Second private model answer"); await page.getByRole("button", { name: "Move Up" }).click();
  await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(openResponseId) }).click(); await uploadReadableText(page, tallReadablePng, "readable-open-response.png", "Open Response readable passage"); assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), false); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); const firstReadableAssetId = nativeDocuments.get(openResponseId).publicDocument.readableText.assetSlot; await uploadReadableText(page, replacementTallReadablePng, "readable-open-response-replacement.png", "Replacement readable passage"); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.notEqual(nativeDocuments.get(openResponseId).publicDocument.readableText.assetSlot, firstReadableAssetId); await page.getByRole("button", { name: "Remove / Disable Readable Text" }).click(); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(Object.hasOwn(nativeDocuments.get(openResponseId).publicDocument, "readableText"), false);
  assert.equal(await page.getByLabel("Activity title").inputValue(), "Persisted browser response"); assert.equal(await page.getByLabel("Visible instruction").inputValue(), "Respond in complete sentences."); assert.equal(await page.locator(".native-or-question-workspace aside button").nth(1).locator("code").textContent(), secondQuestionId);
  await page.getByRole("button", { name: /^Question 1/ }).click(); assert.equal(await page.getByLabel(/Private model answer/).inputValue(), "Second private model answer");
  await page.getByRole("tab", { name: "Layout" }).click(); await page.locator(".native-or-upload input[type=file]").setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: onePixelPng }); await page.getByRole("heading", { name: "Artwork" }).waitFor(); await page.getByLabel("Alt text").fill("A deterministic test diagram"); await page.getByRole("spinbutton", { name: "X", exact: true }).fill("210"); await page.getByRole("spinbutton", { name: "Y", exact: true }).fill("130"); await page.getByRole("button", { name: "Duplicate graphic" }).click(); await page.locator(".native-or-layers button").nth(1).waitFor(); await page.getByLabel("Alt text").fill("Background diagram"); await page.getByRole("spinbutton", { name: "X", exact: true }).fill("0"); await page.getByRole("spinbutton", { name: "Y", exact: true }).fill("0"); await page.getByRole("spinbutton", { name: "Width", exact: true }).fill("1024"); await page.getByRole("spinbutton", { name: "Height", exact: true }).fill("582"); await page.getByRole("button", { name: "Send to Back" }).click(); await page.getByLabel("Lock position and size").check(); assert.equal(await page.getByRole("spinbutton", { name: "X", exact: true }).isDisabled(), true); await page.getByRole("button", { name: "First prompt" }).click(); assert.equal(await page.getByRole("heading", { name: "Prompt" }).count(), 1); await page.locator(".native-or-layers button").filter({ hasText: "Background diagram" }).click(); assert.equal(await page.getByLabel("Alt text").inputValue(), "Background diagram"); await page.waitForTimeout(150); await page.screenshot({ path: path.join(screenshotRoot, "native-open-response-layout-1440.png"), fullPage: true }); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); const canonicalOpenResponseReference = structuredClone(nativeDocuments.get(openResponseId).publicDocument.assets[0]); assert.equal(nativeDocuments.get(openResponseId).publicDocument.assets.length, 1); assert.equal(nativeDocuments.get(openResponseId).publicDocument.parts[0].interaction.artwork.length, 2); assert.equal(new Set(nativeDocuments.get(openResponseId).publicDocument.parts[0].interaction.artwork.map((item) => item.assetSlot)).size, 1); assert.equal(nativeDocuments.get(openResponseId).publicDocument.parts[0].interaction.artwork.find((item) => item.altText === "Background diagram").locked, true); assert.equal(nativeDocuments.get(openResponseId).publicDocument.parts[0].interaction.artwork.find((item) => item.altText === "A deterministic test diagram").locked, false);
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(openResponseId) }).click(); await page.getByRole("tab", { name: "Layout" }).click(); await page.getByRole("button", { name: "Response for question 1" }).click(); assert.equal(await page.getByRole("heading", { name: "Response region" }).count(), 1); await page.locator(".native-or-layers button").filter({ hasText: "Background diagram" }).click(); assert.equal(await page.getByLabel("Lock position and size").isChecked(), true); await page.getByLabel("Lock position and size").uncheck(); await page.getByRole("spinbutton", { name: "Width", exact: true }).fill("800"); await page.getByRole("spinbutton", { name: "X", exact: true }).fill("220"); assert.equal(await page.getByRole("spinbutton", { name: "X", exact: true }).inputValue(), "220"); await page.getByLabel("Lock position and size").check(); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Local Preview" }).click(); await page.getByRole("button", { name: "Student Preview" }).click(); const secondResponse = page.getByLabel("Response for question 2"); const firstResponse = page.getByLabel("Response for question 1"); await secondResponse.fill("Student line one\nStudent line two"); await firstResponse.fill("Another local response"); assert.equal(await page.getByText("Draft saved.", { exact: true }).count(), 1); assert.equal(await page.getByText("Second private model answer", { exact: true }).count(), 0); await page.getByRole("button", { name: "Teacher Preview" }).click(); assert.equal(await page.getByText("Second private model answer", { exact: true }).count(), 0); const revealSecond = page.getByRole("button", { name: /Reveal model answer for Response for question 2/ }); await revealSecond.evaluate((button) => button.click()); assert.equal(await page.getByRole("button", { name: /Hide model answer for Response for question 2/ }).getAttribute("aria-pressed"), "true"); assert.equal(await page.getByText("Second private model answer", { exact: true }).count(), 1); assert.equal(await page.getByText("First private model answer", { exact: true }).count(), 0); await page.getByRole("button", { name: "Student Preview" }).click(); assert.equal(await secondResponse.inputValue(), "Student line one\nStudent line two"); assert.equal(await page.getByText("Second private model answer", { exact: true }).count(), 0);
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(openResponseId) }).click(); await page.getByRole("tab", { name: "Local Preview" }).click(); assert.equal(await page.getByLabel("Response for question 2").inputValue(), ""); await page.getByRole("tab", { name: "Content" }).click(); await page.getByRole("button", { name: /^Question 1/ }).click(); page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Delete Question" }).click(); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(openResponseId).teacherDocument.parts[0].solution.modelAnswers.some((item) => item.questionId === secondQuestionId), false); await page.getByRole("tab", { name: "Layout" }).click(); await page.locator(".native-or-layers button").filter({ hasText: "Background diagram" }).click(); page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Remove graphic" }).click(); assert.equal(await page.locator(".native-or-artwork img").count(), 1); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(openResponseId).publicDocument.assets.length, 1); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(openResponseId) }).click(); await page.getByRole("tab", { name: "Layout" }).click(); await page.locator(".native-or-layers button").filter({ hasText: "A deterministic test diagram" }).click(); page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Remove graphic" }).click(); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(openResponseId).publicDocument.assets.length, 0); await page.locator(".native-or-upload input[type=file]").setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: onePixelPng }); await page.getByRole("heading", { name: "Artwork" }).waitFor(); await page.getByLabel("Alt text").fill("Reintroduced diagram"); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.deepEqual(nativeDocuments.get(openResponseId).publicDocument.assets[0], canonicalOpenResponseReference); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(openResponseId) }).click(); await page.getByRole("tab", { name: "Layout" }).click(); await page.locator(".native-or-artwork img").waitFor(); await page.locator(".native-or-upload input[type=file]").setInputFiles({ name: "fixture.png", mimeType: "image/png", buffer: onePixelPng }); await page.locator(".native-or-layers button").nth(1).waitFor(); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(openResponseId).publicDocument.assets.length, 1); assert.equal(nativeDocuments.get(openResponseId).publicDocument.parts[0].interaction.artwork.length, 2); assert.equal(new Set(nativeDocuments.get(openResponseId).publicDocument.parts[0].interaction.artwork.map((item) => item.assetSlot)).size, 1); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(openResponseId) }).click(); await page.getByRole("tab", { name: "Layout" }).click(); assert.equal(await page.locator(".native-or-artwork img").count(), 2); await uploadReadableText(page, tallReadablePng, "readable-open-response.png", "Open Response readable passage"); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add Activity" }).click(); await page.getByRole("radio", { name: /^Image/ }).check(); await page.getByRole("button", { name: "Create activity" }).click();
  const imageId = "ultimate-b2-sb-u1-p1-o91"; await page.getByText(imageId, { exact: true }).first().waitFor(); await page.getByText("Content incomplete", { exact: true }).first().waitFor(); await verifyReadableTextStartsOffAndBlocksIncompleteSave(page); await page.getByLabel("Activity title").fill("Production image draft"); await page.getByLabel("Visible instruction").fill("Study this image."); await page.getByRole("tab", { name: "Layout" }).click();
  await page.locator(".native-or-upload input[type=file]").setInputFiles({ name: "image.png", mimeType: "image/png", buffer: onePixelPng }); await page.locator(".native-image-surface img").waitFor(); assert.equal(await page.locator(".native-image-surface img").first().evaluate((img) => img.parentElement?.tagName), "BUTTON"); await page.getByLabel("Alt text").fill("A useful diagram"); await page.getByLabel("Fit").selectOption("cover"); await page.getByRole("spinbutton", { name: "X", exact: true }).fill("210"); await page.getByRole("spinbutton", { name: "Y", exact: true }).fill("130");
  await page.locator(".native-or-upload input[type=file]").setInputFiles({ name: "second-image.png", mimeType: "image/png", buffer: secondPixelPng }); await page.locator(".native-or-layers button").nth(1).waitFor(); await page.getByLabel("Alt text").fill("Foreground diagram");
  await page.locator(".native-or-layers button").filter({ hasText: "A useful diagram" }).click(); await page.getByRole("button", { name: "Duplicate image" }).click(); await page.locator(".native-or-layers button").nth(2).waitFor(); await page.getByLabel("Alt text").fill("Background diagram"); await page.getByRole("button", { name: "Send to Back" }).click(); await page.getByLabel("Lock position and size").check(); assert.equal(await page.getByRole("spinbutton", { name: "X", exact: true }).isDisabled(), true);
  await page.locator(".native-or-upload input[type=file]").setInputFiles({ name: "same-image.png", mimeType: "image/png", buffer: onePixelPng }); await page.locator(".native-or-layers button").nth(3).waitFor(); await page.getByLabel("Alt text").fill("Reuploaded diagram"); assert.equal(await page.locator(".native-image-surface img").count(), 4); await uploadReadableText(page, tallReadablePng, "readable-image.png", "Image activity readable passage"); await page.waitForTimeout(150); await page.screenshot({ path: path.join(screenshotRoot, "native-image-layout-1440.png"), fullPage: true }); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(imageId).publicDocument.readableText.sourceHeight, 1800);
  const firstImageReference = structuredClone(nativeDocuments.get(imageId).publicDocument.assets.find((item) => item.checksumSha256 === createHash("sha256").update(onePixelPng).digest("hex"))); assert.equal(nativeDocuments.get(imageId).publicDocument.assets.length, 3); assert.equal(nativeDocuments.get(imageId).publicDocument.parts[0].interaction.images.length, 4); assert.equal(new Set(nativeDocuments.get(imageId).publicDocument.parts[0].interaction.images.map((item) => item.assetSlot)).size, 2);
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(imageId) }).click(); assert.equal(await page.getByLabel("Activity title").inputValue(), "Production image draft"); assert.equal(await page.getByLabel("Visible instruction").inputValue(), "Study this image."); await page.getByRole("tab", { name: "Layout" }).click(); assert.equal(await page.locator(".native-image-surface img").count(), 4); await page.locator(".native-or-layers button").filter({ hasText: "Background diagram" }).click(); assert.equal(await page.getByLabel("Lock position and size").isChecked(), true);
  await page.locator(".native-or-layers button").filter({ hasText: "Reuploaded diagram" }).click(); await page.getByRole("button", { name: "Remove image" }).click(); await page.getByRole("button", { name: "Confirm remove" }).click(); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(imageId).publicDocument.assets.length, 3);
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(imageId) }).click(); await page.getByRole("tab", { name: "Layout" }).click(); assert.equal(await page.locator(".native-image-surface img").count(), 3);
  await page.locator(".native-or-layers button").filter({ hasText: "Background diagram" }).click(); await page.getByRole("button", { name: "Remove image" }).click(); await page.getByRole("button", { name: "Confirm remove" }).click(); await page.locator(".native-or-layers button").filter({ hasText: "A useful diagram" }).click(); await page.getByRole("button", { name: "Remove image" }).click(); await page.getByRole("button", { name: "Confirm remove" }).click(); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(imageId).publicDocument.assets.length, 2); assert.equal(nativeDocuments.get(imageId).publicDocument.parts[0].interaction.images.length, 1);
  await page.locator(".native-or-upload input[type=file]").setInputFiles({ name: "image.png", mimeType: "image/png", buffer: onePixelPng }); await page.getByLabel("Alt text").fill("Restored diagram"); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.deepEqual(nativeDocuments.get(imageId).publicDocument.assets.find((item) => item.slot === firstImageReference.slot), firstImageReference); assert.equal(nativeDocuments.get(imageId).publicDocument.assets.length, 3); assert.equal(nativeDocuments.get(imageId).teacherDocument.parts[0].solution.kind, "image");
  await page.getByRole("button", { name: "Add Activity" }).click(); await page.getByRole("radio", { name: /Multiple Choice/ }).check(); await page.getByLabel(/Initial title/).fill("Browser native multiple choice"); await page.getByRole("button", { name: "Create activity" }).click();
  const singleChoiceId = "ultimate-b2-sb-u1-p1-o92"; await page.getByText(singleChoiceId, { exact: true }).first().waitFor(); await page.getByRole("heading", { name: "Browser native multiple choice" }).first().waitFor(); await verifyReadableTextStartsOffAndBlocksIncompleteSave(page); await page.getByLabel("Activity title").fill("Persisted browser multiple choice"); await page.getByLabel("Visible instruction").fill("Choose one answer for each question.");
  await page.getByRole("button", { name: "Add Question" }).click(); await page.getByText("Needs answer", { exact: true }).first().waitFor(); assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), true); await page.getByLabel("Prompt").fill("Which release is graded?"); let optionInputs = page.locator(".native-single-choice-editor fieldset input:not([type=radio])"); await optionInputs.nth(0).fill("The latest head"); await optionInputs.nth(1).fill("The pinned release"); await page.getByLabel("Mark option 2 correct").check(); assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), false);
  await page.getByRole("button", { name: "Add Question" }).click(); await page.getByLabel("Prompt").fill("Who calculates the score?"); optionInputs = page.locator(".native-single-choice-editor fieldset input:not([type=radio])"); await optionInputs.nth(0).fill("The browser"); await optionInputs.nth(1).fill("The server"); await page.getByLabel("Mark option 2 correct").check(); await page.getByRole("button", { name: "Add Option" }).click(); optionInputs = page.locator(".native-single-choice-editor fieldset input:not([type=radio])"); await optionInputs.nth(2).fill("A teacher"); await optionInputs.nth(2).locator("xpath=..").getByRole("button").first().click(); optionInputs = page.locator(".native-single-choice-editor fieldset input:not([type=radio])"); await optionInputs.nth(0).locator("xpath=..").getByRole("button", { name: "Delete", exact: true }).click(); await page.getByRole("button", { name: "Add Question" }).click(); await page.getByLabel("Prompt").fill("Temporary reorder question"); await page.getByRole("button", { name: "Move Up", exact: true }).click(); page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Delete Question" }).click(); await uploadReadableText(page, tallReadablePng, "readable-multiple-choice.png", "Multiple Choice readable passage"); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(singleChoiceId).publicDocument.readableText.sourceHeight, 1800);
  const singleState = nativeDocuments.get(singleChoiceId); const savedChoiceIds = singleState.publicDocument.parts[0].interaction.questions.map((question) => ({ questionId: question.id, optionIds: question.options.map((option) => option.id) })); assert.equal(singleState.publicDocument.parts[0].interaction.questions.length, 2); assert.doesNotMatch(JSON.stringify(singleState.publicDocument), /correctOptionId|correctAnswers/); assert.equal(singleState.teacherDocument.parts[0].solution.correctAnswers.length, 2);
  await page.getByRole("button", { name: "Student Preview" }).click(); await page.locator(".native-or-preview").getByText("The pinned release", { exact: true }).click(); assert.equal(await page.locator(".native-or-preview").getByText("Correct answer", { exact: false }).count(), 0); await page.getByRole("button", { name: "Teacher Preview" }).click(); const localTeacherChoice = page.locator('.native-or-preview .native-single-choice-teacher[data-native-single-choice-presentation="text"]'); await localTeacherChoice.waitFor(); const localCorrectChoice = localTeacherChoice.getByText("The pinned release", { exact: true }).locator(".."); await localCorrectChoice.click(); assert.equal(await localCorrectChoice.getAttribute("data-answer-state"), "correct"); await localTeacherChoice.getByText("Correct.", { exact: true }).waitFor(); assert.equal(await localTeacherChoice.getByText("Correct answer", { exact: false }).count(), 0); assert.ok(await localTeacherChoice.locator('input[type="radio"]').count() >= 2); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(singleChoiceId) }).click(); assert.equal(await page.getByLabel("Activity title").inputValue(), "Persisted browser multiple choice"); assert.deepEqual(nativeDocuments.get(singleChoiceId).publicDocument.parts[0].interaction.questions.map((question) => ({ questionId: question.id, optionIds: question.options.map((option) => option.id) })), savedChoiceIds);
  await page.getByRole("button", { name: "Enable visual mode" }).click(); assert.equal(await page.getByRole("button", { name: "Save Draft" }).isDisabled(), true);
  await page.locator(".native-single-choice-visual-authoring input[type=file]").setInputFiles({ name: "choice-panel-1.png", mimeType: "image/png", buffer: onePixelPng }); await page.locator(".native-single-choice-hotspot-canvas img").waitFor();
  const drawVisualHotspot = async (bindingIndex, startX, startY) => {
    await page.getByLabel("Option to map").selectOption({ index: bindingIndex }); await page.getByRole("button", { name: "Draw hotspot" }).click();
    const canvas = page.locator(".native-single-choice-hotspot-canvas"); const box = await canvas.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width * startX, box.y + box.height * startY); await page.mouse.down(); await page.mouse.move(box.x + box.width * (startX + .18), box.y + box.height * (startY + .14)); await page.mouse.up();
    await page.getByRole("group", { name: "Hotspot selected" }).waitFor();
  };
  await drawVisualHotspot(1, .08, .12); const firstHotspotX = Number(await page.getByRole("spinbutton", { name: "X", exact: true }).inputValue()); await page.getByRole("group", { name: "Hotspot selected" }).press("ArrowRight"); assert.equal(Number(await page.getByRole("spinbutton", { name: "X", exact: true }).inputValue()), firstHotspotX + 1); const resizeHandle = page.getByRole("button", { name: "Resize Hotspot from bottom right" }); const resizeBox = await resizeHandle.boundingBox(); assert.ok(resizeBox); await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2); await page.mouse.down(); await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 20, resizeBox.y + resizeBox.height / 2 + 15); await page.mouse.up(); await page.getByRole("group", { name: "Hotspot selected" }).press("Escape");
  await drawVisualHotspot(2, .38, .12); await page.getByRole("button", { name: "Delete Hotspot" }).click(); await drawVisualHotspot(2, .38, .12); await page.getByRole("group", { name: "Hotspot selected" }).press("Escape");
  await page.getByRole("button", { name: "Add Panel" }).click(); await page.locator(".native-single-choice-visual-authoring input[type=file]").setInputFiles({ name: "choice-panel-2.png", mimeType: "image/png", buffer: secondPixelPng }); await page.getByRole("button", { name: "Move Up", exact: true }).last().click(); await page.getByRole("button", { name: "Move Down", exact: true }).last().click();
  await drawVisualHotspot(3, .08, .56); await page.getByRole("group", { name: "Hotspot selected" }).press("Escape"); await drawVisualHotspot(4, .38, .56); await page.getByRole("group", { name: "Hotspot selected" }).press("Escape");
  await page.getByRole("button", { name: "Add Panel" }).click(); page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Delete Panel" }).click();
  await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); const savedVisualChoice = nativeDocuments.get(singleChoiceId); assert.equal(savedVisualChoice.publicDocument.parts.length, 1); assert.equal(savedVisualChoice.publicDocument.parts[0].id, "part-1"); assert.equal(savedVisualChoice.publicDocument.parts[0].interaction.presentation.panels.length, 2); assert.equal(savedVisualChoice.publicDocument.parts[0].interaction.presentation.panels.flatMap((panel) => panel.hotspots).length, 4); assert.doesNotMatch(JSON.stringify(savedVisualChoice.publicDocument), /correctOptionId|correctAnswers|isCorrect/);
  await page.getByRole("tab", { name: "Front" }).click(); const front = page.locator(".native-single-choice-front"); const pinnedHotspot = front.getByRole("button", { name: "Which release is graded?: The pinned release" }); await pinnedHotspot.focus(); await pinnedHotspot.press("Enter"); assert.equal(await pinnedHotspot.getAttribute("aria-pressed"), "true"); const latestHotspot = front.getByRole("button", { name: "Which release is graded?: The latest head" }); await latestHotspot.click(); assert.equal(await latestHotspot.getAttribute("aria-pressed"), "true"); assert.equal(await pinnedHotspot.getAttribute("aria-pressed"), "false"); await pinnedHotspot.click(); await front.getByRole("button", { name: "Next" }).click(); await front.getByText("Panel 2 of 2", { exact: true }).waitFor(); assert.equal(await front.getByRole("button", { name: "Next" }).isDisabled(), true); await front.getByRole("button", { name: "Show All" }).click(); assert.equal(await front.locator(".native-single-choice-visual-panel").count(), 2); await front.getByRole("button", { name: "Paged View" }).click(); await front.getByText("Panel 2 of 2", { exact: true }).waitFor(); await front.getByRole("button", { name: "Show All" }).click(); assert.equal(await pinnedHotspot.getAttribute("aria-pressed"), "true");
  await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: new RegExp(singleChoiceId) }).click(); await page.getByRole("tab", { name: "Front" }).click(); assert.equal(await page.locator(".native-single-choice-front .native-single-choice-visual-panel").count(), 1);
  await page.getByRole("button", { name: "Add Activity" }).click(); await page.getByRole("radio", { name: /Multiple Choice/ }).check(); await page.getByLabel(/Initial title/).fill("One panel classroom choice"); await page.getByRole("button", { name: "Create activity" }).click();
  const onePanelChoiceId = "ultimate-b2-sb-u1-p1-o93"; await page.getByText(onePanelChoiceId, { exact: true }).first().waitFor(); await page.getByRole("button", { name: "Add Question" }).click(); await page.getByLabel("Prompt").fill("One panel question?"); optionInputs = page.locator(".native-single-choice-editor fieldset input:not([type=radio])"); await optionInputs.nth(0).fill("Wrong one panel option"); await optionInputs.nth(1).fill("Correct one panel option"); await page.getByLabel("Mark option 2 correct").check(); await page.getByRole("button", { name: "Enable visual mode" }).click(); await page.locator(".native-single-choice-visual-authoring input[type=file]").setInputFiles({ name: "choice-one-panel.png", mimeType: "image/png", buffer: onePixelPng }); await page.locator(".native-single-choice-hotspot-canvas img").waitFor(); await drawVisualHotspot(1, .08, .12); await page.getByRole("group", { name: "Hotspot selected" }).press("Escape"); await drawVisualHotspot(2, .38, .12); await page.getByRole("group", { name: "Hotspot selected" }).press("Escape"); await page.getByRole("button", { name: "Save Draft" }).click(); await page.getByText("Draft saved.", { exact: true }).waitFor(); assert.equal(nativeDocuments.get(onePanelChoiceId).publicDocument.parts[0].interaction.presentation.panels.length, 1);
  await page.locator('.hosted-builder-tool-tabs a[href$="/hotspots"]').click(); await page.getByRole("heading", { name: "Students Book hotspot builder" }).waitFor(); assert.equal(await page.getByRole("button", { name: "Review", exact: true }).count(), 1); assert.equal(await page.locator(".hosted-viewer-preview iframe").count(), 0);
  await page.locator(".editable-hotspot-box").first().click(); await page.getByLabel("Activity").selectOption(openResponseId); await page.getByLabel("Label").fill("Draft Open Response hotspot"); await page.waitForTimeout(150); await page.screenshot({ path: path.join(screenshotRoot, "hotspot-builder-1440.png"), fullPage: true }); const hotspotUrl = page.url(); for (const [viewportWidth, viewportHeight] of [[1280, 800], [1024, 768]]) { const responsive = await context.newPage(); await responsive.setViewportSize({ width: viewportWidth, height: viewportHeight }); await responsive.goto(hotspotUrl, { waitUntil: "domcontentloaded" }); await responsive.locator(".editable-hotspot-box").first().click(); assert.deepEqual(await responsive.evaluate(() => ({ body: document.body.scrollWidth, root: document.documentElement.scrollWidth, viewport: innerWidth })), { body: viewportWidth, root: viewportWidth, viewport: viewportWidth }); await responsive.screenshot({ path: path.join(screenshotRoot, `hotspot-builder-${viewportWidth}.png`), fullPage: true }); await responsive.close(); } await page.locator(".builder-save-state").getByRole("button", { name: "Save", exact: true }).click(); await page.locator(".builder-save-state").getByText("Saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Review", exact: true }).click(); let viewer = page.frameLocator(".unified-builder-review-dialog iframe"); await viewer.getByRole("button", { name: "Draft Open Response hotspot" }).waitFor(); assert.equal(await viewer.getByRole("button", { name: "Show Text", exact: true }).count(), 0); assert.ok(authorizationIntents.length > firstReviewAuthorizationCount); assert.equal(await viewer.locator("title").evaluate((element) => element.ownerDocument.title), "Ultimate B2 Viewer");
  await viewer.getByRole("button", { name: "Draft Open Response hotspot" }).evaluate((button) => button.click()); await viewer.getByText("First prompt", { exact: true }).waitFor(); assert.equal(await viewer.getByText("Persisted browser response", { exact: true }).count(), 0); assert.equal(await viewer.getByText("Respond in complete sentences.", { exact: true }).count(), 0); assert.equal(await viewer.getByText("Students Book activity data could not be loaded.", { exact: true }).count(), 0); assert.equal(await viewer.getByText("First private model answer", { exact: true }).count(), 0);
  const viewerShowNext = viewer.getByRole("button", { name: "Show Next", exact: true });
  const viewerShowAll = viewer.getByRole("button", { name: "Show All", exact: true });
  const viewerReload = viewer.getByRole("button", { name: "Reload", exact: true });
  await viewerShowNext.click();
  await viewer.getByText("First private model answer", { exact: true }).waitFor();
  assert.equal(await viewerShowNext.isDisabled(), true);
  await viewerReload.click();
  assert.equal(await viewer.getByText("First private model answer", { exact: true }).count(), 0);
  await viewerShowAll.click();
  await viewer.getByText("First private model answer", { exact: true }).waitFor();
  const runtimePresentation = viewer.locator(".native-readable-text-presentation");
  await runtimePresentation.waitFor();
  assert.equal(await runtimePresentation.getAttribute("data-readable-text-available"), "true");
  const showText = viewer.locator(".teacher-book-navigation-context--show-text");
  await showText.waitFor();
  assert.equal(await showText.getAttribute("aria-pressed"), "false");
  const outerHeightBeforeText = await viewer.locator("body").evaluate((body) => body.scrollHeight);
  await showText.click();
  const readableScroll = viewer.locator(".native-readable-text-scroll");
  await readableScroll.waitFor();
  assert.equal(await showText.getAttribute("aria-pressed"), "true");
  assert.equal(await viewer.locator(".native-or-surface").count(), 1);
  const readableGeometry = await readableScroll.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const view = element.closest(".native-readable-text-view");
    const presentation = element.closest(".native-readable-text-presentation");
    const content = element.closest(".teacher-offline-embedded-activity-content");
    const viewRect = view.getBoundingClientRect();
    const presentationRect = presentation.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const viewStyle = getComputedStyle(view);
    const paddingY = Number.parseFloat(viewStyle.paddingTop) + Number.parseFloat(viewStyle.paddingBottom);
    const imageRect = element.querySelector("img").getBoundingClientRect();
    const renderedScale = view.offsetHeight ? viewRect.height / view.offsetHeight : 1;
    return { clientHeight: element.clientHeight, clientWidth: element.clientWidth, scrollHeight: element.scrollHeight, scrollBoxHeight: rect.height, viewHeight: viewRect.height, presentationHeight: presentationRect.height, contentHeight: contentRect.height, renderedPaddingY: paddingY * renderedScale, imageWidth: imageRect.width, imageHeight: imageRect.height };
  });
  assert.ok(readableGeometry.scrollHeight > readableGeometry.clientHeight);
  assert.ok(Math.abs((readableGeometry.imageWidth / readableGeometry.imageHeight) - (1000 / 1800)) < 0.02);
  assert.ok(Math.abs(readableGeometry.presentationHeight - readableGeometry.contentHeight) <= 2, JSON.stringify(readableGeometry));
  assert.ok(Math.abs(readableGeometry.viewHeight - readableGeometry.presentationHeight) <= 2, JSON.stringify(readableGeometry));
  assert.ok(Math.abs(readableGeometry.scrollBoxHeight - (readableGeometry.viewHeight - readableGeometry.renderedPaddingY)) <= 3, JSON.stringify(readableGeometry));
  assert.equal(await viewer.locator(".native-readable-text-scroll-affordance").count(), 1);
  await readableScroll.hover(); await page.mouse.wheel(0, 600); await page.waitForTimeout(100);
  assert.ok(await readableScroll.evaluate((element) => element.scrollTop) > 0);
  assert.ok(await viewer.locator("body").evaluate((body) => body.scrollHeight) <= outerHeightBeforeText + 2);
  await showText.click(); await readableScroll.waitFor({ state: "detached" });
  assert.equal(await showText.getAttribute("aria-pressed"), "false");
  assert.equal(await viewer.getByText("First private model answer", { exact: true }).count(), 1);
  await viewer.getByRole("button", { name: "Back" }).evaluate((button) => button.click());
  await page.getByRole("button", { name: "Close Review" }).click();
  await page.locator(".editable-hotspot-box").first().click(); await page.getByLabel("Activity").selectOption(imageId); await page.getByLabel("Label").fill("Draft Image hotspot"); await page.getByRole("button", { name: "Review", exact: true }).click(); await page.getByText("Unsaved changes are not included in Review. Save them first.", { exact: true }).waitFor(); await page.getByRole("button", { name: "Close Review" }).click(); await page.locator(".builder-save-state").getByRole("button", { name: "Save", exact: true }).click(); await page.locator(".builder-save-state").getByText("Saved", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Review", exact: true }).click(); viewer = page.frameLocator(".unified-builder-review-dialog iframe"); await viewer.getByRole("button", { name: "Draft Image hotspot" }).waitFor(); const teacherRequestsBeforeImage = viewerRequests.filter((item) => /\/teacher$/.test(item.pathname)).length; await viewer.getByRole("button", { name: "Draft Image hotspot" }).click({ force: true }); const runtimeImage = viewer.locator(".native-image-surface img").first(); await runtimeImage.waitFor(); assert.equal(await viewer.getByText("Production image draft", { exact: true }).count(), 0); assert.equal(await viewer.getByText("Study this image.", { exact: true }).count(), 0); const runtimeImageWrapper = runtimeImage.locator(".."); const imagePresentationBeforeHover = await runtimeImageWrapper.evaluate((wrapper) => ({ tagName: wrapper.tagName, disabled: wrapper.hasAttribute("disabled"), hasButtonAncestor: Boolean(wrapper.closest("button")), pointerEvents: getComputedStyle(wrapper).pointerEvents, opacity: getComputedStyle(wrapper).opacity, cursor: getComputedStyle(wrapper).cursor })); assert.deepEqual({ ...imagePresentationBeforeHover, cursor: undefined }, { tagName: "DIV", disabled: false, hasButtonAncestor: false, pointerEvents: "none", opacity: "1", cursor: undefined }); assert.ok(["auto", "default"].includes(imagePresentationBeforeHover.cursor)); const runtimeImageBox = await runtimeImage.boundingBox(); assert.ok(runtimeImageBox); await page.mouse.move(runtimeImageBox.x + runtimeImageBox.width / 2, runtimeImageBox.y + runtimeImageBox.height / 2); await page.waitForTimeout(50); const imagePresentationAfterHover = await runtimeImageWrapper.evaluate((wrapper) => ({ opacity: getComputedStyle(wrapper).opacity, cursor: getComputedStyle(wrapper).cursor })); assert.deepEqual(imagePresentationAfterHover, { opacity: "1", cursor: imagePresentationBeforeHover.cursor }); assert.notEqual(imagePresentationAfterHover.cursor, "not-allowed"); assert.equal(viewerRequests.filter((item) => /\/teacher$/.test(item.pathname)).length, teacherRequestsBeforeImage); assert.ok(viewerRequests.some((item) => item.pathname.includes(`/activities/${imageId}/assets/`)));
  const protectedDraftRequests = viewerRequests.filter((item) => item.pathname.includes("/preview/native-activities/")); assert.ok(protectedDraftRequests.length >= 4); assert.ok(protectedDraftRequests.every((item) => new URLSearchParams(item.search).getAll("previewAuthorization").length === 1 && !item.headers.cookie));

  await page.getByRole("button", { name: "Close Review" }).click(); await page.locator(".editable-hotspot-box").first().click(); await page.getByLabel("Activity").selectOption(singleChoiceId); await page.getByLabel("Label").fill("Draft Multiple Choice hotspot"); await page.locator(".builder-save-state").getByRole("button", { name: "Save", exact: true }).click(); await page.locator(".builder-save-state").getByText("Saved", { exact: true }).waitFor(); const teacherRequestsBeforeChoice = viewerRequests.filter((item) => /\/teacher$/.test(item.pathname)).length;
  await page.getByRole("button", { name: "Review", exact: true }).click();
  viewer = page.frameLocator(".unified-builder-review-dialog iframe");
  await viewer.getByRole("button", { name: "Draft Multiple Choice hotspot" }).click({ force: true });
  const teacherChoice = viewer.locator('.native-single-choice-teacher[data-native-single-choice-presentation="visual"]');
  await teacherChoice.waitFor();
  const previousInternal = viewer.getByRole("button", { name: "Previous activity part", exact: true });
  const nextInternal = viewer.getByRole("button", { name: "Next activity part", exact: true });
  const choiceReload = viewer.getByRole("button", { name: "Reload", exact: true });
  const choiceShowAll = viewer.getByRole("button", { name: "Show All", exact: true });
  const choiceShowNext = viewer.getByRole("button", { name: "Show Next", exact: true });
  const savedChoiceDocument = savedVisualChoice.publicDocument;
  const choiceQuestions = savedChoiceDocument.parts[0].interaction.questions;
  const correctChoiceByQuestion = new Map(savedVisualChoice.teacherDocument.parts[0].solution.correctAnswers.map((answer) => [answer.questionId, answer.correctOptionId]));
  const firstChoiceQuestion = choiceQuestions[0];
  const firstCorrectOption = firstChoiceQuestion.options.find((option) => option.id === correctChoiceByQuestion.get(firstChoiceQuestion.id));
  const firstWrongOption = firstChoiceQuestion.options.find((option) => option.id !== firstCorrectOption.id);
  const firstPanel = savedChoiceDocument.parts[0].interaction.presentation.panels[0];
  const firstWrongHotspotDocument = firstPanel.hotspots.find((hotspot) => hotspot.optionId === firstWrongOption.id);
  const firstWrongHotspot = teacherChoice.getByRole("button", { name: `${firstChoiceQuestion.prompt}: ${firstWrongOption.text}` });
  const firstCorrectHotspot = teacherChoice.getByRole("button", { name: `${firstChoiceQuestion.prompt}: ${firstCorrectOption.text}` });
  assert.equal(await teacherChoice.locator(".native-single-choice-visual-stage").count(), 1);
  assert.equal(await teacherChoice.locator(".native-single-choice-visual-navigation").count(), 0);
  assert.equal(await teacherChoice.getByRole("button", { name: "Next", exact: true }).count(), 0);
  assert.equal(await teacherChoice.getByRole("button", { name: "Show All", exact: true }).count(), 0);
  assert.equal(await teacherChoice.getByText("Panel 1 of 2", { exact: true }).count(), 0);
  assert.equal(await teacherChoice.locator('.native-single-choice-visual[aria-label="Panel 1 of 2"]').count(), 1);
  assert.equal(await previousInternal.isDisabled(), true);
  assert.equal(await nextInternal.isDisabled(), false);
  const firstBackground = teacherChoice.locator(".native-single-choice-visual-stage img").first();
  await firstBackground.waitFor();
  assert.ok(new URL(await firstBackground.getAttribute("src"), origin).pathname.includes(`/activities/${singleChoiceId}/assets/`));
  const hotspotGeometry = await firstWrongHotspot.evaluate((element) => ({ left: Number.parseFloat(element.style.left), top: Number.parseFloat(element.style.top), width: Number.parseFloat(element.style.width), height: Number.parseFloat(element.style.height) }));
  assert.ok(Math.abs(hotspotGeometry.left - firstWrongHotspotDocument.area.x / firstPanel.sourceWidth * 100) < .001);
  assert.ok(Math.abs(hotspotGeometry.top - firstWrongHotspotDocument.area.y / firstPanel.sourceHeight * 100) < .001);
  assert.ok(Math.abs(hotspotGeometry.width - firstWrongHotspotDocument.area.width / firstPanel.sourceWidth * 100) < .001);
  assert.ok(Math.abs(hotspotGeometry.height - firstWrongHotspotDocument.area.height / firstPanel.sourceHeight * 100) < .001);
  await firstWrongHotspot.click(); assert.equal(await firstWrongHotspot.getAttribute("data-answer-state"), "incorrect");
  await firstCorrectHotspot.click(); assert.equal(await firstCorrectHotspot.getAttribute("data-answer-state"), "correct"); assert.equal(await firstWrongHotspot.getAttribute("data-answer-state"), "incorrect"); assert.equal(await firstCorrectHotspot.isDisabled(), true);
  await nextInternal.click(); await teacherChoice.getByRole("button", { name: /Who calculates the score\?:/ }).first().waitFor();
  assert.equal(await previousInternal.isDisabled(), false);
  assert.equal(await nextInternal.isDisabled(), true);
  const secondChoiceQuestion = choiceQuestions[1];
  const secondCorrectOption = secondChoiceQuestion.options.find((option) => option.id === correctChoiceByQuestion.get(secondChoiceQuestion.id));
  const secondWrongOption = secondChoiceQuestion.options.find((option) => option.id !== secondCorrectOption.id);
  const secondWrongHotspot = teacherChoice.getByRole("button", { name: `${secondChoiceQuestion.prompt}: ${secondWrongOption.text}` });
  const secondCorrectHotspot = teacherChoice.getByRole("button", { name: `${secondChoiceQuestion.prompt}: ${secondCorrectOption.text}` });
  await secondWrongHotspot.click(); await secondCorrectHotspot.click(); assert.equal(await secondWrongHotspot.getAttribute("data-answer-state"), "incorrect"); assert.equal(await secondCorrectHotspot.getAttribute("data-answer-state"), "correct");
  const choiceShowText = viewer.locator(".teacher-book-navigation-context--show-text"); await choiceShowText.waitFor(); await choiceShowText.click(); await viewer.locator(".native-readable-text-scroll").waitFor(); assert.equal(await choiceShowText.getAttribute("aria-pressed"), "true"); await choiceShowText.click(); await secondWrongHotspot.waitFor(); assert.equal(await secondWrongHotspot.getAttribute("data-answer-state"), "incorrect"); assert.equal(await secondCorrectHotspot.getAttribute("data-answer-state"), "correct");
  await choiceShowText.click(); await viewer.locator(".native-readable-text-scroll").waitFor(); assert.equal(await previousInternal.isDisabled(), true); assert.equal(await nextInternal.isDisabled(), true);
  await choiceReload.click(); await viewer.locator(".native-readable-text-scroll").waitFor({ state: "detached" }); await firstBackground.waitFor(); assert.equal(await previousInternal.isDisabled(), true); assert.equal(await nextInternal.isDisabled(), false); assert.equal(await teacherChoice.locator("[data-answer-state]").count(), 0);
  await choiceShowNext.click(); await page.waitForTimeout(25); assert.equal(await firstCorrectHotspot.getAttribute("data-answer-state"), "correct"); assert.equal(await firstWrongHotspot.getAttribute("data-answer-state"), null); assert.equal(await choiceShowNext.isDisabled(), false);
  await choiceShowNext.click(); await secondCorrectHotspot.waitFor(); assert.equal(await secondCorrectHotspot.getAttribute("data-answer-state"), "correct"); assert.equal(await choiceShowNext.isDisabled(), true); assert.equal(await nextInternal.isDisabled(), true);
  await previousInternal.click(); await firstCorrectHotspot.waitFor(); assert.equal(await firstCorrectHotspot.getAttribute("data-answer-state"), "correct"); await nextInternal.click(); await secondCorrectHotspot.waitFor(); assert.equal(await secondCorrectHotspot.getAttribute("data-answer-state"), "correct");
  await choiceReload.click(); await firstBackground.waitFor(); assert.equal(await teacherChoice.locator("[data-answer-state]").count(), 0); await nextInternal.click(); await secondWrongHotspot.waitFor(); assert.equal(await teacherChoice.locator("[data-answer-state]").count(), 0); await previousInternal.click(); await firstBackground.waitFor();
  await choiceShowAll.click(); await teacherChoice.locator('[data-answer-state="correct"]').waitFor(); assert.equal(await firstCorrectHotspot.getAttribute("data-answer-state"), "correct"); assert.equal(await choiceShowAll.isDisabled(), true); await nextInternal.click(); await secondCorrectHotspot.waitFor(); assert.equal(await secondCorrectHotspot.getAttribute("data-answer-state"), "correct");
  await choiceShowText.click(); await viewer.locator(".native-readable-text-scroll").waitFor(); await choiceShowText.click(); await secondCorrectHotspot.waitFor(); assert.equal(await secondCorrectHotspot.getAttribute("data-answer-state"), "correct");
  const visualBackgroundAssetIds = [...new Set(savedChoiceDocument.parts[0].interaction.presentation.panels.map((panel) => savedChoiceDocument.assets.find((asset) => asset.slot === panel.backgroundAssetSlot)?.assetId).filter(Boolean))];
  assert.ok(visualBackgroundAssetIds.every((assetId) => viewerRequests.some((item) => item.pathname.includes(`/activities/${singleChoiceId}/assets/${assetId}`))));
  assert.equal(await viewer.getByText("The pinned release — Correct answer", { exact: true }).count(), 0); assert.equal(await viewer.getByText("Teacher answers are unavailable.", { exact: true }).count(), 0); assert.equal(await viewer.getByText("Persisted browser multiple choice", { exact: true }).count(), 0); assert.equal(await viewer.getByText("Choose one answer for each question.", { exact: true }).count(), 0); assert.equal(viewerRequests.filter((item) => /\/teacher$/.test(item.pathname)).length, teacherRequestsBeforeChoice + 3, "initial Teacher document plus two generic Reload remounts");
  await page.getByRole("button", { name: "Close Review" }).click(); await page.locator(".editable-hotspot-box").first().click(); await page.getByLabel("Activity").selectOption(onePanelChoiceId); await page.getByLabel("Label").fill("Draft One Panel Choice hotspot"); await page.locator(".builder-save-state").getByRole("button", { name: "Save", exact: true }).click(); await page.locator(".builder-save-state").getByText("Saved", { exact: true }).waitFor(); await page.getByRole("button", { name: "Review", exact: true }).click(); viewer = page.frameLocator(".unified-builder-review-dialog iframe"); await viewer.getByRole("button", { name: "Draft One Panel Choice hotspot" }).click({ force: true }); await viewer.locator('.native-single-choice-teacher[data-native-single-choice-presentation="visual"]').waitFor(); assert.equal(await viewer.getByRole("button", { name: "Previous activity part", exact: true }).count(), 0); assert.equal(await viewer.getByRole("button", { name: "Next activity part", exact: true }).count(), 0); assert.equal(await viewer.locator(".native-single-choice-visual-navigation").count(), 0); await page.getByRole("button", { name: "Close Review" }).click(); await page.locator(".editable-hotspot-box").first().click(); await page.getByLabel("Activity").selectOption(imageId); await page.getByLabel("Label").fill("Draft Image hotspot"); await page.locator(".builder-save-state").getByRole("button", { name: "Save", exact: true }).click(); await page.locator(".builder-save-state").getByText("Saved", { exact: true }).waitFor();
  await page.locator('.hosted-builder-tool-tabs a[href$="/ui"]').click(); await page.getByRole("heading", { name: "UI Controller" }).waitFor(); assert.equal(await page.getByRole("button", { name: "Review", exact: true }).count(), 1); assert.equal(await page.locator(".hosted-viewer-preview iframe").count(), 0); await page.getByRole("button", { name: "Review", exact: true }).click(); await page.getByRole("heading", { name: "Review · Saved Draft", exact: true }).waitFor(); const uiFrameUrl = new URL(await page.locator(".unified-builder-review-dialog iframe").getAttribute("src")); assert.equal(uiFrameUrl.searchParams.get("view"), "page"); assert.equal(uiFrameUrl.searchParams.get("pageId"), "ub2-sb-unit-1-part-1"); assert.equal(authorizationIntents.at(-1).intent.view, "page"); assert.equal(authorizationIntents.at(-1).intent.pageId, "ub2-sb-unit-1-part-1"); viewer = page.frameLocator(".unified-builder-review-dialog iframe"); await viewer.getByRole("button", { name: "Draft Image hotspot" }).waitFor(); await viewer.getByRole("button", { name: "Draft Image hotspot" }).click({ force: true }); await viewer.locator(".native-image-surface img").first().waitFor(); assert.equal(await viewer.getByText("Production image draft", { exact: true }).count(), 0); await page.getByRole("button", { name: "Close Review" }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click(); await page.getByRole("heading", { name: "Review · Saved Draft", exact: true }).waitFor();
  const pageAuthorizationCount = authorizationIntents.length;
  const [pagePlayer] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: "Open Player", exact: true }).click(),
  ]);
  await pagePlayer.getByRole("heading", { name: "Player Review", exact: true }).waitFor();
  assert.equal(new URL(pagePlayer.url()).origin, origin);
  assert.match(new URL(pagePlayer.url()).hash, /^#\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/review\?view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1$/);
  assert.doesNotMatch(pagePlayer.url(), /previewAuthorization|token|secret/i);
  await pagePlayer.locator(".hosted-builder-review-page iframe").waitFor();
  const pagePlayerFrameUrl = new URL(await pagePlayer.locator(".hosted-builder-review-page iframe").getAttribute("src"));
  assert.equal(pagePlayerFrameUrl.origin, "https://hhplms-viewer.netlify.app");
  assert.equal(pagePlayerFrameUrl.searchParams.get("view"), "page");
  assert.equal(pagePlayerFrameUrl.searchParams.get("pageId"), "ub2-sb-unit-1-part-1");
  assert.ok(authorizationIntents.length > pageAuthorizationCount);
  await pagePlayer.frameLocator(".hosted-builder-review-page iframe").getByRole("button", { name: "Draft Image hotspot" }).waitFor();
  await pagePlayer.close(); await page.getByRole("button", { name: "Close Review" }).click();
  await page.locator('.hosted-builder-tool-tabs a[href$="/publication"]').click(); await page.getByRole("heading", { name: "Publication", exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: "Review", exact: true }).count(), 1); assert.equal(await page.locator(".hosted-viewer-preview iframe").count(), 0); await page.getByRole("button", { name: "Review", exact: true }).click(); await page.getByRole("heading", { name: "Review · Saved Draft", exact: true }).waitFor(); assert.equal(await page.getByRole("button", { name: "No release prepared" }).isDisabled(), true); await page.locator(".unified-builder-review-dialog iframe").waitFor(); assert.equal(await page.locator(".unified-builder-review-dialog iframe").count(), 1); await page.getByRole("button", { name: "Close Review" }).click(); assert.equal(await page.locator(".unified-builder-review-dialog iframe").count(), 0);

  const tablet = await context.newPage(); await tablet.setViewportSize({ width: 900, height: 700 }); await tablet.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/activities`, { waitUntil: "domcontentloaded" }); await tablet.getByRole("button", { name: new RegExp(openResponseId) }).click(); await tablet.getByRole("tab", { name: "Local Preview" }).click(); await tablet.getByRole("button", { name: "Teacher Preview" }).click(); await tablet.getByRole("button", { name: /Reveal model answer/ }).click();
  const geometry = await tablet.locator(".native-or-surface:visible").evaluate((surface) => { const rect = surface.getBoundingClientRect(); const line = surface.querySelector(".native-or-line"); const answer = surface.querySelector(".native-or-answer-line"); return { ratio: rect.width / rect.height, lineTop: line?.style.top, answerTop: answer?.style.top }; });
  assert.ok(Math.abs(geometry.ratio - (1024 / 582)) < 0.02); assert.equal(geometry.answerTop, geometry.lineTop); await tablet.close();
  const mobile = await context.newPage(); await mobile.setViewportSize({ width: 768, height: 900 }); await mobile.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/activities`, { waitUntil: "domcontentloaded" }); await mobile.getByRole("button", { name: "Add Activity" }).waitFor(); assert.deepEqual(await mobile.evaluate(() => ({ viewport: innerWidth, body: document.body.scrollWidth, root: document.documentElement.scrollWidth })), await mobile.evaluate(() => ({ viewport: innerWidth, body: innerWidth, root: innerWidth }))); await mobile.waitForTimeout(250); await mobile.screenshot({ path: path.join(screenshotRoot, "activity-builder-768.png"), fullPage: true }); await mobile.close();
  assert.equal(requestedPaths.some((value) => /xml|iwb|import\/prepare/i.test(value)), false); process.stdout.write(`Hosted native draft authoring and real Viewer acceptance passed for ${openResponseId}, ${imageId}, ${singleChoiceId}, and ${onePanelChoiceId}.\n`);
} finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
