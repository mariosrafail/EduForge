import bcrypt from "bcryptjs";
import { getSql, hashToken, json, safeServerError } from "./_auth-utils.js";
import { checkRateLimit, consumePasswordToken, genericTokenError, hashPassword, lifecycleUser, parseJsonBody, prepareFreshSession, recordRateLimitAttempt, requestFingerprint, retryAfterHeaders, validAccountTokenInput, validatePassword } from "./_account-lifecycle-utils.js";
import { requireRuntimeSchema, schemaFailureResponse } from "./_runtime-schema-readiness.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const parsed = parseJsonBody(event); if (parsed.error) return json(400, { error: parsed.error });
    const rawToken = String(parsed.value.token || ""); const password = String(parsed.value.password || "");
    if (!validAccountTokenInput(rawToken)) return json(400, { error: genericTokenError });
    const sql = getSql();
    const readinessError = await requireRuntimeSchema(sql); if (readinessError) return readinessError;
    const fingerprint = requestFingerprint(event);
    if (await checkRateLimit(sql, { scope: "token_validation", fingerprint, limit: 20 })) return json(429, { error: "Too many token attempts. Try again later." }, retryAfterHeaders());
    const lookup = await sql`select u.email,u.password_hash from account_tokens t join app_users u on u.id=t.user_id where t.token_hash=${hashToken(rawToken)} and t.purpose='password_reset' and t.used_at is null and t.revoked_at is null and t.expires_at>now() and u.status='active' limit 1`;
    if (!lookup[0]) { await recordRateLimitAttempt(sql, { scope: "token_validation", fingerprint }); return json(400, { error: genericTokenError }); }
    const passwordError = validatePassword(password, lookup[0].email); if (passwordError) return json(400, { error: passwordError });
    if (lookup[0].password_hash && await bcrypt.compare(password, lookup[0].password_hash)) return json(400, { error: "New password must be different" });
    const session = prepareFreshSession(event);
    const rows = await consumePasswordToken(sql, { rawToken, purpose: "password_reset", passwordHash: await hashPassword(password), session, fingerprint });
    await recordRateLimitAttempt(sql, { scope: "token_validation", fingerprint, succeeded: Boolean(rows[0]) });
    if (!rows[0]) return json(400, { error: genericTokenError });
    return json(200, { user: lifecycleUser(rows[0]) }, { "Set-Cookie": session.cookie });
  } catch (error) { return schemaFailureResponse(error) || safeServerError(error, "Password reset failed"); }
}
