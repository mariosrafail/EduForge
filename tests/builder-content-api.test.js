import assert from "node:assert/strict";
import test from "node:test";

import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";
import { createBuilderContentHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-content.js";
import { resolveBuilderContentResource } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { loadBuilderComponentDocument } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-store.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const builderUserId = "10000000-0000-4000-8000-000000000001";
const route = "/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots";
const mutationOne = "10000000-0000-4000-8000-000000000011";
const mutationTwo = "10000000-0000-4000-8000-000000000012";
const hotspotResource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "hotspots");

function event({ method = "GET", path = route, cookie = "hh_builder_session=live", origin = "https://builder.example", body, contentType = "application/json" } = {}) {
  return {
    httpMethod: method,
    path,
    headers: {
      host: "builder.example",
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
      ...(contentType ? { "content-type": contentType } : {}),
    },
    body: body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body),
  };
}

function parsed(response) {
  return JSON.parse(response.body);
}

function memoryHarness() {
  let current = null;
  const history = [];
  const audits = [];
  const saveCalls = [];
  const handler = createBuilderContentHandler({
    getDatabase: () => ({}),
    authorize: async (request) => {
      const cookie = request.headers.cookie || "";
      if (cookie !== "hh_builder_session=live") return { error: json(401, { error: "Unauthorized" }) };
      return { builderUser: { id: builderUserId, role: "developer", status: "active" } };
    },
    loadDocument: async (_sql, resource) => resource.resource === "hotspots" && current
      ? { revision: current.revision, source: "database", document: current.document }
      : null,
    saveDocument: async (_sql, input) => {
      saveCalls.push(input);
      const replay = history.find((item) => item.clientMutationId === input.clientMutationId);
      if (replay) return replay.payloadSha256 === input.payloadSha256
        ? { outcome: "idempotent", revision: replay.revision, currentRevision: current.revision, document: replay.document, payloadSha256: replay.payloadSha256 }
        : { outcome: "mutation_id_conflict", revision: replay.revision, currentRevision: current.revision, document: null };
      const currentRevision = current?.revision || 0;
      if (input.expectedRevision !== currentRevision) return { outcome: "revision_conflict", revision: null, currentRevision, document: null };
      const revision = currentRevision + 1;
      current = { revision, document: input.document, updatedBy: input.builderUserId };
      history.push({ revision, document: input.document, payloadSha256: input.payloadSha256, clientMutationId: input.clientMutationId });
      audits.push({ action: "builder_document_saved", actor: input.builderUserId, metadata: { book_slug: input.resource.bookSlug, component_slug: input.resource.componentSlug, document_type: input.resource.documentType, revision, source: "database" } });
      return { outcome: "saved", revision, currentRevision: revision, document: input.document, payloadSha256: input.payloadSha256 };
    },
  });
  return { handler, history, audits, saveCalls, current: () => current };
}

function baseline() {
  return hotspotResource.baseline();
}

function changedDocument(label = "Changed safely") {
  const document = baseline();
  const pageId = Object.keys(document.pages)[0];
  document.pages[pageId][0].label = label;
  return document;
}

function saveBody(document, expectedRevision = 0, clientMutationId = mutationOne) {
  return { expectedRevision, clientMutationId, document };
}

test("Builder content requires only a live Builder session for GET and Save", async () => {
  const { handler } = memoryHarness();
  for (const cookie of ["", "hh_lms_session=ordinary", "hh_platform_admin_session=admin", "hh_builder_session=revoked", "hh_builder_session=paused"]) {
    assert.equal((await handler(event({ cookie }))).statusCode, 401);
    assert.equal((await handler(event({ method: "PUT", cookie, body: saveBody(changedDocument()) }))).statusCode, 401);
  }
  assert.equal((await handler(event())).statusCode, 200);
});

test("Builder content mutation enforces same origin and JSON before persistence", async () => {
  const { handler, saveCalls } = memoryHarness();
  assert.equal((await handler(event({ method: "PUT", origin: "", body: saveBody(changedDocument()) }))).statusCode, 403);
  assert.equal((await handler(event({ method: "PUT", origin: "https://other.example", body: saveBody(changedDocument()) }))).statusCode, 403);
  assert.equal((await handler(event({ method: "PUT", contentType: "text/plain", body: saveBody(changedDocument()) }))).statusCode, 415);
  assert.equal((await handler(event({ method: "PUT", body: saveBody(changedDocument()) }))).statusCode, 200);
  assert.equal(saveCalls.length, 1);
});

test("resource registry fails unknown books, components, resources, and pending B2 components closed", async () => {
  const { handler } = memoryHarness();
  const paths = [
    "/builder/api/content/books/unknown/components/ultimate-b2-students-book/hotspots",
    "/builder/api/content/books/ultimate-b2/components/unknown/hotspots",
    "/builder/api/content/books/ultimate-b2/components/ultimate-b2-workbook/hotspots",
    "/builder/api/content/books/ultimate-b2/components/ultimate-b2-grammar-book/hotspots",
    "/builder/api/content/books/ultimate-b2/components/ultimate-b2-test-book/hotspots",
    "/builder/api/content/books/ultimate-b2/components/ultimate-b2-workbook/open-response/ultimate-b2-sb-u1-p5-o2",
    "/builder/api/content/books/ultimate-b2/components/ultimate-b2-grammar-book/open-response/ultimate-b2-sb-u1-p5-o2",
    "/builder/api/content/books/ultimate-b2/components/ultimate-b2-test-book/open-response/ultimate-b2-sb-u1-p5-o2",
    "/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/activities",
  ];
  for (const path of paths) assert.equal((await handler(event({ path }))).statusCode, 404);
});

test("GET returns validated repository revision zero until a hosted document exists", async () => {
  const { handler } = memoryHarness();
  const response = await handler(event());
  assert.equal(response.statusCode, 200);
  const payload = parsed(response);
  assert.equal(payload.revision, 0);
  assert.equal(payload.source, "repository");
  assert.equal(payload.document.schemaVersion, "1.0");
  assert.equal(payload.document.packageSlug, "ultimate-b2");
  assert.equal(payload.document.componentSlug, "students-book");
});

test("first and second Saves persist revisions and reload returns the latest document", async () => {
  const { handler, history, audits, current, saveCalls } = memoryHarness();
  const firstDocument = changedDocument("Revision one");
  const first = parsed(await handler(event({ method: "PUT", body: saveBody(firstDocument) })));
  assert.equal(first.revision, 1);
  assert.equal(first.source, "database");
  const secondDocument = changedDocument("Revision two");
  const second = parsed(await handler(event({ method: "PUT", body: saveBody(secondDocument, 1, mutationTwo) })));
  assert.equal(second.revision, 2);
  const loaded = parsed(await handler(event()));
  assert.equal(loaded.revision, 2);
  assert.equal(loaded.document.pages[Object.keys(loaded.document.pages)[0]][0].label, "Revision two");
  assert.equal(history.length, 2);
  assert.equal(current().updatedBy, builderUserId);
  assert.equal(saveCalls[0].builderUserId, builderUserId);
  assert.equal(typeof saveCalls[0].document?.then, "undefined");
  assert.deepEqual(audits.map(({ action }) => action), ["builder_document_saved", "builder_document_saved"]);
  assert.doesNotMatch(JSON.stringify(audits), /payload|password|token|answer|solution/i);
});

test("stale revisions conflict without overwrite", async () => {
  const { handler, history, current } = memoryHarness();
  await handler(event({ method: "PUT", body: saveBody(changedDocument("Current")) }));
  const response = await handler(event({ method: "PUT", body: saveBody(changedDocument("Stale"), 0, mutationTwo) }));
  assert.equal(response.statusCode, 409);
  assert.deepEqual(parsed(response), { error: "revision_conflict", currentRevision: 1 });
  assert.equal(current().document.pages[Object.keys(current().document.pages)[0]][0].label, "Current");
  assert.equal(history.length, 1);
});

test("mutation retries are idempotent while changed payload reuse is rejected", async () => {
  const { handler, history } = memoryHarness();
  const document = changedDocument("Retry-safe");
  const first = parsed(await handler(event({ method: "PUT", body: saveBody(document) })));
  const replay = parsed(await handler(event({ method: "PUT", body: saveBody(document) })));
  assert.equal(first.revision, 1);
  assert.equal(replay.revision, 1);
  assert.equal(replay.idempotent, true);
  assert.equal(history.length, 1);
  const changed = await handler(event({ method: "PUT", body: saveBody(changedDocument("Different")) }));
  assert.equal(changed.statusCode, 409);
  assert.equal(parsed(changed).error, "mutation_id_conflict");
  assert.equal(history.length, 1);
});

test("hotspot validation rejects unknown pages, geometry, IDs, activities, actions, malformed bodies, and private keys", async () => {
  const cases = [];
  const unknownPage = baseline(); unknownPage.pages.unknown = []; cases.push(unknownPage);
  const badBounds = baseline(); badBounds.pages[Object.keys(badBounds.pages)[0]][0].left = 101; cases.push(badBounds);
  const duplicate = baseline(); { const key = Object.keys(duplicate.pages)[0]; duplicate.pages[key].push({ ...duplicate.pages[key][0] }); } cases.push(duplicate);
  const badActivity = baseline(); badActivity.pages[Object.keys(badActivity.pages)[0]][0].activityKey = "unknown"; cases.push(badActivity);
  const badAction = baseline(); badAction.pages[Object.keys(badAction.pages)[0]][0].actionType = "delete"; cases.push(badAction);
  const { handler, saveCalls, audits } = memoryHarness();
  for (const document of cases) assert.equal((await handler(event({ method: "PUT", body: saveBody(document) }))).statusCode, 400);
  assert.equal((await handler(event({ method: "PUT", body: "{" }))).statusCode, 400);
  assert.equal((await handler(event({ method: "PUT", body: { ...saveBody(baseline()), builderUserId } }))).statusCode, 400);
  assert.equal((await handler(event({ method: "PUT", body: `${" ".repeat(512 * 1024)}x` }))).statusCode, 413);
  const privateDocument = baseline(); privateDocument.pages[Object.keys(privateDocument.pages)[0]][0].metadata = { Correct_Option_IDs: ["x"] };
  assert.equal(parsed(await handler(event({ method: "PUT", body: saveBody(privateDocument) }))).error, "private_document_key_rejected");
  assert.equal(saveCalls.length, 0);
  assert.equal(audits.length, 0);
});

test("stable checksums are key-order independent", () => {
  assert.equal(builderDocumentSha256({ b: 2, a: { d: 4, c: 3 } }), builderDocumentSha256({ a: { c: 3, d: 4 }, b: 2 }));
});

test("stored documents verify raw checksums before validation and fail corrupt state closed", async () => {
  const document = baseline();
  const row = {
    schema_version: hotspotResource.schemaVersion,
    revision: 3,
    payload: document,
    payload_sha256: builderDocumentSha256(document),
  };
  const loaded = await loadBuilderComponentDocument(async () => [row], hotspotResource);
  assert.equal(loaded.revision, 3);
  assert.equal(typeof loaded.document?.then, "undefined");

  await assert.rejects(
    loadBuilderComponentDocument(async () => [{ ...row, payload_sha256: "0".repeat(64) }], hotspotResource),
    /checksum is invalid/,
  );
  const invalidPage = structuredClone(document);
  invalidPage.pages.unknown = [];
  await assert.rejects(
    loadBuilderComponentDocument(async () => [{ ...row, payload: invalidPage, payload_sha256: builderDocumentSha256(invalidPage) }], hotspotResource),
    /Unknown Students Book page id/,
  );
});

test("native hotspot targets save, reload, and fail closed when the saved native catalog cannot prove membership", async () => {
  const fixture = createPublicationV2FixtureSources();
  let saved = null;
  const handler = createBuilderContentHandler({
    getDatabase: () => ({}),
    authorize: async () => ({ builderUser: { id: builderUserId, role: "developer", status: "active" } }),
    loadDocument: async (_sql, resource) => {
      if (resource.resource === "hotspots") return saved;
      if (resource.resource === "native-activity-index") return { revision: fixture.native.index.revision, source: "database", document: fixture.native.index.payload };
      if (resource.resource === "native-activity-public") {
        const source = fixture.native.activities[resource.documentKey]?.public;
        return source ? { revision: source.revision, source: "database", document: source.payload } : null;
      }
      return null;
    },
    saveDocument: async (_sql, input) => {
      saved = { revision: 1, source: "database", document: input.document };
      return { outcome: "saved", revision: 1, currentRevision: 1, document: input.document, payloadSha256: input.payloadSha256 };
    },
  });
  const document = fixture.documents.hotspots.payload;
  const response = await handler(event({ method: "PUT", body: saveBody(document) }));
  assert.equal(response.statusCode, 200);
  assert.equal(parsed(await handler(event())).document.pages[publicationV2Fixture.pageId].some((hotspot) => hotspot.activityKey === publicationV2Fixture.openResponseId), true);

  saved = null;
  delete fixture.native.activities[publicationV2Fixture.openResponseId];
  const rejected = await handler(event({ method: "PUT", body: saveBody(document, 0, mutationTwo) }));
  assert.equal(rejected.statusCode, 400);
  assert.match(parsed(rejected).detail, /incomplete/);
});
