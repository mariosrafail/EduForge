import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { canonicalStudentsBookPages } from "../netlify-sites/ultimate-b2-builder/server/_builder-page-catalog.js";
import { createBuilderPagesHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-pages.js";
import runtime from "../src/data/ultimate-b2/generated/students-book.runtime.json" with { type: "json" };

const actor = "10000000-0000-4000-8000-000000000001";
const uploadId = "10000000-0000-4000-8000-000000000002";
const assetId = "10000000-0000-4000-8000-000000000003";
const base = "/builder/api/pages/books/ultimate-b2/components";
const first = canonicalStudentsBookPages[0];
const canonicalBytes = await readFile(new URL(`../${runtime.units[0].pages[0].pageImage.localHdAssetPath}`, import.meta.url));
const managedUnits = (componentSlug) => Array.from({ length: 10 }, (_, index) => ({
  id: `${componentSlug === "ultimate-b2-workbook" ? "20000000" : "30000000"}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  slug: `unit-${index + 1}`,
  unit_number: index + 1,
  title: `Unit ${index + 1}`,
  sort_order: index + 1,
}));

function request(path, body, overrides = {}) {
  return {
    httpMethod: overrides.method || (body ? "POST" : "GET"),
    path,
    headers: { host: "builder.example", origin: "https://builder.example", cookie: "live", "content-type": "application/json", ...overrides.headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
}

function harness(options = {}) {
  let prepared; let completed; let failed; let mutation;
  const storage = {
    signedPutUrl: async () => ({ url: "https://storage.example/upload", headers: { "Content-Type": first.image.mimeType } }),
    signedGetUrl: async () => "https://storage.example/private-preview",
    head: async () => ({ byteSize: canonicalBytes.length, contentType: first.image.mimeType }),
    download: async () => canonicalBytes,
    upload: async () => ({}),
    delete: async () => {},
    bucket: () => "private-assets",
  };
  const handler = createBuilderPagesHandler({
    getDatabase: () => ({}),
    authorize: async (event) => event.headers.cookie === "live" ? { builderUser: { id: actor } } : { error: json(401, { error: "Unauthorized" }) },
    randomUuid: () => uploadId,
    storage: () => storage,
    loadPages: async (_sql, identity) => options.loadPages?.(identity) || { revision: options.revision || 0, rows: [], units: identity.componentSlug === "ultimate-b2-students-book" ? [] : managedUnits(identity.componentSlug) },
    prepare: async (_sql, input) => {
      prepared = input;
      return { outcome: "prepared", upload_id: uploadId, current_revision: input.expectedRevision, session_state: "prepared", staging_object_key: input.stagingObjectKey };
    },
    claim: async () => ({
      outcome: "claimed", book_slug: "ultimate-b2", component_slug: "ultimate-b2-students-book",
      page_key: `${first.componentSlug}/pages/${first.id}`, upload_mode: "replace", current_revision: 0,
      page_metadata: prepared.pageMetadata, file_descriptor: prepared.fileDescriptor, staging_object_key: prepared.stagingObjectKey,
      ...options.claim,
    }),
    complete: async (_sql, input) => { completed = input; return { outcome: "saved", page_id: actor, asset_id: assetId, revision: 1 }; },
    fail: async (_sql, input) => { failed = input; return true; },
    mutate: async (_sql, input) => { mutation = input; return { outcome: "saved", current_revision: input.expectedRevision + 1 }; },
    loadAsset: options.loadAsset || (async () => null),
    inspectRaster: options.inspectRaster,
    logger: { error() {} },
  });
  return { handler, getPrepared: () => prepared, getCompleted: () => completed, getFailed: () => failed, getMutation: () => mutation };
}

test("Students Book Pages derives the complete canonical catalog and exposes no repository paths", async () => {
  const current = harness();
  const response = await current.handler(request(`${base}/ultimate-b2-students-book`));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  const expected = runtime.units.flatMap((unit) => unit.pages);
  assert.equal(body.pages.length, expected.length);
  assert.deepEqual([...new Set(body.pages.map((page) => page.unitNumber))], runtime.units.map((unit) => Number(unit.number)));
  assert.deepEqual(body.pages.map((page) => page.id), expected.map((page) => page.id));
  assert.deepEqual(body.pages.map((page) => page.printedPages), expected.map((page) => page.pageNumbers));
  assert.ok(body.pages.every((page) => page.source === "repository-baseline" && page.image.url.startsWith("/page-library/")));
  assert.doesNotMatch(response.body, /repositoryPath|localHdAssetPath|Nextcloud|[A-Z]:\\/);
});

test("Workbook and Grammar Pages are authenticated component-scoped ten-Unit empty libraries", async () => {
  const current = harness();
  assert.equal((await current.handler(request(`${base}/ultimate-b2-workbook`, null, { headers: { cookie: "" } }))).statusCode, 401);
  const response = await current.handler(request(`${base}/ultimate-b2-workbook`));
  const workbook = JSON.parse(response.body);
  assert.deepEqual(workbook.pages, []);
  assert.deepEqual(workbook.units.map((unit) => unit.unitNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const grammarResponse = await current.handler(request(`${base}/ultimate-b2-grammar-book`));
  assert.equal(grammarResponse.statusCode, 200);
  const grammar = JSON.parse(grammarResponse.body);
  assert.equal(grammar.component.title, "Grammar Book");
  assert.deepEqual(grammar.units.map((unit) => unit.title), Array.from({ length: 10 }, (_, index) => `Unit ${index + 1}`));
});

test("managed creation requires a valid Unit identity and preserves it in prepare metadata", async () => {
  const current = harness();
  const unitId = managedUnits("ultimate-b2-workbook")[0].id;
  const descriptor = { mode: "create", pageId: "", expectedRevision: 0, clientMutationId: randomUUID(), metadata: { label: "Workbook page", printedLabel: "4", sortOrder: 1 }, file: { name: "page.png", size: canonicalBytes.length, type: "image/png" } };
  assert.equal((await current.handler(request(`${base}/ultimate-b2-workbook/assets/prepare`, descriptor))).statusCode, 400);
  const accepted = await current.handler(request(`${base}/ultimate-b2-workbook/assets/prepare`, { ...descriptor, clientMutationId: randomUUID(), metadata: { ...descriptor.metadata, unitId } }));
  assert.equal(accepted.statusCode, 200);
  assert.equal(current.getPrepared().pageMetadata.unitId, unitId);
  assert.match(JSON.parse(accepted.body).pageId, /^wb-/);
});

test("managed list serializes relational Unit metadata and normalizes bigint revisions safely", async () => {
  const units = managedUnits("ultimate-b2-grammar-book");
  const current = harness({ loadPages: () => ({ revision: 9n, units, rows: [{
    id: actor, stable_key: "ultimate-b2-grammar-book/pages/gb-one", label: "Grammar page", sort_order: 2,
    unit_id: units[9].id, unit_slug: "unit-10", unit_number: 10, unit_title: "Unit 10", unit_sort_order: 10,
    source_metadata: { is_active: true, printed_label: "88" }, asset_id: assetId, mime_type: "image/png", byte_size: 10n,
    checksum_sha256: "a".repeat(64), width: 100, height: 200,
  }] }) });
  const response = await current.handler(request(`${base}/ultimate-b2-grammar-book`));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.revision, 9);
  assert.deepEqual({ unitId: body.pages[0].unitId, unitNumber: body.pages[0].unitNumber, unitTitle: body.pages[0].unitTitle }, { unitId: units[9].id, unitNumber: 10, unitTitle: "Unit 10" });
  assert.equal(body.pages[0].image.byteSize, 10);
});

test("Students Book replacement prepare is baseline-bound and returns only signed upload authorization", async () => {
  const current = harness(); const clientMutationId = randomUUID();
  const valid = { mode: "replace", pageId: first.id, expectedRevision: 0, clientMutationId, metadata: { label: "ignored", printedLabel: "", sortOrder: 1 }, file: { name: "replacement.png", size: canonicalBytes.length, type: "image/png" } };
  assert.equal((await current.handler(request(`${base}/ultimate-b2-students-book/assets/prepare`, { ...valid, mode: "create" }))).statusCode, 400);
  assert.equal((await current.handler(request(`${base}/ultimate-b2-students-book/assets/prepare`, { ...valid, pageId: "unknown-page" }))).statusCode, 400);
  assert.equal((await current.handler(request(`${base}/ultimate-b2-students-book/assets/prepare`, valid, { headers: { origin: "https://attacker.example" } }))).statusCode, 403);
  const response = await current.handler(request(`${base}/ultimate-b2-students-book/assets/prepare`, valid));
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(current.getPrepared().pageMetadata.baselineWidth, first.image.width);
  assert.equal(current.getPrepared().pageMetadata.baselineHeight, first.image.height);
  assert.equal(body.pageId, first.id);
  assert.equal(JSON.stringify(body).includes("stagingObjectKey"), false);
});

test("finalize verifies actual raster bytes and preserves component/page identity", async () => {
  const current = harness(); const clientMutationId = randomUUID();
  const descriptor = { mode: "replace", pageId: first.id, expectedRevision: 0, clientMutationId, metadata: metadata(first), file: { name: "replacement.png", size: canonicalBytes.length, type: "image/png" } };
  await current.handler(request(`${base}/ultimate-b2-students-book/assets/prepare`, descriptor));
  const response = await current.handler(request(`${base}/ultimate-b2-students-book/assets/finalize`, { uploadId, expectedRevision: 0, clientMutationId }));
  assert.equal(response.statusCode, 200);
  assert.match(current.getCompleted().objectKey, new RegExp(`/ultimate-b2-students-book/${first.id}/assets/[a-f0-9]{64}\\.png$`));
  assert.equal(current.getCompleted().width, first.image.width);
  assert.equal(current.getCompleted().height, first.image.height);
  assert.doesNotMatch(response.body, /objectKey|storageBucket|private-assets/);
});

test("replacement rejects dimension drift and preview lookup remains component-scoped", async () => {
  const wrong = harness({ inspectRaster: async () => ({ bytes: canonicalBytes, checksumSha256: "a".repeat(64), mimeType: "image/png", extension: ".png", byteSize: canonicalBytes.length, width: first.image.width + 1, height: first.image.height }) });
  const clientMutationId = randomUUID();
  await wrong.handler(request(`${base}/ultimate-b2-students-book/assets/prepare`, { mode: "replace", pageId: first.id, expectedRevision: 0, clientMutationId, metadata: metadata(first), file: { name: "replacement.png", size: canonicalBytes.length, type: "image/png" } }));
  const rejected = await wrong.handler(request(`${base}/ultimate-b2-students-book/assets/finalize`, { uploadId, expectedRevision: 0, clientMutationId }));
  assert.equal(rejected.statusCode, 400);
  assert.equal(JSON.parse(rejected.body).error, "students_book_page_dimensions_mismatch");
  assert.equal(wrong.getFailed().failureCode, "students_book_page_dimensions_mismatch");

  const scoped = harness({ loadAsset: async (_sql, input) => input.componentSlug === "ultimate-b2-students-book" ? { object_key: "private/page.png" } : null });
  const workbookPreview = await scoped.handler(request(`${base}/ultimate-b2-workbook/pages/${first.id}/assets/${assetId}/preview`));
  assert.equal(workbookPreview.statusCode, 404);
});

test("baseline delete is rejected while Workbook mutations remain revision-bound", async () => {
  const current = harness();
  const body = { expectedRevision: 0, clientMutationId: randomUUID(), metadata: {} };
  assert.equal((await current.handler(request(`${base}/ultimate-b2-students-book/pages/${first.id}/delete`, body))).statusCode, 400);
  const workbook = await current.handler(request(`${base}/ultimate-b2-workbook/pages/wb-page-safe/delete`, body));
  assert.equal(workbook.statusCode, 200);
  assert.equal(current.getMutation().pageKey, "ultimate-b2-workbook/pages/wb-page-safe");
  assert.equal(current.getMutation().componentSlug, "ultimate-b2-workbook");
});

function metadata(page) {
  return { label: page.label, printedLabel: page.printedLabel, sortOrder: page.sortOrder };
}
