import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { compilePublicationV2Fixture, publicationV2Fixture } from "../../tests/fixtures/publication-v2.js";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const activityId = publicationV2Fixture.openResponseId;
const imageActivityId = publicationV2Fixture.imageId;
const releaseIds = ["10000000-0000-4000-8000-000000000091", "10000000-0000-4000-8000-000000000092"];
const publication = "/builder/api/publication/books/ultimate-b2/components/ultimate-b2-students-book";
const mime = { ".css": "text/css", ".gaf": "application/octet-stream", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
let savedPrompt = "Draft version A";
let sourceVersion = 1;
let headRevision = 0;
let activeReleaseId = null;
const releases = [];

function projection(prompt) {
  const compiled = compilePublicationV2Fixture({ prompt });
  return { publicProjection: compiled.publicProjection, teacherProjection: compiled.teacherProjection, sourceSnapshot: compiled.sourceSnapshot, compatibility: compiled.compatibility, releaseSha256: compiled.releaseSha256 };
}
function sourceSha() { return `${sourceVersion}`.repeat(64).slice(0, 64); }
function metadata(release) { return { id: release.id, number: release.number, compilerId: "ultimate-b2-students-book-v2", releaseSchemaVersion: "2.0", releaseSha256: release.releaseSha256, sourceSnapshotSha256: release.sourceSha, createdAt: release.createdAt, current: activeReleaseId === release.id, publishedAt: activeReleaseId === release.id ? "2026-08-14T10:05:00Z" : null, state: release.sourceSha === sourceSha() ? "current" : "stale" }; }
function sendJson(response, statusCode, value) { const body = Buffer.from(JSON.stringify(value)); response.writeHead(statusCode, { "Cache-Control": "no-store", "Content-Length": body.length, "Content-Type": "application/json" }); response.end(body); }
async function staticResponse(root, pathname, response, fallback) { const relative = pathname === "/" ? fallback : decodeURIComponent(pathname).replace(/^\/+/, ""); let file = path.resolve(root, relative); let details = file.startsWith(`${root}${path.sep}`) ? await stat(file).catch(() => null) : null; if (!details?.isFile()) { file = path.join(root, fallback); details = await stat(file); } response.writeHead(200, { "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": details.size }); createReadStream(file).pipe(response); }

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/builder/api/auth" && url.searchParams.get("action") === "me") return sendJson(response, 200, { authenticated: true, builderUser: { id: "task-9", full_name: "Task 9 Browser", role: "developer", status: "active" } });
  if (url.pathname === "/builder/api/preview-authorization" && request.method === "POST") return sendJson(response, 200, { token: `v1.eA.${"a".repeat(43)}`, expiresAt: "2099-01-01T00:00:00.000Z" });
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
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/^\/preview\/releases\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/([0-9a-f-]+)\/(public|teacher-ui|teacher-solution|native-teacher|assets)(?:\/(.*))?$/);
    if (match) {
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
      if (match[2] === "assets") return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, ""); let file = path.resolve(viewerRoot, relative); let details = file.startsWith(`${viewerRoot}${path.sep}`) ? await stat(file).catch(() => null) : null; if (!details?.isFile()) file = path.join(viewerRoot, "index.html");
    return route.fulfill({ status: 200, contentType: mime[path.extname(file).toLowerCase()] || "application/octet-stream", body: await readFile(file) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(60_000); page.on("dialog", (dialog) => dialog.accept());
  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/publication`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Publication", exact: true }).waitFor();
  await page.getByText("No release published yet", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Prepare Preview" }).click();
  await page.getByText("Release 1 · Current", { exact: true }).waitFor();
  const frameUrl = new URL(await page.locator('iframe[title="Immutable release 1 preview"]').getAttribute("src"));
  assert.equal(frameUrl.searchParams.get("releaseId"), releaseIds[0]);

  const viewer = await context.newPage();
  const previewToken = encodeURIComponent(`v1.eA.${"a".repeat(43)}`);
  const pagePreviewUrl = (releaseId) => `https://hhplms-viewer.netlify.app/?builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&releaseId=${releaseId}&view=page&unitNumber=1&pageId=${publicationV2Fixture.pageId}&previewAuthorization=${previewToken}`;
  await viewer.goto(pagePreviewUrl(releaseIds[0]), { waitUntil: "domcontentloaded" });
  await viewer.getByRole("button", { name: "Native Open Response" }).click();
  await viewer.getByText("Draft version A", { exact: true }).waitFor();
  await viewer.getByRole("button", { name: /Reveal model answer/ }).waitFor();
  assert.equal(await viewer.getByText(publicationV2Fixture.teacherSentinel, { exact: true }).count(), 0);
  await viewer.getByRole("button", { name: /Reveal model answer/ }).click();
  await viewer.getByText(publicationV2Fixture.teacherSentinel, { exact: true }).waitFor();
  savedPrompt = "Draft version B"; sourceVersion = 2;
  await viewer.reload({ waitUntil: "domcontentloaded" });
  await viewer.getByRole("button", { name: "Native Open Response" }).click();
  await viewer.getByText("Draft version A", { exact: true }).waitFor();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Release 1 · Stale", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Publish Preview" }).isDisabled(), true);
  const direct = await page.evaluate(async ({ publication, id }) => { const response = await fetch(`${publication}/publish`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ releaseId: id, expectedHeadRevision: 0, clientMutationId: crypto.randomUUID() }) }); return { status: response.status, body: await response.json() }; }, { publication, id: releaseIds[0] });
  assert.deepEqual(direct, { status: 409, body: { error: "stale_release_preview" } });

  await page.getByRole("button", { name: "Prepare Preview" }).click();
  await page.getByText("Release 2 · Current", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Publish Preview" }).click();
  await page.getByText("Release 2 is now published.", { exact: true }).waitFor();
  await page.getByText("Release 2", { exact: true }).first().waitFor();
  const publishedViewer = await context.newPage();
  await publishedViewer.goto(pagePreviewUrl(releaseIds[1]), { waitUntil: "domcontentloaded" });
  await publishedViewer.getByRole("button", { name: "Native Image Composition" }).click();
  await publishedViewer.getByRole("heading", { name: "Native Image Composition", exact: true }).waitFor();
  assert.equal(await publishedViewer.locator(".native-image-surface img").count(), 2);
  assert.deepEqual(await publishedViewer.locator(".native-image-surface img").evaluateAll((images) => images.map((image) => image.style.objectFit)), ["contain", "cover"]);
  assert.equal(activeReleaseId, releaseIds[1]);
  assert.equal(releases[0].publicProjection.nativeActivities[activityId].document.parts[0].interaction.questions[0].prompt, "Draft version A");
  assert.equal(releases[1].publicProjection.nativeActivities[activityId].document.parts[0].interaction.questions[0].prompt, "Draft version B");
  assert.doesNotMatch(JSON.stringify(releases[1].publicProjection), new RegExp(publicationV2Fixture.teacherSentinel));
  assert.equal(releases[1].publicProjection.nativeActivities[imageActivityId].document.parts[0].interaction.images.length, 2);
  process.stdout.write("Phase 5 native Open Response/Image publication, immutable preview, stale block, exact publish, and private Teacher reveal browser acceptance passed.\n");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
