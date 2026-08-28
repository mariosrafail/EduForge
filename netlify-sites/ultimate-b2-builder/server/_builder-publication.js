import { createHash } from "node:crypto";
import { createBookAssetStorage } from "../../../lib/book-assets/storage.js";
import { componentPublicationAssetStorageTarget } from "../../../lib/book-assets/publication-asset-storage.js";
import { findProductComponent } from "../../../src/data/bookProductCatalog.js";
import { componentPublicationAssetRolePolicy } from "../../../src/data/ultimate-b2/componentPublicationAssetRoles.js";
import { builderClientMutationIdPattern, stableBuilderJson } from "./_builder-content-security.js";
import { getBuilderSql, json, requireBuilderOrigin, requireBuilderUser } from "./_builder-auth.js";
import { authorizeBuilderPreviewRequest } from "./_builder-preview-authorization.js";
import { ComponentPublicationAssetError, materializeNativeReleaseAssets } from "./_builder-publication-assets.js";
import { resolvePublicationCompiler, verifyImmutableComponentRelease } from "./_builder-publication-compilers.js";
import { ultimateB2PublicationCanonicalSeeds } from "./_builder-publication-compiler.js";
import { createComponentRelease, loadComponentPublicationMutation, loadComponentPublicationStatus, loadComponentRelease, publicationV2DatabaseReady, publishComponentRelease } from "./_builder-publication-store.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

function route(event) {
  const pathname = String(event.path || "").split("?")[0];
  let match = pathname.match(/(?:\/builder\/api\/publication|\/\.netlify\/functions\/builder-publication)\/books\/([^/]+)\/components\/([^/]+)(?:\/(prepare|publish))?\/?$/);
  if (match) return { boundary: "builder", bookSlug: decodeURIComponent(match[1]), componentSlug: decodeURIComponent(match[2]), action: match[3] || "status" };
  match = pathname.match(/(?:\/builder\/preview\/releases|\/\.netlify\/functions\/builder-publication\/preview\/releases)\/books\/([^/]+)\/components\/([^/]+)\/([0-9a-f-]+)\/(public|teacher-ui|teacher-solution|native-teacher|assets)(?:\/([^/]+))?\/?$/i);
  return match ? { boundary: "preview", bookSlug: decodeURIComponent(match[1]), componentSlug: decodeURIComponent(match[2]), releaseId: match[3], action: match[4], activityId: decodeURIComponent(match[5] || "") } : null;
}

function body(event, keys) {
  if (!String(Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "").toLowerCase().startsWith("application/json")) return { error: json(415, { error: "expected_application_json" }) };
  let value; try { value = JSON.parse(event.body || "{}"); } catch { return { error: json(400, { error: "invalid_json" }) }; }
  return exact(value, keys) ? { value } : { error: json(400, { error: "invalid_request" }) };
}

function publicationComponent(bookSlug, componentSlug, writable = false) {
  const component = findProductComponent(bookSlug, componentSlug);
  if (!component?.publication?.readable || (writable && !component.publication.writable) || !resolvePublicationCompiler(component.publication.compilerId)) return null;
  return component;
}

const assetSourceIdentity = (asset) => `${asset.sha256}.${asset.extension}.${asset.role}`;

export async function verifyAssets(storage, assets, nativeAssetSources = [], { bookSlug, componentSlug }) {
  const privateSources = new Map(nativeAssetSources.map((source) => [assetSourceIdentity(source.descriptor), source]));
  for (const asset of assets) {
    const policy = componentPublicationAssetRolePolicy(asset.role);
    const source = privateSources.get(assetSourceIdentity(asset));
    const target = policy && componentPublicationAssetStorageTarget({ bookSlug, componentSlug, ...asset });
    const diagnostic = (failureClass) => new ComponentPublicationAssetError({
      assetId: source?.row?.id || asset.sha256,
      role: asset.role,
      stage: "verify",
      failureClass,
    });
    if (!policy || !target) throw diagnostic("unsupported_asset_role");
    if (policy.materialized === true && !source) throw diagnostic("materialized_source_missing");
    let head;
    try { head = await storage.head({ profile: target.profile, objectKey: target.objectKey }); }
    catch { throw diagnostic("immutable_object_missing"); }
    if (head.checksumSha256 !== asset.sha256) throw diagnostic("immutable_checksum_mismatch");
    if (policy.materialized === true && head.byteSize !== Number(source.row.byte_size)) throw diagnostic("immutable_byte_size_mismatch");
    if (policy.materialized !== true && (!Number.isSafeInteger(Number(head.byteSize)) || Number(head.byteSize) < 1)) throw diagnostic("immutable_byte_size_invalid");
    if (head.contentType && head.contentType !== asset.mediaType) throw diagnostic("immutable_media_type_mismatch");
  }
}

function verifyImmutableRelease(release) { return verifyImmutableComponentRelease(release); }

export function createBuilderPublicationHandler(overrides = {}) {
  const dependencies = {
    getDatabase: overrides.getDatabase || getBuilderSql,
    authorize: overrides.authorize || requireBuilderUser,
    authorizePreview: overrides.authorizePreview || authorizeBuilderPreviewRequest,
    collect: overrides.collect || null,
    compile: overrides.compile || null,
    create: overrides.create || createComponentRelease,
    publish: overrides.publish || publishComponentRelease,
    status: overrides.status || loadComponentPublicationStatus,
    loadRelease: overrides.loadRelease || loadComponentRelease,
    loadMutation: overrides.loadMutation || loadComponentPublicationMutation,
    v2Ready: overrides.v2Ready || (overrides.compile ? async () => true : publicationV2DatabaseReady),
    materialize: overrides.materialize || materializeNativeReleaseAssets,
    storage: overrides.storage || (() => createBookAssetStorage()),
    logger: overrides.logger || console,
  };
  return async function handler(event) {
    const parsedRoute = route(event);
    const component = parsedRoute && publicationComponent(parsedRoute.bookSlug, parsedRoute.componentSlug, parsedRoute.action === "prepare" || parsedRoute.action === "publish");
    if (!component) return json(404, { error: "publication_component_not_found" });
    try {
      const sql = dependencies.getDatabase();
      if (parsedRoute.boundary === "preview") {
        const methodAllowed = event.httpMethod === "GET" || (parsedRoute.action === "assets" && event.httpMethod === "HEAD");
        if (!methodAllowed || !UUID.test(parsedRoute.releaseId)) return json(methodAllowed ? 404 : 405, { error: "release_not_found" });
        const previewAction = { public: "release-public", assets: "release-asset", "teacher-ui": "release-teacher-ui", "teacher-solution": "release-teacher-solution", "native-teacher": "release-native-teacher" }[parsedRoute.action];
        const authorized = await dependencies.authorizePreview(event, sql, { action: previewAction, bookSlug: parsedRoute.bookSlug, componentSlug: parsedRoute.componentSlug, releaseId: parsedRoute.releaseId, ...(["teacher-solution", "native-teacher"].includes(parsedRoute.action) ? { activityId: parsedRoute.activityId } : {}) });
        if (!authorized) return json(401, { error: "Unauthorized" });
        const release = await dependencies.loadRelease(sql, parsedRoute);
        if (!release) return json(404, { error: "release_not_found" });
        let verified; try { verified = verifyImmutableRelease(release); } catch { return json(409, { error: "release_integrity_failed" }); }
        if (parsedRoute.action === "assets") {
          const match = parsedRoute.activityId.match(/^([a-f0-9]{64})\.(png|jpg|webp|mp3|mp4|pdf|wav|gaf)$/);
          const asset = match && release.asset_manifest?.find((candidate) => candidate.sha256 === match[1] && candidate.extension === match[2] && componentPublicationAssetRolePolicy(candidate.role));
          if (!asset) return json(404, { error: "release_asset_not_found" });
          const target = componentPublicationAssetStorageTarget({ bookSlug: parsedRoute.bookSlug, componentSlug: parsedRoute.componentSlug, ...asset });
          if (!target) return json(404, { error: "release_asset_not_found" });
          if (!target.public) {
            const location = await dependencies.storage().signedGetUrl({ profile: target.profile, objectKey: target.objectKey });
            return { statusCode: 302, headers: { Location: location, "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" }, body: "" };
          }
          return { statusCode: 302, headers: { Location: target.publicPath, "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" }, body: "" };
        }
        if (parsedRoute.action === "public") return json(200, { releaseId: release.id, releaseNumber: Number(release.release_number), releaseSha256: release.release_sha256, compatibility: release.runtime_compatibility_sha256, compilerId: release.compiler_id, releaseSchemaVersion: release.release_schema_version, projection: verified.publicProjection }, { "Cache-Control": "private, no-store", Vary: "Cookie" });
        if (parsedRoute.action === "teacher-ui") return json(200, { releaseId: release.id, releaseNumber: Number(release.release_number), document: release.teacher_projection.ui });
        if (parsedRoute.action === "native-teacher") {
          const native = verified.teacherProjection?.nativeActivities?.[parsedRoute.activityId];
          return native ? json(200, { releaseId: release.id, releaseNumber: Number(release.release_number), activityId: parsedRoute.activityId, kind: native.kind, document: native.document }, { "Cache-Control": "private, no-store", Vary: "Cookie" }) : json(404, { error: "release_native_teacher_not_found" });
        }
        const solution = release.teacher_projection?.solutions?.[parsedRoute.activityId];
        return solution ? json(200, { releaseId: release.id, releaseNumber: Number(release.release_number), activityId: parsedRoute.activityId, document: solution }) : json(404, { error: "release_teacher_solution_not_found" });
      }
      const auth = await dependencies.authorize(event, sql);
      if (auth.error) return auth.error;
      const configuredCompiler = resolvePublicationCompiler(component.publication.compilerId);
      const collectAndCompile = async () => {
        const collected = dependencies.collect ? await dependencies.collect(sql) : await configuredCompiler.collect(sql);
        return dependencies.compile ? dependencies.compile(collected) : configuredCompiler.compile(collected);
      };
      if (event.httpMethod === "GET" && parsedRoute.action === "status") {
        const [status, compiled] = await Promise.all([dependencies.status(sql, parsedRoute.bookSlug, parsedRoute.componentSlug), collectAndCompile()]);
        return json(200, { bookSlug: parsedRoute.bookSlug, componentSlug: parsedRoute.componentSlug, compilerId: configuredCompiler.compilerId, releaseSchemaVersion: configuredCompiler.releaseSchemaVersion, currentSourceSha256: compiled.sourceSnapshotSha256, ...status, releases: status.releases.map((release) => ({ ...release, state: release.sourceSnapshotSha256 === compiled.sourceSnapshotSha256 ? "current" : "stale" })) });
      }
      if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
      const originError = requireBuilderOrigin(event); if (originError) return originError;
      if (parsedRoute.action === "prepare") {
        const parsed = body(event, ["clientMutationId", "releaseNote"]); if (parsed.error) return parsed.error;
        if (!builderClientMutationIdPattern.test(parsed.value.clientMutationId) || typeof parsed.value.releaseNote !== "string" || parsed.value.releaseNote.length > 240) return json(400, { error: "invalid_request" });
        if (configuredCompiler.releaseSchemaVersion === "2.0" && !await dependencies.v2Ready(sql)) return json(409, { error: "publication_schema_unavailable" });
        const compiled = await collectAndCompile();
        const storage = dependencies.storage();
        await dependencies.materialize(storage, { bookSlug: parsedRoute.bookSlug, componentSlug: parsedRoute.componentSlug, nativeAssetSources: compiled.nativeAssetSources || [] });
        await verifyAssets(storage, compiled.assetManifest, compiled.nativeAssetSources || [], parsedRoute);
        const requestSha256 = sha256(stableBuilderJson({ sourceSnapshotSha256: compiled.sourceSnapshotSha256, releaseSha256: compiled.releaseSha256, releaseNote: parsed.value.releaseNote }));
        const result = await dependencies.create(sql, { ...parsedRoute, ...compiled, releaseSchemaVersion: configuredCompiler.releaseSchemaVersion, requestSha256, releaseNote: parsed.value.releaseNote, clientMutationId: parsed.value.clientMutationId, builderUserId: auth.builderUser.id });
        if (result.outcome === "mutation_id_conflict") return json(409, { error: result.outcome });
        if (!["created", "idempotent"].includes(result.outcome)) return json(result.outcome === "component_not_found" ? 404 : 400, { error: result.outcome });
        return json(200, { ...result, idempotent: result.outcome === "idempotent", sourceSnapshot: compiled.sourceSnapshot });
      }
      if (parsedRoute.action === "publish") {
        const parsed = body(event, ["releaseId", "expectedHeadRevision", "clientMutationId"]); if (parsed.error) return parsed.error;
        if (!UUID.test(parsed.value.releaseId) || !Number.isSafeInteger(parsed.value.expectedHeadRevision) || parsed.value.expectedHeadRevision < 0 || !builderClientMutationIdPattern.test(parsed.value.clientMutationId)) return json(400, { error: "invalid_request" });
        const candidate = await dependencies.loadRelease(sql, { ...parsedRoute, releaseId: parsed.value.releaseId });
        if (!candidate) return json(404, { error: "release_not_found" });
        try { verifyImmutableRelease(candidate); } catch { return json(409, { error: "release_integrity_failed" }); }
        if (candidate.compiler_id !== component.publication.compilerId || candidate.release_schema_version !== configuredCompiler.releaseSchemaVersion) return json(409, { error: "publication_compiler_mismatch" });
        if (configuredCompiler.releaseSchemaVersion === "2.0" && !await dependencies.v2Ready(sql)) return json(409, { error: "publication_schema_unavailable" });
        const requestSha256 = sha256(stableBuilderJson({ releaseId: parsed.value.releaseId, expectedHeadRevision: parsed.value.expectedHeadRevision }));
        const replay = await dependencies.loadMutation(sql, { ...parsedRoute, clientMutationId: parsed.value.clientMutationId });
        if (!replay && candidate.is_current !== true) {
          const current = await collectAndCompile();
          if (candidate.source_snapshot_sha256 !== current.sourceSnapshotSha256) return json(409, { error: "stale_release_preview" });
        }
        const result = await dependencies.publish(sql, { ...parsedRoute, ...parsed.value, requestSha256, builderUserId: auth.builderUser.id });
        if (["stale_release_preview", "head_conflict", "mutation_id_conflict"].includes(result.outcome)) return json(409, { error: result.outcome, ...result });
        if (result.outcome === "release_not_found") return json(404, { error: result.outcome });
        if (!["published", "idempotent", "already_active"].includes(result.outcome)) return json(400, { error: result.outcome });
        return json(200, { ...result, idempotent: ["idempotent", "already_active"].includes(result.outcome) });
      }
      return json(404, { error: "publication_route_not_found" });
    } catch (error) {
      dependencies.logger.error("Builder publication request failed", {
        code: /^[A-Za-z0-9_.-]+$/.test(String(error?.code || "")) ? error.code : "unknown",
        ...(error instanceof ComponentPublicationAssetError ? {
          assetId: error.assetId,
          assetRole: error.assetRole,
          assetStage: error.assetStage,
          failureClass: error.failureClass,
        } : {}),
      });
      const safeCode = ["native_activity_not_found", "native_activity_pair_invalid", "native_activity_not_ready", "native_activity_asset_invalid", "release_asset_unavailable"].includes(error?.code || error?.message) ? (error.code || error.message) : null;
      return safeCode ? json(409, { error: safeCode, ...(error.activityId ? { activityId: error.activityId } : {}), ...(error.issues?.length ? { issues: error.issues } : {}) }) : json(500, { error: "builder_publication_failed" });
    }
  };
}

export { route as parseBuilderPublicationRoute, publicationComponent, ultimateB2PublicationCanonicalSeeds, verifyImmutableRelease };
