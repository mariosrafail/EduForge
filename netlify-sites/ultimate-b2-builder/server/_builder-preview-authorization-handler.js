import { getBuilderSql, json, requireBuilderOrigin, requireBuilderUser } from "./_builder-auth.js";
import { findProductComponent } from "../../../src/data/bookProductCatalog.js";
import { verifyProductReleaseEnvelope } from "./_builder-product-publication-domain.js";
import { loadProductRelease } from "./_builder-product-publication-store.js";
import { loadComponentRelease } from "./_builder-publication-store.js";
import { verifyImmutableComponentRelease } from "./_builder-publication-compilers.js";
import { inspectBuilderPreviewAuthorizationScope, issueBuilderPreviewAuthorization, issueBuilderReleaseMemberAuthorization, normalizeBuilderPreviewAuthorizationIntent } from "./_builder-preview-authorization.js";

const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

export function createBuilderPreviewAuthorizationHandler(overrides = {}) {
  const dependencies = {
    getDatabase: overrides.getDatabase || getBuilderSql,
    authorize: overrides.authorize || requireBuilderUser,
    normalizeIntent: overrides.normalizeIntent || normalizeBuilderPreviewAuthorizationIntent,
    inspect: overrides.inspect || inspectBuilderPreviewAuthorizationScope,
    issue: overrides.issue || issueBuilderPreviewAuthorization,
    issueReleaseMember: overrides.issueReleaseMember || issueBuilderReleaseMemberAuthorization,
    loadProductRelease: overrides.loadProductRelease || loadProductRelease,
    loadComponentRelease: overrides.loadComponentRelease || loadComponentRelease,
    verifyComponentRelease: overrides.verifyComponentRelease || verifyImmutableComponentRelease,
    logger: overrides.logger || console,
  };

  const verifiedMember = async (sql, { bookSlug, componentSlug, productReleaseId, componentReleaseId = null, memberSha256 = null }) => {
    const family = await dependencies.loadProductRelease(sql, { bookSlug, productReleaseId });
    if (!family) return { error: "product_release_not_found" };
    let envelope;
    try {
      envelope = verifyProductReleaseEnvelope({
        id: family.id, number: family.number, bookSlug: family.bookSlug, compilerId: family.compilerId,
        releaseSchemaVersion: family.releaseSchemaVersion, sourceSnapshotSha256: family.sourceSnapshotSha256,
        releaseSha256: family.releaseSha256, releaseNote: family.releaseNote, createdAt: new Date(family.createdAt).toISOString(),
        members: family.members.map((member) => ({
          componentSlug: member.componentSlug, order: member.order, status: member.status,
          componentReleaseId: member.componentReleaseId, compilerId: member.compilerId,
          releaseSchemaVersion: member.releaseSchemaVersion, releaseSha256: member.releaseSha256,
          compatibility: member.compatibility, memberSha256: member.memberSha256, unavailableReason: member.unavailableReason,
        })),
      });
    } catch { return { error: "release_integrity_failed" }; }
    const member = envelope.members.find((candidate) => candidate.componentSlug === componentSlug);
    if (!member) return { error: "release_member_not_found" };
    if ((componentReleaseId && member.componentReleaseId !== String(componentReleaseId).toLowerCase())
      || (memberSha256 && member.memberSha256 !== memberSha256)) return { error: "release_integrity_failed" };
    if (member.status !== "included") return { error: "release_member_unavailable", family, member };
    const release = await dependencies.loadComponentRelease(sql, { bookSlug, componentSlug, releaseId: member.componentReleaseId });
    if (!release || release.id !== member.componentReleaseId || release.compiler_id !== member.compilerId || release.release_schema_version !== member.releaseSchemaVersion
      || release.release_sha256 !== member.releaseSha256 || release.runtime_compatibility_sha256 !== member.compatibility) return { error: "release_integrity_failed" };
    try { dependencies.verifyComponentRelease(release); } catch { return { error: "release_integrity_failed" }; }
    return { family, member, release };
  };

  return async function handler(event) {
    try {
      if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
      const releaseFamily = /(?:\/builder\/preview\/authorization\/release-family|\/preview\/authorization\/release-family|\/\.netlify\/functions\/builder-preview-authorization\/preview\/authorization\/release-family)$/.test(String(event.path || ""));
      if (releaseFamily) {
        if (event.httpMethod !== "GET") return json(405, { error: "method_not_allowed" });
        const query = event.queryStringParameters || {};
        const requested = { bookSlug: String(query.bookSlug || ""), componentSlug: String(query.componentSlug || ""), productReleaseId: String(query.productReleaseId || ""), releaseId: String(query.componentReleaseId || ""), memberSha256: String(query.memberSha256 || "") };
        const decision = dependencies.inspect(event, { action: "release-family", ...requested });
        if (!decision.authorized || decision.scope?.version !== 3) return json(401, { error: "release_member_authorization_denied", code: decision.code });
        const sql = dependencies.getDatabase();
        const source = await verifiedMember(sql, requested);
        if (source.error) return json(source.error.endsWith("not_found") ? 404 : 409, { error: source.error });
        return json(200, { productReleaseId: source.family.id, releaseNumber: source.family.number, members: source.family.members.map((member) => ({ componentSlug: member.componentSlug, status: member.status, componentReleaseId: member.componentReleaseId, unavailableReason: member.unavailableReason })) }, { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      }
      const releaseExchange = /(?:\/builder\/preview\/authorization\/release-member-exchange|\/preview\/authorization\/release-member-exchange|\/\.netlify\/functions\/builder-preview-authorization\/preview\/authorization\/release-member-exchange)$/.test(String(event.path || ""));
      if (releaseExchange) {
        if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
        if (!String(Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "").toLowerCase().startsWith("application/json")) return json(415, { error: "expected_application_json" });
        let requestBody; try { requestBody = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "invalid_json" }); }
        if (!exact(requestBody, ["source", "intent"]) || !exact(requestBody.source, ["bookSlug", "componentSlug", "productReleaseId", "componentReleaseId", "memberSha256"])) return json(400, { error: "invalid_request" });
        let intent; try { intent = dependencies.normalizeIntent(requestBody.intent); } catch { return json(400, { error: "invalid_preview_intent" }); }
        const decision = dependencies.inspect(event, {
          action: "release-member-switch",
          bookSlug: requestBody.source.bookSlug,
          componentSlug: requestBody.source.componentSlug,
          productReleaseId: requestBody.source.productReleaseId,
          releaseId: requestBody.source.componentReleaseId,
          memberSha256: requestBody.source.memberSha256,
        });
        if (!decision.authorized || decision.scope?.version !== 3 || intent.releaseId !== null || intent.productReleaseId !== decision.scope.productReleaseId
          || requestBody.source.productReleaseId !== decision.scope.productReleaseId || requestBody.source.componentReleaseId !== decision.scope.releaseId
          || requestBody.source.memberSha256 !== decision.scope.memberSha256 || intent.bookSlug !== requestBody.source.bookSlug
          || !findProductComponent(intent.bookSlug, intent.componentSlug)?.publication?.readable) return json(401, { error: "release_member_authorization_denied", code: decision.code || "scope_mismatch" });
        const sql = dependencies.getDatabase();
        const source = await verifiedMember(sql, {
          bookSlug: requestBody.source.bookSlug,
          componentSlug: requestBody.source.componentSlug,
          productReleaseId: requestBody.source.productReleaseId,
          componentReleaseId: requestBody.source.componentReleaseId,
          memberSha256: requestBody.source.memberSha256,
        });
        if (source.error) return json(source.error.endsWith("not_found") ? 404 : 409, { error: source.error });
        const target = await verifiedMember(sql, { bookSlug: intent.bookSlug, componentSlug: intent.componentSlug, productReleaseId: decision.scope.productReleaseId });
        if (target.error === "release_member_unavailable") return json(409, { error: target.error, componentSlug: intent.componentSlug, productReleaseId: decision.scope.productReleaseId, releaseNumber: target.family.number });
        if (target.error) return json(target.error.endsWith("not_found") ? 404 : 409, { error: target.error });
        return json(200, dependencies.issueReleaseMember({ intent, productReleaseId: target.family.id, componentReleaseId: target.member.componentReleaseId, memberSha256: target.member.memberSha256 }), { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
      }
      const exchange = /(?:\/builder\/preview\/authorization\/exchange|\/preview\/authorization\/exchange|\/\.netlify\/functions\/builder-preview-authorization\/preview\/authorization\/exchange)$/.test(String(event.path || ""));
      if (exchange) {
        if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
        if (!String(Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "").toLowerCase().startsWith("application/json")) return json(415, { error: "expected_application_json" });
        let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "invalid_json" }); }
        if (!exact(body, ["source", "intent"]) || !exact(body.source, ["bookSlug", "componentSlug"])) return json(400, { error: "invalid_request" });
        let intent; try { intent = dependencies.normalizeIntent(body.intent); } catch { return json(400, { error: "invalid_preview_intent" }); }
        const components = new Set(["ultimate-b2-students-book", "ultimate-b2-workbook", "ultimate-b2-grammar-book"]);
        if (body.source.bookSlug !== "ultimate-b2" || intent.bookSlug !== "ultimate-b2" || !components.has(body.source.componentSlug) || !components.has(intent.componentSlug) || intent.releaseId !== null) return json(401, { error: "preview_authorization_denied" });
        const decision = dependencies.inspect(event, { action: "component-switch", bookSlug: body.source.bookSlug, componentSlug: body.source.componentSlug });
        if (!decision.authorized) return json(401, { error: "preview_authorization_denied", code: decision.code });
        return json(200, dependencies.issue(intent), { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
      }
      const sql = dependencies.getDatabase();
      const auth = await dependencies.authorize(event, sql); if (auth.error) return auth.error;
      if (event.httpMethod !== "POST") return json(405, { error: "method_not_allowed" });
      const originError = requireBuilderOrigin(event); if (originError) return originError;
      if (!String(Object.entries(event.headers || {}).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "").toLowerCase().startsWith("application/json")) return json(415, { error: "expected_application_json" });
      let body; try { body = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "invalid_json" }); }
      if (!exact(body, ["intent"])) return json(400, { error: "invalid_request" });
      let intent; try { intent = dependencies.normalizeIntent(body.intent); } catch { return json(400, { error: "invalid_preview_intent" }); }
      let issued;
      if (intent.productReleaseId) {
        const resolved = await verifiedMember(sql, intent);
        if (resolved.error === "release_member_unavailable") return json(409, { error: resolved.error, componentSlug: intent.componentSlug, productReleaseId: intent.productReleaseId, releaseNumber: resolved.family.number });
        if (resolved.error) return json(resolved.error.endsWith("not_found") ? 404 : 409, { error: resolved.error });
        issued = dependencies.issueReleaseMember({ intent, productReleaseId: resolved.family.id, componentReleaseId: resolved.member.componentReleaseId, memberSha256: resolved.member.memberSha256 });
      } else issued = dependencies.issue(intent);
      return json(200, issued, { "X-Content-Type-Options": "nosniff" });
    } catch (error) {
      dependencies.logger.error("Builder preview authorization failed", { code: /^[A-Za-z0-9_.-]+$/.test(String(error?.code || "")) ? error.code : "unknown" });
      return json(500, { error: "preview_authorization_failed" });
    }
  };
}
