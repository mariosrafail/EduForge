import {
  getBuilderSql,
  json,
  requireBuilderOrigin,
  requireBuilderUser,
} from "./_builder-auth.js";
import { resolveBuilderContentResource } from "./_builder-content-registry.js";
import {
  assertPublicBuilderDocument,
  builderClientMutationIdPattern,
  builderDocumentSha256,
} from "./_builder-content-security.js";
import {
  loadBuilderComponentDocument,
  saveBuilderComponentDocument,
} from "./_builder-content-store.js";

export const builderContentMaximumBodyBytes = 512 * 1024;

const builderContentDiagnosticStages = new Set([
  "database",
  "authorize",
  "route",
  "resolve_resource",
  "load_document",
  "repository_baseline",
  "parse_mutation",
  "validate_mutation",
  "save_document",
  "validate_saved_document",
  "response",
]);
const safeDiagnosticToken = /^[A-Za-z0-9_.-]{1,64}$/;

function diagnosticToken(value, fallback) {
  const token = typeof value === "string" ? value : "";
  return safeDiagnosticToken.test(token) ? token : fallback;
}

function errorProperty(error, property) {
  try {
    return error?.[property];
  } catch {
    return undefined;
  }
}

function diagnosticCategory(errorCode) {
  if (errorCode === "ERR_MODULE_NOT_FOUND") return "module_not_found";
  if (["ERR_REQUIRE_ESM", "ERR_UNKNOWN_FILE_EXTENSION", "ERR_UNSUPPORTED_ESM_URL_SCHEME", "MODULE_NOT_FOUND"].includes(errorCode)) return "module_loading";
  if (errorCode === "42P01") return "database_relation_missing";
  if (errorCode === "42703") return "database_column_missing";
  if (["28P01", "28000"].includes(errorCode)) return "database_authentication";
  if (errorCode === "3D000") return "database_missing";
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT"].includes(errorCode)) return "database_or_network_connectivity";
  return "unexpected";
}

export function safeBuilderContentDiagnostic(stage, error) {
  const safeStage = builderContentDiagnosticStages.has(stage) ? stage : "database";
  const errorName = diagnosticToken(errorProperty(error, "name"), "UnknownError");
  const errorCode = diagnosticToken(errorProperty(error, "code"), "unknown");
  return { stage: safeStage, errorName, errorCode, category: diagnosticCategory(errorCode) };
}

function header(event, name) {
  const entry = Object.entries(event?.headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry ? String(entry[1]) : "";
}

function decodeSegment(segment) {
  try { return decodeURIComponent(segment); } catch { return ""; }
}

export function parseBuilderContentRoute(event) {
  const pathname = String(event?.path || "").split("?")[0];
  const match = pathname.match(/(?:\/builder\/api\/content|\/\.netlify\/functions\/builder-content)\/books\/([^/]+)\/components\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (!match) return null;
  return {
    bookSlug: decodeSegment(match[1]),
    componentSlug: decodeSegment(match[2]),
    resource: decodeSegment(match[3]),
    documentKey: decodeSegment(match[4] || ""),
  };
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseSaveBody(event) {
  const encoded = String(event?.body || "");
  const source = event?.isBase64Encoded ? Buffer.from(encoded, "base64").toString("utf8") : encoded;
  if (Buffer.byteLength(source, "utf8") > builderContentMaximumBodyBytes) {
    return { error: json(413, { error: "request_too_large" }) };
  }
  let value;
  try { value = JSON.parse(source); } catch { return { error: json(400, { error: "invalid_json" }) }; }
  if (!exactKeys(value, ["expectedRevision", "clientMutationId", "document"])) {
    return { error: json(400, { error: "invalid_request" }) };
  }
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) {
    return { error: json(400, { error: "invalid_expected_revision" }) };
  }
  if (!builderClientMutationIdPattern.test(String(value.clientMutationId || ""))) {
    return { error: json(400, { error: "invalid_client_mutation_id" }) };
  }
  if (!value.document || typeof value.document !== "object" || Array.isArray(value.document)) {
    return { error: json(400, { error: "invalid_document" }) };
  }
  return { value };
}

function contentResponse(resource, state, extra = {}) {
  return {
    bookSlug: resource.bookSlug,
    componentSlug: resource.componentSlug,
    resource: resource.resource,
    ...(resource.documentKey !== "default" ? { documentKey: resource.documentKey } : {}),
    schemaVersion: resource.schemaVersion,
    revision: state.revision,
    source: state.source,
    document: state.document,
    ...extra,
  };
}

export function createBuilderContentHandler(overrides = {}) {
  const dependencies = {
    getDatabase: overrides.getDatabase || getBuilderSql,
    authorize: overrides.authorize || requireBuilderUser,
    resolveResource: overrides.resolveResource || resolveBuilderContentResource,
    loadDocument: overrides.loadDocument || loadBuilderComponentDocument,
    saveDocument: overrides.saveDocument || saveBuilderComponentDocument,
    logger: overrides.logger || console,
  };

  return async function builderContentHandler(event) {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
    let stage = "database";
    try {
      stage = "database";
      const sql = dependencies.getDatabase();
      stage = "authorize";
      const auth = await dependencies.authorize(event, sql);
      if (auth.error) return auth.error;

      stage = "route";
      const route = parseBuilderContentRoute(event);
      stage = "resolve_resource";
      const resource = route && await dependencies.resolveResource(route.bookSlug, route.componentSlug, route.resource, route.documentKey);
      if (!resource || !resource.readable) return json(404, { error: "builder_resource_not_found" });

      if (event.httpMethod === "GET") {
        stage = "load_document";
        const stored = await dependencies.loadDocument(sql, resource);
        let state = stored;
        if (!state) {
          if (resource.requiresStored) return json(404, { error: "builder_resource_not_found" });
          stage = "repository_baseline";
          state = { revision: 0, source: "repository", document: resource.baseline() };
        }
        stage = "response";
        return json(200, contentResponse(resource, state));
      }

      stage = "parse_mutation";
      if (event.httpMethod !== "PUT" || !resource.writeAllowed) return json(405, { error: "method_not_allowed" });
      const originError = requireBuilderOrigin(event);
      if (originError) return originError;
      if (!header(event, "content-type").toLowerCase().startsWith("application/json")) {
        return json(415, { error: "expected_application_json" });
      }

      const parsed = parseSaveBody(event);
      if (parsed.error) return parsed.error;
      stage = "validate_mutation";
      if (resource.audience !== "teacher") {
        try { assertPublicBuilderDocument(parsed.value.document); } catch { return json(400, { error: "private_document_key_rejected" }); }
      }

      let document;
      try { document = resource.validate(parsed.value.document); } catch (error) {
        return json(400, { error: "invalid_document", detail: String(error.message || "Document validation failed").slice(0, 240) });
      }
      const currentState = resource.requiresStored ? await dependencies.loadDocument(sql, resource) : null;
      if (resource.requiresStored && !currentState) return json(404, { error: "builder_resource_not_found" });
      if (typeof resource.validateMutationContext === "function") {
        try {
          await resource.validateMutationContext({
            document,
            currentDocument: currentState?.document || null,
            loadRelated: async (relatedResource, relatedKey) => {
              const resolved = await dependencies.resolveResource(resource.bookSlug, resource.componentSlug, relatedResource, relatedKey);
              return resolved ? dependencies.loadDocument(sql, resolved) : null;
            },
          });
        } catch (error) {
          return json(400, { error: "invalid_document", detail: String(error.message || "Document consistency validation failed").slice(0, 240) });
        }
      }
      const payloadSha256 = builderDocumentSha256(document);
      stage = "save_document";
      const result = await dependencies.saveDocument(sql, {
        resource,
        expectedRevision: parsed.value.expectedRevision,
        clientMutationId: parsed.value.clientMutationId,
        document,
        payloadSha256,
        builderUserId: auth.builderUser.id,
      });

      if (result.outcome === "revision_conflict") {
        return json(409, { error: "revision_conflict", currentRevision: result.currentRevision });
      }
      if (result.outcome === "mutation_id_conflict") {
        return json(409, { error: "mutation_id_conflict", currentRevision: result.currentRevision });
      }
      if (result.outcome === "resource_not_found") return json(404, { error: "builder_resource_not_found" });
      if (result.outcome === "unauthorized_actor") return json(401, { error: "Unauthorized" });
      if (!["saved", "idempotent"].includes(result.outcome)) throw new Error("Unexpected Builder content save outcome");

      stage = "validate_saved_document";
      const responseDocument = resource.validate(result.document);
      stage = "response";
      return json(200, contentResponse(resource, {
        revision: result.revision,
        source: "database",
        document: responseDocument,
      }, {
        currentRevision: result.currentRevision,
        idempotent: result.outcome === "idempotent",
      }));
    } catch (error) {
      dependencies.logger.error("Builder content request failed", safeBuilderContentDiagnostic(stage, error));
      return json(500, { error: "builder_content_failed" });
    }
  };
}
