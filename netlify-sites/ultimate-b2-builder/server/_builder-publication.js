import { createHash } from "node:crypto";
import { createBookAssetStorage } from "../../../lib/book-assets/storage.js";
import { buildBookAssetHostedOpenResponsePublicKey, buildBookAssetHostedTeacherUiPublicKey } from "../../../lib/book-assets/object-keys.js";
import { findProductComponent } from "../../../src/data/bookProductCatalog.js";
import { normalizeUltimateB2PublicReleaseProjection, normalizeUltimateB2ReleaseSourceSnapshot, normalizeUltimateB2TeacherReleaseProjection, ULTIMATE_B2_COMPONENT_RELEASE_SCHEMA_VERSION } from "../../../src/data/ultimate-b2/componentPublication.js";
import { builderClientMutationIdPattern, builderDocumentSha256, stableBuilderJson } from "./_builder-content-security.js";
import { getBuilderSql, json, requireBuilderOrigin, requireBuilderUser } from "./_builder-auth.js";
import { authorizeBuilderPreviewRequest } from "./_builder-preview-authorization.js";
import { compileUltimateB2ComponentRelease, ultimateB2PublicationCanonicalSeeds, ultimateB2PublicationCompatibility } from "./_builder-publication-compiler.js";
import { collectUltimateB2PublicationSources, createComponentRelease, loadComponentPublicationMutation, loadComponentPublicationStatus, loadComponentRelease, publishComponentRelease } from "./_builder-publication-store.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

function route(event) {
  const pathname = String(event.path || "").split("?")[0];
  let match = pathname.match(/(?:\/builder\/api\/publication|\/\.netlify\/functions\/builder-publication)\/books\/([^/]+)\/components\/([^/]+)(?:\/(prepare|publish))?\/?$/);
  if (match) return { boundary: "builder", bookSlug: decodeURIComponent(match[1]), componentSlug: decodeURIComponent(match[2]), action: match[3] || "status" };
  match = pathname.match(/(?:\/builder\/preview\/releases|\/\.netlify\/functions\/builder-publication\/preview\/releases)\/books\/([^/]+)\/components\/([^/]+)\/([0-9a-f-]+)\/(public|teacher-ui|teacher-solution|assets)(?:\/([^/]+))?\/?$/i);
  return match ? { boundary: "preview", bookSlug: decodeURIComponent(match[1]), componentSlug: decodeURIComponent(match[2]), releaseId: match[3], action: match[4], activityId: decodeURIComponent(match[5] || "") } : null;
}

function body(event, keys) {
  if (!String(Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "").toLowerCase().startsWith("application/json")) return { error: json(415, { error: "expected_application_json" }) };
  let value; try { value = JSON.parse(event.body || "{}"); } catch { return { error: json(400, { error: "invalid_json" }) }; }
  return exact(value, keys) ? { value } : { error: json(400, { error: "invalid_request" }) };
}

function publicationComponent(bookSlug, componentSlug, writable = false) {
  const component = findProductComponent(bookSlug, componentSlug);
  if (!component?.publication?.readable || (writable && !component.publication.writable) || component.publication.compilerId !== "ultimate-b2-students-book-v1") return null;
  return component;
}

async function verifyAssets(storage, assets) {
  for (const asset of assets) {
    const objectKey = asset.role === "teacher_ui"
      ? buildBookAssetHostedTeacherUiPublicKey({ checksum: asset.sha256, extension: asset.extension })
      : buildBookAssetHostedOpenResponsePublicKey({ checksum: asset.sha256, extension: `.${asset.extension}` });
    const head = await storage.head({ profile: "public", objectKey });
    if (head.checksumSha256 !== asset.sha256 || head.byteSize < 1) throw new Error("release_asset_unavailable");
  }
}

function verifyImmutableRelease(release) {
  const compatibility = ultimateB2PublicationCompatibility();
  if (release.runtime_compatibility_sha256 !== compatibility) throw new Error("release_integrity_failed");
  const seeds = ultimateB2PublicationCanonicalSeeds();
  const sourceSnapshot = normalizeUltimateB2ReleaseSourceSnapshot(release.source_snapshot, seeds);
  const publicProjection = normalizeUltimateB2PublicReleaseProjection(release.public_projection, seeds);
  const teacherProjection = normalizeUltimateB2TeacherReleaseProjection(release.teacher_projection, seeds);
  const expectedAssets = [
    ...publicProjection.assets,
    ...Object.values(teacherProjection.ui.assets).map((asset) => ({ sha256: asset.sha256, extension: asset.extension, mediaType: asset.mediaType, role: "teacher_ui" })),
  ].sort((left, right) => `${left.sha256}.${left.extension}.${left.role}`.localeCompare(`${right.sha256}.${right.extension}.${right.role}`));
  if (!Array.isArray(release.asset_manifest) || release.asset_manifest.some((asset) => !exact(asset, ["sha256", "extension", "mediaType", "role"]))
    || stableBuilderJson([...release.asset_manifest].sort((left, right) => `${left.sha256}.${left.extension}.${left.role}`.localeCompare(`${right.sha256}.${right.extension}.${right.role}`))) !== stableBuilderJson(expectedAssets)) throw new Error("release_integrity_failed");
  if (builderDocumentSha256(sourceSnapshot) !== release.source_snapshot_sha256
    || builderDocumentSha256(publicProjection) !== release.public_projection_sha256
    || builderDocumentSha256(teacherProjection) !== release.teacher_projection_sha256
    || builderDocumentSha256({ compatibility, sourceSnapshot, publicProjection, teacherProjection }) !== release.release_sha256) throw new Error("release_integrity_failed");
}

export function createBuilderPublicationHandler(overrides = {}) {
  const dependencies = { getDatabase: overrides.getDatabase || getBuilderSql, authorize: overrides.authorize || requireBuilderUser, authorizePreview: overrides.authorizePreview || authorizeBuilderPreviewRequest, collect: overrides.collect || collectUltimateB2PublicationSources, compile: overrides.compile || compileUltimateB2ComponentRelease, create: overrides.create || createComponentRelease, publish: overrides.publish || publishComponentRelease, status: overrides.status || loadComponentPublicationStatus, loadRelease: overrides.loadRelease || loadComponentRelease, loadMutation: overrides.loadMutation || loadComponentPublicationMutation, storage: overrides.storage || (() => createBookAssetStorage()), logger: overrides.logger || console };
  return async function handler(event) {
    const parsedRoute = route(event);
    if (!parsedRoute || !publicationComponent(parsedRoute.bookSlug, parsedRoute.componentSlug, parsedRoute.action === "prepare" || parsedRoute.action === "publish")) return json(404, { error: "publication_component_not_found" });
    try {
      const sql = dependencies.getDatabase();
      if (parsedRoute.boundary === "preview") {
        const methodAllowed = event.httpMethod === "GET" || (parsedRoute.action === "assets" && event.httpMethod === "HEAD");
        if (!methodAllowed || !UUID.test(parsedRoute.releaseId)) return json(methodAllowed ? 404 : 405, { error: "release_not_found" });
        if (["teacher-ui", "teacher-solution"].includes(parsedRoute.action)) {
          const authorized = await dependencies.authorizePreview(event, sql, { action: parsedRoute.action === "teacher-ui" ? "release-teacher-ui" : "release-teacher-solution", bookSlug: parsedRoute.bookSlug, componentSlug: parsedRoute.componentSlug, releaseId: parsedRoute.releaseId, ...(parsedRoute.action === "teacher-solution" ? { activityId: parsedRoute.activityId } : {}) });
          if (!authorized) return json(401, { error: "Unauthorized" });
        }
        const release = await dependencies.loadRelease(sql, parsedRoute);
        if (!release) return json(404, { error: "release_not_found" });
        try { verifyImmutableRelease(release); } catch { return json(409, { error: "release_integrity_failed" }); }
        if (parsedRoute.action === "assets") {
          const match = parsedRoute.activityId.match(/^([a-f0-9]{64})\.(png|jpg|webp|mp3|wav|gaf)$/);
          const asset = match && release.asset_manifest?.find((candidate) => candidate.sha256 === match[1] && candidate.extension === match[2] && ["open_response_artwork", "teacher_ui"].includes(candidate.role));
          if (!asset) return json(404, { error: "release_asset_not_found" });
          const objectKey = asset.role === "teacher_ui"
            ? buildBookAssetHostedTeacherUiPublicKey({ checksum: match[1], extension: match[2] })
            : buildBookAssetHostedOpenResponsePublicKey({ checksum: match[1], extension: `.${match[2]}` });
          return { statusCode: 302, headers: { Location: dependencies.storage().publicUrl(objectKey), "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" }, body: "" };
        }
        if (parsedRoute.action === "public") return json(200, { releaseId: release.id, releaseNumber: Number(release.release_number), releaseSha256: release.release_sha256, projection: release.public_projection });
        if (parsedRoute.action === "teacher-ui") return json(200, { releaseId: release.id, releaseNumber: Number(release.release_number), document: release.teacher_projection.ui });
        const solution = release.teacher_projection?.solutions?.[parsedRoute.activityId];
        return solution ? json(200, { releaseId: release.id, releaseNumber: Number(release.release_number), activityId: parsedRoute.activityId, document: solution }) : json(404, { error: "release_teacher_solution_not_found" });
      }
      const auth = await dependencies.authorize(event, sql);
      if (auth.error) return auth.error;
      if (event.httpMethod === "GET" && parsedRoute.action === "status") {
        const [status, compiled] = await Promise.all([dependencies.status(sql, parsedRoute.bookSlug, parsedRoute.componentSlug), dependencies.collect(sql).then(dependencies.compile)]);
        return json(200, { bookSlug: parsedRoute.bookSlug, componentSlug: parsedRoute.componentSlug, currentSourceSha256: compiled.sourceSnapshotSha256, ...status, releases: status.releases.map((release) => ({ ...release, state: release.sourceSnapshotSha256 === compiled.sourceSnapshotSha256 ? "current" : "stale" })) });
      }
      if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
      const originError = requireBuilderOrigin(event); if (originError) return originError;
      if (parsedRoute.action === "prepare") {
        const parsed = body(event, ["clientMutationId", "releaseNote"]); if (parsed.error) return parsed.error;
        if (!builderClientMutationIdPattern.test(parsed.value.clientMutationId) || typeof parsed.value.releaseNote !== "string" || parsed.value.releaseNote.length > 240) return json(400, { error: "invalid_request" });
        const compiled = dependencies.compile(await dependencies.collect(sql));
        await verifyAssets(dependencies.storage(), compiled.assetManifest);
        const requestSha256 = sha256(stableBuilderJson({ sourceSnapshotSha256: compiled.sourceSnapshotSha256, releaseSha256: compiled.releaseSha256, releaseNote: parsed.value.releaseNote }));
        const result = await dependencies.create(sql, { ...parsedRoute, ...compiled, releaseSchemaVersion: ULTIMATE_B2_COMPONENT_RELEASE_SCHEMA_VERSION, requestSha256, releaseNote: parsed.value.releaseNote, clientMutationId: parsed.value.clientMutationId, builderUserId: auth.builderUser.id });
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
        const requestSha256 = sha256(stableBuilderJson({ releaseId: parsed.value.releaseId, expectedHeadRevision: parsed.value.expectedHeadRevision }));
        const replay = await dependencies.loadMutation(sql, { ...parsedRoute, clientMutationId: parsed.value.clientMutationId });
        if (!replay && candidate.is_current !== true) {
          const current = dependencies.compile(await dependencies.collect(sql));
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
      dependencies.logger.error("Builder publication request failed", { code: /^[A-Za-z0-9_.-]+$/.test(String(error?.code || "")) ? error.code : "unknown" });
      return json(error?.message === "release_asset_unavailable" ? 409 : 500, { error: error?.message === "release_asset_unavailable" ? "release_asset_unavailable" : "builder_publication_failed" });
    }
  };
}

export { route as parseBuilderPublicationRoute, publicationComponent, ultimateB2PublicationCanonicalSeeds, verifyImmutableRelease };
