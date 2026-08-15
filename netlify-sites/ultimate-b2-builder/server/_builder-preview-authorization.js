import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { currentBuilderUserFromEvent } from "./_builder-auth.js";

export const builderPreviewAuthorizationTtlSeconds = 5 * 60;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/;
const ACTIONS = new Set(["teacher-ui-draft", "open-response-teacher", "release-public", "release-asset", "release-teacher-ui", "release-teacher-solution", "release-native-teacher"]);
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
  if (!exact(input, ["bookSlug", "componentSlug", "view", "activityId", "releaseId"])) throw new Error("Invalid Builder preview authorization intent");
  if (!SAFE_ID.test(input.bookSlug) || !SAFE_ID.test(input.componentSlug) || !["library", "page", "activity"].includes(input.view)) throw new Error("Invalid Builder preview authorization intent");
  const activityId = input.activityId === null ? null : String(input.activityId || "");
  const releaseId = input.releaseId === null ? null : String(input.releaseId || "").toLowerCase();
  if ((input.view === "activity") !== Boolean(activityId) || (activityId && !SAFE_ID.test(activityId)) || (releaseId && !UUID.test(releaseId))) throw new Error("Invalid Builder preview authorization intent");
  return { bookSlug: input.bookSlug, componentSlug: input.componentSlug, view: input.view, activityId, releaseId };
}

function actionsFor(intent) {
  const actions = intent.releaseId
    ? ["release-public", "release-asset", "release-teacher-ui", "release-teacher-solution", "release-native-teacher"]
    : ["teacher-ui-draft"];
  if (!intent.releaseId && intent.view === "activity") actions.push("open-response-teacher");
  return actions;
}

function signature(payload, key) { return createHmac("sha256", key).update(payload).digest("base64url"); }

export function issueBuilderPreviewAuthorization(input, { environment = process.env, now = Date.now(), nonce = randomBytes(16).toString("base64url") } = {}) {
  const intent = normalizeIntent(input);
  const payload = Buffer.from(JSON.stringify({ version: 1, expiresAt: Math.floor(now / 1000) + builderPreviewAuthorizationTtlSeconds, nonce, actions: actionsFor(intent), ...intent }), "utf8").toString("base64url");
  return { token: `v1.${payload}.${signature(payload, secret(environment))}`, expiresAt: new Date((Math.floor(now / 1000) + builderPreviewAuthorizationTtlSeconds) * 1000).toISOString() };
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

export function classifyBuilderPreviewAuthorization(event, requestedScope, { environment = process.env, now = Date.now() } = {}) {
  const selected = tokenFromEvent(event);
  if (selected.code) return { authorized: false, code: selected.code };
  const match = selected.token.match(TOKEN);
  if (!match) return { authorized: false, code: "token_malformed" };
  if (!ACTIONS.has(requestedScope.action)) return { authorized: false, code: "action_denied" };
  const expected = Buffer.from(signature(match[1], secret(environment)));
  const actual = Buffer.from(match[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return { authorized: false, code: "signature_invalid" };
  let payload; try { payload = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")); } catch { return { authorized: false, code: "token_malformed" }; }
  if (!exact(payload, ["version", "expiresAt", "nonce", "actions", "bookSlug", "componentSlug", "view", "activityId", "releaseId"]) || payload.version !== 1 || !Number.isSafeInteger(payload.expiresAt) || !/^[A-Za-z0-9_-]{16,64}$/.test(payload.nonce) || !Array.isArray(payload.actions)) return { authorized: false, code: "token_malformed" };
  if (payload.expiresAt <= Math.floor(now / 1000)) return { authorized: false, code: "token_expired" };
  if (!payload.actions.includes(requestedScope.action)) return { authorized: false, code: "action_denied" };
  if (payload.bookSlug !== requestedScope.bookSlug || payload.componentSlug !== requestedScope.componentSlug) return { authorized: false, code: "scope_mismatch" };
  if (requestedScope.releaseId && payload.releaseId !== String(requestedScope.releaseId).toLowerCase()) return { authorized: false, code: "scope_mismatch" };
  if (requestedScope.activityId && payload.activityId !== null && payload.activityId !== requestedScope.activityId) return { authorized: false, code: "scope_mismatch" };
  return { authorized: true, code: "authorized" };
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
