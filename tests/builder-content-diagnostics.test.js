import assert from "node:assert/strict";
import test from "node:test";

import {
  createBuilderContentHandler,
  safeBuilderContentDiagnostic,
} from "../netlify-sites/ultimate-b2-builder/server/_builder-content.js";

const route = "/builder/api/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots";
const secretMessage = "postgresql://user:secret@host/db hh_builder_session=SECRET correctAnswers=SECRET";
const safeResource = {
  readable: true,
  writeAllowed: true,
  bookSlug: "ultimate-b2",
  componentSlug: "ultimate-b2-students-book",
  resource: "hotspots",
  schemaVersion: "1.0",
  baseline: () => ({ schemaVersion: "1.0", packageSlug: "ultimate-b2", componentSlug: "students-book", pages: {} }),
};

function request() {
  return {
    httpMethod: "GET",
    path: route,
    headers: { cookie: "hh_builder_session=REQUEST_SECRET", host: "builder.example" },
    body: secretMessage,
  };
}

function diagnosticHarness(overrides = {}) {
  const calls = [];
  const handler = createBuilderContentHandler({
    getDatabase: () => ({}),
    authorize: async () => ({ builderUser: { id: "not-logged" } }),
    resolveResource: async () => safeResource,
    loadDocument: async () => null,
    logger: { error: (...args) => calls.push(args) },
    ...overrides,
  });
  return { calls, handler };
}

async function expectSafeFailure(overrides, expectedStage) {
  const { calls, handler } = diagnosticHarness(overrides);
  const response = await handler(request());
  assert.equal(response.statusCode, 500);
  assert.equal(response.body, '{"error":"builder_content_failed"}');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "Builder content request failed");
  assert.equal(calls[0][1].stage, expectedStage);
  assert.deepEqual(Object.keys(calls[0][1]), ["stage", "errorName", "errorCode", "category"]);
  const logged = JSON.stringify(calls);
  assert.doesNotMatch(logged, /postgresql:\/\/|user:secret|REQUEST_SECRET|correctAnswers|SECRET|builder\.example/i);
  assert.doesNotMatch(logged, /stack|message|headers|cookie|body/i);
  return calls[0][1];
}

test("Builder content diagnostics identify resolve, load, and repository baseline failures", async () => {
  const syntheticError = Object.assign(new Error(secretMessage), { code: "42P01" });
  assert.deepEqual(await expectSafeFailure({ resolveResource: async () => { throw syntheticError; } }, "resolve_resource"), {
    stage: "resolve_resource",
    errorName: "Error",
    errorCode: "42P01",
    category: "database_relation_missing",
  });
  assert.equal((await expectSafeFailure({ loadDocument: async () => { throw syntheticError; } }, "load_document")).category, "database_relation_missing");
  assert.equal((await expectSafeFailure({ resolveResource: async () => ({ ...safeResource, baseline: () => { throw syntheticError; } }) }, "repository_baseline")).category, "database_relation_missing");
});

test("Builder content diagnostic classification keeps only bounded machine metadata", () => {
  assert.deepEqual(safeBuilderContentDiagnostic("resolve_resource", Object.assign(new Error(secretMessage), { code: "ERR_MODULE_NOT_FOUND" })), {
    stage: "resolve_resource", errorName: "Error", errorCode: "ERR_MODULE_NOT_FOUND", category: "module_not_found",
  });
  assert.equal(safeBuilderContentDiagnostic("load_document", { name: "DatabaseError", code: "42P01", message: secretMessage }).category, "database_relation_missing");
  assert.deepEqual(safeBuilderContentDiagnostic("response", { name: secretMessage, code: secretMessage, message: secretMessage, stack: secretMessage }), {
    stage: "response", errorName: "UnknownError", errorCode: "unknown", category: "unexpected",
  });
});

test("Builder content diagnostic categories cover safe module, database, and connectivity codes", () => {
  const categories = {
    ERR_REQUIRE_ESM: "module_loading",
    "42703": "database_column_missing",
    "28P01": "database_authentication",
    "28000": "database_authentication",
    "3D000": "database_missing",
    ENOTFOUND: "database_or_network_connectivity",
    EAI_AGAIN: "database_or_network_connectivity",
    ECONNREFUSED: "database_or_network_connectivity",
    ETIMEDOUT: "database_or_network_connectivity",
  };
  for (const [code, category] of Object.entries(categories)) {
    assert.equal(safeBuilderContentDiagnostic("database", { name: "Error", code, message: secretMessage }).category, category);
  }
});
