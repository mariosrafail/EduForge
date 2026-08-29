import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { localPlaywrightLaunchOptions } from "../android-teacher/playwright-launch-options.mjs";
import { assertInteractiveOverview } from "./interactive-overview-assertions.mjs";
import { isManagedSpreadLabel, managedPageBytes, managedPageFixture, managedSpreadPageWidth } from "./interactive-overview-fixtures.mjs";
import { canonicalStudentsBookPages } from "../../netlify-sites/ultimate-b2-builder/server/_builder-page-catalog.js";
import { createBuilderPagesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-pages.js";
import { createBuilderNativeActivitiesHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-native-activities.js";
import { createBuilderContentHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content.js";
import { createBuilderPreviewHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-preview.js";
import { createBuilderPreviewAuthorizationHandler } from "../../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization-handler.js";
import { classifyBuilderPreviewAuthorization, inspectBuilderPreviewAuthorizationScope, issueBuilderPreviewAuthorization } from "../../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization.js";
import { resolveBuilderContentResource } from "../../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { createBuilderWorker } from "../../cloudflare/builder/worker.js";
import { buildBookAssetHostedTeacherUiPublicKey } from "../../lib/book-assets/object-keys.js";
import { nativeChildIdFromUuid } from "../../src/data/native-activities/nativeChildIdentity.js";

const builderRoot = path.resolve("dist-netlify/ultimate-b2-builder");
const viewerRoot = path.resolve("dist-netlify/ultimate-b2-interactive");
const studentsHotspots = JSON.parse(await readFile("src/data/ultimate-b2/authoring/studentsBookHotspots.json", "utf8"));
const draftUnitExtraBytes = await readFile("src/assets/books/ultimate-b2/teacher-offline-media/ultimate-b2-startup-intro.mp4");
const draftUnitExtraVideoId = nativeChildIdFromUuid("video", "10000000-0000-4000-8000-000000000081");
const draftUnitExtraAssetId = "10000000-0000-4000-8000-000000000082";
const draftUnitExtrasDocument = Object.freeze({ schemaVersion: "1.0", units: [{ unitId: "unit-1", unitNumber: 1, categories: { videos: [{ id: draftUnitExtraVideoId, title: "Saved Draft Extra", assetSlot: draftUnitExtraVideoId, asset: { assetId: draftUnitExtraAssetId, checksumSha256: "8".repeat(64), role: "unit_extra_video", slot: draftUnitExtraVideoId }, fileName: "saved-draft-extra.mp4", byteSize: draftUnitExtraBytes.length, durationMs: 5_840, cues: [] }] } }], pages: [{ pageId: "ub2-sb-unit-1-part-1", unitId: "unit-1", extrasVisibility: { videos: true } }] });
const mime = { ".css": "text/css", ".gaf": "application/x-gaf", ".html": "text/html", ".jpg": "image/jpeg", ".js": "text/javascript", ".json": "application/json", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
const components = Object.freeze({ workbook: "ultimate-b2-workbook", grammar: "ultimate-b2-grammar-book" });
const previewEnvironment = { BUILDER_PREVIEW_AUTH_SECRET: "multi-book-browser-test-secret-with-at-least-thirty-two-bytes" };
const previewNow = Date.now();
const teacherUiChecksum = createHash("sha256").update(managedPageBytes).digest("hex");
const teacherUiObjectKey = buildBookAssetHostedTeacherUiPublicKey({ checksum: teacherUiChecksum, extension: "png" });
const exchangeRequests = [];
const authorizationIntents = [];
const managedAssetRequests = [];
const managedCatalogRequests = [];
const managedStorageObjectRequests = [];
const teacherUiObjectRequests = [];
const canonicalViewerAssetRequests = [];
const draftUnitExtraRequests = [];
const managedReviewTokens = new Map();
const managedStorageOrigin = "https://hhplms-viewer.netlify.app";
const overviewScreenshotDir = process.env.INTERACTIVE_OVERVIEW_SCREENSHOT_DIR || "";

function managedCatalog(componentSlug) {
  const title = componentSlug === components.workbook ? "Workbook" : "Grammar Book";
  const abbreviation = componentSlug === components.workbook ? "wb" : "gb";
  const units = Array.from({ length: 10 }, (_, index) => ({ id: `${componentSlug}-unit-${index + 1}`, slug: `unit-${index + 1}`, title: `Unit ${index + 1}`, unitNumber: index + 1, sortOrder: index + 1 }));
  const descriptors = [
    { unitNumber: 1, printedLabel: "1", token: "1" },
    { unitNumber: 1, printedLabel: "2", token: "2" },
    { unitNumber: 2, printedLabel: "3", token: "3" },
    ...(componentSlug === components.workbook
      ? ["70-71", "72-73", "74-75", "76", "77", "78-79"].map((printedLabel) => ({ unitNumber: 7, printedLabel, token: printedLabel.replaceAll(/[^0-9]+/g, "-") }))
      : ["16", "17-18", "19-20", "21", "22-23", "25", "27-28"].map((printedLabel) => ({ unitNumber: 3, printedLabel, token: printedLabel.replaceAll(/[^0-9]+/g, "-") }))),
  ];
  return {
    revision: 2,
    component: { bookSlug: "ultimate-b2", componentSlug, kind: "managed", title },
    units,
    pages: descriptors.map(({ unitNumber, printedLabel, token }, index) => {
      const pageId = `ultimate-b2-${abbreviation}-unit-${unitNumber}-page-${token}`;
      const assetId = `40000000-0000-4000-8000-${String(index + 1 + (abbreviation === "gb" ? 100 : 0)).padStart(12, "0")}`;
      const isSpread = isManagedSpreadLabel(printedLabel);
      return {
        id: pageId,
        componentSlug,
        unitId: units[unitNumber - 1].id,
        unitNumber,
        unitTitle: `Unit ${unitNumber}`,
        label: `${title} page ${printedLabel}`,
        printedLabel,
        sortOrder: (index + 1) * 10,
        source: "managed-upload",
        image: { source: "managed", assetId, width: isSpread ? managedSpreadPageWidth : 581, height: 794, checksumSha256: "a".repeat(64) },
      };
    }),
  };
}

const managedCatalogs = Object.freeze({
  [components.workbook]: managedCatalog(components.workbook),
  [components.grammar]: managedCatalog(components.grammar),
});

const managedNativeStates = Object.fromEntries(Object.values(components).map((componentSlug) => [componentSlug, {
  index: { revision: 1, document: { schemaVersion: "1.0", activities: [] } },
  lifecycle: { revision: 1, document: { schemaVersion: "1.0", activities: {} } },
  hotspots: { revision: 1, document: managedHotspots(componentSlug).document },
  documents: new Map(), assets: new Map(), uploads: new Map(), mutations: new Map(),
}]));
const nativeScopeRequests = [];
const nativeContentRequests = [];
let delayedWorkbookCatalog = false;
let nativeSequence = 500;

function nativeState(componentSlug) { return managedNativeStates[componentSlug] || null; }
function nativeDocumentKey(resource) { return `${resource.documentType}:${resource.documentKey}`; }
const managedNativeSql = async (strings, ...values) => {
  const query = strings.join(" ");
  if (!query.includes("from book_pages page")) return [];
  const stableKey = values.find((value) => typeof value === "string" && value.includes("/pages/"));
  const [componentSlug, , pageId] = String(stableKey || "").split("/");
  const page = managedCatalogs[componentSlug]?.pages.find((candidate) => candidate.id === pageId);
  return page ? [{ stable_key: stableKey, sort_order: page.sortOrder, unit_id: page.unitId, unit_number: page.unitNumber, unit_title: page.unitTitle }] : [];
};

async function loadNativeDocument(_sql, resource) {
  const state = nativeState(resource.componentSlug);
  if (!state) return null;
  if (resource.documentType === "native_activity_index") return state.index;
  if (resource.documentType === "activity_lifecycle") return state.lifecycle;
  if (resource.documentType === "hotspots") return state.hotspots;
  return state.documents.get(nativeDocumentKey(resource)) || null;
}

function nativeSources(componentSlug) {
  const state = nativeState(componentSlug);
  const source = (stored) => stored ? { revision: stored.revision, payload: stored.document } : null;
  return {
    native: {
      index: source(state.index),
      activities: Object.fromEntries(state.index.document.activities.map((entry) => [entry.activityId, {
        index: entry,
        public: source(state.documents.get(`native_activity_public:${entry.activityId}`)),
        teacher: source(state.documents.get(`native_activity_teacher:${entry.activityId}`)),
      }])),
      assetRows: [...state.assets.values()],
    },
  };
}

const nativeStorage = {
  signedPutUrl: async ({ objectKey, contentType }) => ({ url: `${origin}/__native-upload/${encodeURIComponent(objectKey)}`, headers: { "Content-Type": contentType }, expiresIn: 900 }),
  signedGetUrl: async ({ objectKey }) => `${origin}/__native-asset/${encodeURIComponent(objectKey)}`,
  head: async ({ objectKey }) => {
    for (const state of Object.values(managedNativeStates)) for (const upload of state.uploads.values()) if (upload.stagingObjectKey === objectKey) return { byteSize: upload.bytes?.length || 0 };
    return null;
  },
  download: async ({ objectKey }) => {
    for (const state of Object.values(managedNativeStates)) for (const upload of state.uploads.values()) if (upload.stagingObjectKey === objectKey) return upload.bytes;
    return Buffer.alloc(0);
  },
  upload: async () => ({ reused: false }), delete: async () => {}, bucket: () => "browser-private-assets",
};

const nativeHandler = createBuilderNativeActivitiesHandler({
  getDatabase: () => managedNativeSql,
  authorize: async () => ({ builderUser: { id: "10000000-0000-4000-8000-000000000001" } }),
  loadDocument: loadNativeDocument,
  loadKnownActivityIds: async (_sql, scope) => [...nativeState(scope.componentSlug).documents.keys()].filter((key) => key.startsWith("native_activity_public:")).map((key) => key.split(":")[1]),
  collectCatalog: async (_sql, scope) => { nativeScopeRequests.push({ action: "catalog", ...scope }); return nativeSources(scope.componentSlug); },
  create: async (_sql, input) => {
    const state = nativeState(input.componentSlug); const replay = state.mutations.get(input.clientMutationId);
    if (replay) return replay.requestSha256 === input.requestSha256 ? { ...replay.result, outcome: "idempotent" } : { outcome: "mutation_id_conflict" };
    state.index = { revision: state.index.revision + 1, document: input.indexDocument };
    state.documents.set(`native_activity_public:${input.activityId}`, { revision: 1, document: input.publicDocument });
    state.documents.set(`native_activity_teacher:${input.activityId}`, { revision: 1, document: input.teacherDocument });
    const result = { outcome: "created", activityId: input.activityId, indexRevision: state.index.revision, publicRevision: 1, teacherRevision: 1 };
    state.mutations.set(input.clientMutationId, { requestSha256: input.requestSha256, result }); return result;
  },
  savePair: async (_sql, input) => {
    const state = nativeState(input.componentSlug); const publicState = state.documents.get(`native_activity_public:${input.activityId}`); const teacherState = state.documents.get(`native_activity_teacher:${input.activityId}`);
    if (publicState.revision !== input.expectedPublicRevision || teacherState.revision !== input.expectedTeacherRevision) return { outcome: "revision_conflict", currentPublicRevision: publicState.revision, currentTeacherRevision: teacherState.revision };
    publicState.revision += 1; teacherState.revision += 1; publicState.document = input.publicDocument; teacherState.document = input.teacherDocument;
    return { outcome: "saved", publicRevision: publicState.revision, teacherRevision: teacherState.revision, currentPublicRevision: publicState.revision, currentTeacherRevision: teacherState.revision };
  },
  mutateLifecycle: async (_sql, input) => {
    const state = nativeState(input.componentSlug);
    if (input.sourcePageId !== input.authoritativeSourcePageId) return { outcome: "location_conflict" };
    state.index = { revision: state.index.revision + 1, document: input.indexDocument };
    const publicState = state.documents.get(`native_activity_public:${input.activityId}`); publicState.revision += 1; publicState.document = input.publicDocument;
    if (input.hotspotChanged) state.hotspots = { revision: state.hotspots.revision + 1, document: input.hotspotDocument };
    return { outcome: "moved", activityId: input.activityId, lifecycleRevision: state.lifecycle.revision, indexRevision: state.index.revision, publicRevision: publicState.revision, hotspotRevision: state.hotspots.revision, removedHotspotCount: input.removedHotspotCount };
  },
  validateAssets: async (_sql, input) => {
    const state = nativeState(input.componentSlug);
    for (const reference of input.assets) if (state.assets.get(reference.assetId)?.source_metadata?.native_activity_id !== input.activityId) throw new Error("Native managed asset references are invalid.");
    return true;
  },
  prepareAsset: async (_sql, input) => {
    const state = nativeState(input.componentSlug); state.uploads.set(input.uploadId, { ...input, bytes: null });
    return { outcome: "prepared", uploadId: input.uploadId, state: "prepared", fileDescriptor: input.fileDescriptor, stagingObjectKey: input.stagingObjectKey };
  },
  loadAssetUploadScope: async (_sql, input) => {
    for (const [componentSlug, state] of Object.entries(managedNativeStates)) { const upload = state.uploads.get(input.uploadId); if (upload) return { bookSlug: upload.bookSlug, componentSlug, activityId: upload.activityId }; }
    return null;
  },
  claimAsset: async (_sql, input) => {
    for (const state of Object.values(managedNativeStates)) { const upload = state.uploads.get(input.uploadId); if (upload) return { outcome: "claimed", activityId: upload.activityId, assetSlot: upload.assetSlot, fileDescriptor: upload.fileDescriptor, stagingObjectKey: upload.stagingObjectKey }; }
    return { outcome: "session_not_found" };
  },
  completeAsset: async (_sql, input) => {
    for (const state of Object.values(managedNativeStates)) { const upload = state.uploads.get(input.uploadId); if (!upload) continue; const assetId = `10000000-0000-4000-8000-${String(nativeSequence++).padStart(12, "0")}`; state.assets.set(assetId, { id: assetId, checksum_sha256: input.checksumSha256, asset_role: "activity_artwork", object_key: input.objectKey, storage_profile: "private", storage_bucket: input.storageBucket, mime_type: input.mimeType, byte_size: input.byteSize, width: input.width, height: input.height, publication_status: "draft", access_level: "internal", source_metadata: { native_activity_id: upload.activityId, asset_slot: upload.assetSlot } }); return assetId; }
    return null;
  },
  failAsset: async () => {},
  loadAsset: async (_sql, input) => nativeState(input.componentSlug)?.assets.get(input.assetId) || null,
  randomUuid: () => `10000000-0000-4000-8000-${String(nativeSequence++).padStart(12, "0")}`,
  storage: () => nativeStorage,
  logger: { error() {} },
});

const nativeContentHandler = createBuilderContentHandler({
  getDatabase: () => managedNativeSql,
  authorize: async () => ({ builderUser: { id: "10000000-0000-4000-8000-000000000001" } }),
  loadDocument: async (sql, resource) => { nativeContentRequests.push({ componentSlug: resource.componentSlug, resource: resource.resource, documentKey: resource.documentKey }); return loadNativeDocument(sql, resource); },
});
const managedStorageObjects = new Map(Object.values(managedCatalogs).flatMap((catalog) => catalog.pages.map((page) => [
  `managed-pages/${page.componentSlug}/${page.id}/${page.image.assetId}.png`,
  managedPageFixture(page),
])));

const managedPreviewResolutions = [];
const managedPreviewLoads = [];
let teacherUiOverrideEnabled = true;
let immutableRedirectSourceRequests = 0;
let immutableRedirectTargetRequests = 0;
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
    if (resource.resource === "unit-extras") return { revision: 4, source: "database", document: draftUnitExtrasDocument };
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
      byte_size: managedPageFixture(page).length,
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
    if (scope.action === "managed-page-catalog") managedCatalogRequests.push({ ...scope, authorization: event.queryStringParameters?.previewAuthorization || "" });
    if (scope.action === "managed-page-asset") managedAssetRequests.push({ ...scope, authorization: event.queryStringParameters?.previewAuthorization || "" });
    return classifyBuilderPreviewAuthorization(event, scope, { environment: previewEnvironment, now: previewNow });
  },
  loadPages: async (_sql, identity) => identity.componentSlug === "ultimate-b2-students-book"
    ? { revision: 0, hotspotRevision: 0, units: [], rows: [] }
    : storedManagedPages(identity.componentSlug),
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

const builderUnitExtraAssetsHandler = async (event) => {
  const scope = { action: "unit-extra-draft-asset", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" };
  const decision = classifyBuilderPreviewAuthorization(event, scope, { environment: previewEnvironment, now: previewNow });
  draftUnitExtraRequests.push({ path: event.path, authorization: event.queryStringParameters?.previewAuthorization || "", decision });
  if (!decision.authorized || !event.path.endsWith(`/units/unit-1/videos/${draftUnitExtraVideoId}/assets/${draftUnitExtraAssetId}/preview`)) return { statusCode: decision.authorized ? 404 : 401, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ error: "Unauthorized" }) };
  return { statusCode: 302, headers: { Location: `${managedStorageOrigin}/__draft-unit-extra.mp4`, "Cache-Control": "private, no-store" }, body: "" };
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
  handlers: { pages: builderPagesHandler, previewAuthorization: builderAuthorizationHandler, preview: builderPreviewHandler, unitExtraAssets: builderUnitExtraAssetsHandler },
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

async function requestBytes(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
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
  if (response.status === 302 && location === `${managedStorageOrigin}/__draft-unit-extra.mp4`) {
    return route.fulfill({ status: 200, contentType: "video/mp4", body: draftUnitExtraBytes });
  }
  if (response.status === 302 && location?.startsWith(`${managedStorageOrigin}/__managed-page-storage/`)) {
    const objectKey = decodeURIComponent(new URL(location).pathname.slice("/__managed-page-storage/".length));
    managedStorageObjectRequests.push(objectKey);
    return route.fulfill(managedStorageObjects.has(objectKey)
      ? { status: 200, contentType: "image/png", body: managedStorageObjects.get(objectKey) }
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

const immutableRedirectTargetServer = createServer((request, response) => {
  if (request.url?.startsWith("/publishers/hamilton-house/teacher-ui/assets/")) {
    immutableRedirectTargetRequests += 1;
    response.writeHead(200, { "Cache-Control": "public, max-age=31536000, immutable", "Content-Length": managedPageBytes.length, "Content-Type": "image/png" });
    response.end(managedPageBytes);
    return;
  }
  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("Not found");
});
await new Promise((resolve) => immutableRedirectTargetServer.listen(0, "127.0.0.1", resolve));
const immutableRedirectTargetOrigin = `http://127.0.0.1:${immutableRedirectTargetServer.address().port}`;

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/__immutable-ui-redirect-probe") {
    const body = `<!doctype html><img alt="cached redirect probe" src="/preview/ui-assets/${teacherUiChecksum}.png">`;
    response.writeHead(200, { "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(body), "Content-Type": "text/html" });
    response.end(body);
    return;
  }
  if (url.pathname === `/preview/ui-assets/${teacherUiChecksum}.png`) {
    immutableRedirectSourceRequests += 1;
    response.writeHead(302, {
      "Cache-Control": "public, max-age=31536000, immutable",
      Location: `${immutableRedirectTargetOrigin}/publishers/hamilton-house/teacher-ui/assets/${teacherUiChecksum}.png`,
    });
    response.end();
    return;
  }
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
  if (url.pathname === "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/catalog" && request.method === "GET") {
    nativeScopeRequests.push({ action: "catalog", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" });
    sendJson(response, { schemaVersion: "1.0", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", activities: [] }); return;
  }
  if (url.pathname === "/builder/api/native-activities/books/ultimate-b2/components/ultimate-b2-students-book/lifecycle" && request.method === "GET") {
    sendJson(response, { schemaVersion: "1.0", revision: 0, source: "repository", document: { schemaVersion: "1.0", activities: {} } }); return;
  }
  if (url.pathname.startsWith("/builder/api/native-activities/")) {
    const event = netlifyEvent(request, url, await requestBody(request));
    if (delayedWorkbookCatalog && url.pathname.endsWith("/ultimate-b2-workbook/catalog")) {
      delayedWorkbookCatalog = false;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    sendNetlify(response, await nativeHandler(event));
    return;
  }
  if (/^\/builder\/api\/content\/books\/ultimate-b2\/components\/ultimate-b2-(?:workbook|grammar-book)\/(?:native-activity-public|native-activity-teacher)\//.test(url.pathname)) {
    sendNetlify(response, await nativeContentHandler(netlifyEvent(request, url, await requestBody(request))));
    return;
  }
  if (url.pathname.startsWith("/__native-upload/") && request.method === "PUT") {
    const objectKey = decodeURIComponent(url.pathname.slice("/__native-upload/".length));
    const bytes = await requestBytes(request);
    for (const state of Object.values(managedNativeStates)) for (const upload of state.uploads.values()) if (upload.stagingObjectKey === objectKey) upload.bytes = bytes;
    response.writeHead(200); response.end();
    return;
  }
  if (url.pathname.startsWith("/__native-asset/")) {
    const objectKey = decodeURIComponent(url.pathname.slice("/__native-asset/".length));
    for (const state of Object.values(managedNativeStates)) {
      const asset = [...state.assets.values()].find((candidate) => candidate.object_key === objectKey);
      if (asset) { response.writeHead(200, { "Content-Type": asset.mime_type, "Content-Length": managedPageBytes.length }); response.end(managedPageBytes); return; }
    }
    response.writeHead(404); response.end();
    return;
  }
  await staticFile(builderRoot, url.pathname, response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  if (overviewScreenshotDir) await mkdir(overviewScreenshotDir, { recursive: true });
  browser = await chromium.launch(localPlaywrightLaunchOptions());
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block" });
  await context.addInitScript(() => {
    const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
    let acceleratedAuthorizationTimers = 0;
    globalThis.setTimeout = (callback, delay, ...args) => nativeSetTimeout(
      callback,
      Number(delay) >= 240_000 && acceleratedAuthorizationTimers++ < 3 ? 120 : delay,
      ...args,
    );
    globalThis.__teacherPreparationCounts = {};
    globalThis.__teacherProductStartupCount = 0;
    globalThis.addEventListener("teacher:component-prepared", (event) => {
      globalThis.__teacherPreparationCounts[event.detail.componentSlug] = event.detail.count;
    });
    globalThis.addEventListener("teacher:product-startup", (event) => {
      globalThis.__teacherProductStartupCount = event.detail.count;
    });
  });
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];
  const failedRequests = [];
  const browserRequests = [];
  const redirectProbe = await context.newPage();
  await redirectProbe.goto(`${origin}/__immutable-ui-redirect-probe`, { waitUntil: "load" });
  assert.equal(await redirectProbe.getByAltText("cached redirect probe").evaluate((image) => image.complete && image.naturalWidth > 0), true);
  await redirectProbe.reload({ waitUntil: "load" });
  assert.equal(await redirectProbe.getByAltText("cached redirect probe").evaluate((image) => image.complete && image.naturalWidth > 0), true);
  assert.equal(immutableRedirectSourceRequests, 1, "an explicitly immutable 302 remains cached under its original URL");
  assert.equal(immutableRedirectTargetRequests >= 1, true);
  await redirectProbe.close();

  await context.route("https://hhplms-viewer.netlify.app/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/__draft-unit-extra.mp4") return route.fulfill({ status: 200, contentType: "video/mp4", body: draftUnitExtraBytes });
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
    assert.deepEqual(await page.locator(".hosted-builder-tool-tabs a strong").allTextContents(), ["Pages", "Hotspot Builder", "Activity Builder", "Publication"]);
    assert.equal(await page.locator(".component-pages-groups > section").count(), 11);
    const selectedCatalog = managedCatalogs[componentSlug];
    assert.equal(await page.locator(".component-page-card").count(), selectedCatalog.pages.length);
    await page.getByRole("button", { name: `Preview ${selectedCatalog.pages[0].label}`, exact: true }).click();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    const pagesReview = page.frameLocator(".unified-builder-review-dialog iframe");
    await pagesReview.locator(".teacher-offline-library").waitFor();
    assert.match(await pagesReview.locator(".teacher-offline-library").getAttribute("style"), new RegExp(`/preview/ui-assets-v2/${teacherUiChecksum}\\.png`), "Workbook/Grammar-launched Review must immediately use the shared Students-owned shell override");
    const frameSource = await page.locator(".unified-builder-review-dialog iframe").getAttribute("src");
    managedReviewTokens.set(componentSlug, new URL(frameSource).searchParams.get("previewAuthorization"));
    assert.equal(new URL(frameSource).searchParams.get("view"), "library");
    assert.equal(await page.getByLabel("Review page").count(), 0);
    assert.equal(await pagesReview.getByRole("button", { name: title, exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await pagesReview.getByRole("button", { name: /^Open Unit \d+:/ }).count(), 10);
    await pagesReview.getByRole("button", { name: /^Open Unit 1:/ }).click();
    await pagesReview.getByRole("heading", { name: "Unit 1", exact: true }).waitFor();
    assert.equal(await pagesReview.locator(".teacher-unit-page-card").count(), 2);
    assert.equal(await pagesReview.locator(`.teacher-unit-page-card[data-page-ids^="ultimate-b2-${componentSlug === components.workbook ? "wb" : "gb"}-"]`).count(), 2);
    if (overviewScreenshotDir) await pagesReview.locator(".teacher-offline-unit-overview-screen").screenshot({ path: path.join(overviewScreenshotDir, `${componentSlug === components.workbook ? "workbook" : "grammar-book"}-unit-1-overview.png`) });
    await pagesReview.getByRole("button", { name: new RegExp(`^Open ${selectedCatalog.pages[0].label},`) }).click();
    await pagesReview.getByAltText(new RegExp(selectedCatalog.pages[0].label)).waitFor();
    await pagesReview.getByRole("button", { name: "Home" }).click();
    await pagesReview.locator(".teacher-offline-library").waitFor();
    assert.equal(await pagesReview.getByRole("button", { name: title, exact: true }).getAttribute("aria-pressed"), "true");
    await pagesReview.getByRole("button", { name: /^Open Unit 2:/ }).click();
    await pagesReview.getByRole("heading", { name: "Unit 2", exact: true }).waitFor();
    assert.equal(await pagesReview.locator(".teacher-unit-page-card").count(), 1);
    await pagesReview.getByRole("button", { name: new RegExp(`^Open ${selectedCatalog.pages[2].label},`) }).click();
    await pagesReview.getByAltText(new RegExp(selectedCatalog.pages[2].label)).waitFor();
    if (componentSlug === components.workbook) {
      await pagesReview.getByRole("button", { name: "Home" }).click();
      await pagesReview.getByRole("button", { name: /^Open Unit 3:/ }).click();
      await pagesReview.getByText("No pages are available for this Unit yet.", { exact: true }).waitFor();
      await pagesReview.getByRole("button", { name: "Back" }).click();
      await pagesReview.locator(".teacher-offline-library").waitFor();
    }
    await page.getByRole("button", { name: "Close Review" }).click();

    await page.goto(`${origin}/#/books/ultimate-b2/components/${componentSlug}/hotspots`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: `${title} hotspot builder` }).waitFor();
    await page.getByText("No hotspots yet", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Add hotspot" }).isDisabled(), true);

    await page.goto(`${origin}/#/books/ultimate-b2/components/${componentSlug}/activities`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Activity authoring" }).waitFor();
    await page.getByText("No activities yet", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Add Activity" }).isEnabled(), true);
    await page.getByRole("button", { name: "Add Activity" }).click();
    await page.getByText(`Choose an activity type and its location in the ${title}.`, { exact: true }).waitFor();
    await page.getByRole("radio", { name: /^Image/ }).check();
    await page.getByLabel(/Initial title/).fill(`${title} component-local image`);
    await page.getByRole("button", { name: "Create activity" }).click();
    await page.locator(".native-image-editor").waitFor();
    const state = nativeState(componentSlug);
    assert.equal(state.index.document.activities.length, 1);
    const activityId = state.index.document.activities[0].activityId;
    const expectedPrefix = componentSlug === components.workbook ? "ultimate-b2-wb-" : "ultimate-b2-gb-";
    const forbiddenPrefixes = componentSlug === components.workbook ? ["ultimate-b2-sb-", "ultimate-b2-gb-"] : ["ultimate-b2-sb-", "ultimate-b2-wb-"];
    assert.match(activityId, new RegExp(`^${expectedPrefix}`));
    await page.getByText(activityId, { exact: true }).first().waitFor();
    for (const prefix of forbiddenPrefixes) assert.equal((await page.locator("body").innerText()).includes(prefix), false);
    assert.equal(nativeContentRequests.some((entry) => entry.componentSlug === componentSlug && entry.documentKey === activityId && entry.resource === "native-activity-public"), true);
    assert.equal(nativeContentRequests.some((entry) => entry.componentSlug === componentSlug && entry.documentKey === activityId && entry.resource === "native-activity-teacher"), true);
    await page.getByLabel("Activity title").fill(`${title} saved image`);
    await page.getByRole("textbox", { name: /^Content/ }).fill(`${title} public image content.`);
    await page.getByRole("tab", { name: "Layout" }).click();
    await page.locator(".native-or-upload input[type=file]").setInputFiles({ name: `${componentSlug}.png`, mimeType: "image/png", buffer: managedPageBytes });
    await page.locator(".native-image-surface img").waitFor();
    await page.getByLabel("Alt text").fill(`${title} classroom diagram`);
    await page.getByRole("button", { name: "Save Draft" }).click();
    await page.getByText("Draft saved.", { exact: true }).waitFor();
    assert.equal(state.documents.get(`native_activity_public:${activityId}`).document.metadata.title, `${title} saved image`);
    assert.doesNotMatch(JSON.stringify(state.documents.get(`native_activity_public:${activityId}`).document), /solution|answerKey|modelAnswer/i);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Activity title").waitFor();
    assert.equal(await page.getByLabel("Activity title").inputValue(), `${title} saved image`);
    await page.getByRole("button", { name: "Move Activity" }).click();
    const destination = managedCatalogs[componentSlug].pages[1].id;
    const moveDialog = page.getByRole("dialog", { name: "Move activity" });
    await moveDialog.getByLabel("Destination").selectOption(destination);
    await moveDialog.getByRole("button", { name: "Move Activity", exact: true }).click();
    await page.getByText("Activity moved. Open the destination page in Hotspots and place one deliberate launch hotspot.", { exact: true }).waitFor();
    assert.equal(state.index.document.activities[0].placement.pageId, destination);
    assert.equal(state.documents.get(`native_activity_public:${activityId}`).document.placement.pageId, destination);
  }

  delayedWorkbookCatalog = true;
  await page.goto(`${origin}/#/books/ultimate-b2/components/${components.workbook}/activities`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(40);
  await page.goto(`${origin}/#/books/ultimate-b2/components/${components.grammar}/activities`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Activity title").waitFor();
  assert.equal(await page.getByLabel("Activity title").inputValue(), "Grammar Book saved image");
  assert.equal((await page.locator("body").innerText()).includes("ultimate-b2-wb-"), false, "a delayed Workbook catalog cannot repopulate Grammar state");
  await page.goto(`${origin}/#/books/ultimate-b2/components/${components.workbook}/activities`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Activity title").waitFor();
  assert.equal(await page.getByLabel("Activity title").inputValue(), "Workbook saved image");
  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book/activities`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Activity authoring" }).waitFor();
  assert.equal((await page.locator("body").innerText()).includes("ultimate-b2-wb-"), false);
  assert.equal((await page.locator("body").innerText()).includes("ultimate-b2-gb-"), false);

  const residentExchangeStart = exchangeRequests.length;
  const residentCatalogStart = managedCatalogRequests.length;
  const residentPreviewLoadStart = managedPreviewLoads.length;
  await page.goto(`${origin}/#/books/ultimate-b2/components/ultimate-b2-students-book`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const studentsPagesReview = page.frameLocator(".unified-builder-review-dialog iframe");
  await studentsPagesReview.locator(".teacher-offline-library").waitFor();
  const studentsFrameSource = await page.locator(".unified-builder-review-dialog iframe").getAttribute("src");
  const studentsPreviewAuthorization = new URL(studentsFrameSource).searchParams.get("previewAuthorization");
  assert.ok(studentsPreviewAuthorization);
  assert.equal(new URL(studentsFrameSource).searchParams.get("view"), "library");
  assert.equal(await page.getByLabel("Review page").count(), 0);
  assert.equal(await studentsPagesReview.getByRole("button", { name: "Students Book", exact: true }).getAttribute("aria-pressed"), "true");
  const residentIframeLocator = page.locator(".unified-builder-review-dialog iframe");
  const residentIframe = await residentIframeLocator.elementHandle();
  assert.ok(residentIframe);
  await residentIframeLocator.evaluate((iframe) => { iframe.dataset.productViewerInstance = "single"; });
  assert.match(await studentsPagesReview.locator(".teacher-offline-library").getAttribute("style"), new RegExp(`/preview/ui-assets-v2/${teacherUiChecksum}\\.png`));
  await studentsPagesReview.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await studentsPagesReview.getByRole("heading", { name: "Unit 1", exact: true }).waitFor();
  if (overviewScreenshotDir) await studentsPagesReview.locator(".teacher-offline-unit-overview-screen").screenshot({ path: path.join(overviewScreenshotDir, "students-book-unit-1-overview.png") });
  await studentsPagesReview.getByRole("button", { name: "Home" }).click();
  await studentsPagesReview.getByRole("button", { name: /^Open Unit 2:/ }).click();
  await studentsPagesReview.getByRole("heading", { name: "Unit 2", exact: true }).waitFor();
  if (overviewScreenshotDir) await studentsPagesReview.locator(".teacher-offline-unit-overview-screen").screenshot({ path: path.join(overviewScreenshotDir, "students-book-unit-2-overview.png") });
  await studentsPagesReview.getByRole("button", { name: "Home" }).click();
  await studentsPagesReview.getByRole("button", { name: /^Open Unit 5:/ }).click();
  await studentsPagesReview.getByRole("heading", { name: "Unit 5", exact: true }).waitFor();
  const studentsOverviewMetrics = await assertInteractiveOverview(studentsPagesReview, {
    labels: ["pg 65", "pg 66-67", "pg 68-69", "pg 70-71", "pg 72", "pg 73", "pg 74-75", "pg 76", "pg 77", "pg 78"],
    rows: [1, 1, 1, 1, 2, 2, 2, 2, 2, 2],
    weights: [1, 2, 2, 2, 1, 1, 2, 1, 1, 1],
    columnTotals: [24, 24],
    overviewBook: "students-book",
    imageHeightParityTolerance: 1,
    singleImageHeight: 129.25,
  }, "Students Book Unit 5 interactive Review", { directory: overviewScreenshotDir, fileName: "students-book-unit-5-overview.png" });
  assert.equal(studentsOverviewMetrics.thumbnailToken, "235px", "Students Book launcher keeps its established thumbnail token");
  await studentsPagesReview.getByRole("button", { name: /^Open Reading, pg 66-67$/ }).click();
  await studentsPagesReview.getByAltText("Unit 5, Reading, pg 66-67", { exact: true }).waitFor();
  await studentsPagesReview.getByRole("button", { name: "Home" }).click();
  await studentsPagesReview.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await studentsPagesReview.getByRole("heading", { name: "Unit 1", exact: true }).waitFor();
  await studentsPagesReview.locator(".teacher-unit-page-card").first().click();
  await studentsPagesReview.locator(".teacher-offline-page-stage").waitFor();
  const draftExtraLauncher = studentsPagesReview.getByRole("button", { name: "Extra Videos", exact: true });
  await draftExtraLauncher.waitFor(); await draftExtraLauncher.click();
  await studentsPagesReview.getByRole("menuitem", { name: "Saved Draft Extra", exact: true }).click();
  const draftExtraDialog = studentsPagesReview.getByRole("dialog", { name: "Saved Draft Extra" });
  await draftExtraDialog.waitFor(); await draftExtraDialog.locator("video").waitFor();
  assert.match(await draftExtraDialog.locator("video").getAttribute("src"), /^\/preview\/unit-extras\//);
  await draftExtraDialog.getByRole("button", { name: "Close Extra Video" }).click();
  await studentsPagesReview.getByRole("button", { name: "Home" }).click();
  await studentsPagesReview.locator(".teacher-offline-library").waitFor();
  await studentsPagesReview.getByRole("button", { name: "Workbook", exact: true }).click();
  await studentsPagesReview.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await studentsPagesReview.getByRole("heading", { name: "Unit 1", exact: true }).waitFor();
  await studentsPagesReview.getByRole("button", { name: /^Open Workbook page 1,/ }).click();
  await studentsPagesReview.getByAltText(/Workbook page 1/).waitFor();
  assert.match(await studentsPagesReview.locator(".teacher-offline-book").getAttribute("style"), new RegExp(`/preview/ui-assets-v2/${teacherUiChecksum}\\.png`));
  await studentsPagesReview.getByRole("button", { name: "Home" }).click();
  await studentsPagesReview.locator(".teacher-offline-library").waitFor();
  assert.equal(await studentsPagesReview.getByRole("button", { name: "Workbook", exact: true }).getAttribute("aria-pressed"), "true");
  await studentsPagesReview.getByRole("button", { name: /^Open Unit 7:/ }).click();
  await studentsPagesReview.getByRole("heading", { name: "Unit 7", exact: true }).waitFor();
  const workbookOverviewMetrics = await assertInteractiveOverview(studentsPagesReview, {
    labels: ["pg 70-71", "pg 72-73", "pg 74-75", "pg 76", "pg 77", "pg 78-79"],
    rows: [1, 1, 1, 2, 2, 2],
    weights: [2, 2, 2, 1, 1, 2],
    columnTotals: [24, 16],
    overviewBook: "workbook",
    imageHeightParityTolerance: 2,
    singleImageHeight: 154,
    verifyNaturalAspectRatio: true,
  }, "Workbook Unit 7 interactive Review", { directory: overviewScreenshotDir, fileName: "workbook-unit-7-overview.png" });
  assert.equal(workbookOverviewMetrics.thumbnailToken, "280px", "Workbook launcher uses the larger managed thumbnail token");
  assert.ok(Math.min(...workbookOverviewMetrics.thumbnailHeights) >= Math.min(...studentsOverviewMetrics.thumbnailHeights) * 1.18, "Workbook launcher thumbnails are at least 18% larger without scaling labels");
  assert.deepEqual([...new Set(workbookOverviewMetrics.titleFontSizes)], [...new Set(studentsOverviewMetrics.titleFontSizes)], "Workbook title font size remains unchanged");
  assert.deepEqual([...new Set(workbookOverviewMetrics.pageLabelFontSizes)], [...new Set(studentsOverviewMetrics.pageLabelFontSizes)], "Workbook page-label font size remains unchanged");
  await studentsPagesReview.getByRole("button", { name: /^Open Workbook page 70-71,/ }).click();
  await studentsPagesReview.getByAltText(/Workbook page 70-71/).waitFor();
  await studentsPagesReview.getByRole("button", { name: "Home" }).click();
  await studentsPagesReview.locator(".teacher-offline-library").waitFor();
  await studentsPagesReview.getByRole("button", { name: "Grammar Book", exact: true }).click();
  await studentsPagesReview.getByRole("button", { name: /^Open Unit 3:/ }).click();
  await studentsPagesReview.getByRole("heading", { name: "Unit 3", exact: true }).waitFor();
  const grammarOverviewMetrics = await assertInteractiveOverview(studentsPagesReview, {
    labels: ["pg 16", "pg 17-18", "pg 19-20", "pg 21", "pg 22-23", "pg 25", "pg 27-28"],
    rows: [1, 1, 1, 1, 2, 2, 2],
    weights: [1, 2, 2, 1, 2, 1, 2],
    columnTotals: [24, 20],
    overviewBook: "grammar-book",
    imageHeightParityTolerance: 2,
    singleImageHeight: 154,
    verifyNaturalAspectRatio: true,
  }, "Grammar Book Unit 3 interactive Review", { directory: overviewScreenshotDir, fileName: "grammar-book-unit-3-overview.png" });
  assert.equal(grammarOverviewMetrics.thumbnailToken, "280px", "Grammar Book safely shares the managed thumbnail token");
  assert.ok(grammarOverviewMetrics.thumbnailHeights.every((height) => Math.abs(height - workbookOverviewMetrics.thumbnailHeights[0]) < 0.1), "Grammar Book safely shares the managed launcher thumbnail size");
  assert.deepEqual([...new Set(grammarOverviewMetrics.titleFontSizes)], [...new Set(studentsOverviewMetrics.titleFontSizes)], "Grammar Book title font size remains unchanged");
  await studentsPagesReview.getByRole("button", { name: /^Open Grammar Book page 17-18,/ }).click();
  await studentsPagesReview.getByAltText(/Grammar Book page 17-18/).waitFor();
  assert.match(await studentsPagesReview.locator(".teacher-offline-book").getAttribute("style"), new RegExp(`/preview/ui-assets-v2/${teacherUiChecksum}\\.png`));
  await page.waitForTimeout(500);
  const renewedResidentExchanges = exchangeRequests.slice(residentExchangeStart);
  assert.equal(renewedResidentExchanges.length >= 6, true, "controlled short timers renew all scoped component authorizations inside the resident Viewer");
  assert.equal(renewedResidentExchanges.some((entry) => entry.source.componentSlug === entry.intent.componentSlug), true, "controlled renewal must use same-component scope");
  await studentsPagesReview.getByAltText(/Grammar Book page 17-18/).waitFor();
  await studentsPagesReview.getByRole("button", { name: "Home" }).click();
  await studentsPagesReview.getByRole("button", { name: "Students Book", exact: true }).click();
  await studentsPagesReview.getByRole("button", { name: /^Open Unit 1:/ }).click();
  await studentsPagesReview.getByRole("heading", { name: "Unit 1", exact: true }).waitFor();
  await studentsPagesReview.locator(".teacher-unit-page-card").first().click();
  await studentsPagesReview.locator(".teacher-offline-page-stage").waitFor();
  assert.equal(await residentIframeLocator.evaluate((node, original) => node === original, residentIframe), true, "all content switches and token renewal preserve iframe DOM identity");
  assert.equal(await residentIframeLocator.getAttribute("src"), studentsFrameSource, "Saved Draft renewal must not rewrite iframe src");
  assert.equal(await page.locator('.unified-builder-review-dialog iframe[data-product-viewer-instance="single"]').count(), 1, "component switching must preserve the one Viewer iframe");
  assert.deepEqual(await studentsPagesReview.locator("body").evaluate(() => globalThis.__teacherPreparationCounts), {
    "ultimate-b2-students-book": 1,
    "ultimate-b2-workbook": 1,
    "ultimate-b2-grammar-book": 1,
  });
  assert.equal(await studentsPagesReview.locator("body").evaluate(() => globalThis.__teacherProductStartupCount), 1);
  assert.equal(draftUnitExtraRequests.some((entry) => entry.decision.authorized && /^v2\./.test(entry.authorization)), true, "Saved Draft media uses an exact Students component token");
  const residentCatalogs = managedCatalogRequests.slice(residentCatalogStart);
  assert.equal(residentCatalogs.filter((entry) => entry.componentSlug === components.workbook).length, 1);
  assert.equal(residentCatalogs.filter((entry) => entry.componentSlug === components.grammar).length, 1);
  const residentPreviewLoads = managedPreviewLoads.slice(residentPreviewLoadStart);
  assert.equal(residentPreviewLoads.filter((entry) => entry === "ultimate-b2-students-book:ui-controller:default").length, 1, "the product shell UI manifest loads once");
  assert.equal(exchangeRequests.slice(residentExchangeStart).some((entry) => entry.source.componentSlug !== entry.intent.componentSlug), true);
  assert.equal(teacherUiObjectRequests.some(({ operation, objectKey }) => operation === "get" && objectKey === teacherUiObjectKey), true);
  const overrideObjectRequestCount = teacherUiObjectRequests.length;
  await page.getByRole("button", { name: "Close Review" }).click();

  assert.deepEqual(consoleErrors, [], [...failedResponses, ...failedRequests].join("\n"));
  const fallbackFailureStart = failedResponses.length;
  const fallbackConsoleStart = consoleErrors.length;
  teacherUiOverrideEnabled = false;
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Refresh Viewer", exact: true }).click();
  await page.frameLocator(".unified-builder-review-dialog iframe").locator(".teacher-offline-library").waitFor();
  assert.equal(teacherUiObjectRequests.length, overrideObjectRequestCount, "canonical fallback must not request a hosted Teacher UI object");
  const fallbackFailures = failedResponses.splice(fallbackFailureStart);
  assert.equal(fallbackFailures.length, 1);
  assert.match(fallbackFailures[0], /^404 .*\/preview\/content\/books\/ultimate-b2\/components\/ultimate-b2-students-book\/ui-controller\?/);
  const fallbackConsoleErrors = consoleErrors.splice(fallbackConsoleStart);
  assert.deepEqual(fallbackConsoleErrors, ["Failed to load resource: the server responded with a status of 404 (Not Found)"]);
  await page.getByRole("button", { name: "Close Review" }).click();
  teacherUiOverrideEnabled = true;
  assert.equal(exchangeRequests.every((entry) => entry.source.bookSlug === "ultimate-b2" && entry.intent.bookSlug === "ultimate-b2"), true);
  assert.equal(exchangeRequests.some((entry) => entry.intent.componentSlug === components.workbook), true);
  assert.equal(exchangeRequests.some((entry) => entry.intent.componentSlug === components.grammar), true);
  assert.equal(managedAssetRequests.length >= 9, true);
  assert.equal(managedAssetRequests.every((entry) => entry.pageId.startsWith(entry.componentSlug === components.workbook ? "ultimate-b2-wb-" : "ultimate-b2-gb-")
    && classifyBuilderPreviewAuthorization({ queryStringParameters: { previewAuthorization: entry.authorization } }, {
      action: "managed-page-asset", bookSlug: entry.bookSlug, componentSlug: entry.componentSlug, pageId: entry.pageId,
    }, { environment: previewEnvironment, now: previewNow }).authorized), true);
  for (const componentSlug of [components.workbook, components.grammar]) {
    assert.equal(authorizationIntents.some((intent) => intent.componentSlug === componentSlug && intent.view === "library" && intent.pageId === null), true);
    assert.ok(managedReviewTokens.get(componentSlug));
  }
  assert.equal(authorizationIntents.some((intent) => intent.componentSlug === "ultimate-b2-students-book" && intent.view === "library" && intent.pageId === null), true);

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
  assert.equal(browserRequests.some((entry) => entry.includes(`/preview/ui-assets-v2/${teacherUiChecksum}.png`)), true);
  assert.equal(browserRequests.some((entry) => entry.includes(`/preview/ui-assets/${teacherUiChecksum}.png`)), false, "new Viewer code must not reuse the immutable v1 redirect cache key");
  assert.equal(failedResponses.some((entry) => /^401 .*\/preview\/pages\//.test(entry)), false);
  assert.equal(browserRequests.some((entry) => /pub-.*\.r2\.dev|\/publishers\//i.test(entry)), false);
  assert.equal(failedRequests.some((entry) => /pub-.*\.r2\.dev|\/publishers\//i.test(entry)), false);

  assert.deepEqual(consoleErrors, [], [...failedResponses, ...failedRequests].join("\n"));
  assert.deepEqual(pageErrors, []);
  process.stdout.write("Ultimate B2 multi-component Builder and hosted Viewer browser acceptance passed.\n");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => immutableRedirectTargetServer.close(resolve));
}
