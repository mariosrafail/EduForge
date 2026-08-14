import { createHash } from "node:crypto";

import { appendNativeActivityIndexEntry, createEmptyNativeActivityIndex, NATIVE_ACTIVITY_SCHEMA_VERSION } from "../../../src/data/native-activities/nativeActivityPublic.js";
import { getBuilderSql, json, requireBuilderOrigin, requireBuilderUser } from "./_builder-auth.js";
import { resolveBuilderContentResource } from "./_builder-content-registry.js";
import { assertPublicBuilderDocument, builderClientMutationIdPattern, builderDocumentSha256, stableBuilderJson } from "./_builder-content-security.js";
import { loadBuilderComponentDocument } from "./_builder-content-store.js";
import { createBuilderNativeActivity } from "./_builder-native-activity-store.js";
import { resolveNativeActivityAdapter } from "./_native-activity-adapters.js";
import { resolveNativeActivityKind, validateNativeActivityPair } from "./_native-activity-registry.js";

const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function route(event) {
  const pathname = String(event?.path || "").split("?")[0];
  const match = pathname.match(/(?:\/builder\/api\/native-activities|\/\.netlify\/functions\/builder-native-activities)\/books\/([^/]+)\/components\/([^/]+)\/create\/?$/);
  if (!match) return null;
  try { return { bookSlug: decodeURIComponent(match[1]), componentSlug: decodeURIComponent(match[2]) }; } catch { return null; }
}

function body(event) {
  if (!String(Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "").toLowerCase().startsWith("application/json")) return { error: json(415, { error: "expected_application_json" }) };
  let value; try { value = JSON.parse(event.body || "{}"); } catch { return { error: json(400, { error: "invalid_json" }) }; }
  if (!exact(value, ["kind", "pageId", "title", "clientMutationId"]) || !builderClientMutationIdPattern.test(String(value.clientMutationId || "")) || typeof value.title !== "string") return { error: json(400, { error: "invalid_request" }) };
  return { value };
}

export function createBuilderNativeActivitiesHandler(overrides = {}) {
  const dependencies = {
    getDatabase: overrides.getDatabase || getBuilderSql,
    authorize: overrides.authorize || requireBuilderUser,
    resolveAdapter: overrides.resolveAdapter || resolveNativeActivityAdapter,
    resolveResource: overrides.resolveResource || resolveBuilderContentResource,
    loadDocument: overrides.loadDocument || loadBuilderComponentDocument,
    create: overrides.create || createBuilderNativeActivity,
    logger: overrides.logger || console,
  };
  return async function handler(event) {
    try {
      const parsedRoute = route(event);
      if (!parsedRoute) return json(404, { error: "native_activity_component_not_found" });
      const sql = dependencies.getDatabase();
      const auth = await dependencies.authorize(event, sql);
      if (auth.error) return auth.error;
      if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
      const originError = requireBuilderOrigin(event); if (originError) return originError;
      const parsed = body(event); if (parsed.error) return parsed.error;
      const adapter = dependencies.resolveAdapter(parsedRoute.bookSlug, parsedRoute.componentSlug);
      const kind = resolveNativeActivityKind(parsed.value.kind);
      if (!adapter) return json(404, { error: "native_activity_component_not_found" });
      if (!kind || !adapter.kinds.includes(kind.kind)) return json(400, { error: "unsupported_native_activity_kind" });
      let placement; try { placement = adapter.normalizePlacement({ pageId: parsed.value.pageId }); } catch { return json(400, { error: "invalid_native_activity_placement" }); }
      const title = parsed.value.title.trim() || `New ${kind.label}`;
      if (title.length > 300 || /[\u0000-\u001f\u007f]/.test(title)) return json(400, { error: "invalid_native_activity_title" });
      const requestSha256 = sha256(stableBuilderJson({ ...parsedRoute, kind: kind.kind, pageId: placement.pageId, title }));
      const indexResource = await dependencies.resolveResource(parsedRoute.bookSlug, parsedRoute.componentSlug, "native-activity-index", "");
      if (!indexResource) return json(404, { error: "native_activity_component_not_found" });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const storedIndex = await dependencies.loadDocument(sql, indexResource);
        const index = storedIndex?.document || createEmptyNativeActivityIndex();
        const activityId = adapter.nextActivityId({ placement, nativeIndex: index });
        const publicDocument = kind.createBlankPublic({ activityId, title, placement });
        const teacherDocument = kind.createBlankTeacher({ activityId, placement });
        validateNativeActivityPair(publicDocument, teacherDocument);
        assertPublicBuilderDocument(publicDocument);
        const indexDocument = appendNativeActivityIndexEntry(index, { activityId, kind: kind.kind, placement: { pageId: placement.pageId }, sortOrder: adapter.sortOrder({ placement, activityId }) }, { allowedKinds: adapter.kinds });
        const result = await dependencies.create(sql, {
          ...parsedRoute, activityId, kind: kind.kind, expectedIndexRevision: storedIndex?.revision || 0,
          indexDocument, indexSha256: builderDocumentSha256(indexDocument), publicDocument, publicSha256: builderDocumentSha256(publicDocument),
          teacherDocument, teacherSha256: builderDocumentSha256(teacherDocument), schemaVersion: NATIVE_ACTIVITY_SCHEMA_VERSION,
          requestSha256, builderUserId: auth.builderUser.id, clientMutationId: parsed.value.clientMutationId,
        });
        if (["revision_conflict", "identity_conflict"].includes(result.outcome)) continue;
        if (result.outcome === "mutation_id_conflict") return json(409, { error: result.outcome });
        if (result.outcome === "unauthorized_actor") return json(401, { error: "Unauthorized" });
        if (result.outcome === "resource_not_found") return json(404, { error: "native_activity_component_not_found" });
        if (!["created", "idempotent"].includes(result.outcome)) throw new Error("Unexpected native activity creation outcome");
        return json(200, { ...result, kind: kind.kind, placement: { pageId: placement.pageId }, idempotent: result.outcome === "idempotent" });
      }
      return json(409, { error: "native_activity_creation_conflict" });
    } catch (error) {
      dependencies.logger.error("Builder native activity creation failed", { code: /^[A-Za-z0-9_.-]+$/.test(String(error?.code || "")) ? error.code : "unknown" });
      return json(500, { error: "native_activity_creation_failed" });
    }
  };
}

export { route as parseBuilderNativeActivityRoute };
