import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { getSql, json, requireAuth, safeServerError } from "./_auth-utils.js";
import { hashPassword, parseJsonBody, prepareFreshSession, requestFingerprint, validatePassword } from "./_account-lifecycle-utils.js";
import { deliverAccountEmail, markEmailDelivery, recordDeliveryFailureEvent } from "./_email-utils.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const sql = getSql(); const auth = await requireAuth(event, sql); if (auth.error) return auth.error;
    const parsed = parseJsonBody(event); if (parsed.error) return json(400, { error: parsed.error });
    if (parsed.value.user_id || parsed.value.userId) return json(400, { error: "The account is determined by the authenticated session" });
    const currentPassword = String(parsed.value.currentPassword || ""); const newPassword = String(parsed.value.newPassword || "");
    const rows = await sql`select password_hash,email,full_name,school_id from app_users where id=${auth.currentUser.id} limit 1`;
    const user = rows[0];
    if (!user?.password_hash || !await bcrypt.compare(currentPassword, user.password_hash)) return json(401, { error: "Current password is incorrect" });
    if (await bcrypt.compare(newPassword, user.password_hash)) return json(400, { error: "New password must be different" });
    const passwordError = validatePassword(newPassword, user.email); if (passwordError) return json(400, { error: passwordError });
    const session = prepareFreshSession(event); const outboxId = randomUUID();
    await sql`
      with updated as (update app_users set password_hash=${await hashPassword(newPassword)},password_set_at=now(),updated_at=now() where id=${auth.currentUser.id} returning id),
      sessions_removed as (select revoke_account_sessions(id) as count from updated),
      tokens_revoked as (update account_tokens set revoked_at=now() where user_id in (select id from updated) and used_at is null and revoked_at is null),
      fresh as (insert into auth_sessions (user_id,token_hash,expires_at) select updated.id,${session.tokenHash},${session.expiresAt} from updated cross join (select count(*) from sessions_removed) session_revocation),
      outbox as (insert into account_email_outbox (id,user_id,recipient_email,template_type,template_variables) values (${outboxId},${auth.currentUser.id},${user.email},'password_changed',jsonb_build_object('name',${user.full_name}::text)))
      insert into account_security_events (user_id,actor_user_id,school_id,event_type,request_fingerprint) values (${auth.currentUser.id},${auth.currentUser.id},${user.school_id},'password_changed',${requestFingerprint(event)})
    `;
    let delivery;
    try { delivery = await deliverAccountEmail({ recipient: user.email, templateType: "password_changed", outboxId, name: user.full_name }); }
    catch { delivery = { state: "failed", errorCode: "email_configuration_error" }; }
    await markEmailDelivery(sql, outboxId, delivery, { retryable: delivery.state === "failed" });
    if (delivery.state === "failed") await recordDeliveryFailureEvent(sql, { userId: auth.currentUser.id, actorUserId: auth.currentUser.id, schoolId: user.school_id, fingerprint: requestFingerprint(event), templateType: "password_changed" });
    return json(200, { message: "Password changed", delivery_status: delivery.state }, { "Set-Cookie": session.cookie });
  } catch (error) { return safeServerError(error, "Password change failed"); }
}
