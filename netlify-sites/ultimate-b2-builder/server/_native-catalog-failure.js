export const nativeCatalogSafeIdPattern = /^[a-z0-9][a-z0-9-]{0,127}$/;

const boundaryStages = new Set([
  "catalog_scope_unavailable",
  "activity_identity_outside_component",
  "placement_resolution_failed",
  "placement_mismatch",
  "activity_kind_unsupported",
  "activity_resources_unavailable",
  "asset_component_mismatch",
  "asset_activity_mismatch",
]);
const processingStages = new Set([
  "source_collection",
  "placement_batch_load",
  "catalog_asset_load",
  "readiness_assessment",
  "asset_requirement_derivation",
  "catalog_projection",
]);
const safeContextFields = new Set(["bookSlug", "componentSlug", "activityId", "kind", "pageId"]);
const failureType = Symbol("nativeCatalogFailureType");

function safeContext(context) {
  if (!context || typeof context !== "object" || Array.isArray(context)) return {};
  return Object.fromEntries(Object.entries(context).filter(([key, value]) => (
    safeContextFields.has(key) && typeof value === "string" && nativeCatalogSafeIdPattern.test(value)
  )));
}

function safeErrorCode(error) {
  const candidateCode = String(error?.code || "");
  return /^[A-Za-z0-9_.-]{1,80}$/.test(candidateCode) ? candidateCode : null;
}

export function nativeCatalogBoundary(stage, message, context = {}) {
  if (!boundaryStages.has(stage)) throw new Error("Native catalog boundary stage is invalid.");
  return Object.assign(new Error(message), {
    [failureType]: "boundary",
    code: "native_catalog_boundary_invalid",
    boundaryStage: stage,
    safeContext: safeContext(context),
  });
}

export function nativeCatalogIdentityContext(parsedRoute, entry) {
  return {
    bookSlug: parsedRoute.bookSlug,
    componentSlug: parsedRoute.componentSlug,
    activityId: entry?.activityId,
    kind: entry?.kind,
    pageId: entry?.placement?.pageId,
  };
}

function processingFailure(stage, error, context = {}) {
  if (!processingStages.has(stage)) throw new Error("Native catalog processing stage is invalid.");
  return Object.assign(new Error("Native catalog processing failed."), {
    [failureType]: "processing",
    code: safeErrorCode(error) || "native_catalog_processing_failed",
    processingStage: stage,
    safeContext: safeContext(context),
  });
}

export async function withNativeCatalogProcessing(stage, context, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error?.[failureType]) throw error;
    throw processingFailure(stage, error, context);
  }
}

export function nativeActivityFailureLogFields(error) {
  const code = safeErrorCode(error) || "unknown";
  const fields = { code };
  if (error?.[failureType] === "boundary" && code === "native_catalog_boundary_invalid" && boundaryStages.has(error?.boundaryStage)) {
    fields.boundaryStage = error.boundaryStage;
  } else if (error?.[failureType] === "processing" && processingStages.has(error?.processingStage)) {
    fields.processingStage = error.processingStage;
  } else {
    return fields;
  }
  return Object.assign(fields, safeContext(error.safeContext));
}
