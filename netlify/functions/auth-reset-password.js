import { getSql, hashToken, json, safeServerError } from "./_auth-utils.js";
import { consumePasswordToken, hashPassword, lifecycleUser, parseJsonBody, prepareFreshSession, requestFingerprint, validatePassword } from "./_account-lifecycle-utils.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const parsed = parseJsonBody(event); if (parsed.error) return json(400, { error: parsed.error });
    const rawToken = String(parsed.value.token || ""); const password = String(parsed.value.password || "");
    const sql = getSql();
    const lookup = await sql`select u.email from account_tokens t join app_users u on u.id=t.user_id where t.token_hash=${hashToken(rawToken)} and t.purpose='password_reset' and t.used_at is null and t.revoked_at is null and t.expires_at>now() and u.status='active' limit 1`;
    if (!lookup[0]) return json(400, { error: "This reset link is invalid or has expired" });
    const passwordError = validatePassword(password, lookup[0].email); if (passwordError) return json(400, { error: passwordError });
    const session = prepareFreshSession(event);
    const rows = await consumePasswordToken(sql, { rawToken, purpose: "password_reset", passwordHash: await hashPassword(password), session, fingerprint: requestFingerprint(event) });
    if (!rows[0]) return json(400, { error: "This reset link is invalid or has expired" });
    return json(200, { user: lifecycleUser(rows[0]) }, { "Set-Cookie": session.cookie });
  } catch (error) { return safeServerError(error, "Password reset failed"); }
}
