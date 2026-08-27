import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";
import { canonicalStudentsBookPages } from "../../netlify-sites/ultimate-b2-builder/server/_builder-page-catalog.js";
import { createBuilderPreviewHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-preview.js";
import { resolveBuilderContentResource } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const studentsHotspots = JSON.parse(await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8"));
const managedPageBytes = await readFile("unit/1/parts/HD/parts_part_1.png");
const mime = { ".css": "text/css", ".gaf": "application/x-gaf", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
const previewAuthorization = `v1.eA.${"a".repeat(43)}`;
const components = Object.freeze({ workbook: "ultimate-b2-workbook", grammar: "ultimate-b2-grammar-book" });
const exchangeRequests = [];
const managedAssetRequests = [];

function managedCatalog(componentSlug) {
  const title = componentSlug === components.workbook ? "Workbook" : "Grammar Book";
  const abbreviation = componentSlug === components.workbook ? "wb" : "gb";
  const units = Array.from({ length: 10 }, (_, index) => ({ id: `${componentSlug}-unit-${index + 1}`, slug: `unit-${index + 1}`, title: `Unit ${index + 1}`, unitNumber: index + 1, sortOrder: index + 1 }));
  return {
    revision: 2,
    component: { bookSlug: "ultimate-b2", componentSlug, kind: "managed", title },
    units,
    pages: [1, 2].map((number) => {
      const pageId = `ultimate-b2-${abbreviation}-unit-1-page-${number}`;
      const assetId = `40000000-0000-4000-8000-${String(number + (abbreviation === "gb" ? 100 : 0)).padStart(12, "0")}`;
      return {
        id: pageId,
        componentSlug,
        unitId: units[0].id,
        unitNumber: 1,
        unitTitle: "Unit 1",
        label: `${title} page ${number}`,
        printedLabel: String(number),
        sortOrder: number * 10,
        source: "managed-upload",
        image: { source: "managed", assetId, url: `/preview/pages/books/ultimate-b2/components/${componentSlug}/pages/${pageId}/assets/${assetId}/preview?previewAuthorization=${encodeURIComponent(previewAuthorization)}`, width: 581, height: 794, checksumSha256: "a".repeat(64) },
      };
    }),
  };
}

const managedCatalogs = Object.freeze({
  [components.workbook]: managedCatalog(components.workbook),
  [components.grammar]: managedCatalog(components.grammar),
});

const managedPreviewResolutions = [];
const managedPreviewLoads = [];
const managedPreviewSql = async (strings, ...values) => {
  const query = strings.join(" ");
  if (query.includes("from book_packages package join book_components component")) return [{ id: values[1], revision: managedCatalogs[values[1]].revision }];
  if (query.includes("from units unit")) return managedCatalogs[values[0]].units.map((unit) => ({ id: unit.id, slug: unit.slug, title: unit.title, unit_number: unit.unitNumber, sort_order: unit.sortOrder }));
  if (query.includes("from book_pages page")) return managedCatalogs[values[1]].pages.map((page) => ({
    id: page.id, stable_key: `${values[1]}/pages/${page.id}`, source_metadata: { is_active: true },
    unit_id: page.unitId, unit_number: 1, asset_id: page.image.assetId,
  }));
  return [];
};
const managedPreviewHandler = createBuilderPreviewHandler({
  getDatabase: () => managedPreviewSql,
  resolveResource: async (...arguments_) => {
    managedPreviewResolutions.push(`${arguments_[1]}:${arguments_[2]}:${arguments_[3] || ""}`);
    return resolveBuilderContentResource(...arguments_);
  },
  loadDocument: async (_sql, resource) => {
    managedPreviewLoads.push(`${resource.componentSlug}:${resource.resource}:${resource.documentKey}`);
    return null;
  },
  authorizePreview: async (event, _sql, scope) => scope.action === "managed-hotspots"
    && event.queryStringParameters?.previewAuthorization === previewAuthorization,
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
    const managedAssetPreview = url.pathname.match(/^\/preview\/pages\/books\/ultimate-b2\/components\/(ultimate-b2-(?:workbook|grammar-book))\/pages\/([a-z0-9-]+)\/assets\/([0-9a-f-]+)\/preview$/);
    if (managedAssetPreview) {
      managedAssetRequests.push({ componentSlug: managedAssetPreview[1], pageId: managedAssetPreview[2], authorization: url.searchParams.get("previewAuthorization") });
      return route.fulfill({ status: 200, contentType: "image/png", body: managedPageBytes });
    }
    const hotspotPreview = url.pathname.match(/^\/preview\/content\/books\/ultimate-b2\/components\/(ultimate-b2-(?:students-book|workbook|grammar-book))\/hotspots$/);
    if (hotspotPreview) {
      const componentSlug = hotspotPreview[1];
      if (componentSlug === "ultimate-b2-students-book") {
        const body = { bookSlug: "ultimate-b2", componentSlug, resource: "hotspots", schemaVersion: "1.0", revision: 0, source: "repository", document: studentsHotspots };
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      }
      const previewResponse = await managedPreviewHandler({
        httpMethod: request.method(),
        path: `/builder${url.pathname}`,
        headers: request.headers(),
        queryStringParameters: Object.fromEntries(url.searchParams),
      });
      return route.fulfill({ status: previewResponse.statusCode, headers: previewResponse.headers, body: previewResponse.body });
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
    const selectedCatalog = managedCatalogs[componentSlug];
    await page.getByRole("button", { name: `Preview ${selectedCatalog.pages[1].label}` }).click();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    const pagesReview = page.frameLocator(".unified-builder-review-dialog iframe");
    await pagesReview.getByAltText(new RegExp(selectedCatalog.pages[1].label)).waitFor();
    assert.deepEqual(await page.getByLabel("Review page").locator("option").allTextContents(), selectedCatalog.pages.map((item) => `Unit 1 · Pages ${item.printedLabel} · ${item.label}`));
    await page.getByRole("button", { name: "Close Review" }).click();

    await page.goto(`${origin}/#/books/ultimate-b2/components/${componentSlug}/hotspots`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: `${title} hotspot builder` }).waitFor();
    await page.getByText("No hotspots yet", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Add hotspot" }).isDisabled(), true);

    await page.goto(`${origin}/#/books/ultimate-b2/components/${componentSlug}/activities`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Activity authoring" }).waitFor();
    await page.getByText("No activities yet", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Add Activity" }).isEnabled(), true);
  }

  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const studentsPagesReview = page.frameLocator(".unified-builder-review-dialog iframe");
  await studentsPagesReview.locator(".teacher-offline-page-stage").waitFor();
  assert.equal((await page.getByLabel("Review page").locator("option").allTextContents()).some((label) => /Workbook|Grammar Book/.test(label)), false);
  await page.getByRole("button", { name: "Close Review" }).click();

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
  assert.equal(managedAssetRequests.length >= 6, true);
  assert.equal(managedAssetRequests.every((entry) => entry.authorization === previewAuthorization && entry.pageId.startsWith(entry.componentSlug === components.workbook ? "ultimate-b2-wb-" : "ultimate-b2-gb-")), true);
  for (const componentSlug of [components.workbook, components.grammar]) {
    assert.equal(managedPreviewResolutions.includes(`${componentSlug}:hotspots:`), true);
    assert.equal(managedPreviewResolutions.includes(`${componentSlug}:native-activity-index:`), true);
    assert.equal(managedPreviewLoads.includes(`${componentSlug}:hotspots:default`), true);
    assert.equal(managedPreviewLoads.includes(`${componentSlug}:native-activity-index:default`), true);
  }
  assert.equal(managedPreviewResolutions.some((entry) => entry.includes(":activity-lifecycle:")), false);
  assert.equal(managedPreviewLoads.some((entry) => /:activity-lifecycle:|:native-activity-teacher:/.test(entry)), false);
  assert.equal(failedResponses.some((entry) => /pub-.*\.r2\.dev|publishers\//i.test(entry)), false);

  assert.deepEqual(consoleErrors, [], failedResponses.join("\n"));
  assert.deepEqual(pageErrors, []);
  process.stdout.write("Ultimate B2 multi-component Builder and hosted Viewer browser acceptance passed.\n");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
