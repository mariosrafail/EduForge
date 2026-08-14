import assert from "node:assert/strict";
import test from "node:test";

import { issueBuilderPreviewAuthorization, verifyBuilderPreviewAuthorization } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization.js";
import { createBuilderPreviewAuthorizationHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-preview-authorization-handler.js";
import { json } from "../netlify-sites/ultimate-b2-builder/server/_builder-auth.js";

const environment = { BUILDER_PREVIEW_AUTH_SECRET: "test-only-preview-secret-with-at-least-thirty-two-bytes" };
const now = Date.parse("2026-08-14T12:00:00Z");
const intent = { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", view: "activity", activityId: "ultimate-b2-sb-u1-p1-o1", releaseId: null };
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

test("release authorization cannot cross release, activity, component, or action scope", () => {
  const releaseId = "10000000-0000-4000-8000-000000000099";
  const issued = issueBuilderPreviewAuthorization({ ...intent, releaseId }, { environment, now, nonce: "abcdefghijklmnopQRSTUV" });
  const scope = { action: "release-teacher-solution", bookSlug: intent.bookSlug, componentSlug: intent.componentSlug, releaseId, activityId: intent.activityId };
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), scope, { environment, now }), true);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, releaseId: "10000000-0000-4000-8000-000000000098" }, { environment, now }), false);
  assert.equal(verifyBuilderPreviewAuthorization(eventFor(issued.token), { ...scope, componentSlug: "ultimate-b2-workbook" }, { environment, now }), false);
});

test("authorization issuance requires Builder auth, same origin, and exact intent", async () => {
  const handler = createBuilderPreviewAuthorizationHandler({ getDatabase: () => ({}), authorize: async (event) => event.headers.cookie ? { builderUser: { id: "actor" } } : { error: json(401, { error: "Unauthorized" }) }, issue: (value) => issueBuilderPreviewAuthorization(value, { environment, now, nonce: "abcdefghijklmnopQRSTUV" }), logger: { error() {} } });
  const request = (overrides = {}) => ({ httpMethod: "POST", path: "/builder/api/preview-authorization", headers: { host: "builder.example", origin: "https://builder.example", cookie: "hh_builder_session=live", "content-type": "application/json", ...overrides.headers }, body: JSON.stringify(overrides.body || { intent }) });
  assert.equal((await handler(request({ headers: { cookie: "" } }))).statusCode, 401);
  assert.equal((await handler(request({ headers: { origin: "https://attacker.example" } }))).statusCode, 403);
  assert.equal((await handler(request({ body: { intent, extra: true } }))).statusCode, 400);
  const response = await handler(request());
  assert.equal(response.statusCode, 200);
  assert.match(JSON.parse(response.body).token, /^v1\./);
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
