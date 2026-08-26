import { getBuilderSql, json, requireBuilderOrigin, requireBuilderUser } from "./_builder-auth.js";
import { inspectBuilderPreviewAuthorizationScope, issueBuilderPreviewAuthorization, normalizeBuilderPreviewAuthorizationIntent } from "./_builder-preview-authorization.js";

const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");

export function createBuilderPreviewAuthorizationHandler(overrides = {}) {
  const dependencies = { getDatabase: overrides.getDatabase || getBuilderSql, authorize: overrides.authorize || requireBuilderUser, normalizeIntent: overrides.normalizeIntent || normalizeBuilderPreviewAuthorizationIntent, inspect: overrides.inspect || inspectBuilderPreviewAuthorizationScope, issue: overrides.issue || issueBuilderPreviewAuthorization, logger: overrides.logger || console };
  return async function handler(event) {
    try {
      if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
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
      const issued = dependencies.issue(intent);
      return json(200, issued, { "X-Content-Type-Options": "nosniff" });
    } catch (error) {
      dependencies.logger.error("Builder preview authorization failed", { code: /^[A-Za-z0-9_.-]+$/.test(String(error?.code || "")) ? error.code : "unknown" });
      return json(500, { error: "preview_authorization_failed" });
    }
  };
}
