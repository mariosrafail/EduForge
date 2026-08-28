import assert from "node:assert/strict";
import test from "node:test";

import { classifyBuilderPreviewAuthorization, inspectBuilderPreviewAuthorizationScope, issueBuilderPreviewAuthorization, issueBuilderReleaseMemberAuthorization, verifyBuilderPreviewAuthorization } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization.js";
import { createBuilderPreviewAuthorizationHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization-handler.js";
import { productReleaseMemberSha256, productReleaseSha256, productReleaseSourceSha256 } from "../netlify-sites/ultimate-b2-builder/server/_builder-product-publication-domain.js";
import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";

const environment = { BUILDER_PREVIEW_AUTH_SECRET: "test-only-preview-secret-with-at-least-thirty-two-bytes" };
const now = Date.parse("2026-08-14T12:00:00Z");
const intent = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", view: "activity", pageId: null, activityId: "ultimate-b2-sb-u1-p1-o1", releaseId: null };
const eventFor = (token) => ({ queryStringParameters: { previewAuthorization: token } });

const releaseMembers = ["ultimate-b2-students-book", "ultimate-b2-workbook", "ultimate-b2-grammar-book"].map((componentSlug, index) => {
  const member = {
    componentSlug, order: index + 1, status: "included",
    componentReleaseId: `10000000-0000-4000-8000-00000000009${9 - index}`,
    compilerId: index ? `ultimate-b2-${index === 1 ? "workbook" : "grammar-book"}-v1` : "ultimate-b2-students-book-v2",
    releaseSchemaVersion: index ? "1.0" : "2.0", releaseSha256: String(index + 1).repeat(64), compatibility: String(index + 4).repeat(64), unavailableReason: null,
  };
  return Object.freeze({ ...member, memberSha256: productReleaseMemberSha256(member) });
});

function familyFixture({ productReleaseId = "20000000-0000-4000-8000-000000000099", members = releaseMembers, compilerId = "ultimate-b2-product-v1" } = {}) {
  const base = { id: productReleaseId, number: 7, bookSlug: "ultimate-b2", compilerId, releaseSchemaVersion: "1.0", releaseNote: "", createdAt: "2026-08-14T11:00:00.000Z" };
  const sourceSnapshotSha256 = productReleaseSourceSha256({ bookSlug: base.bookSlug, releaseNumber: base.number, members });
  return Object.freeze({ ...base, sourceSnapshotSha256, releaseSha256: productReleaseSha256({ ...base, releaseNumber: base.number, sourceSnapshotSha256, members }), members });
}

function componentReleaseFor(member) {
  return { id: member.componentReleaseId, compiler_id: member.compilerId, release_schema_version: member.releaseSchemaVersion, release_sha256: member.releaseSha256, runtime_compatibility_sha256: member.compatibility };
}

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

test("v3 release-member authorization binds product, member, component release, resource, action, and expiry", () => {
  const productReleaseId = "20000000-0000-4000-8000-000000000099";
  const componentReleaseId = "10000000-0000-4000-8000-000000000099";
  const memberSha256 = "a".repeat(64);
  const releaseIntent = { ...intent, releaseId: null, productReleaseId };
  const issued = issueBuilderReleaseMemberAuthorization({ intent: releaseIntent, productReleaseId, componentReleaseId, memberSha256 }, { environment, now, nonce: "release-member-nonce" });
  const exactScope = { action: "release-teacher-solution", bookSlug: intent.bookSlug, componentSlug: intent.componentSlug, productReleaseId, releaseId: componentReleaseId, memberSha256, activityId: intent.activityId };
  assert.match(issued.token, /^v3\./);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), exactScope, { environment, now }), true);
  for (const scope of [
    { ...exactScope, productReleaseId: "20000000-0000-4000-8000-000000000098" },
    { ...exactScope, releaseId: "10000000-0000-4000-8000-000000000098" },
    { ...exactScope, memberSha256: "b".repeat(64) },
    { ...exactScope, componentSlug: "ultimate-b2-workbook" },
    { ...exactScope, activityId: "ultimate-b2-sb-u1-p1-o2" },
  ]) assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), scope, { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { ...exactScope, action: "managed-page-catalog" }, { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), exactScope, { environment, now: now + 301_000 }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(`${issued.token.slice(0, -1)}x`), exactScope, { environment, now }), false);
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

test("release-family switching re-verifies the exact source and derives only an included target member server-side", async () => {
  const family = familyFixture();
  const bySlug = new Map(family.members.map((member) => [member.componentSlug, member]));
  let databaseCalls = 0;
  const handler = createBuilderPreviewAuthorizationHandler({
    getDatabase: () => { databaseCalls += 1; return {}; },
    authorize: async () => ({ builderUser: { id: "actor" } }),
    inspect: (event, scope) => inspectBuilderPreviewAuthorizationScope(event, scope, { environment, now }),
    issueReleaseMember: (value) => issueBuilderReleaseMemberAuthorization(value, { environment, now, nonce: "derived-member-nonce" }),
    loadProductRelease: async (_sql, input) => input.productReleaseId === family.id ? family : null,
    loadComponentRelease: async (_sql, input) => componentReleaseFor(bySlug.get(input.componentSlug)),
    verifyComponentRelease: () => true,
    logger: { error() {} },
  });
  const students = bySlug.get("ultimate-b2-students-book");
  const workbook = bySlug.get("ultimate-b2-workbook");
  const initialIntent = { bookSlug: family.bookSlug, componentSlug: students.componentSlug, view: "library", pageId: null, activityId: null, releaseId: null, productReleaseId: family.id };
  const initialResponse = await handler({ httpMethod: "POST", path: "/builder/api/preview-authorization", headers: { host: "builder.example", origin: "https://builder.example", "content-type": "application/json" }, body: JSON.stringify({ intent: initialIntent }) });
  assert.equal(initialResponse.statusCode, 200);
  const initial = JSON.parse(initialResponse.body);
  assert.deepEqual({ productReleaseId: initial.productReleaseId, componentReleaseId: initial.componentReleaseId, memberSha256: initial.memberSha256 }, { productReleaseId: family.id, componentReleaseId: students.componentReleaseId, memberSha256: students.memberSha256 });

  const source = { bookSlug: family.bookSlug, componentSlug: students.componentSlug, productReleaseId: family.id, componentReleaseId: students.componentReleaseId, memberSha256: students.memberSha256 };
  const targetIntent = { ...initialIntent, componentSlug: workbook.componentSlug };
  const exchangeRequest = (sourceOverride = source, intentOverride = targetIntent) => ({ httpMethod: "POST", path: "/preview/authorization/release-member-exchange", headers: { "content-type": "application/json" }, queryStringParameters: { previewAuthorization: initial.token }, body: JSON.stringify({ source: sourceOverride, intent: intentOverride }) });
  const exchangedResponse = await handler(exchangeRequest());
  assert.equal(exchangedResponse.statusCode, 200);
  const exchanged = JSON.parse(exchangedResponse.body);
  assert.deepEqual({ productReleaseId: exchanged.productReleaseId, componentReleaseId: exchanged.componentReleaseId, memberSha256: exchanged.memberSha256 }, { productReleaseId: family.id, componentReleaseId: workbook.componentReleaseId, memberSha256: workbook.memberSha256 });
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(exchanged.token), { action: "release-public", bookSlug: family.bookSlug, componentSlug: workbook.componentSlug, productReleaseId: family.id, releaseId: workbook.componentReleaseId, memberSha256: workbook.memberSha256 }, { environment, now }), true);
  assert.equal((await handler(exchangeRequest({ ...source, memberSha256: "f".repeat(64) }))).statusCode, 401);
  assert.equal((await handler(exchangeRequest(source, { ...targetIntent, productReleaseId: "20000000-0000-4000-8000-000000000098" }))).statusCode, 401);
  assert.ok(databaseCalls >= 2, "initial issuance and exchange must resolve immutable family membership from storage");
});

test("historical unavailable release members are explicit and cannot be exchanged", async () => {
  const students = releaseMembers[0];
  const unavailable = [releaseMembers[1], releaseMembers[2]].map((member) => {
    const value = { componentSlug: member.componentSlug, order: member.order, status: "unavailable", componentReleaseId: null, compilerId: null, releaseSchemaVersion: null, releaseSha256: null, compatibility: null, unavailableReason: "not_in_legacy_release" };
    return { ...value, memberSha256: productReleaseMemberSha256(value) };
  });
  const family = familyFixture({ members: [students, ...unavailable], compilerId: "ultimate-b2-product-legacy-v1" });
  const initialIntent = { bookSlug: family.bookSlug, componentSlug: students.componentSlug, view: "library", pageId: null, activityId: null, releaseId: null, productReleaseId: family.id };
  const issued = issueBuilderReleaseMemberAuthorization({ intent: initialIntent, productReleaseId: family.id, componentReleaseId: students.componentReleaseId, memberSha256: students.memberSha256 }, { environment, now, nonce: "legacy-member-nonce" });
  const handler = createBuilderPreviewAuthorizationHandler({
    getDatabase: () => ({}), inspect: (event, scope) => inspectBuilderPreviewAuthorizationScope(event, scope, { environment, now }),
    issueReleaseMember: (value) => issueBuilderReleaseMemberAuthorization(value, { environment, now, nonce: "unavailable-target" }),
    loadProductRelease: async () => family, loadComponentRelease: async () => componentReleaseFor(students), verifyComponentRelease: () => true, logger: { error() {} },
  });
  const source = { bookSlug: family.bookSlug, componentSlug: students.componentSlug, productReleaseId: family.id, componentReleaseId: students.componentReleaseId, memberSha256: students.memberSha256 };
  const target = { ...initialIntent, componentSlug: "ultimate-b2-workbook" };
  const response = await handler({ httpMethod: "POST", path: "/preview/authorization/release-member-exchange", headers: { "content-type": "application/json" }, queryStringParameters: { previewAuthorization: issued.token }, body: JSON.stringify({ source, intent: target }) });
  assert.equal(response.statusCode, 409);
  assert.deepEqual(JSON.parse(response.body), { error: "release_member_unavailable", componentSlug: "ultimate-b2-workbook", productReleaseId: family.id, releaseNumber: family.number });
});
