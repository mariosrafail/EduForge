import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";
import { canonicalStudentsBookPages } from "../../netlify-sites/ultimate-b2-builder/server/_builder-page-catalog.js";
import { createBuilderPagesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-pages.js";
import { createBuilderPreviewHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-preview.js";
import { createBuilderPreviewAuthorizationHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization-handler.js";
import { classifyBuilderPreviewAuthorization, inspectBuilderPreviewAuthorizationScope, issueBuilderPreviewAuthorization } from "../../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization.js";
import { resolveBuilderContentResource } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { createBuilderWorker } from "../../cloudflare/builder/worker.js";
import { buildBookAssetHostedTeacherUiPublicKey } from "../../lib/book-assets/object-keys.js";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const studentsHotspots = JSON.parse(await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8"));
const managedPageBytes = await readFile("unit/1/parts/HD/parts_part_1.png");
const mime = { ".css": "text/css", ".gaf": "application/x-gaf", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
const components = Object.freeze({ workbook: "ultimate-b2-workbook", grammar: "ultimate-b2-grammar-book" });
const previewEnvironment = { BUILDER_PREVIEW_AUTH_SECRET: "multi-book-browser-test-secret-with-at-least-thirty-two-bytes" };
const previewNow = Date.parse("2026-08-27T12:00:00Z");
const teacherUiChecksum = createHash("sha256").update(managedPageBytes).digest("hex");
const teacherUiObjectKey = buildBookAssetHostedTeacherUiPublicKey({ checksum: teacherUiChecksum, extension: "png" });
const exchangeRequests = [];
const authorizationIntents = [];
const managedAssetRequests = [];
const managedStorageObjectRequests = [];
const teacherUiObjectRequests = [];
const canonicalViewerAssetRequests = [];
const managedReviewTokens = new Map();
const managedStorageOrigin = "https://hhplms-viewer.netlify.app";

function managedCatalog(componentSlug) {
  const title = componentSlug === components.workbook ? "Workbook" : "Grammar Book";
  const abbreviation = componentSlug === components.workbook ? "wb" : "gb";
  const units = Array.from({ length: 10 }, (_, index) => ({ id: `${componentSlug}-unit-${index + 1}`, slug: `unit-${index + 1}`, title: `Unit ${index + 1}`, unitNumber: index + 1, sortOrder: index + 1 }));
  return {
    revision: 2,
    component: { bookSlug: "ultimate-b2", componentSlug, kind: "managed", title },
    units,
    pages: [{ unitNumber: 1, pageNumber: 1 }, { unitNumber: 1, pageNumber: 2 }, { unitNumber: 2, pageNumber: 3 }].map(({ unitNumber, pageNumber }, index) => {
      const pageId = `ultimate-b2-${abbreviation}-unit-${unitNumber}-page-${pageNumber}`;
      const assetId = `40000000-0000-4000-8000-${String(index + 1 + (abbreviation === "gb" ? 100 : 0)).padStart(12, "0")}`;
      return {
        id: pageId,
        componentSlug,
        unitId: units[unitNumber - 1].id,
        unitNumber,
        unitTitle: `Unit ${unitNumber}`,
        label: `${title} page ${pageNumber}`,
        printedLabel: String(pageNumber),
        sortOrder: pageNumber * 10,
        source: "managed-upload",
        image: { source: "managed", assetId, width: 581, height: 794, checksumSha256: "a".repeat(64) },
      };
    }),
  };
}

const managedCatalogs = Object.freeze({
  [components.workbook]: managedCatalog(components.workbook),
  [components.grammar]: managedCatalog(components.grammar),
});
const managedStorageObjects = new Set(Object.values(managedCatalogs).flatMap((catalog) => catalog.pages.map((page) =>
  `managed-pages/${page.componentSlug}/${page.id}/${page.image.assetId}.png`)));

const managedPreviewResolutions = [];
const managedPreviewLoads = [];
let teacherUiOverrideEnabled = true;
const managedPreviewSql = async (strings, ...values) => {
  const query = strings.join(" ");
  if (query.includes("from book_packages package join book_components component")) return [{ id: values[1], revision: managedCatalogs[values[1]].revision }];
  if (query.includes("from units unit")) return managedCatalogs[values[0]].units.map((unit) => ({ id: unit.id, slug: unit.slug, title: unit.title, unit_number: unit.unitNumber, sort_order: unit.sortOrder }));
  if (query.includes("from book_pages page")) return managedCatalogs[values[1]].pages.map((page) => ({
    id: page.id, stable_key: `${values[1]}/pages/${page.id}`, source_metadata: { is_active: true },
    unit_id: page.unitId, unit_number: page.unitNumber, asset_id: page.image.assetId,
  }));
  return [];
};
const builderPreviewHandler = createBuilderPreviewHandler({
  getDatabase: () => managedPreviewSql,
  resolveResource: async (...arguments_) => {
    managedPreviewResolutions.push(`${arguments_[1]}:${arguments_[2]}:${arguments_[3] || ""}`);
    return resolveBuilderContentResource(...arguments_);
  },
  loadDocument: async (_sql, resource) => {
    managedPreviewLoads.push(`${resource.componentSlug}:${resource.resource}:${resource.documentKey}`);
    if (resource.resource === "ui-controller" && teacherUiOverrideEnabled) return {
      revision: 3,
      source: "database",
      document: {
        schemaVersion: "1.0",
        packageId: "ultimate-b2-students-book",
        assets: {
          "background.main": {
            sha256: teacherUiChecksum, extension: "png", mediaType: "image/png", sizeBytes: managedPageBytes.length,
            width: 581, height: 794, originalFilename: "hosted-background.png",
          },
        },
      },
    };
    return null;
  },
  authorizePreview: async (event, _sql, scope) => classifyBuilderPreviewAuthorization(event, scope, { environment: previewEnvironment, now: previewNow }),
});

function storedManagedPages(componentSlug) {
  const catalog = managedCatalogs[componentSlug];
  return {
    revision: catalog.revision,
    units: catalog.units.map((unit) => ({ id: unit.id, slug: unit.slug, title: unit.title, unit_number: unit.unitNumber, sort_order: unit.sortOrder })),
    rows: catalog.pages.map((page) => ({
      stable_key: `${componentSlug}/pages/${page.id}`,
      label: page.label,
      sort_order: page.sortOrder,
      unit_id: page.unitId,
      unit_slug: `unit-${page.unitNumber}`,
      unit_number: page.unitNumber,
      unit_title: page.unitTitle,
      unit_sort_order: page.unitNumber,
      source_metadata: { is_active: true, printed_label: page.printedLabel },
      asset_id: page.image.assetId,
      mime_type: "image/png",
      byte_size: managedPageBytes.length,
      checksum_sha256: page.image.checksumSha256,
      width: page.image.width,
      height: page.image.height,
    })),
  };
}

const builderPagesHandler = createBuilderPagesHandler({
  getDatabase: () => managedPreviewSql,
  authorize: async () => ({ builderUser: { id: "ultimate-b2-acceptance" } }),
  authorizePreview: async (event, _sql, scope) => {
    if (scope.action === "managed-page-asset") managedAssetRequests.push({ ...scope, authorization: event.queryStringParameters?.previewAuthorization || "" });
    return classifyBuilderPreviewAuthorization(event, scope, { environment: previewEnvironment, now: previewNow });
  },
  loadPages: async (_sql, identity) => storedManagedPages(identity.componentSlug),
  loadAsset: async (_sql, identity) => {
    const page = managedCatalogs[identity.componentSlug]?.pages.find((candidate) => candidate.id === identity.pageId && candidate.image.assetId === identity.assetId);
    return page ? { object_key: `managed-pages/${identity.componentSlug}/${identity.pageId}/${identity.assetId}.png` } : null;
  },
  storage: () => ({ signedGetUrl: async ({ objectKey }) => `${managedStorageOrigin}/__managed-page-storage/${objectKey}` }),
  logger: { error() {} },
});

let authorizationNonce = 0;
const rawAuthorizationHandler = createBuilderPreviewAuthorizationHandler({
  getDatabase: () => managedPreviewSql,
  authorize: async () => ({ builderUser: { id: "ultimate-b2-acceptance" } }),
  inspect: (event, scope) => inspectBuilderPreviewAuthorizationScope(event, scope, { environment: previewEnvironment, now: previewNow }),
  issue: (intent) => {
    authorizationIntents.push(structuredClone(intent));
    authorizationNonce += 1;
    return issueBuilderPreviewAuthorization(intent, { environment: previewEnvironment, now: previewNow, nonce: `multi-book-browser-nonce-${authorizationNonce}` });
  },
  logger: { error() {} },
});
const builderAuthorizationHandler = async (event) => {
  if (event.path.includes("/preview/authorization/exchange")) exchangeRequests.push(JSON.parse(event.body || "{}"));
  return rawAuthorizationHandler(event);
};

const publicBucket = {
  async head(objectKey) {
    teacherUiObjectRequests.push({ operation: "head", objectKey });
    return objectKey === teacherUiObjectKey ? { size: managedPageBytes.length, httpEtag: '"teacher-ui-browser-etag"', writeHttpMetadata() {} } : null;
  },
  async get(objectKey) {
    teacherUiObjectRequests.push({ operation: "get", objectKey });
    return objectKey === teacherUiObjectKey ? {
      size: managedPageBytes.length,
      httpEtag: '"teacher-ui-browser-etag"',
      writeHttpMetadata() {},
      body: new ReadableStream({ start(controller) { controller.enqueue(managedPageBytes); controller.close(); } }),
    } : null;
  },
};

const builderWorker = createBuilderWorker({
  handlers: { pages: builderPagesHandler, previewAuthorization: builderAuthorizationHandler, preview: builderPreviewHandler },
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

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function netlifyEvent(request, url, body = "") {
  return {
    httpMethod: request.method,
    path: url.pathname,
    headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value || "")])),
    queryStringParameters: Object.fromEntries(url.searchParams),
    multiValueQueryStringParameters: Object.fromEntries([...new Set(url.searchParams.keys())].map((key) => [key, url.searchParams.getAll(key)])),
    body,
  };
}

function sendNetlify(response, result) {
  const body = result.body || "";
  response.writeHead(result.statusCode, { ...(result.headers || {}), "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}

async function fulfillWorkerResponse(route, response) {
  const location = response.headers.get("Location");
  if (response.status === 302 && location?.startsWith(`${managedStorageOrigin}/__managed-page-storage/`)) {
    const objectKey = decodeURIComponent(new URL(location).pathname.slice("/__managed-page-storage/".length));
    managedStorageObjectRequests.push(objectKey);
    return route.fulfill(managedStorageObjects.has(objectKey)
      ? { status: 200, contentType: "image/png", body: managedPageBytes }
      : { status: 404, contentType: "text/plain", body: "Not found" });
  }
  const body = response.body ? Buffer.from(await response.arrayBuffer()) : undefined;
  await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), ...(body ? { body } : {}) });
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
    sendNetlify(response, await builderAuthorizationHandler(netlifyEvent(request, url, await requestBody(request)))); return;
  }
  const pagesMatch = url.pathname.match(/^\/builder\/api\/pages\/books\/ultimate-b2\/components\/(ultimate-b2-(?:students-book|workbook|grammar-book))$/);
  if (pagesMatch && request.method === "GET") {
    const componentSlug = pagesMatch[1];
    if (componentSlug === "ultimate-b2-students-book") sendJson(response, { revision: 0, component: { bookSlug: "ultimate-b2", componentSlug, kind: "students-book" }, pages: canonicalStudentsBookPages });
    else sendNetlify(response, await builderPagesHandler(netlifyEvent(request, url)));
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
  const failedRequests = [];
  const browserRequests = [];
  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith("/preview/")) {
      const init = { method: request.method(), headers: request.headers() };
      if (!["GET", "HEAD"].includes(request.method())) init.body = request.postData() || "";
      return fulfillWorkerResponse(route, await builderWorker.fetch(new Request(request.url(), init), { PLAYER_MEDIA: publicBucket }));
    }
    const relative = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let file = path.resolve(viewerRoot, relative);
    let details = file.startsWith(`${viewerRoot}${path.sep}`) ? await stat(file).catch(() => null) : null;
    if (!details?.isFile()) file = path.join(viewerRoot, "index.html");
    if (url.pathname.startsWith("/assets/")) canonicalViewerAssetRequests.push(url.pathname);
    return route.fulfill({ status: 200, contentType: mime[path.extname(file).toLowerCase()] || "application/octet-stream", body: await readFile(file) });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.stack || error.message));
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`); });
  page.on("requestfailed", (request) => failedRequests.push(`${request.failure()?.errorText || "failed"} ${request.url()}`));
  page.on("request", (request) => browserRequests.push(request.url()));

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
    assert.equal(await page.locator(".component-page-card").count(), 3);
    const selectedCatalog = managedCatalogs[componentSlug];
    await page.getByRole("button", { name: `Preview ${selectedCatalog.pages[0].label}` }).click();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    const pagesReview = page.frameLocator(".unified-builder-review-dialog iframe");
    await pagesReview.getByAltText(new RegExp(selectedCatalog.pages[0].label)).waitFor();
    const frameSource = await page.locator(".unified-builder-review-dialog iframe").getAttribute("src");
    managedReviewTokens.set(componentSlug, new URL(frameSource).searchParams.get("previewAuthorization"));
    assert.deepEqual(await page.getByLabel("Review page").locator("option").allTextContents(), selectedCatalog.pages.map((item) => `Unit ${item.unitNumber} · Pages ${item.printedLabel} · ${item.label}`));
    assert.equal(await pagesReview.getByRole("button", { name: "Previous page" }).isDisabled(), true);
    await pagesReview.getByRole("button", { name: "Next page" }).click();
    await pagesReview.getByAltText(new RegExp(selectedCatalog.pages[1].label)).waitFor();
    assert.equal(await pagesReview.getByRole("button", { name: "Next page" }).isDisabled(), true);
    await pagesReview.getByRole("button", { name: "Previous page" }).click();
    await pagesReview.getByAltText(new RegExp(selectedCatalog.pages[0].label)).waitFor();
    await pagesReview.getByRole("button", { name: "Home" }).click();
    await pagesReview.getByRole("button", { name: title, exact: true }).click();
    await pagesReview.getByRole("button", { name: /^Open Unit 2:/ }).click();
    await pagesReview.getByRole("heading", { name: "Unit 2", exact: true }).waitFor();
    await pagesReview.getByRole("button", { name: new RegExp(`^Open ${selectedCatalog.pages[2].label},`) }).click();
    await pagesReview.getByAltText(new RegExp(selectedCatalog.pages[2].label)).waitFor();
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
  const studentsFrameSource = await page.locator(".unified-builder-review-dialog iframe").getAttribute("src");
  const studentsPreviewAuthorization = new URL(studentsFrameSource).searchParams.get("previewAuthorization");
  assert.equal((await page.getByLabel("Review page").locator("option").allTextContents()).some((label) => /Workbook|Grammar Book/.test(label)), false);
  assert.equal(teacherUiObjectRequests.some(({ operation, objectKey }) => operation === "get" && objectKey === teacherUiObjectKey), true);
  const overrideObjectRequestCount = teacherUiObjectRequests.length;
  await page.getByRole("button", { name: "Close Review" }).click();

  assert.deepEqual(consoleErrors, [], [...failedResponses, ...failedRequests].join("\n"));
  const fallbackFailureStart = failedResponses.length;
  const fallbackConsoleStart = consoleErrors.length;
  teacherUiOverrideEnabled = false;
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.frameLocator(".unified-builder-review-dialog iframe").locator(".teacher-offline-page-stage").waitFor();
  assert.equal(teacherUiObjectRequests.length, overrideObjectRequestCount, "canonical fallback must not request a hosted Teacher UI object");
  const fallbackFailures = failedResponses.splice(fallbackFailureStart);
  assert.equal(fallbackFailures.length, 1);
  assert.match(fallbackFailures[0], /^404 .*\/preview\/content\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/ui-controller\?/);
  const fallbackConsoleErrors = consoleErrors.splice(fallbackConsoleStart);
  assert.deepEqual(fallbackConsoleErrors, ["Failed to load resource: the server responded with a status of 404 (Not Found)"]);
  await page.getByRole("button", { name: "Close Review" }).click();
  teacherUiOverrideEnabled = true;

  const studentsIdentity = `builderPreview=1&bookSlug=ultimate-b2&componentSlug=ultimate-b2-students-book&previewAuthorization=${encodeURIComponent(studentsPreviewAuthorization)}`;
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
  assert.equal(managedAssetRequests.length >= 9, true);
  assert.equal(managedAssetRequests.every((entry) => entry.pageId.startsWith(entry.componentSlug === components.workbook ? "ultimate-b2-wb-" : "ultimate-b2-gb-")
    && classifyBuilderPreviewAuthorization({ queryStringParameters: { previewAuthorization: entry.authorization } }, {
      action: "managed-page-asset", bookSlug: entry.bookSlug, componentSlug: entry.componentSlug, pageId: entry.pageId,
    }, { environment: previewEnvironment, now: previewNow }).authorized), true);
  for (const componentSlug of [components.workbook, components.grammar]) {
    assert.equal(authorizationIntents.some((intent) => intent.componentSlug === componentSlug && intent.view === "library" && intent.pageId === null), true);
    assert.ok(managedReviewTokens.get(componentSlug));
  }
  assert.equal(authorizationIntents.some((intent) => intent.componentSlug === "ultimate-b2-students-book" && intent.view === "page" && intent.pageId === "ub2-sb-unit-1-part-1"), true);

  const workerStatus = async (path, token = null) => {
    const url = new URL(path, "https://builder.hhplms.workers.dev");
    if (token) url.searchParams.set("previewAuthorization", token);
    return (await builderWorker.fetch(new Request(url), { PLAYER_MEDIA: publicBucket })).status;
  };
  const workbookRoot = "/preview/pages/books/ultimate-b2/components/ultimate-b2-workbook";
  const grammarRoot = "/preview/pages/books/ultimate-b2/components/ultimate-b2-grammar-book";
  assert.equal(await workerStatus(grammarRoot, managedReviewTokens.get(components.workbook)), 401);
  assert.equal(await workerStatus(workbookRoot), 401);
  assert.equal(await workerStatus(workbookRoot, "malformed"), 401);
  const expired = issueBuilderPreviewAuthorization({ bookSlug: "ultimate-b2", componentSlug: components.workbook, view: "library", pageId: null, activityId: null, releaseId: null }, { environment: previewEnvironment, now: previewNow - 600_000, nonce: "multi-book-expired-nonce" }).token;
  assert.equal(await workerStatus(workbookRoot, expired), 401);
  const pageScoped = issueBuilderPreviewAuthorization({ bookSlug: "ultimate-b2", componentSlug: components.workbook, view: "page", pageId: managedCatalogs[components.workbook].pages[0].id, activityId: null, releaseId: null }, { environment: previewEnvironment, now: previewNow, nonce: "multi-book-page-scope-nonce" }).token;
  const secondWorkbookPage = managedCatalogs[components.workbook].pages[1];
  assert.equal(await workerStatus(`${workbookRoot}/pages/${secondWorkbookPage.id}/assets/${secondWorkbookPage.image.assetId}/preview`, pageScoped), 401);
  assert.equal(await workerStatus("/preview/pages/books/another-book/components/ultimate-b2-workbook", managedReviewTokens.get(components.workbook)), 404);
  for (const componentSlug of [components.workbook, components.grammar]) {
    assert.equal(managedPreviewResolutions.includes(`${componentSlug}:hotspots:`), true);
    assert.equal(managedPreviewResolutions.includes(`${componentSlug}:native-activity-index:`), true);
    assert.equal(managedPreviewLoads.includes(`${componentSlug}:hotspots:default`), true);
    assert.equal(managedPreviewLoads.includes(`${componentSlug}:native-activity-index:default`), true);
  }
  assert.equal(managedPreviewResolutions.some((entry) => /^ultimate-b2-(?:workbook|grammar-book):activity-lifecycle:/.test(entry)), false);
  assert.equal(managedPreviewLoads.some((entry) => /^ultimate-b2-(?:workbook|grammar-book):(?:activity-lifecycle|native-activity-teacher):/.test(entry)), false);
  assert.equal(teacherUiObjectRequests.some(({ objectKey }) => objectKey !== teacherUiObjectKey), false);
  assert.equal(managedStorageObjectRequests.length >= 9, true);
  assert.equal(managedStorageObjectRequests.every((objectKey) => managedStorageObjects.has(objectKey)), true);
  assert.equal(canonicalViewerAssetRequests.some((pathname) => /\.(?:png|jpg|webp|gaf|mp3)$/i.test(pathname)), true);
  assert.equal(failedResponses.some((entry) => /^401 .*\/preview\/pages\//.test(entry)), false);
  assert.equal(browserRequests.some((entry) => /pub-.*\.r2\.dev|\/publishers\//i.test(entry)), false);
  assert.equal(failedRequests.some((entry) => /pub-.*\.r2\.dev|\/publishers\//i.test(entry)), false);

  assert.deepEqual(consoleErrors, [], [...failedResponses, ...failedRequests].join("\n"));
  assert.deepEqual(pageErrors, []);
  process.stdout.write("Ultimate B2 multi-component Builder and hosted Viewer browser acceptance passed.\n");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
