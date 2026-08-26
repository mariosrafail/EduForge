import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { canonicalStudentsBookPages } from "../../netlify-sites/ultimate-b2-builder/server/_builder-page-catalog.js";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";

const root = path.resolve("dist-netlify/ultimate-b2-builder");
const mime = { ".css": "text/css", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
const imageA = await readFile("unit/1/parts/HD/parts_part_1.png");
const imageB = await readFile("unit/1/parts/HD/parts_part_2.png");
const state = {
  students: { revision: 0, pages: canonicalStudentsBookPages.map((page) => ({ ...page })) },
  workbook: { revision: 0, pages: [] },
  sessions: new Map(),
  uploads: new Map(),
};
let origin;

function json(response, status, body) {
  const encoded = JSON.stringify(body);
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(encoded), "Cache-Control": "no-store" });
  response.end(encoded);
}

async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function library(component) {
  const current = component === "ultimate-b2-students-book" ? state.students : state.workbook;
  return { revision: current.revision, component: { bookSlug: "ultimate-b2", componentSlug: component, kind: component.endsWith("workbook") ? "workbook" : "students-book" }, pages: current.pages };
}

function managedImage(pageId, uploadId, bytes) {
  return { source: "managed", assetId: uploadId, url: `/test-uploaded/${uploadId}`, originalFilename: "browser-page.png", mimeType: "image/png", byteSize: bytes.length, checksumSha256: "a".repeat(64), width: 581, height: 794 };
}

async function pagesApi(request, response, url) {
  const match = url.pathname.match(/^\/builder\/api\/pages\/books\/ultimate-b2\/components\/(ultimate-b2-(?:students-book|workbook))(.*)$/);
  if (!match) return false;
  const [, component, suffix] = match;
  const current = component.endsWith("workbook") ? state.workbook : state.students;
  if (!suffix && request.method === "GET") { json(response, 200, library(component)); return true; }
  const input = request.method === "POST" ? JSON.parse((await body(request)).toString("utf8")) : {};
  if (suffix === "/assets/prepare") {
    if (input.expectedRevision !== current.revision) { json(response, 409, { error: "revision_conflict", currentRevision: current.revision }); return true; }
    const pageId = input.mode === "create" ? `wb-page-${input.clientMutationId.replaceAll("-", "")}` : input.pageId;
    const uploadId = input.clientMutationId;
    state.sessions.set(uploadId, { component, pageId, mode: input.mode, metadata: input.metadata });
    json(response, 200, { pageId, uploadId, expectedRevision: current.revision, expiresIn: 900, authorization: { url: `${origin}/test-upload/${uploadId}`, headers: { "Content-Type": input.file.type } }, idempotent: false });
    return true;
  }
  if (suffix === "/assets/finalize") {
    const session = state.sessions.get(input.uploadId);
    const bytes = state.uploads.get(input.uploadId);
    if (!session || session.component !== component || !bytes) { json(response, 409, { error: "session_identity_conflict" }); return true; }
    if (session.mode === "create") {
      current.pages.push({ id: session.pageId, stableKey: `${component}/pages/${session.pageId}`, componentSlug: component, source: "managed", unitNumber: null, unitTitle: "", sectionTitle: "", partNumber: null, printedPages: [], printedLabel: session.metadata.printedLabel, sortOrder: session.metadata.sortOrder, label: session.metadata.label, image: managedImage(session.pageId, input.uploadId, bytes) });
    } else {
      const index = current.pages.findIndex((page) => page.id === session.pageId);
      const existing = current.pages[index];
      current.pages[index] = { ...existing, source: component.endsWith("students-book") ? "override" : "managed", image: managedImage(session.pageId, input.uploadId, bytes), ...(component.endsWith("students-book") ? { baselineImage: existing.baselineImage || existing.image } : {}) };
    }
    current.revision += 1;
    json(response, 200, { ...library(component), idempotent: false }); return true;
  }
  const mutation = suffix.match(/^\/pages\/([a-z0-9-]+)\/(metadata|reorder|delete|restore)$/);
  if (mutation) {
    const [, pageId, action] = mutation;
    const index = current.pages.findIndex((page) => page.id === pageId);
    if (index < 0) { json(response, 404, { error: "page_not_found" }); return true; }
    if (component.endsWith("students-book") && action === "delete") { json(response, 400, { error: "students_book_baseline_metadata_locked" }); return true; }
    if (action === "restore") {
      const baseline = canonicalStudentsBookPages.find((page) => page.id === pageId);
      current.pages[index] = { ...baseline };
    } else if (action === "delete") current.pages.splice(index, 1);
    else current.pages[index] = { ...current.pages[index], ...input.metadata };
    current.revision += 1;
    json(response, 200, { ...library(component), idempotent: false }); return true;
  }
  json(response, 404, { error: "page_route_not_found" }); return true;
}

async function staticFile(pathname, response) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  let file = path.resolve(root, relative);
  let details = file.startsWith(`${root}${path.sep}`) ? await stat(file).catch(() => null) : null;
  if (!details?.isFile()) { file = path.join(root, "index.html"); details = await stat(file); }
  response.writeHead(200, { "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream", "Content-Length": details.size });
  createReadStream(file).pipe(response);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/builder/api/auth" && url.searchParams.get("action") === "me") return json(response, 200, { authenticated: true, builderUser: { id: "pages-browser", full_name: "Pages Browser", role: "developer", status: "active" } });
  if (url.pathname.startsWith("/test-upload/") && request.method === "PUT") { state.uploads.set(url.pathname.split("/").at(-1), await body(request)); response.writeHead(200); response.end(); return; }
  if (url.pathname.startsWith("/test-uploaded/")) { const bytes = state.uploads.get(url.pathname.split("/").at(-1)); if (!bytes) return json(response, 404, {}); response.writeHead(200, { "Content-Type": "image/png", "Content-Length": bytes.length }); response.end(bytes); return; }
  if (await pagesApi(request, response, url)) return;
  await staticFile(url.pathname, response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60_000);

  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-workbook`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "No pages added yet." }).waitFor();
  const addChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add pages" }).first().click();
  await (await addChooser).setFiles([{ name: "Workbook A.png", mimeType: "image/png", buffer: imageA }, { name: "Workbook B.png", mimeType: "image/png", buffer: imageB }]);
  await page.locator(".component-page-card").nth(1).waitFor();
  assert.deepEqual(await page.locator(".component-page-card-copy strong").allTextContents(), ["Workbook A", "Workbook B"]);
  const firstId = await page.locator(".component-page-card").first().getAttribute("data-page-id");

  await page.locator(".component-page-card").first().getByTitle("Edit metadata").click();
  await page.getByLabel("Label").fill("Workbook opening page");
  await page.getByLabel("Printed page or spread").fill("2");
  await page.getByRole("button", { name: "Save metadata" }).click();
  await page.locator(".component-page-card-copy strong", { hasText: "Workbook opening page" }).waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".component-page-card-copy strong", { hasText: "Workbook opening page" }).waitFor();
  assert.equal(await page.locator(".component-page-card").first().getAttribute("data-page-id"), firstId);

  const replaceChooser = page.waitForEvent("filechooser");
  await page.locator(".component-page-card").first().getByTitle("Replace page image").click();
  await (await replaceChooser).setFiles({ name: "replacement.png", mimeType: "image/png", buffer: imageB });
  await page.locator(".component-pages-progress").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".component-page-card").first().getAttribute("data-page-id"), firstId);

  await page.locator(".component-page-card").nth(1).getByTitle("Delete page").click();
  await page.locator(".builder-modal .builder-danger-action").click();
  await page.locator(".component-page-card").nth(1).waitFor({ state: "detached" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".component-page-card").first().waitFor();
  assert.equal(await page.locator(".component-page-card").count(), 1);
  assert.equal(await page.locator(".component-page-card").first().getAttribute("data-page-id"), firstId);

  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book`, { waitUntil: "domcontentloaded" });
  const baseline = canonicalStudentsBookPages[0];
  assert.equal(await page.locator(`.component-page-card[data-page-id="${baseline.id}"]`).getAttribute("data-source"), "repository-baseline");
  const studentReplace = page.waitForEvent("filechooser");
  await page.locator(`.component-page-card[data-page-id="${baseline.id}"]`).getByTitle("Replace page image").click();
  await (await studentReplace).setFiles({ name: "student-replacement.png", mimeType: "image/png", buffer: imageA });
  await page.locator(`.component-page-card[data-page-id="${baseline.id}"][data-source="override"]`).waitFor();
  await page.locator(`.component-page-card[data-page-id="${baseline.id}"]`).getByTitle("Restore canonical page").click();
  await page.locator(`.component-page-card[data-page-id="${baseline.id}"][data-source="repository-baseline"]`).waitFor();
  assert.equal(state.workbook.pages.some((item) => item.id === baseline.id), false);

  const foreign = await page.request.get(`${origin}/builder/api/pages/books/ultimate-b2/components/ultimate-b2-workbook/pages/${baseline.id}/assets/${baseline.id}/preview`);
  assert.equal(foreign.status(), 404);
  process.stdout.write("Component Pages browser acceptance passed.\n");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
