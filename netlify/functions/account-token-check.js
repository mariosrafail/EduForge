import { getSql, hashToken, json, safeServerError } from "./_auth-utils.js";
import { checkRateLimit, genericTokenError, parseJsonBody, recordRateLimitAttempt, requestFingerprint, retryAfterHeaders, validAccountTokenInput } from "./_account-lifecycle-utils.js";
import { requireRuntimeSchema, schemaFailureResponse } from "./_runtime-schema-readiness.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const parsed = parseJsonBody(event);
    if (parsed.error) return json(400, { error: parsed.error });
    const rawToken = String(parsed.value.token || "");
    const purpose = String(parsed.value.purpose || "");
    if (!validAccountTokenInput(rawToken) || !["initial_password", "password_reset"].includes(purpose)) return json(400, { valid: false, error: genericTokenError });
    const sql = getSql();
    const readinessError = await requireRuntimeSchema(sql);
    if (readinessError) return readinessError;
    const fingerprint = requestFingerprint(event);
    if (await checkRateLimit(sql, { scope: "token_validation", fingerprint, limit: 20 })) return json(429, { error: "Too many token checks. Try again later." }, retryAfterHeaders());
    const rows = await sql`
      select t.purpose from account_tokens t join app_users u on u.id = t.user_id
      where t.token_hash = ${hashToken(rawToken)} and t.purpose = ${purpose}
        and t.used_at is null and t.revoked_at is null and t.expires_at > now()
        and ((t.purpose = 'initial_password' and u.status = 'invited') or (t.purpose = 'password_reset' and u.status = 'active')) limit 1
    `;
    await recordRateLimitAttempt(sql, { scope: "token_validation", fingerprint, succeeded: Boolean(rows[0]) });
    return rows[0] ? json(200, { valid: true, purpose: rows[0].purpose }) : json(400, { valid: false, error: genericTokenError });
  } catch (error) { return schemaFailureResponse(error) || safeServerError(error, "Token validation failed"); }
}
