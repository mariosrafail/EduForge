import assert from "node:assert/strict";
import test from "node:test";

import { classifyBuilderPreviewAuthorization, inspectBuilderPreviewAuthorizationScope, issueBuilderPreviewAuthorization, verifyBuilderPreviewAuthorization } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization.js";
import { createBuilderPreviewAuthorizationHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization-handler.js";
import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";

const environment = { BUILDER_PREVIEW_AUTH_SECRET: "test-only-preview-secret-with-at-least-thirty-two-bytes" };
const now = Date.parse("2026-08-14T12:00:00Z");
const intent = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", view: "activity", pageId: null, activityId: "ultimate-b2-sb-u1-p1-o1", releaseId: null };
const eventFor = (token) => ({ queryStringParameters: { previewAuthorization: token } });

test("short-lived preview authorization is signed and restricted to exact action and resource", () => {
  const issued = issueBuilderPreviewAuthorization(intent, { environment, now, nonce: "abcdefghijklmnopQRSTUV" });
  const scope = { action: "open-response-teacher", bookSlug: intent.bookSlug, componentSlug: intent.componentSlug, activityId: intent.activityId };
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), scope, { environment, now: now + 1_000 }), true);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, activityId: "ultimate-b2-sb-u1-p1-o2" }, { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, action: "release-teacher-solution" }, { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), scope, { environment, now: now + 301_000 }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(`${issued.token.slice(0, -1)}x`), scope, { environment, now }), false);
});

test("authorization denial classification is bounded and never returns token material", () => {
  const issued = issueBuilderPreviewAuthorization(intent, { environment, now, nonce: "abcdefghijklmnopQRSTUV" });
  const scope = { action: "open-response-teacher", bookSlug: intent.bookSlug, componentSlug: intent.componentSlug, activityId: intent.activityId };
  assert.deepEqual(classifyBuilderPreviewAuthorization(eventFor(issued.token), scope, { environment, now }), { authorized: true, code: "authorized" });
  assert.deepEqual(classifyBuilderPreviewAuthorization({}, scope, { environment, now }), { authorized: false, code: "token_missing" });
  assert.deepEqual(classifyBuilderPreviewAuthorization(eventFor("malformed"), scope, { environment, now }), { authorized: false, code: "token_malformed" });
  assert.deepEqual(classifyBuilderPreviewAuthorization(eventFor(issued.token), scope, { environment, now: now + 301_000 }), { authorized: false, code: "token_expired" });
  assert.deepEqual(classifyBuilderPreviewAuthorization(eventFor(`${issued.token.slice(0, -1)}x`), scope, { environment, now }), { authorized: false, code: "signature_invalid" });
  assert.deepEqual(classifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, action: "release-teacher-solution" }, { environment, now }), { authorized: false, code: "action_denied" });
  assert.deepEqual(classifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, componentSlug: "ultimate-b2-workbook" }, { environment, now }), { authorized: false, code: "scope_mismatch" });
  assert.deepEqual(classifyBuilderPreviewAuthorization({ multiValueQueryStringParameters: { previewAuthorization: [issued.token, issued.token] } }, scope, { environment, now }), { authorized: false, code: "token_malformed" });
  assert.doesNotMatch(JSON.stringify(classifyBuilderPreviewAuthorization(eventFor(issued.token), scope, { environment, now })), /v[12]\.|abcdefghijklmnopQRSTUV/);
});

test("release authorization cannot cross release, activity, component, or action scope", () => {
  const releaseId = "10000000-0000-4000-8000-000000000099";
  const issued = issueBuilderPreviewAuthorization({ ...intent, releaseId }, { environment, now, nonce: "abcdefghijklmnopQRSTUV" });
  const scope = { action: "release-teacher-solution", bookSlug: intent.bookSlug, componentSlug: intent.componentSlug, releaseId, activityId: intent.activityId };
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), scope, { environment, now }), true);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, releaseId: "10000000-0000-4000-8000-000000000098" }, { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, componentSlug: "ultimate-b2-workbook" }, { environment, now }), false);
  for (const action of ["release-public", "release-asset", "release-teacher-ui", "release-native-teacher"]) {
    assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, action }, { environment, now }), true);
  }
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, action: "release-native-teacher", activityId: "ultimate-b2-sb-u1-p1-o2" }, { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor("malformed"), scope, { environment, now }), false);
});

test("release library tokens may address only membership-checked resources in their exact release", () => {
  const releaseId = "10000000-0000-4000-8000-000000000099";
  const issued = issueBuilderPreviewAuthorization({ ...intent, view: "library", activityId: null, releaseId }, { environment, now, nonce: "abcdefghijklmnopQRSTUV" });
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { action: "release-native-teacher", bookSlug: intent.bookSlug, componentSlug: intent.componentSlug, releaseId, activityId: "ultimate-b2-sb-u1-p1-o99" }, { environment, now }), true);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { action: "release-native-teacher", bookSlug: intent.bookSlug, componentSlug: intent.componentSlug, releaseId: "10000000-0000-4000-8000-000000000098", activityId: "ultimate-b2-sb-u1-p1-o99" }, { environment, now }), false);
});

test("authorization issuance requires Builder auth, same origin, and exact intent", async () => {
  const handler = createBuilderPreviewAuthorizationHandler({ getDatabase: () => ({}), authorize: async (event) => event.headers.cookie ? { builderUser: { id: "actor" } } : { error: json(401, { error: "Unauthorized" }) }, issue: (value) => issueBuilderPreviewAuthorization(value, { environment, now, nonce: "abcdefghijklmnopQRSTUV" }), logger: { error() {} } });
  const request = (overrides = {}) => ({ httpMethod: "POST", path: "/builder/api/preview-authorization", headers: { host: "builder.example", origin: "https://builder.example", cookie: "hh_builder_session=live", "content-type": "application/json", ...overrides.headers }, body: JSON.stringify(overrides.body || { intent }) });
  assert.equal((await handler(request({ headers: { cookie: "" } }))).statusCode, 401);
  assert.equal((await handler(request({ headers: { origin: "https://attacker.example" } }))).statusCode, 403);
  assert.equal((await handler(request({ body: { intent, extra: true } }))).statusCode, 400);
  const response = await handler(request());
  assert.equal(response.statusCode, 200);
  assert.match(JSON.parse(response.body).token, /^v2\./);
  assert.doesNotMatch(response.body, /secret|cookie|session/i);
});

test("authorization issuance fails closed as a server error when signing configuration is unavailable", async () => {
  const handler = createBuilderPreviewAuthorizationHandler({
    getDatabase: () => ({}),
    authorize: async () => ({ builderUser: { id: "actor" } }),
    issue: (value) => issueBuilderPreviewAuthorization(value, { environment: {}, now }),
    logger: { error() {} },
  });
  const response = await handler({ httpMethod: "POST", path: "/builder/api/preview-authorization", headers: { host: "builder.example", origin: "https://builder.example", "content-type": "application/json" }, body: JSON.stringify({ intent }) });
  assert.equal(response.statusCode, 500);
  assert.deepEqual(JSON.parse(response.body), { error: "preview_authorization_failed" });
});

test("component switching exchanges one scoped token without permitting direct cross-component reads", async () => {
  const sourceIntent = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", view: "library", pageId: null, activityId: null, releaseId: null };
  const targetIntent = { ...sourceIntent, componentSlug: "ultimate-b2-workbook" };
  const source = issueBuilderPreviewAuthorization(sourceIntent, { environment, now, nonce: "source-component-nonce" });
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(source.token), { action: "managed-page-catalog", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" }, { environment, now }), false);
  const handler = createBuilderPreviewAuthorizationHandler({
    getDatabase: () => { throw new Error("exchange must not open the database"); },
    authorize: async () => { throw new Error("exchange must not require a cross-origin Builder cookie"); },
    inspect: (event, scope) => inspectBuilderPreviewAuthorizationScope(event, scope, { environment, now }),
    issue: (value) => issueBuilderPreviewAuthorization(value, { environment, now, nonce: "target-component-nonce" }),
    logger: { error() {} },
  });
  const request = (token = source.token, body = { source: { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book" }, intent: targetIntent }) => ({
    httpMethod: "POST",
    path: "/preview/authorization/exchange",
    headers: { "content-type": "application/json", origin: "https://viewer.example" },
    queryStringParameters: { previewAuthorization: token },
    body: JSON.stringify(body),
  });
  const response = await handler(request());
  assert.equal(response.statusCode, 200);
  const exchanged = JSON.parse(response.body).token;
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(exchanged), { action: "managed-page-catalog", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" }, { environment, now }), true);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(exchanged), { action: "managed-page-catalog", bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-grammar-book" }, { environment, now }), false);
  assert.equal((await handler(request("malformed"))).statusCode, 401);
  assert.equal((await handler(request(source.token, { source: { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook" }, intent: targetIntent }))).statusCode, 401);
});

test("managed library tokens are component-wide only for already-allowlisted managed capabilities", () => {
  const managedIntent = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-workbook", view: "library", pageId: null, activityId: null, releaseId: null };
  const library = issueBuilderPreviewAuthorization(managedIntent, { environment, now, nonce: "managed-library-nonce" });
  const pageOne = issueBuilderPreviewAuthorization({ ...managedIntent, view: "page", pageId: "ultimate-b2-wb-unit-1-page-1" }, { environment, now, nonce: "managed-page-one-nonce" });
  const assetScope = (pageId, componentSlug = managedIntent.componentSlug, bookSlug = managedIntent.bookSlug) => ({ action: "managed-page-asset", bookSlug, componentSlug, pageId });
  for (const pageId of ["ultimate-b2-wb-unit-1-page-1", "ultimate-b2-wb-unit-2-page-1"]) {
    assert.equal(verifyBuilderPreviewAuthorization(eventFor(library.token), assetScope(pageId), { environment, now }), true);
  }
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(pageOne.token), assetScope("ultimate-b2-wb-unit-1-page-1"), { environment, now }), true);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(pageOne.token), assetScope("ultimate-b2-wb-unit-1-page-2"), { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(library.token), assetScope("ultimate-b2-gb-unit-1-page-1", "ultimate-b2-grammar-book"), { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(library.token), assetScope("ultimate-b2-wb-unit-1-page-1", managedIntent.componentSlug, "another-book"), { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(library.token), { action: "open-response-teacher", bookSlug: managedIntent.bookSlug, componentSlug: managedIntent.componentSlug, activityId: "ultimate-b2-wb-unit-1-page-1-o1" }, { environment, now }), false);
});
