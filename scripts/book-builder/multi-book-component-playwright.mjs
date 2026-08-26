import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";
import { canonicalStudentsBookPages } from "../../netlify-sites/ultimate-b2-builder/server/_builder-page-catalog.js";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const studentsHotspots = JSON.parse(await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8"));
const mime = { ".css": "text/css", ".gaf": "application/x-gaf", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
const previewAuthorization = `v1.eA.${"a".repeat(43)}`;
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const components = Object.freeze({ workbook: "ultimate-b2-workbook", grammar: "ultimate-b2-grammar-book" });
const exchangeRequests = [];

function managedCatalog(componentSlug) {
  const title = componentSlug === components.workbook ? "Workbook" : "Grammar Book";
  const abbreviation = componentSlug === components.workbook ? "wb" : "gb";
  const units = Array.from({ length: 10 }, (_, index) => ({ id: `${componentSlug}-unit-${index + 1}`, slug: `unit-${index + 1}`, title: `Unit ${index + 1}`, unitNumber: index + 1, sortOrder: index + 1 }));
  return {
    revision: 2,
    component: { bookSlug: "ultimate-b2", componentSlug, kind: "managed", title },
    units,
    pages: [1, 2].map((number) => ({
      id: `ultimate-b2-${abbreviation}-unit-1-page-${number}`,
      componentSlug,
      unitId: units[0].id,
      unitNumber: 1,
      unitTitle: "Unit 1",
      label: `${title} page ${number}`,
      printedLabel: String(number),
      sortOrder: number * 10,
      source: "managed-upload",
      image: { source: "managed", url: pixel, width: 1, height: 1, checksumSha256: "a".repeat(64) },
    })),
  };
}

const managedCatalogs = Object.freeze({
  [components.workbook]: managedCatalog(components.workbook),
  [components.grammar]: managedCatalog(components.grammar),
});

function managedHotspots(componentSlug) {
  return {
    bookSlug: "ultimate-b2", componentSlug, resource: "hotspots", documentKey: "default", schemaVersion: "1.0", revision: 0, source: "repository",
    document: { schemaVersion: "1.0", packageSlug: "ultimate-b2", componentSlug, pages: {} },
  };
}

function sendJson(response, value, status = 200) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}

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
    sendJson(response, { authenticated: true, builderUser: { id: "ultimate-b2-acceptance", full_name: "Ultimate B2 Acceptance", role: "developer", status: "active" } }); return;
  }
  if (url.pathname === "/builder/api/preview-authorization" && request.method === "POST") {
    sendJson(response, { token: previewAuthorization, expiresAt: "2099-01-01T00:00:00.000Z" }); return;
  }
  const pagesMatch = url.pathname.match(/^\/builder\/api\/pages\/books\/ultimate-b2\/components\/(ultimate-b2-(?:students-book|workbook|grammar-book))$/);
  if (pagesMatch && request.method === "GET") {
    const componentSlug = pagesMatch[1];
    sendJson(response, componentSlug === "ultimate-b2-students-book"
      ? { revision: 0, component: { bookSlug: "ultimate-b2", componentSlug, kind: "students-book" }, pages: canonicalStudentsBookPages }
      : managedCatalogs[componentSlug]);
    return;
  }
  const hotspotMatch = url.pathname.match(/^\/builder\/api\/content\/books\/ultimate-b2\/components\/(ultimate-b2-(?:students-book|workbook|grammar-book))\/hotspots$/);
  if (hotspotMatch && request.method === "GET") {
    const componentSlug = hotspotMatch[1];
    sendJson(response, componentSlug === "ultimate-b2-students-book"
      ? { bookSlug: "ultimate-b2", componentSlug, resource: "hotspots", documentKey: "default", schemaVersion: "1.0", revision: 0, source: "repository", document: studentsHotspots }
      : managedHotspots(componentSlug));
    return;
  }
  if (url.pathname === "/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/native-activity-index" && request.method === "GET") {
    sendJson(response, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "native-activity-index", documentKey: "default", schemaVersion: "1.0", revision: 0, source: "repository", document: { schemaVersion: "1.0", activities: [] } }); return;
  }
  const openResponse = url.pathname.match(/^\/builder\/api\/content\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/open-response\/([a-z0-9-]+)$/);
  if (openResponse && request.method === "GET") {
    const activityId = openResponse[1];
    sendJson(response, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "open-response", documentKey: activityId, schemaVersion: "1.0", revision: 0, source: "repository", document: { schemaVersion: "1.0", activityId, visibleInstructionText: "", questions: [{ id: `${activityId}-q1`, prompt: "Browser acceptance prompt" }] } }); return;
  }
  if (url.pathname.startsWith("/builder/api/open-response-import/status/") && request.method === "GET") {
    sendJson(response, { revision: 0, fingerprint: null, updatedAt: null, files: [] }); return;
  }
  const nativeMatch = url.pathname.match(/^\/builder\/api\/native-activities\/books\/ultimate-b2\/components\/(ultimate-b2-(?:students-book|workbook|grammar-book))\/(catalog|lifecycle)$/);
  if (nativeMatch && request.method === "GET") {
    sendJson(response, nativeMatch[2] === "catalog"
      ? { schemaVersion: "1.0", activities: [] }
      : { schemaVersion: "1.0", revision: 0, source: "repository", document: { schemaVersion: "1.0", activities: {} } });
    return;
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
  const pageErrors = [];
  const failedResponses = [];
  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/preview/authorization/exchange" && request.method() === "POST") {
      exchangeRequests.push(JSON.parse(request.postData() || "{}"));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: previewAuthorization, expiresAt: "2099-01-01T00:00:00.000Z" }) });
    }
    const pagePreview = url.pathname.match(/^\/preview\/pages\/books\/ultimate-b2\/components\/(ultimate-b2-(?:workbook|grammar-book))$/);
    if (pagePreview) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(managedCatalogs[pagePreview[1]]) });
    const hotspotPreview = url.pathname.match(/^\/preview\/content\/books\/ultimate-b2\/components\/(ultimate-b2-(?:students-book|workbook|grammar-book))\/hotspots$/);
    if (hotspotPreview) {
      const componentSlug = hotspotPreview[1];
      const body = componentSlug === "ultimate-b2-students-book"
        ? { bookSlug: "ultimate-b2", componentSlug, resource: "hotspots", schemaVersion: "1.0", revision: 0, source: "repository", document: studentsHotspots }
        : managedHotspots(componentSlug);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (url.pathname === "/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/ui-controller") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ document: { schemaVersion: "1.0", packageId: "ultimate-b2-students-book", assets: {} } }) });
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
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });

  await page.goto(`${origin}/#/books`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Book Builder" }).waitFor();
  for (const title of ["Ultimate English B1", "Ultimate English B1+", "Ultimate B2"]) await page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(await page.locator(".hosted-builder-book-card .hosted-builder-cover-placeholder").count(), 2);

  await page.goto(`${origin}/#/books/ultimate-b2`, { waitUntil: "domcontentloaded" });
  for (const title of ["Students Book", "Workbook", "Grammar Book", "Test Book"]) await page.getByRole("heading", { name: title, exact: true }).waitFor();
  assert.equal(await page.locator(".hosted-builder-component-card[data-available]").count(), 3);
  for (const title of ["Workbook", "Grammar Book"]) assert.equal(await page.locator(`.hosted-builder-component-card:has-text("${title}") a:has-text("Open workspace")`).count(), 1);
  await page.locator('.hosted-builder-component-card:has-text("Test Book") .hosted-builder-unavailable').waitFor();

  for (const [componentSlug, title] of [[components.workbook, "Workbook"], [components.grammar, "Grammar Book"]]) {
    await page.goto(`${origin}/#/books/ultimate-b2/components/${componentSlug}`, { waitUntil: "domcontentloaded" });
    await page.locator(`[data-component-pages="${componentSlug}"]`).waitFor();
    assert.deepEqual(await page.locator(".hosted-builder-tool-tabs a strong").allTextContents(), ["Pages", "Hotspot Builder", "Activity Builder"]);
    assert.equal(await page.locator(".component-pages-groups > section").count(), 11);
    assert.equal(await page.locator(".component-page-card").count(), 2);

    await page.goto(`${origin}/#/books/ultimate-b2/components/${componentSlug}/hotspots`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: `${title} hotspot builder` }).waitFor();
    await page.getByText("No hotspots yet", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Add hotspot" }).isDisabled(), true);

    await page.goto(`${origin}/#/books/ultimate-b2/components/${componentSlug}/activities`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Activity authoring" }).waitFor();
    await page.getByText("No activities yet", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Add Activity" }).isEnabled(), true);
  }

  for (const componentSlug of [components.workbook, components.grammar]) {
    const catalog = managedCatalogs[componentSlug];
    await page.goto(`https://hhplms-viewer.netlify.app/?builderPreview=1&bookSlug=ultimate-b2&componentSlug=${componentSlug}&previewAuthorization=${encodeURIComponent(previewAuthorization)}&view=page&unitNumber=1&pageId=${catalog.pages[0].id}`, { waitUntil: "domcontentloaded" });
    await page.locator(".teacher-offline-page-stage").waitFor();
    assert.equal(await page.getByRole("button", { name: "Previous page" }).isDisabled(), true);
    await page.getByRole("button", { name: "Next page" }).click();
    await page.waitForFunction((label) => document.querySelector(".teacher-offline-page-image img")?.alt.includes(label), catalog.pages[1].label);
    assert.equal(await page.getByRole("button", { name: "Next page" }).isDisabled(), true);
    await page.getByRole("button", { name: "Previous page" }).click();
    await page.waitForFunction((label) => document.querySelector(".teacher-offline-page-image img")?.alt.includes(label), catalog.pages[0].label);
  }

  const studentsIdentity = `builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&previewAuthorization=${encodeURIComponent(previewAuthorization)}`;
  await page.goto(`https://hhplms-viewer.netlify.app/?${studentsIdentity}&view=page&unitNumber=1&pageId=ub2-sb-unit-1-part-1`, { waitUntil: "domcontentloaded" });
  await page.locator(".teacher-offline-page-stage").waitFor();
  assert.equal(await page.locator('.teacher-book-navigation-book-switch[data-book-id="students-book"]').getAttribute("aria-current"), "page");
  await page.locator('.teacher-book-navigation-book-switch[data-book-id="workbook"]').click();
  await page.locator(".teacher-offline-page-stage").waitFor();
  await page.locator('.teacher-book-navigation-book-switch[data-book-id="workbook"][aria-current="page"]').waitFor();
  await page.locator('.teacher-book-navigation-book-switch[data-book-id="grammar-book"]').click();
  await page.locator(".teacher-offline-page-stage").waitFor();
  await page.locator('.teacher-book-navigation-book-switch[data-book-id="grammar-book"][aria-current="page"]').waitFor();
  assert.deepEqual(exchangeRequests.map((entry) => [entry.source.componentSlug, entry.intent.componentSlug]), [
    ["ultimate-b2-students-book", components.workbook],
    [components.workbook, components.grammar],
  ]);

  assert.deepEqual(consoleErrors, [], failedResponses.join("\n"));
  assert.deepEqual(pageErrors, []);
  process.stdout.write("Ultimate B2 multi-component Builder and hosted Viewer browser acceptance passed.\n");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
