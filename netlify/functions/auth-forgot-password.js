import { randomUUID } from "node:crypto";
import { getSql, hashToken, json, safeServerError } from "./_auth-utils.js";
import { checkRateLimit, createAccountToken, genericForgotPasswordMessage, hashPrivateValue, parseJsonBody, passwordResetLifetimeMinutes, recordRateLimitAttempt, requestFingerprint, tokenExpiry, validateEmail } from "./_account-lifecycle-utils.js";
import { deliverAccountEmail, markEmailDelivery, recordDeliveryFailureEvent } from "./_email-utils.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const parsed = parseJsonBody(event);
    const email = validateEmail(parsed.value?.email);
    const sql = getSql();
    const fingerprint = requestFingerprint(event);
    const emailHash = hashPrivateValue(email || "invalid");
    if (await checkRateLimit(sql, { scope: "forgot_password", fingerprint, emailHash, limit: 5 })) return json(429, { message: genericForgotPasswordMessage }, { "Retry-After": "900" });
    const users = email ? await sql`select id, school_id, full_name, email from app_users where lower(email)=${email} and status='active' limit 1` : [];
    const user = users[0];
    let delivery;
    if (user) {
      const rawToken = createAccountToken(); const outboxId = randomUUID();
      await sql`
        with revoked as (update account_tokens set revoked_at=now() where user_id=${user.id} and purpose='password_reset' and used_at is null and revoked_at is null returning id),
        token as (insert into account_tokens (user_id,purpose,token_hash,expires_at,delivery_reference) select ${user.id},'password_reset',${hashToken(rawToken)},${tokenExpiry(passwordResetLifetimeMinutes)},${outboxId} from (select count(*) from revoked) revoked_done),
        outbox as (insert into account_email_outbox (id,user_id,recipient_email,template_type,template_variables) values (${outboxId},${user.id},${user.email},'password_reset',jsonb_build_object('name',${user.full_name}::text)))
        insert into account_security_events (user_id,school_id,event_type,request_fingerprint) values (${user.id},${user.school_id},'password_reset_requested',${fingerprint})
      `;
      try { delivery = await deliverAccountEmail({ recipient: user.email, templateType: "password_reset", rawToken, outboxId, name: user.full_name }); }
      catch { delivery = { state: "failed", errorCode: "email_configuration_error" }; }
      await markEmailDelivery(sql, outboxId, delivery);
      if (delivery.state === "failed") await recordDeliveryFailureEvent(sql, { userId: user.id, schoolId: user.school_id, fingerprint, templateType: "password_reset" });
    }
    await recordRateLimitAttempt(sql, { scope: "forgot_password", fingerprint, emailHash, succeeded: Boolean(user) });
    return json(200, { message: genericForgotPasswordMessage, ...(delivery?.previewUrl ? { preview_url: delivery.previewUrl } : {}) });
  } catch (error) { return safeServerError(error, "Password reset request failed"); }
}
