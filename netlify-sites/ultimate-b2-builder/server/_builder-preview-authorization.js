import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { currentBuilderUserFromEvent } from "./_builder-auth.js";
import { resolveBuilderServerComponent } from "./_builder-component-registry.js";

export const builderPreviewAuthorizationTtlSeconds = 5 * 60;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^v([123])\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/;
const ACTIONS = new Set(["teacher-ui-draft", "unit-extras-draft", "unit-extra-draft-asset", "open-response-teacher", "native-draft-public", "native-draft-teacher", "native-draft-asset", "managed-page-catalog", "managed-page-asset", "managed-hotspots", "component-switch", "release-family", "release-member-switch", "release-public", "release-asset", "release-teacher-ui", "release-teacher-solution", "release-native-teacher"]);
export const builderPreviewAuthorizationDiagnosticCodes = Object.freeze([
  "authorized",
  "builder_session",
  "token_missing",
  "token_malformed",
  "token_expired",
  "signature_invalid",
  "action_denied",
  "scope_mismatch",
  "authorization_denied",
]);

function secret(environment = process.env) {
  const value = String(environment.BUILDER_PREVIEW_AUTH_SECRET || "");
  if (Buffer.byteLength(value, "utf8") < 32) throw new Error("BUILDER_PREVIEW_AUTH_SECRET must contain at least 32 bytes");
  return value;
}

function exact(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function normalizeIntent(input) {
  const legacyShape = exact(input, ["bookSlug", "componentSlug", "view", "pageId", "activityId", "releaseId"]);
  if (!legacyShape && !exact(input, ["bookSlug", "componentSlug", "view", "pageId", "activityId", "releaseId", "productReleaseId"])) throw new Error("Invalid Builder preview authorization intent");
  if (!SAFE_ID.test(input.bookSlug) || !SAFE_ID.test(input.componentSlug) || !["library", "page", "activity"].includes(input.view)) throw new Error("Invalid Builder preview authorization intent");
  const pageId = input.pageId === null ? null : String(input.pageId || "");
  const activityId = input.activityId === null ? null : String(input.activityId || "");
  const releaseId = input.releaseId === null ? null : String(input.releaseId || "").toLowerCase();
  const productReleaseId = legacyShape || input.productReleaseId === null ? null : String(input.productReleaseId || "").toLowerCase();
  if ((input.view === "page") !== Boolean(pageId) || (input.view === "activity") !== Boolean(activityId)
    || (pageId && !SAFE_ID.test(pageId)) || (activityId && !SAFE_ID.test(activityId)) || (releaseId && !UUID.test(releaseId))
    || (productReleaseId && !UUID.test(productReleaseId)) || (releaseId && productReleaseId)) throw new Error("Invalid Builder preview authorization intent");
  return { bookSlug: input.bookSlug, componentSlug: input.componentSlug, view: input.view, pageId, activityId, releaseId, productReleaseId };
}

function actionsFor(intent) {
  const registration = resolveBuilderServerComponent(intent.bookSlug, intent.componentSlug);
  if (!registration) throw new Error("Unsupported Builder preview component.");
  if ((intent.releaseId || intent.productReleaseId) && !registration.publication.enabled) throw new Error("Builder publication preview is unavailable for this component.");
  const actions = intent.releaseId
    ? ["release-public", "release-asset", "release-teacher-ui", "release-teacher-solution", "release-native-teacher"]
    : [];
  if (!intent.releaseId && registration.packageUi.owner) actions.push("teacher-ui-draft");
  if (!intent.releaseId) actions.push("native-draft-public", "native-draft-teacher", "native-draft-asset");
  if (!intent.releaseId && registration.content.unitExtras) actions.push("unit-extras-draft", "unit-extra-draft-asset");
  if (!intent.releaseId && intent.view === "activity" && registration.content.legacyOpenResponseImport) actions.push("open-response-teacher");
  if (!intent.releaseId && registration.pageCatalog) actions.push("managed-page-catalog", "managed-page-asset");
  if (!intent.releaseId && registration.content.hotspots === "managed") actions.push("managed-hotspots");
  if (!intent.releaseId) actions.push("component-switch");
  return actions;
}

function signature(payload, key) { return createHmac("sha256", key).update(payload).digest("base64url"); }

export function issueBuilderPreviewAuthorization(input, { environment = process.env, now = Date.now(), nonce = randomBytes(16).toString("base64url") } = {}) {
  const intent = normalizeIntent(input);
  if (intent.productReleaseId) throw new Error("Product release authorization requires a verified member.");
  const { productReleaseId: _productReleaseId, ...legacyIntent } = intent;
  const payload = Buffer.from(JSON.stringify({ version: 2, expiresAt: Math.floor(now / 1000) + builderPreviewAuthorizationTtlSeconds, nonce, actions: actionsFor(legacyIntent), ...legacyIntent }), "utf8").toString("base64url");
  return { token: `v2.${payload}.${signature(payload, secret(environment))}`, expiresAt: new Date((Math.floor(now / 1000) + builderPreviewAuthorizationTtlSeconds) * 1000).toISOString() };
}

export function issueBuilderReleaseMemberAuthorization(input, { environment = process.env, now = Date.now(), nonce = randomBytes(16).toString("base64url") } = {}) {
  const intent = normalizeIntent(input.intent);
  const productReleaseId = String(input.productReleaseId || "").toLowerCase();
  const componentReleaseId = String(input.componentReleaseId || "").toLowerCase();
  const memberSha256 = String(input.memberSha256 || "");
  const registration = resolveBuilderServerComponent(intent.bookSlug, intent.componentSlug);
  if (!registration?.publication.enabled || intent.releaseId || intent.productReleaseId !== productReleaseId || !UUID.test(productReleaseId) || !UUID.test(componentReleaseId) || !/^[a-f0-9]{64}$/.test(memberSha256)) throw new Error("Invalid verified release member authorization.");
  const expiresAt = Math.floor(now / 1000) + builderPreviewAuthorizationTtlSeconds;
  const actions = ["release-public", "release-asset", "release-teacher-ui", "release-teacher-solution", "release-native-teacher", "release-family", "release-member-switch"];
  const payload = Buffer.from(JSON.stringify({ version: 3, expiresAt, nonce, actions, bookSlug: intent.bookSlug, productReleaseId, componentSlug: intent.componentSlug, componentReleaseId, memberSha256, view: intent.view, pageId: intent.pageId, activityId: intent.activityId }), "utf8").toString("base64url");
  return { token: `v3.${payload}.${signature(payload, secret(environment))}`, expiresAt: new Date(expiresAt * 1000).toISOString(), productReleaseId, componentReleaseId, memberSha256 };
}

function tokenFromEvent(event) {
  const values = event?.multiValueQueryStringParameters?.previewAuthorization;
  if (Array.isArray(values)) {
    if (values.length === 0) return { token: "", code: "token_missing" };
    if (values.length !== 1) return { token: "", code: "token_malformed" };
    return { token: String(values[0]), code: null };
  }
  const token = String(event?.queryStringParameters?.previewAuthorization || "");
  return { token, code: token ? null : "token_missing" };
}

function inspectBuilderPreviewAuthorization(event, requestedScope, { environment = process.env, now = Date.now() } = {}) {
  const selected = tokenFromEvent(event);
  if (selected.code) return { authorized: false, code: selected.code };
  const match = selected.token.match(TOKEN);
  if (!match) return { authorized: false, code: "token_malformed" };
  if (!ACTIONS.has(requestedScope.action)) return { authorized: false, code: "action_denied" };
  const expected = Buffer.from(signature(match[2], secret(environment)));
  const actual = Buffer.from(match[3]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { authorized: false, code: "signature_invalid" };
  let payload; try { payload = JSON.parse(Buffer.from(match[2], "base64url").toString("utf8")); } catch { return { authorized: false, code: "token_malformed" }; }
  const tokenVersion = Number(match[1]);
  const payloadKeys = tokenVersion === 1
    ? ["version", "expiresAt", "nonce", "actions", "bookSlug", "componentSlug", "view", "activityId", "releaseId"]
    : tokenVersion === 2
      ? ["version", "expiresAt", "nonce", "actions", "bookSlug", "componentSlug", "view", "pageId", "activityId", "releaseId"]
      : ["version", "expiresAt", "nonce", "actions", "bookSlug", "productReleaseId", "componentSlug", "componentReleaseId", "memberSha256", "view", "pageId", "activityId"];
  if (!exact(payload, payloadKeys) || payload.version !== tokenVersion || !Number.isSafeInteger(payload.expiresAt) || !/^[A-Za-z0-9_-]{16,64}$/.test(payload.nonce) || !Array.isArray(payload.actions)) return { authorized: false, code: "token_malformed" };
  if (payload.expiresAt <= Math.floor(now / 1000)) return { authorized: false, code: "token_expired" };
  if (!payload.actions.includes(requestedScope.action)) return { authorized: false, code: "action_denied" };
  if (payload.bookSlug !== requestedScope.bookSlug || payload.componentSlug !== requestedScope.componentSlug) return { authorized: false, code: "scope_mismatch" };
  const payloadReleaseId = tokenVersion === 3 ? payload.componentReleaseId : payload.releaseId;
  if (requestedScope.releaseId && payloadReleaseId !== String(requestedScope.releaseId).toLowerCase()) return { authorized: false, code: "scope_mismatch" };
  if (requestedScope.productReleaseId && payload.productReleaseId !== String(requestedScope.productReleaseId).toLowerCase()) return { authorized: false, code: "scope_mismatch" };
  if (requestedScope.memberSha256 && payload.memberSha256 !== requestedScope.memberSha256) return { authorized: false, code: "scope_mismatch" };
  if (requestedScope.pageId && payload.pageId !== null && payload.pageId !== requestedScope.pageId) return { authorized: false, code: "scope_mismatch" };
  if (requestedScope.activityId && payload.activityId !== null && payload.activityId !== requestedScope.activityId) return { authorized: false, code: "scope_mismatch" };
  return { authorized: true, code: "authorized", scope: Object.freeze({ version: payload.version, view: payload.view, pageId: payload.pageId || null, activityId: payload.activityId, releaseId: payloadReleaseId, productReleaseId: payload.productReleaseId || null, memberSha256: payload.memberSha256 || null }) };
}

export function classifyBuilderPreviewAuthorization(event, requestedScope, options) {
  const decision = inspectBuilderPreviewAuthorization(event, requestedScope, options);
  return { authorized: decision.authorized, code: decision.code };
}

export function inspectBuilderPreviewAuthorizationScope(event, requestedScope, options) {
  return inspectBuilderPreviewAuthorization(event, requestedScope, options);
}

export function verifyBuilderPreviewAuthorization(event, requestedScope, options) {
  return classifyBuilderPreviewAuthorization(event, requestedScope, options).authorized;
}

export async function authorizeBuilderPreviewRequestWithDiagnostic(event, sql, scope, options) {
  if (await currentBuilderUserFromEvent(sql, event)) return { authorized: true, code: "builder_session" };
  return classifyBuilderPreviewAuthorization(event, scope, options);
}

export async function authorizeBuilderPreviewRequest(event, sql, scope, options) {
  return (await authorizeBuilderPreviewRequestWithDiagnostic(event, sql, scope, options)).authorized;
}

export { normalizeIntent as normalizeBuilderPreviewAuthorizationIntent };
