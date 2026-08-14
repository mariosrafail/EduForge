import assert from "node:assert/strict";
import test from "node:test";

import { createBuilderPreviewHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview.js";
import { resolveBuilderContentResource } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-registry.js";
import { builderDocumentSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-content-security.js";

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
  assert.equal(databaseReads, 1);
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
  const handler = createBuilderPreviewHandler({ getDatabase: () => async () => [row(document)] });
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
