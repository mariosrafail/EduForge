import { createBookAssetStorage } from "../../../lib/book-assets/storage.js";
import { getBuilderSql, json } from "./_builder-auth.js";
import { resolveBuilderContentResource } from "./_builder-content-registry.js";
import { assertPublicBuilderDocument } from "./_builder-content-security.js";
import { loadBuilderComponentDocument } from "./_builder-content-store.js";
import { isBuilderNativeDraftAssetRecord, loadBuilderNativeAsset } from "./_builder-native-activity-store.js";
import { inspectBuilderPreviewAuthorizationScope } from "./_builder-preview-authorization.js";
import { validateNativeActivityPair } from "./_native-activity-registry.js";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const previewTtlSeconds = 5 * 60;
const NATIVE_TEACHER_PREVIEW_KINDS = new Set(["open-response", "single-choice", "complete-sentences", "listening", "drag-drop"]);

function decode(value) { try { return decodeURIComponent(value); } catch { return ""; } }

function route(event) {
  const pathname = String(event?.path || "").split("?")[0];
  const root = /^(?:\/builder\/preview\/native-activities|\/\.netlify\/functions\/builder-native-preview)\/books\/([^/]+)\/components\/([^/]+)\/activities\/([^/]+)/;
  const prefix = pathname.match(root);
  if (!prefix) return null;
  const identity = { bookSlug: decode(prefix[1]), componentSlug: decode(prefix[2]), activityId: decode(prefix[3]) };
  if (![identity.bookSlug, identity.componentSlug, identity.activityId].every((value) => SAFE_ID.test(value))) return null;
  const suffix = pathname.slice(prefix.index + prefix[0].length).replace(/^\/+|\/+$/g, "");
  if (suffix === "public" || suffix === "teacher") return { ...identity, action: suffix };
  const asset = suffix.match(/^assets\/([0-9a-f-]+)$/i);
  return asset && UUID.test(asset[1]) ? { ...identity, action: "asset", assetId: asset[1].toLowerCase() } : null;
}

function privateJson(statusCode, body) {
  return json(statusCode, body, { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
}

async function loadPublicContext(dependencies, sql, identity) {
  const [indexResource, publicResource] = await Promise.all([
    dependencies.resolveResource(identity.bookSlug, identity.componentSlug, "native-activity-index", ""),
    dependencies.resolveResource(identity.bookSlug, identity.componentSlug, "native-activity-public", identity.activityId),
  ]);
  if (!indexResource || !publicResource) return null;
  const [storedIndex, storedPublic] = await Promise.all([
    dependencies.loadDocument(sql, indexResource),
    dependencies.loadDocument(sql, publicResource),
  ]);
  const entry = storedIndex?.document.activities.find((candidate) => candidate.activityId === identity.activityId);
  if (!entry || !storedPublic) return null;
  const document = storedPublic.document;
  if (entry.kind !== document.kind || entry.placement.pageId !== document.placement.pageId) throw new Error("Native draft index and public document are inconsistent.");
  assertPublicBuilderDocument(document);
  return { entry, document, revision: storedPublic.revision };
}

function matchesAuthorizedDraftScope(scope, identity, publicDocument) {
  if (!scope || scope.version !== 2 || scope.releaseId !== null) return false;
  if (scope.view === "activity") return scope.pageId === null && scope.activityId === identity.activityId;
  if (scope.view === "page") return scope.activityId === null && scope.pageId === publicDocument.placement.pageId;
  return false;
}

function envelope(identity, state, audience, document) {
  return {
    bookSlug: identity.bookSlug,
    componentSlug: identity.componentSlug,
    activityId: identity.activityId,
    kind: state.entry.kind,
    audience,
    schemaVersion: document.schemaVersion,
    revision: state.revision,
    document,
  };
}

export function createBuilderNativePreviewHandler(overrides = {}) {
  const dependencies = {
    getDatabase: overrides.getDatabase || getBuilderSql,
    resolveResource: overrides.resolveResource || resolveBuilderContentResource,
    loadDocument: overrides.loadDocument || loadBuilderComponentDocument,
    inspectAuthorization: overrides.inspectAuthorization || inspectBuilderPreviewAuthorizationScope,
    loadAsset: overrides.loadAsset || loadBuilderNativeAsset,
    storage: overrides.storage || (() => createBookAssetStorage()),
    logger: overrides.logger || console,
  };
  return async function handler(event) {
    try {
      const parsed = route(event);
      if (!parsed) return privateJson(404, { error: "native_draft_not_found" });
      if (event.httpMethod !== "GET") return privateJson(405, { error: "method_not_allowed" });
      const requestedAction = `native-draft-${parsed.action}`;
      const decision = dependencies.inspectAuthorization(event, { action: requestedAction, bookSlug: parsed.bookSlug, componentSlug: parsed.componentSlug, activityId: parsed.activityId });
      if (!decision.authorized) return privateJson(401, { error: "Unauthorized" });
      const sql = dependencies.getDatabase();
      const publicState = await loadPublicContext(dependencies, sql, parsed);
      if (!publicState) return privateJson(404, { error: "native_draft_not_found" });
      if (!matchesAuthorizedDraftScope(decision.scope, parsed, publicState.document)) return privateJson(401, { error: "Unauthorized" });

      if (parsed.action === "public") return privateJson(200, envelope(parsed, publicState, "public", publicState.document));
      if (parsed.action === "teacher") {
        if (!NATIVE_TEACHER_PREVIEW_KINDS.has(publicState.entry.kind)) return privateJson(404, { error: "native_teacher_draft_not_found" });
        const teacherResource = await dependencies.resolveResource(parsed.bookSlug, parsed.componentSlug, "native-activity-teacher", parsed.activityId);
        const storedTeacher = teacherResource ? await dependencies.loadDocument(sql, teacherResource) : null;
        if (!storedTeacher) return privateJson(404, { error: "native_teacher_draft_not_found" });
        validateNativeActivityPair(publicState.document, storedTeacher.document);
        return privateJson(200, envelope(parsed, { ...publicState, revision: storedTeacher.revision }, "teacher", storedTeacher.document));
      }

      const reference = publicState.document.assets.find((candidate) => candidate.assetId === parsed.assetId);
      if (!reference) return privateJson(404, { error: "native_draft_asset_not_found" });
      const asset = await dependencies.loadAsset(sql, parsed);
      if (!isBuilderNativeDraftAssetRecord(asset, { activityId: parsed.activityId, reference })) return privateJson(404, { error: "native_draft_asset_not_found" });
      const location = await dependencies.storage().signedGetUrl({ profile: "private", objectKey: asset.object_key, ttlSeconds: previewTtlSeconds });
      return { statusCode: 302, headers: { Location: location, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }, body: "" };
    } catch (error) {
      dependencies.logger.error("Builder native draft preview failed", { code: /^[A-Za-z0-9_.-]+$/.test(String(error?.code || "")) ? error.code : "unknown" });
      return privateJson(500, { error: "native_draft_preview_failed" });
    }
  };
}

export { route as parseBuilderNativePreviewRoute };
