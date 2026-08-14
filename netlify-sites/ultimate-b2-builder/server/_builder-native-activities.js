import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { createBookAssetStorage } from "../../../lib/book-assets/storage.js";
import { buildNativeActivityAssetObjectKey, buildNativeActivityAssetStagingKey } from "../../../lib/book-assets/object-keys.js";
import { inspectManagedRaster, MANAGED_RASTER_MAXIMUM_BYTES, MANAGED_RASTER_TYPES } from "../../../lib/book-assets/raster-inspection.js";
import { appendNativeActivityIndexEntry, createEmptyNativeActivityIndex, NATIVE_ACTIVITY_SCHEMA_VERSION } from "../../../src/data/native-activities/nativeActivityPublic.js";
import { getBuilderSql, json, requireBuilderOrigin, requireBuilderUser } from "./_builder-auth.js";
import { resolveBuilderContentResource } from "./_builder-content-registry.js";
import { assertPublicBuilderDocument, builderClientMutationIdPattern, builderDocumentSha256, stableBuilderJson } from "./_builder-content-security.js";
import { loadBuilderComponentDocument } from "./_builder-content-store.js";
import {
  claimBuilderNativeAssetUpload,
  completeBuilderNativeAssetUpload,
  createBuilderNativeActivity,
  failBuilderNativeAssetUpload,
  loadBuilderNativeAsset,
  prepareBuilderNativeAssetUpload,
  saveBuilderNativeActivityPair,
  validateBuilderNativeAssetReferences,
} from "./_builder-native-activity-store.js";
import { resolveNativeActivityAdapter } from "./_native-activity-adapters.js";
import { resolveNativeActivityKind, validateNativeActivityPair } from "./_native-activity-registry.js";

const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeId = /^[a-z0-9][a-z0-9-]{0,127}$/;
const uploadTtlSeconds = 15 * 60;
const previewTtlSeconds = 5 * 60;
const declaredRasterTypes = new Set(Object.values(MANAGED_RASTER_TYPES));
const extensionTypes = new Map([[".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"]]);

function decode(value) { try { return decodeURIComponent(value); } catch { return ""; } }

function route(event) {
  const pathname = String(event?.path || "").split("?")[0];
  const root = /(?:\/builder\/api\/native-activities|\/\.netlify\/functions\/builder-native-activities)\/books\/([^/]+)\/components\/([^/]+)/;
  const prefix = pathname.match(root);
  if (!prefix) return null;
  const scope = { bookSlug: decode(prefix[1]), componentSlug: decode(prefix[2]) };
  const suffix = pathname.slice(prefix.index + prefix[0].length).replace(/^\/+|\/+$/g, "");
  if (suffix === "create") return { ...scope, action: "create" };
  let match = suffix.match(/^activities\/([a-z0-9-]+)\/save$/);
  if (match) return { ...scope, activityId: match[1], action: "save" };
  match = suffix.match(/^activities\/([a-z0-9-]+)\/assets\/(prepare|finalize)$/);
  if (match) return { ...scope, activityId: match[1], action: `asset-${match[2]}` };
  match = suffix.match(/^activities\/([a-z0-9-]+)\/assets\/([0-9a-f-]+)\/preview$/);
  if (match) return { ...scope, activityId: match[1], assetId: match[2], action: "asset-preview" };
  return null;
}

function parseJson(event, keys, maximumBytes = 1024 * 1024) {
  if (!String(Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "").toLowerCase().startsWith("application/json")) return { error: json(415, { error: "expected_application_json" }) };
  const encoded = String(event.body || "");
  const bytes = event.isBase64Encoded ? Buffer.from(encoded, "base64") : Buffer.from(encoded, "utf8");
  if (bytes.length > maximumBytes) return { error: json(413, { error: "request_too_large" }) };
  let value; try { value = JSON.parse(bytes.toString("utf8") || "{}"); } catch { return { error: json(400, { error: "invalid_json" }) }; }
  if (!exact(value, keys)) return { error: json(400, { error: "invalid_request" }) };
  return { value };
}

function createBody(event) {
  const parsed = parseJson(event, ["kind", "pageId", "title", "clientMutationId"]);
  if (parsed.error) return parsed;
  if (!builderClientMutationIdPattern.test(String(parsed.value.clientMutationId || "")) || typeof parsed.value.title !== "string") return { error: json(400, { error: "invalid_request" }) };
  return parsed;
}

function failureCode(error) {
  const value = String(error?.message || "native_asset_rejected");
  return /^[a-z0-9_]{3,64}$/.test(value) ? value : "native_asset_rejected";
}

async function createActivity(dependencies, sql, auth, parsedRoute, event) {
  const parsed = createBody(event); if (parsed.error) return parsed.error;
  const adapter = dependencies.resolveAdapter(parsedRoute.bookSlug, parsedRoute.componentSlug);
  const kind = resolveNativeActivityKind(parsed.value.kind);
  if (!adapter) return json(404, { error: "native_activity_component_not_found" });
  if (!kind || !adapter.kinds.includes(kind.kind)) return json(400, { error: "unsupported_native_activity_kind" });
  let placement; try { placement = adapter.normalizePlacement({ pageId: parsed.value.pageId }); } catch { return json(400, { error: "invalid_native_activity_placement" }); }
  const title = parsed.value.title.trim() || `New ${kind.label}`;
  if (title.length > 300 || /[\u0000-\u001f\u007f]/.test(title)) return json(400, { error: "invalid_native_activity_title" });
  const requestSha256 = sha256(stableBuilderJson({ bookSlug: parsedRoute.bookSlug, componentSlug: parsedRoute.componentSlug, kind: kind.kind, pageId: placement.pageId, title }));
  const indexResource = await dependencies.resolveResource(parsedRoute.bookSlug, parsedRoute.componentSlug, "native-activity-index", "");
  if (!indexResource) return json(404, { error: "native_activity_component_not_found" });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const storedIndex = await dependencies.loadDocument(sql, indexResource);
    const index = storedIndex?.document || createEmptyNativeActivityIndex();
    const activityId = adapter.nextActivityId({ placement, nativeIndex: index });
    const publicDocument = kind.createBlankPublic({ activityId, title, placement });
    const teacherDocument = kind.createBlankTeacher({ activityId, placement });
    validateNativeActivityPair(publicDocument, teacherDocument); assertPublicBuilderDocument(publicDocument);
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
}

async function savePair(dependencies, sql, auth, parsedRoute, event) {
  const parsed = parseJson(event, ["expectedPublicRevision", "expectedTeacherRevision", "clientMutationId", "publicDocument", "teacherDocument"]);
  if (parsed.error) return parsed.error;
  const input = parsed.value;
  if (![input.expectedPublicRevision, input.expectedTeacherRevision].every((revision) => Number.isSafeInteger(revision) && revision >= 1)
    || !builderClientMutationIdPattern.test(String(input.clientMutationId || ""))) return json(400, { error: "invalid_request" });
  let publicDocument; let teacherDocument;
  try {
    const [publicResource, teacherResource] = await Promise.all([
      dependencies.resolveResource(parsedRoute.bookSlug, parsedRoute.componentSlug, "native-activity-public", parsedRoute.activityId),
      dependencies.resolveResource(parsedRoute.bookSlug, parsedRoute.componentSlug, "native-activity-teacher", parsedRoute.activityId),
    ]);
    if (!publicResource || !teacherResource) throw new Error("Native activity resources are unavailable.");
    const [currentPublic, currentTeacher] = await Promise.all([
      dependencies.loadDocument(sql, publicResource), dependencies.loadDocument(sql, teacherResource),
    ]);
    if (!currentPublic || !currentTeacher || currentPublic.document.kind !== input.publicDocument?.kind || currentTeacher.document.kind !== input.teacherDocument?.kind
      || currentPublic.document.activityId !== parsedRoute.activityId || currentTeacher.document.activityId !== parsedRoute.activityId) throw new Error("Native activity identity and kind are immutable.");
    const kind = resolveNativeActivityKind(input.publicDocument?.kind);
    if (!kind || input.publicDocument?.kind !== "open-response") throw new Error("Only native Open Response uses paired authoring save.");
    publicDocument = kind.normalizePublic(input.publicDocument, parsedRoute.activityId);
    teacherDocument = kind.normalizeTeacher(input.teacherDocument, parsedRoute.activityId);
    validateNativeActivityPair(publicDocument, teacherDocument);
    assertPublicBuilderDocument(publicDocument);
    await dependencies.validateAssets(sql, { ...parsedRoute, assets: publicDocument.assets });
  } catch (error) {
    return json(400, { error: "invalid_native_activity_pair", detail: String(error.message || "Invalid pair").slice(0, 240) });
  }
  const requestSha256 = sha256(stableBuilderJson({
    expectedPublicRevision: input.expectedPublicRevision, expectedTeacherRevision: input.expectedTeacherRevision,
    publicDocument, teacherDocument,
  }));
  const result = await dependencies.savePair(sql, {
    ...parsedRoute, schemaVersion: NATIVE_ACTIVITY_SCHEMA_VERSION,
    expectedPublicRevision: input.expectedPublicRevision, expectedTeacherRevision: input.expectedTeacherRevision,
    publicDocument, publicSha256: builderDocumentSha256(publicDocument), teacherDocument, teacherSha256: builderDocumentSha256(teacherDocument),
    requestSha256, builderUserId: auth.builderUser.id, clientMutationId: input.clientMutationId,
  });
  if (["revision_conflict", "mutation_id_conflict"].includes(result.outcome)) return json(409, { error: result.outcome, currentPublicRevision: result.currentPublicRevision, currentTeacherRevision: result.currentTeacherRevision });
  if (result.outcome === "resource_not_found") return json(404, { error: "native_activity_not_found" });
  if (result.outcome === "unauthorized_actor") return json(401, { error: "Unauthorized" });
  if (!["saved", "idempotent"].includes(result.outcome)) throw new Error("Unexpected native activity pair save outcome");
  return json(200, { activityId: parsedRoute.activityId, publicRevision: result.publicRevision, teacherRevision: result.teacherRevision, publicDocument, teacherDocument, idempotent: result.outcome === "idempotent" });
}

function normalizeAssetDescriptor(input) {
  if (!exact(input, ["name", "size", "type", "assetSlot"])) throw new Error("invalid_file_descriptor");
  const name = String(input.name || "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._() -]{0,179}$/.test(name) || path.basename(name) !== name || /^(?:[a-z]:|\\\\|\/)|%2f|%5c|[\u0000-\u001f\u007f]/i.test(name)) throw new Error("invalid_filename");
  const extension = path.extname(name).toLowerCase();
  const type = String(input.type || "").toLowerCase();
  if (!extensionTypes.has(extension) || extensionTypes.get(extension) !== type || !declaredRasterTypes.has(type)) throw new Error("declared_mime_mismatch");
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > MANAGED_RASTER_MAXIMUM_BYTES) throw new Error("declared_file_too_large");
  if (!safeId.test(String(input.assetSlot || ""))) throw new Error("invalid_asset_slot");
  return { name, size: input.size, type, assetSlot: input.assetSlot };
}

async function prepareAsset(dependencies, sql, auth, parsedRoute, event) {
  const parsed = parseJson(event, ["name", "size", "type", "assetSlot", "clientMutationId"]);
  if (parsed.error) return parsed.error;
  if (!builderClientMutationIdPattern.test(String(parsed.value.clientMutationId || ""))) return json(400, { error: "invalid_client_mutation_id" });
  let descriptor; try { descriptor = normalizeAssetDescriptor({ name: parsed.value.name, size: parsed.value.size, type: parsed.value.type, assetSlot: parsed.value.assetSlot }); } catch (error) { return json(400, { error: failureCode(error) }); }
  const uploadId = dependencies.randomUuid();
  const stagingObjectKey = buildNativeActivityAssetStagingKey({ ...parsedRoute, uploadId });
  const requestSha256 = sha256(stableBuilderJson(descriptor));
  const result = await dependencies.prepareAsset(sql, { ...parsedRoute, assetSlot: descriptor.assetSlot, clientMutationId: parsed.value.clientMutationId, uploadId, requestSha256, fileDescriptor: descriptor, stagingObjectKey, builderUserId: auth.builderUser.id, expiresAt: new Date(dependencies.now() + uploadTtlSeconds * 1000).toISOString() });
  if (!result) throw new Error("Native asset preparation returned no result");
  if (result.outcome === "mutation_id_conflict") return json(409, { error: result.outcome });
  if (result.outcome === "resource_not_found") return json(404, { error: "native_activity_not_found" });
  if (!["prepared", "idempotent"].includes(result.outcome) || result.state !== "prepared") return json(409, { error: result.outcome || "invalid_session_state" });
  const storage = dependencies.storage();
  const authorization = await storage.signedPutUrl({ profile: "private", objectKey: result.stagingObjectKey, contentType: result.fileDescriptor.type, ttlSeconds: uploadTtlSeconds });
  return json(200, { uploadId: result.uploadId, expiresIn: uploadTtlSeconds, authorization, idempotent: result.outcome === "idempotent" });
}

async function assetResponse(dependencies, sql, parsedRoute, assetId) {
  const asset = await dependencies.loadAsset(sql, { ...parsedRoute, assetId });
  if (!asset || asset.publication_status !== "draft" || asset.access_level !== "internal" || asset.storage_profile !== "private") return null;
  return {
    asset,
    reference: { assetId: String(asset.id), checksumSha256: asset.checksum_sha256, role: asset.asset_role, slot: asset.source_metadata.asset_slot },
    previewUrl: `/builder/api/native-activities/books/${encodeURIComponent(parsedRoute.bookSlug)}/components/${encodeURIComponent(parsedRoute.componentSlug)}/activities/${encodeURIComponent(parsedRoute.activityId)}/assets/${encodeURIComponent(asset.id)}/preview`,
  };
}

async function finalizeAsset(dependencies, sql, auth, parsedRoute, event) {
  const parsed = parseJson(event, ["uploadId", "clientMutationId"]); if (parsed.error) return parsed.error;
  if (!uuidV4.test(String(parsed.value.uploadId || "")) || !builderClientMutationIdPattern.test(String(parsed.value.clientMutationId || ""))) return json(400, { error: "invalid_finalize_identity" });
  const claimed = await dependencies.claimAsset(sql, { uploadId: parsed.value.uploadId, clientMutationId: parsed.value.clientMutationId, builderUserId: auth.builderUser.id });
  if (!claimed) throw new Error("Native asset claim returned no result");
  if (claimed.outcome === "idempotent") {
    const result = await assetResponse(dependencies, sql, parsedRoute, claimed.resultingAssetId);
    return result ? json(200, { reference: result.reference, previewUrl: result.previewUrl, idempotent: true }) : json(404, { error: "asset_not_found" });
  }
  if (claimed.outcome !== "claimed" || claimed.activityId !== parsedRoute.activityId) return json(claimed.outcome === "session_not_found" ? 404 : claimed.outcome === "expired_session" ? 410 : 409, { error: claimed.outcome });
  const storage = dependencies.storage();
  try {
    const head = await storage.head({ profile: "private", objectKey: claimed.stagingObjectKey });
    if (head.byteSize !== claimed.fileDescriptor.size) throw new Error("actual_object_size_mismatch");
    const bytes = await storage.download({ profile: "private", objectKey: claimed.stagingObjectKey });
    if (bytes.length !== claimed.fileDescriptor.size) throw new Error("actual_object_size_mismatch");
    const inspected = await dependencies.inspectRaster(bytes);
    if (inspected.mimeType !== claimed.fileDescriptor.type || extensionTypes.get(path.extname(claimed.fileDescriptor.name).toLowerCase()) !== inspected.mimeType) throw new Error("actual_mime_mismatch");
    const objectKey = buildNativeActivityAssetObjectKey({ ...parsedRoute, checksum: inspected.checksumSha256, extension: inspected.extension });
    await storage.upload({ profile: "private", objectKey, body: inspected.bytes, contentType: inspected.mimeType, checksumSha256: inspected.checksumSha256, byteSize: inspected.byteSize });
    const assetId = await dependencies.completeAsset(sql, { uploadId: parsed.value.uploadId, builderUserId: auth.builderUser.id, objectKey, storageBucket: storage.bucket("private"), ...inspected });
    await storage.delete({ profile: "private", objectKey: claimed.stagingObjectKey }).catch(() => {});
    const result = await assetResponse(dependencies, sql, parsedRoute, assetId);
    if (!result) throw new Error("asset_record_unavailable");
    return json(200, { reference: result.reference, previewUrl: result.previewUrl, metadata: { mimeType: inspected.mimeType, byteSize: inspected.byteSize, width: inspected.width, height: inspected.height }, idempotent: false });
  } catch (error) {
    await Promise.allSettled([
      dependencies.failAsset(sql, { uploadId: parsed.value.uploadId, builderUserId: auth.builderUser.id, failureCode: failureCode(error) }),
      storage.delete({ profile: "private", objectKey: claimed.stagingObjectKey }),
    ]);
    return json(400, { error: failureCode(error) });
  }
}

export function createBuilderNativeActivitiesHandler(overrides = {}) {
  const dependencies = {
    getDatabase: overrides.getDatabase || getBuilderSql,
    authorize: overrides.authorize || requireBuilderUser,
    resolveAdapter: overrides.resolveAdapter || resolveNativeActivityAdapter,
    resolveResource: overrides.resolveResource || resolveBuilderContentResource,
    loadDocument: overrides.loadDocument || loadBuilderComponentDocument,
    create: overrides.create || createBuilderNativeActivity,
    savePair: overrides.savePair || saveBuilderNativeActivityPair,
    validateAssets: overrides.validateAssets || validateBuilderNativeAssetReferences,
    prepareAsset: overrides.prepareAsset || prepareBuilderNativeAssetUpload,
    claimAsset: overrides.claimAsset || claimBuilderNativeAssetUpload,
    completeAsset: overrides.completeAsset || completeBuilderNativeAssetUpload,
    failAsset: overrides.failAsset || failBuilderNativeAssetUpload,
    loadAsset: overrides.loadAsset || loadBuilderNativeAsset,
    storage: overrides.storage || (() => createBookAssetStorage()),
    inspectRaster: overrides.inspectRaster || inspectManagedRaster,
    randomUuid: overrides.randomUuid || randomUUID,
    now: overrides.now || (() => Date.now()),
    logger: overrides.logger || console,
  };
  return async function handler(event) {
    try {
      const parsedRoute = route(event);
      if (!parsedRoute) return json(404, { error: "native_activity_component_not_found" });
      const sql = dependencies.getDatabase();
      const auth = await dependencies.authorize(event, sql);
      if (auth.error) return auth.error;
      if (parsedRoute.action === "asset-preview") {
        if (!["GET", "HEAD"].includes(event.httpMethod) || !uuidV4.test(parsedRoute.assetId)) return json(405, { error: "method_not_allowed" });
        const result = await assetResponse(dependencies, sql, parsedRoute, parsedRoute.assetId);
        if (!result) return json(404, { error: "asset_not_found" });
        const location = await dependencies.storage().signedGetUrl({ profile: "private", objectKey: result.asset.object_key, ttlSeconds: previewTtlSeconds });
        return { statusCode: 302, headers: { Location: location, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }, body: "" };
      }
      if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
      const originError = requireBuilderOrigin(event); if (originError) return originError;
      if (parsedRoute.action === "create") return createActivity(dependencies, sql, auth, parsedRoute, event);
      if (parsedRoute.action === "save") return savePair(dependencies, sql, auth, parsedRoute, event);
      if (parsedRoute.action === "asset-prepare") return prepareAsset(dependencies, sql, auth, parsedRoute, event);
      if (parsedRoute.action === "asset-finalize") return finalizeAsset(dependencies, sql, auth, parsedRoute, event);
      return json(404, { error: "native_activity_route_not_found" });
    } catch (error) {
      dependencies.logger.error("Builder native activity request failed", { code: /^[A-Za-z0-9_.-]+$/.test(String(error?.code || "")) ? error.code : "unknown" });
      return json(500, { error: "native_activity_request_failed" });
    }
  };
}

export { route as parseBuilderNativeActivityRoute };
