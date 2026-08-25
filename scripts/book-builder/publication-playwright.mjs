import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { builderDocumentSha256 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { compileUltimateB2ComponentReleaseV2 } from "../../netlify-sites/ultimate-b2-builder/server/_builder-publication-compiler-v2.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "../../tests/fixtures/publication-v2.js";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const activityId = publicationV2Fixture.openResponseId;
const imageActivityId = publicationV2Fixture.imageId;
const dragDropActivityId = publicationV2Fixture.dragDropId;
const listeningActivityId = "ultimate-b2-sb-u1-p1-o95";
const listeningAudio = { assetId: "10000000-0000-4000-8000-000000000051", checksumSha256: "e".repeat(64), role: "activity_artwork", slot: "publication-listening-audio" };
const listeningBackground = { assetId: "10000000-0000-4000-8000-000000000052", checksumSha256: "f".repeat(64), role: "activity_artwork", slot: "publication-listening-background" };
const unitExtraMp4 = await readFile(path.resolve("src/assets/books/ultimate-b2/teacher-offline-media/ultimate-b2-startup-intro.mp4"));
const releaseIds = ["10000000-0000-4000-8000-000000000091", "10000000-0000-4000-8000-000000000092"];
const publication = "/builder/api/publication/books/ultimate-b2/components/ultimate-b2-students-book";
const mime = { ".css": "text/css", ".gaf": "application/octet-stream", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".pdf": "application/pdf", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
let savedPrompt = "Draft version A";
let sourceVersion = 1;
let headRevision = 0;
let activeReleaseId = null;
let publicationFailure = null;
const releases = [];
const viewerReleaseRequests = [];
const lifecycleState = {
  cleanupStarted: false,
  browserDisconnected: false,
  contextClosed: false,
  pages: new Map(),
};

function lifecyclePhase() {
  return lifecycleState.cleanupStarted ? "expected-cleanup" : "unexpected-runtime";
}

function safeDiagnosticText(value) {
  return String(value ?? "")
    .replaceAll(publicationV2Fixture.teacherSentinel, "[teacher-private-redacted]")
    .replace(/v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[token]")
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/[A-Za-z]:\\[^\s)]+/g, "[path]")
    .replace(/\/(?:home|Users|tmp)\/[^\s)]+/g, "[path]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 240);
}

function lifecycle(event, fields = {}) {
  const details = Object.entries(fields)
    .map(([key, value]) => `${key}=${safeDiagnosticText(value)}`)
    .join(" ");
  process.stderr.write(`[publication-lifecycle] ${new Date().toISOString()} ${event}${details ? ` ${details}` : ""}\n`);
}

function observePage(page, label) {
  const state = { closed: false, crashed: false };
  lifecycleState.pages.set(label, state);
  page.on("close", () => {
    state.closed = true;
    lifecycle("page-close", { page: label, phase: lifecyclePhase() });
  });
  page.on("crash", () => {
    state.crashed = true;
    lifecycle("page-crash", { page: label, phase: lifecyclePhase() });
  });
  page.on("pageerror", (error) => lifecycle("page-error", {
    page: label,
    phase: lifecyclePhase(),
    name: error?.name || "Error",
    message: error?.message || "unknown",
  }));
  lifecycle("page-created", { page: label });
  return page;
}

process.on("uncaughtExceptionMonitor", (error, origin) => lifecycle("process-uncaught-exception", {
  origin,
  name: error?.name || "Error",
  message: error?.message || "unknown",
}));
process.on("exit", (code) => lifecycle("process-exit", { code, phase: lifecyclePhase() }));
lifecycle("process-start", { platform: process.platform, arch: process.arch, node: process.version });

function projection(prompt) {
  const sources = createPublicationV2FixtureSources({ prompt });
  const questionId = `q-${"5".repeat(32)}`; const cueOne = `cue-${"6".repeat(32)}`; const cueTwo = `cue-${"7".repeat(32)}`;
  const publicDocument = {
    schemaVersion: "1.0", activityId: listeningActivityId, kind: "listening", metadata: { title: "Published Listening Panels", visibleInstructionText: "" }, placement: { pageId: publicationV2Fixture.pageId }, assets: [listeningAudio, listeningBackground],
    parts: [{ id: "part-1", interaction: { kind: "listening", audioAssetSlot: listeningAudio.slot, audioDurationMs: 12_000, panels: [{ id: "panel-1", kind: "questions", sourceWidth: 1024, sourceHeight: 582 }, { id: "panel-2", kind: "synchronized-transcript", backgroundAssetSlot: listeningBackground.slot, sourceWidth: 1000, sourceHeight: 1800, transcriptArea: { x: 100, y: 120, width: 800, height: 1500 } }], questions: [{ id: questionId, prompt: "Published listening question" }], cues: [{ id: cueOne, startMs: 0, endMs: 3_000, text: "Published transcript first line" }, { id: cueTwo, startMs: 4_000, endMs: 8_000, text: "Published transcript second line" }], snippetHotspots: [{ id: `aud-${"8".repeat(32)}`, area: { x: 900, y: 30, width: 48, height: 48 }, cueIds: [cueOne], label: "Open published transcript" }] } }],
  };
  const teacherDocument = { schemaVersion: "1.0", activityId: listeningActivityId, kind: "listening", parts: [{ id: "part-1", solution: { kind: "listening", modelAnswers: [{ questionId, text: "Published listening teacher answer" }] } }] };
  const entry = { activityId: listeningActivityId, kind: "listening", placement: { pageId: publicationV2Fixture.pageId }, sortOrder: 5 };
  const source = (payload, revision = 1) => ({ payload, revision, sha256: builderDocumentSha256(payload) });
  sources.native.index.payload.activities.push(entry); sources.native.index = source(sources.native.index.payload, sources.native.index.revision);
  sources.native.activities[listeningActivityId] = { index: entry, public: source(publicDocument), teacher: source(teacherDocument) };
  sources.documents.hotspots.payload.pages[publicationV2Fixture.pageId].push({ id: "hotspot-native-listening", unitNumber: 1, pageId: publicationV2Fixture.pageId, pageNumber: 5, left: 68, top: 4, width: 12, height: 12, label: "Published Listening Panels", actionType: "normalized_activity", activityKey: listeningActivityId });
  sources.documents.hotspots = source(sources.documents.hotspots.payload, sources.documents.hotspots.revision);
  sources.native.assetRows.push(
    { id: listeningAudio.assetId, checksum_sha256: listeningAudio.checksumSha256, asset_role: listeningAudio.role, object_key: "builder-native-assets/publication-listening.mp3", storage_profile: "private", storage_bucket: "private", mime_type: "audio/mpeg", byte_size: 32_000, duration_seconds: 12, width: null, height: null, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: listeningActivityId, asset_slot: listeningAudio.slot } },
    { id: listeningBackground.assetId, checksum_sha256: listeningBackground.checksumSha256, asset_role: listeningBackground.role, object_key: "builder-native-assets/publication-listening.png", storage_profile: "private", storage_bucket: "private", mime_type: "image/png", byte_size: 68, width: 1000, height: 1800, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: listeningActivityId, asset_slot: listeningBackground.slot } },
  );
  const compiled = compileUltimateB2ComponentReleaseV2(sources);
  return { publicProjection: compiled.publicProjection, teacherProjection: compiled.teacherProjection, sourceSnapshot: compiled.sourceSnapshot, compatibility: compiled.compatibility, releaseSha256: compiled.releaseSha256 };
}
function sourceSha() { return `${sourceVersion}`.repeat(64).slice(0, 64); }
function metadata(release) { return { id: release.id, number: release.number, compilerId: "ultimate-b2-students-book-v2", releaseSchemaVersion: "2.0", releaseSha256: release.releaseSha256, sourceSnapshotSha256: release.sourceSha, createdAt: release.createdAt, current: activeReleaseId === release.id, publishedAt: activeReleaseId === release.id ? "2026-08-14T10:05:00Z" : null, state: release.sourceSha === sourceSha() ? "current" : "stale" }; }
function sendJson(response, statusCode, value) { const body = Buffer.from(JSON.stringify(value)); response.writeHead(statusCode, { "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "application/json" }); response.end(body); }
async function staticResponse(root, pathname, response, fallback) { const relative = pathname === "/" ? fallback : decodeURIComponent(pathname).replace(/^\/+/, ""); let file = path.resolve(root, relative); let details = file.startsWith(`${root}${path.sep}`) ? await stat(file).catch(() => null) : null; if (!details?.isFile()) { file = path.join(root, fallback); details = await stat(file); } response.writeHead(200, { "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": details.size }); createReadStream(file).pipe(response); }

async function measureDragDrop(locator, { context: measuredContext, viewport }) {
  await locator.evaluate(async (surface) => {
    let previousSignature = "";
    let stableFrames = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const visualRect = surface.querySelector(".native-drag-drop-visual-region")?.getBoundingClientRect();
      const stageRect = surface.querySelector(".native-drag-drop-stage")?.getBoundingClientRect();
      if (!visualRect || !stageRect) continue;
      const signature = [visualRect.width, visualRect.height, stageRect.width, stageRect.height].map((value) => value.toFixed(2)).join(":");
      const stageInsideVisual = stageRect.left >= visualRect.left - 1 && stageRect.right <= visualRect.right + 1 && stageRect.top >= visualRect.top - 1 && stageRect.bottom <= visualRect.bottom + 1;
      stableFrames = stageInsideVisual && signature === previousSignature ? stableFrames + 1 : 0;
      previousSignature = signature;
      if (stableFrames >= 2) return;
    }
  });
  const measurement = await locator.evaluate((surface, context) => {
    const snapshot = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return { element: element.tagName.toLowerCase(), className: typeof element.className === "string" ? element.className : "", width: Math.round(rect.width * 100) / 100, height: Math.round(rect.height * 100) / 100, minWidth: style.minWidth, minHeight: style.minHeight, maxWidth: style.maxWidth, maxHeight: style.maxHeight, display: style.display, gridTemplateRows: style.gridTemplateRows, alignSelf: style.alignSelf, overflow: style.overflow, overflowX: style.overflowX, overflowY: style.overflowY };
    };
    const visualElement = surface.querySelector(".native-drag-drop-visual-region"); const stageElement = surface.querySelector(".native-drag-drop-stage"); const bankElement = surface.querySelector(".native-drag-drop-bank");
    const root = snapshot(surface); const visual = snapshot(visualElement); const stage = snapshot(stageElement); const bank = snapshot(bankElement);
    const ancestors = []; for (let current = surface.parentElement, depth = 0; current && depth < 9; current = current.parentElement, depth += 1) ancestors.push(snapshot(current));
    const stageRect = stageElement.getBoundingClientRect(); const visualRect = visualElement.getBoundingClientRect(); const activityHost = snapshot(surface.closest(".native-readable-text-activity-view"));
    return { context, viewport: { width: innerWidth, height: innerHeight }, root, visual, stage, bank, activityHost, ancestors, activityHostFillRatio: root.height / activityHost.height, visualRootRatio: visual.height / root.height, bankRootRatio: bank.height / root.height, usableVisualRatio: visual.height / (visual.height + bank.height), usableBankRatio: bank.height / (visual.height + bank.height), stageAspectRatio: stage.width / stage.height, sourceAspectRatio: Number(stageElement.dataset.surfaceWidth) / Number(stageElement.dataset.surfaceHeight), stageInsideVisual: stageRect.left >= visualRect.left - 1 && stageRect.right <= visualRect.right + 1 && stageRect.top >= visualRect.top - 1 && stageRect.bottom <= visualRect.bottom + 1, horizontalOverflow: document.documentElement.scrollWidth - innerWidth };
  }, measuredContext);
  process.stdout.write(`[drag-drop-geometry] ${JSON.stringify({ requestedViewport: viewport, ...measurement })}\n`);
  return measurement;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/builder/api/auth" && url.searchParams.get("action") === "me") return sendJson(response, 200, { authenticated: true, builderUser: { id: "task-9", full_name: "Task 9 Browser", role: "developer", status: "active" } });
  if (url.pathname === "/builder/api/preview-authorization" && request.method === "POST") return sendJson(response, 200, { token: `v1.eA.${"a".repeat(43)}`, expiresAt: "2099-01-01T00:00:00.000Z" });
  if (url.pathname === "/test/publication-block/open-response" && request.method === "POST") { publicationFailure = { error: "native_activity_not_ready", activityId, issues: ["Question 1 needs a model answer."] }; return sendJson(response, 200, { ok: true }); }
  if (url.pathname === "/test/publication-block/image" && request.method === "POST") { publicationFailure = { error: "native_activity_not_ready", activityId: imageActivityId, issues: ["Image 1 needs alt text or must be marked decorative."] }; return sendJson(response, 200, { ok: true }); }
  if (url.pathname === "/test/publication-block/clear" && request.method === "POST") { publicationFailure = null; return sendJson(response, 200, { ok: true }); }
  if (url.pathname === publication && request.method === "GET" && publicationFailure) return sendJson(response, 409, publicationFailure);
  if (url.pathname === publication && request.method === "GET") return sendJson(response, 200, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", compilerId: "ultimate-b2-students-book-v2", releaseSchemaVersion: "2.0", currentSourceSha256: sourceSha(), headRevision, published: activeReleaseId ? metadata(releases.find((release) => release.id === activeReleaseId)) : null, releases: [...releases].reverse().map(metadata) });
  if (url.pathname === `${publication}/prepare` && request.method === "POST") {
    const number = releases.length + 1; const release = { id: releaseIds[number - 1], number, sourceSha: sourceSha(), createdAt: `2026-08-14T10:0${number}:00Z`, ...projection(savedPrompt) }; releases.push(release);
    return sendJson(response, 200, { outcome: "created", releaseId: release.id, releaseNumber: number, releaseSha256: release.releaseSha256, sourceSnapshot: release.sourceSnapshot });
  }
  if (url.pathname === `${publication}/publish` && request.method === "POST") {
    const chunks = []; for await (const chunk of request) chunks.push(chunk); const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); const release = releases.find((item) => item.id === body.releaseId);
    if (!release || release.sourceSha !== sourceSha()) return sendJson(response, 409, { error: "stale_release_preview" });
    if (body.expectedHeadRevision !== headRevision) return sendJson(response, 409, { error: "head_conflict" });
    activeReleaseId = release.id; headRevision += 1; return sendJson(response, 200, { outcome: "published", releaseId: release.id, releaseNumber: release.number, headRevision });
  }
  return staticResponse(builderRoot, url.pathname, response, "index.html");
});
server.on("close", () => lifecycle("server-close", { phase: lifecyclePhase() }));
server.on("error", (error) => {
  lifecycle("server-error", { phase: lifecyclePhase(), code: error?.code || "unknown", message: error?.message || "unknown" });
  throw error;
});
lifecycle("server-listen-start");
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
lifecycle("server-ready");

let browser;
let context;
try {
  lifecycle("browser-launch-start");
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  lifecycle("browser-launched", { version: browser.version() });
  browser.on("disconnected", () => {
    lifecycleState.browserDisconnected = true;
    lifecycle("browser-disconnected", { phase: lifecyclePhase() });
  });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  lifecycle("context-created");
  context.on("close", () => {
    lifecycleState.contextClosed = true;
    lifecycle("context-close", { phase: lifecyclePhase() });
  });
  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/^\/preview\/releases\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/([0-9a-f-]+)\/(public|teacher-ui|teacher-solution|native-teacher|assets)(?:\/(.*))?$/);
    if (match) {
      viewerReleaseRequests.push({ pathname: url.pathname, action: match[2], authorization: url.searchParams.get("previewAuthorization") });
      const release = releases.find((item) => item.id === match[1]);
      if (!release) return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      if (match[2] === "public") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ releaseId: release.id, releaseNumber: release.number, releaseSha256: release.releaseSha256, compatibility: release.compatibility, compilerId: "ultimate-b2-students-book-v2", releaseSchemaVersion: "2.0", projection: release.publicProjection }) });
      if (match[2] === "teacher-ui") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ releaseId: release.id, releaseNumber: release.number, document: release.teacherProjection.ui }) });
      if (match[2] === "native-teacher") {
        const entry = release.teacherProjection.nativeActivities[decodeURIComponent(match[3] || "")];
        return entry
          ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ releaseId: release.id, releaseNumber: release.number, activityId: decodeURIComponent(match[3]), kind: entry.kind, document: entry.document }) })
          : route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      }
      if (match[2] === "assets") return (match[3] || "").endsWith(".mp4")
        ? route.fulfill({ status: 200, contentType: "video/mp4", body: unitExtraMp4 })
        : route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, ""); let file = path.resolve(viewerRoot, relative); let details = file.startsWith(`${viewerRoot}${path.sep}`) ? await stat(file).catch(() => null) : null; if (!details?.isFile()) file = path.join(viewerRoot, "index.html");
    return route.fulfill({ status: 200, contentType: mime[path.extname(file).toLowerCase()] || "application/octet-stream", body: await readFile(file) });
  });
  const page = observePage(await context.newPage(), "builder"); page.setDefaultTimeout(60_000); page.on("dialog", (dialog) => dialog.accept());
  lifecycle("builder-navigation-start");
  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/publication`, { waitUntil: "domcontentloaded" });
  lifecycle("builder-navigation-complete");
  await page.getByRole("heading", { name: "Publication", exact: true }).waitFor();
  await page.getByText("No release published yet", { exact: true }).waitFor();
  lifecycle("builder-publication-ready");
  await page.request.post(`${origin}/test/publication-block/open-response`); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("heading", { name: "Publication blocked", exact: true }).waitFor(); await page.getByText(activityId, { exact: true }).waitFor(); await page.getByText("Question 1 needs a model answer.", { exact: true }).waitFor(); assert.equal(releases.length, 0);
  await page.request.post(`${origin}/test/publication-block/image`); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByText(imageActivityId, { exact: true }).waitFor(); await page.getByText("Image 1 needs alt text or must be marked decorative.", { exact: true }).waitFor(); assert.equal(releases.length, 0);
  await page.request.post(`${origin}/test/publication-block/clear`); await page.reload({ waitUntil: "domcontentloaded" }); await page.getByRole("heading", { name: "Publication", exact: true }).waitFor();
  await page.getByRole("button", { name: "Prepare Preview" }).click();
  await page.getByText("Release 1 · Current", { exact: true }).waitFor();
  lifecycle("preview-one-prepared");
  assert.equal(await page.locator(".hosted-viewer-preview iframe").count(), 0);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("heading", { name: "Review · Release #1 · Immutable", exact: true }).waitFor();
  await page.locator(".unified-builder-review-dialog iframe").waitFor();
  assert.equal(await page.locator(".unified-builder-review-dialog iframe").count(), 1);
  const frameUrl = new URL(await page.locator(".unified-builder-review-dialog iframe").getAttribute("src"));
  assert.equal(frameUrl.searchParams.get("releaseId"), releaseIds[0]);
  assert.equal(frameUrl.searchParams.get("view"), "page");
  await page.getByRole("button", { name: "Saved Draft", exact: true }).click();
  await page.getByRole("heading", { name: "Review · Saved Draft", exact: true }).waitFor();
  await page.getByRole("button", { name: "Release #1 · Immutable", exact: true }).click();
  await page.getByRole("button", { name: "Close Review" }).click();
  assert.equal(await page.locator(".unified-builder-review-dialog iframe").count(), 0);

  const viewer = observePage(await context.newPage(), "preview-viewer");
  const previewToken = encodeURIComponent(`v1.eA.${"a".repeat(43)}`);
  const pagePreviewUrl = (releaseId) => `https://hhplms-viewer.netlify.app/?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&releaseId=${releaseId}&view=page&unitNumber=1&pageId=${publicationV2Fixture.pageId}&previewAuthorization=${previewToken}`;
  lifecycle("preview-viewer-navigation-start");
  await viewer.goto(pagePreviewUrl(releaseIds[0]), { waitUntil: "domcontentloaded" });
  lifecycle("preview-viewer-navigation-complete");
  lifecycle("open-response-click-start", { attempt: 1 });
  await viewer.getByRole("button", { name: "Native Open Response" }).click();
  lifecycle("open-response-click-complete", { attempt: 1 });
  await viewer.getByText("Draft version A", { exact: true }).waitFor();
  await viewer.getByRole("button", { name: /Reveal model answer/ }).waitFor();
  assert.equal(await viewer.getByText(publicationV2Fixture.teacherSentinel, { exact: true }).count(), 0);
  await viewer.getByRole("button", { name: /Reveal model answer/ }).click();
  await viewer.getByText(publicationV2Fixture.teacherSentinel, { exact: true }).waitFor();
  assert.ok(viewerReleaseRequests.some((request) => request.action === "native-teacher" && request.pathname.endsWith(`/${activityId}`)), "Teacher reveal must load the protected native Teacher document.");
  assert.ok(viewerReleaseRequests.every((request) => /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(request.authorization || "")), "Every release projection request must carry preview authorization.");
  savedPrompt = "Draft version B"; sourceVersion = 2;
  lifecycle("preview-viewer-reload-start");
  await viewer.reload({ waitUntil: "domcontentloaded" });
  lifecycle("preview-viewer-reload-complete");
  lifecycle("open-response-click-start", { attempt: 2 });
  await viewer.getByRole("button", { name: "Native Open Response" }).click();
  lifecycle("open-response-click-complete", { attempt: 2 });
  await viewer.getByText("Draft version A", { exact: true }).waitFor();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Release 1 · Stale", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Publish Preview" }).isDisabled(), true);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByText("Release #1 is immutable and older than the current saved draft.", { exact: true }).waitFor();
  const staleFrameUrl = new URL(await page.locator(".unified-builder-review-dialog iframe").getAttribute("src"));
  assert.equal(staleFrameUrl.searchParams.get("releaseId"), releaseIds[0]);
  await page.getByRole("button", { name: "Close Review" }).click();
  const direct = await page.evaluate(async ({ publication, id }) => { const response = await fetch(`${publication}/publish`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseId: id, expectedHeadRevision: 0, clientMutationId: crypto.randomUUID() }) }); return { status: response.status, body: await response.json() }; }, { publication, id: releaseIds[0] });
  assert.deepEqual(direct, { status: 409, body: { error: "stale_release_preview" } });

  await page.getByRole("button", { name: "Prepare Preview" }).click();
  await page.getByText("Release 2 · Current", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("heading", { name: "Review · Release #2 · Immutable", exact: true }).waitFor();
  const currentFrameUrl = new URL(await page.locator(".unified-builder-review-dialog iframe").getAttribute("src"));
  assert.equal(currentFrameUrl.searchParams.get("releaseId"), releaseIds[1]);
  await page.getByRole("button", { name: "Close Review" }).click();
  await page.getByRole("button", { name: "Publish Preview" }).click();
  await page.getByText("Release 2 is now published.", { exact: true }).waitFor();
  await page.getByText("Release 2", { exact: true }).first().waitFor();
  const publishedViewer = observePage(await context.newPage(), "published-viewer");
  lifecycle("published-viewer-navigation-start");
  await publishedViewer.goto(pagePreviewUrl(releaseIds[1]), { waitUntil: "domcontentloaded" });
  lifecycle("published-viewer-navigation-complete");
  const extraVideoLauncher = publishedViewer.getByRole("button", { name: "Extra Videos", exact: true });
  await extraVideoLauncher.waitFor(); await extraVideoLauncher.click();
  await publishedViewer.getByRole("menuitem", { name: "Captioned extra", exact: true }).click();
  const captionedExtraDialog = publishedViewer.getByRole("dialog", { name: "Captioned extra" }); await captionedExtraDialog.waitFor();
  await captionedExtraDialog.locator("video").waitFor(); await captionedExtraDialog.getByRole("button", { name: "Turn subtitles off" }).waitFor();
  assert.match(await captionedExtraDialog.locator("video").getAttribute("src"), new RegExp(`${publicationV2Fixture.unitExtraAssetChecksum}\\.mp4`));
  await captionedExtraDialog.getByRole("button", { name: "Close Extra Video" }).click(); await captionedExtraDialog.waitFor({ state: "detached" });
  await extraVideoLauncher.click(); await publishedViewer.getByRole("menuitem", { name: "No captions extra", exact: true }).click();
  const noCaptionsExtraDialog = publishedViewer.getByRole("dialog", { name: "No captions extra" }); await noCaptionsExtraDialog.waitFor();
  assert.equal(await noCaptionsExtraDialog.getByRole("button", { name: /subtitles/i }).count(), 0); await noCaptionsExtraDialog.getByRole("button", { name: "Close Extra Video" }).click();
  await publishedViewer.getByRole("button", { name: "Native Drag and Drop" }).click();
  const immutableDragDrop = publishedViewer.locator(".published-native-activity .native-drag-drop-teacher"); await immutableDragDrop.waitFor();
  assert.equal(await extraVideoLauncher.count(), 0, "Unit Extra launcher is suppressed while an activity is open");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 900 }]) {
    await publishedViewer.setViewportSize(viewport); await immutableDragDrop.waitFor();
    const geometry = await measureDragDrop(immutableDragDrop, { context: "immutable-published-viewer-teacher", viewport });
    assert.ok(geometry.activityHostFillRatio > .95 && geometry.activityHostFillRatio < 1.05, JSON.stringify(geometry));
    assert.ok(geometry.usableVisualRatio > .72 && geometry.usableVisualRatio < .78, JSON.stringify(geometry));
    assert.ok(geometry.usableBankRatio > .22 && geometry.usableBankRatio < .28, JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.stageAspectRatio - geometry.sourceAspectRatio) < .02 && geometry.stageInsideVisual, JSON.stringify(geometry));
    assert.ok(geometry.horizontalOverflow <= 1, JSON.stringify(geometry));
  }
  await publishedViewer.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await immutableDragDrop.locator(".native-drag-drop-artwork img").evaluate((image) => getComputedStyle(image).objectFit), "contain");
  const immutableTarget = immutableDragDrop.locator(".native-drag-drop-teacher-target").first(); await immutableTarget.click(); assert.equal(await immutableTarget.getAttribute("data-revealed"), "true");
  await publishedViewer.getByRole("button", { name: "Back", exact: true }).click(); await extraVideoLauncher.waitFor();
  await extraVideoLauncher.click(); await publishedViewer.getByRole("menuitem", { name: "Captioned extra", exact: true }).click(); await captionedExtraDialog.waitFor(); await publishedViewer.keyboard.press("Escape"); await captionedExtraDialog.waitFor({ state: "detached" });
  await publishedViewer.getByRole("button", { name: "Next page", exact: true }).click(); assert.equal(await extraVideoLauncher.count(), 0); await publishedViewer.getByRole("button", { name: "Previous page", exact: true }).click(); await extraVideoLauncher.waitFor();
  lifecycle("image-composition-click-start");
  await publishedViewer.getByRole("button", { name: "Native Image Composition" }).click();
  lifecycle("image-composition-click-complete");
  await publishedViewer.locator(".native-image-surface img").first().waitFor();
  assert.equal(await publishedViewer.getByText("Native Image Composition", { exact: true }).count(), 0);
  assert.equal(await publishedViewer.getByText("Inspect both composed image layers.", { exact: true }).count(), 0);
  assert.equal(await publishedViewer.locator(".native-image-surface img").count(), 2);
  assert.deepEqual(await publishedViewer.locator(".native-image-surface img").evaluateAll((images) => images.map((image) => image.style.objectFit)), ["contain", "cover"]);
  await publishedViewer.getByRole("button", { name: "Back", exact: true }).click();
  await publishedViewer.getByRole("button", { name: "Published Listening Panels", exact: true }).click();
  const publishedListening = publishedViewer.locator('.published-native-activity[data-native-kind="listening"] .native-listening'); await publishedListening.waitFor();
  await publishedListening.getByText("Published listening question", { exact: true }).waitFor();
  const previousListeningPanel = publishedViewer.getByRole("button", { name: "Previous activity part", exact: true }); const nextListeningPanel = publishedViewer.getByRole("button", { name: "Next activity part", exact: true }); await previousListeningPanel.waitFor(); await nextListeningPanel.waitFor(); assert.equal(await previousListeningPanel.isDisabled(), true); assert.equal(await nextListeningPanel.isDisabled(), false);
  await nextListeningPanel.click(); await publishedListening.getByText("Published transcript first line", { exact: true }).waitFor(); assert.equal(await publishedListening.getAttribute("data-view"), "transcript"); assert.equal(await previousListeningPanel.isDisabled(), false); assert.equal(await nextListeningPanel.isDisabled(), true);
  await previousListeningPanel.click(); await publishedListening.getByText("Published listening question", { exact: true }).waitFor(); assert.equal(await publishedListening.getAttribute("data-view"), "questions");
  assert.equal(activeReleaseId, releaseIds[1]);
  assert.equal(releases[0].publicProjection.nativeActivities[activityId].document.parts[0].interaction.questions[0].prompt, "Draft version A");
  assert.equal(releases[1].publicProjection.nativeActivities[activityId].document.parts[0].interaction.questions[0].prompt, "Draft version B");
  assert.doesNotMatch(JSON.stringify(releases[1].publicProjection), new RegExp(publicationV2Fixture.teacherSentinel));
  assert.equal(releases[1].publicProjection.nativeActivities[imageActivityId].document.parts[0].interaction.images.length, 2);
  assert.equal(releases[1].publicProjection.nativeActivities[listeningActivityId].document.parts[0].interaction.panels.length, 2);
  lifecycle("acceptance-complete");
  process.stdout.write("Immutable publication acceptance passed for Unit Extras, Drag & Drop geometry, Open Response/Image, Listening panels, stale blocking, exact publish, and private Teacher reveal.\n");
} catch (error) {
  lifecycle("test-error", {
    name: error?.name || "Error",
    message: error?.message || "unknown",
    browserConnected: browser?.isConnected() ?? false,
    browserDisconnected: lifecycleState.browserDisconnected,
    contextClosed: lifecycleState.contextClosed,
    pages: [...lifecycleState.pages.entries()].map(([label, state]) => `${label}:${state.crashed ? "crashed" : state.closed ? "closed" : "open"}`).join(","),
  });
  throw error;
} finally {
  lifecycleState.cleanupStarted = true;
  lifecycle("cleanup-begin");
  lifecycle("browser-close-start");
  await browser?.close();
  lifecycle("browser-close-complete");
  lifecycle("server-close-start");
  await new Promise((resolve) => server.close(resolve));
  lifecycle("server-close-complete");
  lifecycle("cleanup-complete");
}
