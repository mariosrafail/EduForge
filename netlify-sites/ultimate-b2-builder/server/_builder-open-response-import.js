import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

import { createBookAssetStorage } from "../../../lib/book-assets/storage.js";
import {
  buildBookAssetHostedOpenResponseArchiveKey,
  buildBookAssetHostedOpenResponsePublicKey,
  buildBookAssetImportStagingKey,
} from "../../../lib/book-assets/object-keys.js";
import { OPEN_RESPONSE_IMPORT_LIMITS } from "../../../scripts/ultimate-b2/open-response-import-limits.js";
import { assertPublicBuilderDocument, builderClientMutationIdPattern, stableBuilderJson } from "./_builder-content-security.js";
import { resolveBuilderContentResource } from "./_builder-content-registry.js";
import { getBuilderSql, json, requireBuilderOrigin, requireBuilderUser } from "./_builder-auth.js";
import { authorizeBuilderPreviewRequest } from "./_builder-preview-authorization.js";
import {
  claimOpenResponseImportSession,
  commitOpenResponseImport,
  failOpenResponseImportSession,
  loadCurrentOpenResponseImport,
  prepareOpenResponseImportSession,
} from "./_builder-open-response-import-store.js";

export const openResponseImportSessionTtlSeconds = 15 * 60;
const maximumRequestBytes = 128 * 1024;
const safeBasenamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rasterExtensions = new Set([".png", ".jpg", ".jpeg"]);
const mimeByExtension = Object.freeze({ ".xml": "application/xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" });
const identity = Object.freeze({ bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", resource: "open-response" });

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const header = (event, name) => Object.entries(event?.headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] || "";
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

function parseJsonBody(event, keys) {
  const encoded = String(event?.body || "");
  const bytes = event?.isBase64Encoded ? Buffer.from(encoded, "base64") : Buffer.from(encoded, "utf8");
  if (bytes.length > maximumRequestBytes) return { error: json(413, { error: "request_too_large" }) };
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { return { error: json(400, { error: "invalid_json" }) }; }
  if (!exactKeys(value, keys)) return { error: json(400, { error: "invalid_request" }) };
  return { value };
}

function safeFilename(value) {
  const name = String(value || "");
  if (!safeBasenamePattern.test(name) || name !== path.basename(name) || /^(?:[a-z]:|\\\\|\/)|%2f|%5c|[\u0000-\u001f\u007f]/i.test(name)) throw new Error("invalid_filename");
  return name;
}

function normalizePrepareFiles(files) {
  if (!Array.isArray(files) || files.length < 2 || files.length > OPEN_RESPONSE_IMPORT_LIMITS.files) throw new Error("invalid_file_count");
  const names = new Set();
  let total = 0;
  const normalized = files.map((file) => {
    if (!exactKeys(file, ["name", "size", "type"])) throw new Error("invalid_file_descriptor");
    const name = safeFilename(file.name);
    const lower = name.toLowerCase();
    if (names.has(lower)) throw new Error("duplicate_filename");
    names.add(lower);
    if (!Number.isSafeInteger(file.size) || file.size < 1) throw new Error("invalid_declared_size");
    const parsed = path.parse(name);
    const base = parsed.name.toLowerCase();
    const extension = parsed.ext.toLowerCase();
    const role = base === "obj_params" ? "obj_params" : base === "ebook_obj_params" ? "ebook_obj_params" : "raster";
    const maximum = role === "raster" ? OPEN_RESPONSE_IMPORT_LIMITS.rasterBytes : OPEN_RESPONSE_IMPORT_LIMITS.xmlBytes;
    if ((role === "raster" && !rasterExtensions.has(extension)) || (role !== "raster" && extension !== ".xml")) throw new Error("unsupported_file_type");
    if (file.size > maximum) throw new Error("declared_file_too_large");
    const declaredType = String(file.type || "").toLowerCase();
    if (declaredType && declaredType !== mimeByExtension[extension] && !(extension === ".xml" && ["text/xml", "application/xml"].includes(declaredType))) throw new Error("declared_mime_mismatch");
    total += file.size;
    return { name, size: file.size, type: mimeByExtension[extension], role };
  });
  if (normalized.filter((file) => file.role === "obj_params").length !== 1 || normalized.filter((file) => file.role === "ebook_obj_params").length !== 1) throw new Error("required_xml_missing_or_duplicate");
  if (total > OPEN_RESPONSE_IMPORT_LIMITS.totalBytes) throw new Error("declared_total_too_large");
  return normalized;
}

function publicAssetPath(checksum, extension) {
  return `/preview/open-response-assets/${checksum}${extension}`;
}

function safeFailureCode(error) {
  const message = String(error?.message || "import_failed");
  if (/^[a-z0-9_]{3,64}$/.test(message)) return message;
  if (/question topology|question identity/i.test(message)) return "question_topology_mismatch";
  if (/missing from the supplied source bundle/i.test(message)) return "referenced_raster_missing";
  if (/unexpected unreferenced raster/i.test(message)) return "unexpected_raster";
  if (/forbidden XML/i.test(message)) return "xml_security_rejected";
  if (/malformed XML/i.test(message)) return "xml_parse_failed";
  if (/raster|sharp|image/i.test(message)) return "invalid_raster";
  return "publisher_import_rejected";
}

async function cleanupStaging(storage, descriptors) {
  await Promise.allSettled((descriptors || []).map((descriptor) => storage.delete({ profile: "private", objectKey: descriptor.objectKey })));
}

async function uploadAuthoritativeOutputs(storage, imported, files) {
  const publicAssets = [];
  for (const asset of imported.assets) {
    const extension = path.extname(asset.repositoryPath).toLowerCase();
    const objectKey = buildBookAssetHostedOpenResponsePublicKey({ checksum: asset.sha256, extension });
    const result = await storage.upload({ profile: "public", objectKey, body: asset.bytes, contentType: mimeByExtension[extension], checksumSha256: asset.sha256, byteSize: asset.bytes.length });
    publicAssets.push({ checksumSha256: asset.sha256, byteSize: asset.bytes.length, contentType: mimeByExtension[extension], reused: result.reused });
  }
  const archiveFiles = [];
  for (const file of files) {
    const checksum = sha256(file.bytes);
    const extension = path.extname(file.name).toLowerCase();
    const objectKey = buildBookAssetHostedOpenResponseArchiveKey({ activityId: imported.activityId, fingerprint: imported.fingerprint, fileChecksum: checksum, extension });
    await storage.upload({ profile: "archive", objectKey, body: file.bytes, contentType: mimeByExtension[extension], checksumSha256: checksum, byteSize: file.bytes.length });
    archiveFiles.push({ name: file.name, checksumSha256: checksum, byteSize: file.bytes.length, objectKey });
  }
  return { publicAssets, archiveManifest: { schemaVersion: "1.0", fingerprint: imported.fingerprint, files: archiveFiles } };
}

function importJson(statusCode, body) {
  return json(statusCode, body, { "X-Content-Type-Options": "nosniff" });
}

function safeDiagnosticCode(error) {
  return /^[A-Za-z0-9_.-]{1,64}$/.test(String(error?.code || "")) ? error.code : "unknown";
}

function unavailable(logger, category, error) {
  logger.error("Builder Open Response import dependency unavailable", { category, code: safeDiagnosticCode(error) });
  return importJson(503, { error: `open_response_${category}_unavailable` });
}

async function loadAuthoritativeImporter() {
  const module = await import("../../../scripts/ultimate-b2/open-response-hosted-import.js");
  return module.importUltimateB2HostedOpenResponseBundle;
}

export function createBuilderOpenResponseImportHandler(overrides = {}) {
  const dependencies = {
    getDatabase: overrides.getDatabase || getBuilderSql,
    authorize: overrides.authorize || requireBuilderUser,
    authorizePreview: overrides.authorizePreview || authorizeBuilderPreviewRequest,
    resolveResource: overrides.resolveResource || resolveBuilderContentResource,
    storage: overrides.storage || (() => createBookAssetStorage()),
    prepare: overrides.prepare || prepareOpenResponseImportSession,
    claim: overrides.claim || claimOpenResponseImportSession,
    commit: overrides.commit || commitOpenResponseImport,
    fail: overrides.fail || failOpenResponseImportSession,
    loadCurrent: overrides.loadCurrent || loadCurrentOpenResponseImport,
    importer: overrides.importer || null,
    loadImporter: overrides.loadImporter || loadAuthoritativeImporter,
    now: overrides.now || (() => Date.now()),
    randomUuid: overrides.randomUuid || randomUUID,
    logger: overrides.logger || console,
  };

  return async function builderOpenResponseImportHandler(event) {
    const pathname = String(event?.path || "").split("?")[0];
    const publicImportMatch = pathname.match(/\/preview\/open-response-import\/([a-z0-9-]+)\/?$/);
    const teacherMatch = pathname.match(/\/preview\/open-response-teacher\/([a-z0-9-]+)\/?$/);
    const assetMatch = pathname.match(/\/preview\/open-response-assets\/([a-f0-9]{64})\.(png|jpg|webp)\/?$/);
    let sql;
    try {
      if (publicImportMatch || teacherMatch) {
        if (event.httpMethod !== "GET") return importJson(405, { error: "method_not_allowed" });
        const activityId = publicImportMatch?.[1] || teacherMatch[1];
        const resource = await dependencies.resolveResource(identity.bookSlug, identity.componentSlug, identity.resource, activityId);
        if (!resource) return importJson(404, { error: "import_not_found" });
        sql = dependencies.getDatabase();
        if (teacherMatch && !(await dependencies.authorizePreview(event, sql, { action: "open-response-teacher", bookSlug: identity.bookSlug, componentSlug: identity.componentSlug, activityId }))) return importJson(401, { error: "Unauthorized" });
        const current = await dependencies.loadCurrent(sql, activityId);
        if (!current) return importJson(404, { error: "import_not_found" });
        const document = publicImportMatch ? current.publicProjection : current.teacherProjection;
        if (publicImportMatch) assertPublicBuilderDocument(document);
        return importJson(200, { activityId, revision: current.revision, fingerprint: current.fingerprint, document });
      }
      if (assetMatch) {
        if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") return importJson(405, { error: "method_not_allowed" });
        let storage;
        try { storage = dependencies.storage(); } catch (error) { return unavailable(dependencies.logger, "storage", error); }
        const objectKey = buildBookAssetHostedOpenResponsePublicKey({ checksum: assetMatch[1], extension: `.${assetMatch[2]}` });
        try { await storage.head({ profile: "public", objectKey }); } catch { return importJson(404, { error: "asset_not_found" }); }
        return { statusCode: 302, headers: { Location: storage.publicUrl(objectKey), "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" }, body: "" };
      }

      if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
      sql = dependencies.getDatabase();
      const auth = await dependencies.authorize(event, sql);
      if (auth.error) return auth.error;
      const statusMatch = pathname.match(/\/(?:builder\/api\/open-response-import|\.netlify\/functions\/builder-open-response-import)\/status\/([a-z0-9-]+)\/?$/);
      if (statusMatch) {
        if (event.httpMethod !== "GET") return importJson(405, { error: "method_not_allowed" });
        const resource = await dependencies.resolveResource(identity.bookSlug, identity.componentSlug, identity.resource, statusMatch[1]);
        if (!resource) return importJson(404, { error: "unsupported_activity" });
        const current = await dependencies.loadCurrent(sql, statusMatch[1]);
        return importJson(200, { activityId: statusMatch[1], revision: current?.revision || 0, fingerprint: current?.fingerprint || null, updatedAt: current?.updatedAt || null });
      }
      if (event.httpMethod !== "POST") return importJson(405, { error: "method_not_allowed" });
      const originError = requireBuilderOrigin(event);
      if (originError) return originError;
      if (!String(header(event, "content-type")).toLowerCase().startsWith("application/json")) return importJson(415, { error: "expected_application_json" });

      if (/\/prepare\/?$/.test(pathname)) {
        const parsed = parseJsonBody(event, ["activityId", "expectedRevision", "clientMutationId", "files"]);
        if (parsed.error) return parsed.error;
        const { activityId, expectedRevision, clientMutationId } = parsed.value;
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return importJson(400, { error: "invalid_expected_revision" });
        if (!builderClientMutationIdPattern.test(String(clientMutationId || ""))) return importJson(400, { error: "invalid_client_mutation_id" });
        const resource = await dependencies.resolveResource(identity.bookSlug, identity.componentSlug, identity.resource, activityId);
        if (!resource) return importJson(404, { error: "unsupported_activity" });
        let files;
        try { files = normalizePrepareFiles(parsed.value.files); } catch (error) { return importJson(400, { error: safeFailureCode(error) }); }
        const uploadId = dependencies.randomUuid();
        const descriptors = files.map((file) => {
          const fileId = dependencies.randomUuid();
          return { ...file, fileId, objectKey: buildBookAssetImportStagingKey({ ...identity, activityId, uploadId, fileId }) };
        });
        const requestSha256 = sha256(stableBuilderJson({ activityId, expectedRevision, files }));
        let prepared;
        try {
          prepared = await dependencies.prepare(sql, { ...identity, activityId, expectedRevision, clientMutationId, uploadId, requestSha256, fileDescriptors: descriptors, builderUserId: auth.builderUser.id, expiresAt: new Date(dependencies.now() + openResponseImportSessionTtlSeconds * 1000).toISOString() });
        } catch (error) {
          return unavailable(dependencies.logger, "schema", error);
        }
        if (prepared.outcome === "revision_conflict") return importJson(409, { error: "revision_conflict", currentRevision: prepared.currentRevision });
        if (prepared.outcome === "mutation_id_conflict") return importJson(409, { error: "mutation_id_conflict", currentRevision: prepared.currentRevision });
        if (!new Set(["prepared", "idempotent"]).has(prepared.outcome)) return importJson(prepared.outcome === "resource_not_found" ? 404 : 400, { error: prepared.outcome });
        if (prepared.state !== "prepared") return importJson(409, { error: "invalid_session_state", state: prepared.state });
        const storedDescriptors = prepared.fileDescriptors;
        let uploads;
        try {
          const storage = dependencies.storage();
          uploads = await Promise.all(storedDescriptors.map(async (descriptor) => ({ fileId: descriptor.fileId, name: descriptor.name, size: descriptor.size, role: descriptor.role, authorization: await storage.signedPutUrl({ profile: "private", objectKey: descriptor.objectKey, contentType: descriptor.type, ttlSeconds: openResponseImportSessionTtlSeconds }) })));
        } catch (error) {
          return unavailable(dependencies.logger, "storage", error);
        }
        return importJson(200, { uploadId: prepared.uploadId, activityId, expectedRevision, expiresIn: openResponseImportSessionTtlSeconds, idempotent: prepared.outcome === "idempotent", uploads });
      }

      if (/\/finalize\/?$/.test(pathname)) {
        const parsed = parseJsonBody(event, ["uploadId", "expectedRevision", "clientMutationId"]);
        if (parsed.error) return parsed.error;
        const { uploadId, expectedRevision, clientMutationId } = parsed.value;
        if (!uuidV4Pattern.test(String(uploadId || "")) || !builderClientMutationIdPattern.test(String(clientMutationId || "")) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return importJson(400, { error: "invalid_finalize_identity" });
        const claimed = await dependencies.claim(sql, { uploadId, expectedRevision, clientMutationId, builderUserId: auth.builderUser.id });
        if (claimed.outcome === "idempotent") {
          const current = await dependencies.loadCurrent(sql, claimed.activityId);
          return importJson(200, { activityId: claimed.activityId, revision: current.revision, fingerprint: current.fingerprint, idempotent: true });
        }
        if (claimed.outcome === "revision_conflict") return importJson(409, { error: "revision_conflict", currentRevision: claimed.currentRevision });
        if (claimed.outcome === "finalize_in_progress") return importJson(409, { error: "finalize_in_progress" });
        if (claimed.outcome !== "claimed") return importJson(claimed.outcome === "session_not_found" ? 404 : claimed.outcome === "expired_session" ? 410 : 409, { error: claimed.outcome });
        const resource = await dependencies.resolveResource(identity.bookSlug, identity.componentSlug, identity.resource, claimed.activityId);
        if (!resource) return importJson(404, { error: "unsupported_activity" });
        const descriptors = claimed.fileDescriptors;
        const storage = dependencies.storage();
        try {
          let total = 0;
          for (const descriptor of descriptors) {
            const head = await storage.head({ profile: "private", objectKey: descriptor.objectKey });
            const maximum = descriptor.role === "raster" ? OPEN_RESPONSE_IMPORT_LIMITS.rasterBytes : OPEN_RESPONSE_IMPORT_LIMITS.xmlBytes;
            if (head.byteSize !== descriptor.size || head.byteSize < 1 || head.byteSize > maximum) throw new Error("actual_object_size_mismatch");
            total += head.byteSize;
          }
          if (total > OPEN_RESPONSE_IMPORT_LIMITS.totalBytes) throw new Error("actual_total_too_large");
          const files = await Promise.all(descriptors.map(async (descriptor) => ({ name: descriptor.name, bytes: await storage.download({ profile: "private", objectKey: descriptor.objectKey }) })));
          files.forEach((file, index) => { if (file.bytes.length !== descriptors[index].size) throw new Error("actual_object_size_mismatch"); });
          const expectedQuestionIds = resource.baseline().questions.map((question) => question.id);
          const importer = dependencies.importer || await dependencies.loadImporter();
          const imported = await importer({ activityId: claimed.activityId, files, expectedQuestionIds, assetPathFor: publicAssetPath });
          assertPublicBuilderDocument(imported.publicProjection);
          const persisted = await uploadAuthoritativeOutputs(storage, imported, files);
          const committed = await dependencies.commit(sql, { uploadId, expectedRevision, clientMutationId, fingerprint: imported.fingerprint, publicProjection: imported.publicProjection, teacherProjection: imported.teacherProjection, archiveManifest: persisted.archiveManifest, builderUserId: auth.builderUser.id });
          if (committed.outcome === "revision_conflict") throw Object.assign(new Error("revision_conflict"), { currentRevision: committed.currentRevision });
          if (!["saved", "idempotent"].includes(committed.outcome)) throw new Error(committed.outcome);
          await cleanupStaging(storage, descriptors);
          return importJson(200, { activityId: claimed.activityId, revision: committed.revision, fingerprint: committed.fingerprint, importedAssets: persisted.publicAssets.length, idempotent: committed.outcome === "idempotent" });
        } catch (error) {
          await Promise.allSettled([dependencies.fail(sql, { uploadId, builderUserId: auth.builderUser.id, failureCode: safeFailureCode(error) }), cleanupStaging(storage, descriptors)]);
          if (error?.message === "revision_conflict") return importJson(409, { error: "revision_conflict", currentRevision: error.currentRevision });
          return importJson(400, { error: safeFailureCode(error) });
        }
      }
      return importJson(404, { error: "import_route_not_found" });
    } catch (error) {
      dependencies.logger.error("Builder Open Response import request failed", { category: "unexpected", code: /^[A-Za-z0-9_.-]{1,64}$/.test(String(error?.code || "")) ? error.code : "unknown" });
      return importJson(500, { error: "open_response_import_failed" });
    }
  };
}
