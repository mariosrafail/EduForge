import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderPreviewHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview.js";
import { authorizeBuilderPreviewRequest, issueBuilderPreviewAuthorization } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization.js";
import { resolveBuilderContentResource } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";

const route = "/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots";
const resource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "hotspots");
const forbiddenResponseData = /acceptedAnswers|correctAnswer|correctOptionId|modelAnswer|teacherSolution|revealText|password|token|secret|databaseUrl/i;

function event(method = "GET", path = route, headers = {}) {
  return { httpMethod: method, path, headers };
}

function parsed(response) {
  return JSON.parse(response.body);
}

function row(document, overrides = {}) {
  return {
    schema_version: resource.schemaVersion,
    revision: 3,
    payload: document,
    payload_sha256: builderDocumentSha256(document),
    ...overrides,
  };
}

test("public Builder preview returns the canonical repository revision without a session", async () => {
  let databaseReads = 0;
  const handler = createBuilderPreviewHandler({
    getDatabase: () => async () => { databaseReads += 1; return []; },
  });
  const response = await handler(event("GET", route, {}));
  const body = parsed(response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Content-Type"], "application/json");
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(databaseReads, 2);
  assert.deepEqual(Object.keys(body), [
    "bookSlug", "componentSlug", "resource", "schemaVersion", "revision", "source", "document",
  ]);
  assert.deepEqual(body, {
    bookSlug: "ultimate-b2",
    componentSlug: "ultimate-b2-students-book",
    resource: "hotspots",
    schemaVersion: "1.0",
    revision: 0,
    source: "repository",
    document: resource.baseline(),
  });
  assert.doesNotMatch(response.body, forbiddenResponseData);
  assert.doesNotMatch(response.body, /session|user|email|payloadSha|timestamp|clientMutationId/i);
});

test("public Builder preview returns the checksum-validated latest database revision", async () => {
  const document = resource.baseline();
  const pageId = Object.keys(document.pages)[0];
  Object.assign(document.pages[pageId][0], { left: 11.125, top: 22.25, width: 13.375, height: 14.5 });
  const handler = createBuilderPreviewHandler({
    getDatabase: () => async (_strings, _bookSlug, _componentSlug, documentType) => documentType === resource.documentType ? [row(document)] : [],
  });
  const response = await handler(event());
  const body = parsed(response);

  assert.equal(response.statusCode, 200);
  assert.equal(body.revision, 3);
  assert.equal(body.source, "database");
  assert.deepEqual(body.document, resource.validate(document));
  assert.deepEqual(
    (({ left, top, width, height }) => ({ left, top, width, height }))(body.document.pages[pageId][0]),
    { left: 11.125, top: 22.25, width: 13.375, height: 14.5 },
  );
  assert.doesNotMatch(response.body, forbiddenResponseData);
});

test("hotspot preview loads declared native context and preserves a valid persisted native target", async () => {
  const fixture = createPublicationV2FixtureSources();
  const loaded = [];
  const handler = createBuilderPreviewHandler({
    getDatabase: () => ({}),
    loadDocument: async (_sql, candidate) => {
      loaded.push(`${candidate.resource}:${candidate.documentKey}`);
      if (candidate.resource === "hotspots") return { revision: fixture.documents.hotspots.revision, source: "database", document: fixture.documents.hotspots.payload };
      if (candidate.resource === "native-activity-index") return { revision: fixture.native.index.revision, source: "database", document: fixture.native.index.payload };
      if (candidate.resource === "native-activity-public") {
        const source = fixture.native.activities[candidate.documentKey]?.public;
        return source ? { revision: source.revision, source: "database", document: source.payload } : null;
      }
      if (candidate.resource === "native-activity-teacher") throw new Error("Teacher documents must not be loaded for hotspot preview.");
      return null;
    },
  });
  const response = await handler(event());
  const body = parsed(response);
  assert.equal(response.statusCode, 200);
  assert.equal(body.document.pages[publicationV2Fixture.pageId].some((hotspot) => hotspot.activityKey === publicationV2Fixture.openResponseId), true);
  assert.equal(loaded.includes("native-activity-index:default"), true);
  assert.equal(loaded.includes(`native-activity-public:${publicationV2Fixture.openResponseId}`), true);
  assert.equal(loaded.some((value) => value.startsWith("native-activity-teacher:")), false);
  assert.doesNotMatch(response.body, forbiddenResponseData);
});

test("hotspot preview rejects deleted, unknown, and malformed native targets without weakening geometry", async () => {
  const fixture = createPublicationV2FixtureSources();
  const preview = async (document, index = fixture.native.index.payload, publicDocuments = fixture.native.activities) => createBuilderPreviewHandler({
    getDatabase: () => ({}),
    loadDocument: async (_sql, candidate) => {
      if (candidate.resource === "hotspots") return { revision: 4, source: "database", document };
      if (candidate.resource === "native-activity-index") return { revision: 2, source: "database", document: index };
      if (candidate.resource === "native-activity-public") {
        const source = publicDocuments[candidate.documentKey]?.public;
        return source ? { revision: source.revision, source: "database", document: source.payload } : null;
      }
      return null;
    },
    logger: { error() {} },
  })(event());

  const deletedIndex = structuredClone(fixture.native.index.payload);
  deletedIndex.activities = deletedIndex.activities.filter((entry) => entry.activityId !== publicationV2Fixture.openResponseId);
  assert.equal((await preview(fixture.documents.hotspots.payload, deletedIndex)).statusCode, 500);

  const missingPublic = structuredClone(fixture.native.activities);
  delete missingPublic[publicationV2Fixture.openResponseId];
  assert.equal((await preview(fixture.documents.hotspots.payload, fixture.native.index.payload, missingPublic)).statusCode, 500);

  const unknown = structuredClone(fixture.documents.hotspots.payload);
  unknown.pages[publicationV2Fixture.pageId].find((hotspot) => hotspot.activityKey === publicationV2Fixture.openResponseId).activityKey = "unknown-native-activity";
  assert.equal((await preview(unknown)).statusCode, 500);

  const invalidGeometry = structuredClone(fixture.documents.hotspots.payload);
  invalidGeometry.pages[publicationV2Fixture.pageId][0].left = -1;
  assert.equal((await preview(invalidGeometry)).statusCode, 500);
});

test("preview resources without a related-context declaration do not load the native index", async () => {
  const teacherResource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "ui-controller");
  const resolutions = [];
  const handler = createBuilderPreviewHandler({
    getDatabase: () => ({}),
    resolveResource: async (...arguments_) => {
      resolutions.push(arguments_.slice(2).join(":"));
      return resolveBuilderContentResource(...arguments_);
    },
    authorizePreview: async () => true,
    loadDocument: async () => ({ revision: 1, source: "database", document: teacherResource.baseline() }),
  });
  const response = await handler(event("GET", "/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/ui-controller"));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(resolutions, ["ui-controller:"]);
});

test("public preview resource lookup fails unknown and non-preview resources closed before database access", async () => {
  let databaseCalls = 0;
  const getDatabase = () => { databaseCalls += 1; return async () => []; };
  const handler = createBuilderPreviewHandler({ getDatabase });
  const unknownRoutes = [
    "/builder/preview/content/books/unknown/components/ultimate-b2-students-book/hotspots",
    "/builder/preview/content/books/ultimate-b2/components/unknown/hotspots",
    "/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/unknown",
  ];
  for (const unknownRoute of unknownRoutes) {
    const response = await handler(event("GET", unknownRoute));
    assert.equal(response.statusCode, 404);
    assert.deepEqual(parsed(response), { error: "builder_preview_resource_not_found" });
  }

  const authenticatedOnly = createBuilderPreviewHandler({
    getDatabase,
    resolveResource: async () => ({ ...resource, previewReadable: false }),
  });
  assert.equal((await authenticatedOnly(event())).statusCode, 404);
  assert.equal(databaseCalls, 0);
});

test("public preview is GET-only and never authorizes through Builder cookies", async () => {
  let databaseCalls = 0;
  const handler = createBuilderPreviewHandler({
    getDatabase: () => { databaseCalls += 1; return async () => []; },
  });
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const response = await handler(event(method, route, { cookie: "hh_builder_session=private" }));
    assert.equal(response.statusCode, 405);
    assert.deepEqual(parsed(response), { error: "method_not_allowed" });
  }
  assert.equal(databaseCalls, 0);

  const withoutSession = await handler(event());
  const withSession = await handler(event("GET", route, { cookie: "hh_builder_session=private" }));
  assert.deepEqual(withSession, withoutSession);
});

test("corrupt checksum and invalid stored schema return only a generic failure", async () => {
  const document = resource.baseline();
  const diagnostics = [];
  for (const storedRow of [
    row(document, { payload_sha256: "0".repeat(64) }),
    row(document, { schema_version: "9.9" }),
  ]) {
    const handler = createBuilderPreviewHandler({
      getDatabase: () => async () => [storedRow],
      logger: { error: (...arguments_) => diagnostics.push(arguments_) },
    });
    const response = await handler(event());
    assert.equal(response.statusCode, 500);
    assert.deepEqual(parsed(response), { error: "builder_preview_failed" });
    assert.doesNotMatch(response.body, /checksum|schema|payload|database|sql/i);
  }
  assert.equal(diagnostics.length, 2);
  for (const [, diagnostic] of diagnostics) {
    assert.deepEqual(Object.keys(diagnostic), ["stage", "errorName", "errorCode"]);
    assert.doesNotMatch(JSON.stringify(diagnostic), /checksum|schema|payload|DATABASE_URL|postgres|cookie/i);
  }
});

test("private keys are rejected before projection and can never be serialized", async () => {
  const privateDocument = resource.baseline();
  privateDocument.teacherSolution = "must-not-escape";
  const handler = createBuilderPreviewHandler({
    getDatabase: () => ({}),
    loadDocument: async () => ({ revision: 7, source: "database", document: privateDocument }),
    logger: { error() {} },
  });
  const response = await handler(event());
  assert.equal(response.statusCode, 500);
  assert.deepEqual(parsed(response), { error: "builder_preview_failed" });
  assert.doesNotMatch(response.body, /teacherSolution|must-not-escape/i);
});

test("Teacher UI draft preview requires explicit Builder/scoped authorization", async () => {
  const teacherResource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "ui-controller");
  const teacherRoute = "/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/ui-controller";
  const document = teacherResource.baseline();
  const handler = createBuilderPreviewHandler({
    getDatabase: () => ({}),
    authorizePreview: async (request) => request.headers["x-preview-authorized"] === "yes",
    loadDocument: async () => ({ revision: 1, source: "database", document }),
  });
  assert.equal((await handler(event("GET", teacherRoute))).statusCode, 401);
  const authorized = await handler(event("GET", teacherRoute, { "x-preview-authorized": "yes" }));
  assert.equal(authorized.statusCode, 200);
  assert.deepEqual(parsed(authorized).document, teacherResource.projectPreview(document));
});

test("actual Teacher UI preview authorization accepts fresh exact scope and rejects expired or wrong scope", async () => {
  const environment = { BUILDER_PREVIEW_AUTH_SECRET: "test-only-preview-secret-with-at-least-thirty-two-bytes" };
  const now = Date.parse("2026-08-15T16:00:00Z");
  const intent = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", view: "library", pageId: null, activityId: null, releaseId: null };
  const issued = issueBuilderPreviewAuthorization(intent, { environment, now, nonce: "abcdefghijklmnopQRSTUV" });
  const teacherResource = await resolveBuilderContentResource(intent.bookSlug, intent.componentSlug, "ui-controller");
  const teacherRoute = "/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/ui-controller";
  const request = (token) => ({ httpMethod: "GET", path: teacherRoute, headers: {}, queryStringParameters: { previewAuthorization: token } });
  const handlerAt = (requestNow) => createBuilderPreviewHandler({
    getDatabase: () => async () => [],
    authorizePreview: (previewEvent, sql, scope) => authorizeBuilderPreviewRequest(previewEvent, sql, scope, { environment, now: requestNow }),
    loadDocument: async () => ({ revision: 1, source: "database", document: teacherResource.baseline() }),
  });
  assert.equal((await handlerAt(now + 1_000)(request(issued.token))).statusCode, 200);
  assert.equal((await handlerAt(now + 301_000)(request(issued.token))).statusCode, 401);
  assert.equal((await handlerAt(now + 1_000)(request("malformed"))).statusCode, 401);
  const wrongScope = issueBuilderPreviewAuthorization({ ...intent, componentSlug: "ultimate-b2-workbook" }, { environment, now, nonce: "abcdefghijklmnopQRSTUV" });
  assert.equal((await handlerAt(now + 1_000)(request(wrongScope.token))).statusCode, 401);
});
