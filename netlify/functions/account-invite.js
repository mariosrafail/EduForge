import { randomUUID } from "node:crypto";
import { getSql, hashToken, json, requireRole, safeServerError } from "./_auth-utils.js";
import {
  checkRateLimit, createAccountToken, hashPrivateValue, initialPasswordLifetimeMinutes,
  lifecycleUser, parseJsonBody, recordRateLimitAttempt, requestFingerprint, tokenExpiry, validateEmail,
} from "./_account-lifecycle-utils.js";
import { deliverAccountEmail, markEmailDelivery } from "./_email-utils.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const sql = getSql();
    const auth = await requireRole(event, "admin", sql);
    if (auth.error) return auth.error;
    const parsed = parseJsonBody(event);
    if (parsed.error) return json(400, { error: parsed.error });
    const body = parsed.value;
    if (body.school_id || body.schoolId || body.invited_by || body.created_by) return json(400, { error: "School and inviter are determined by the authenticated session" });
    const resend = body.resend === true;
    const email = validateEmail(body.email);
    const role = String(body.role || "").trim().toLowerCase();
    const fullName = String(body.full_name ?? body.fullName ?? "").trim();
    if (!email || (!resend && !fullName)) return json(400, { error: "A valid email and full name are required" });
    if (!resend && !["teacher", "student"].includes(role)) return json(400, { error: "Only teacher and student invitations are allowed" });

    const fingerprint = requestFingerprint(event);
    const emailHash = hashPrivateValue(email);
    if (resend && await checkRateLimit(sql, { scope: "invitation_resend", fingerprint, emailHash, limit: 5 })) {
      await recordRateLimitAttempt(sql, { scope: "invitation_resend", fingerprint, emailHash });
      return json(429, { error: "Too many invitation requests. Try again later." });
    }

    const rawToken = createAccountToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = tokenExpiry(initialPasswordLifetimeMinutes);
    const outboxId = randomUUID();
    const tokenId = randomUUID();
    let rows;
    if (resend) {
      rows = await sql`
        with target as (
          select id, full_name, email, role, status from app_users
          where lower(email) = ${email} and school_id = ${auth.currentUser.school_id}
            and role in ('teacher', 'student') and status = 'invited'
        ), revoked as (
          update account_tokens set revoked_at = now()
          where user_id in (select id from target) and purpose = 'initial_password' and used_at is null and revoked_at is null
          returning id
        ), touched as (
          update app_users set invited_at = now(), invited_by = ${auth.currentUser.id}, updated_at = now()
          where id in (select id from target) returning id, full_name, email, role, status, school_id
        ), token as (
          insert into account_tokens (id, user_id, purpose, token_hash, expires_at, created_by, delivery_reference)
          select ${tokenId}, touched.id, 'initial_password', ${tokenHash}, ${expiresAt}, ${auth.currentUser.id}, ${outboxId}
          from touched cross join (select count(*) from revoked) revoked_done
        ), outbox as (
          insert into account_email_outbox (id, user_id, created_by, recipient_email, template_type, template_variables)
          select ${outboxId}, id, ${auth.currentUser.id}, email, 'account_invitation', jsonb_build_object('name', full_name::text) from touched
        ), event_row as (
          insert into account_security_events (user_id, actor_user_id, school_id, event_type, request_fingerprint)
          select id, ${auth.currentUser.id}, school_id, 'invitation_resent', ${fingerprint} from touched
        ) select id, full_name, email, role, status from touched
      `;
    } else {
      rows = await sql`
        with created as (
          insert into app_users (school_id, full_name, email, role, level, status, auth_provider, invited_at, invited_by)
          values (${auth.currentUser.school_id}, ${fullName}, ${email}, ${role}, ${String(body.level || "").trim() || null}, 'invited', 'password', now(), ${auth.currentUser.id})
          on conflict ((lower(email))) where email is not null and email <> '' do nothing
          returning id, full_name, email, role, status, school_id
        ), token as (
          insert into account_tokens (id, user_id, purpose, token_hash, expires_at, created_by, delivery_reference)
          select ${tokenId}, id, 'initial_password', ${tokenHash}, ${expiresAt}, ${auth.currentUser.id}, ${outboxId} from created
        ), outbox as (
          insert into account_email_outbox (id, user_id, created_by, recipient_email, template_type, template_variables)
          select ${outboxId}, id, ${auth.currentUser.id}, email, 'account_invitation', jsonb_build_object('name', full_name::text) from created
        ), event_row as (
          insert into account_security_events (user_id, actor_user_id, school_id, event_type, request_fingerprint)
          select id, ${auth.currentUser.id}, school_id, 'account_invited', ${fingerprint} from created
        ) select id, full_name, email, role, status from created
      `;
    }
    if (!rows[0]) return json(resend ? 404 : 409, { error: resend ? "Invited account not found" : "An account with this email already exists" });
    if (resend) await recordRateLimitAttempt(sql, { scope: "invitation_resend", fingerprint, emailHash, succeeded: true });
    const delivery = await deliverAccountEmail({ recipient: email, templateType: "account_invitation", rawToken, outboxId, name: rows[0].full_name });
    await markEmailDelivery(sql, outboxId, delivery);
    return json(resend ? 200 : 201, { user: lifecycleUser(rows[0]), ...(delivery.previewUrl ? { preview_url: delivery.previewUrl } : {}) });
  } catch (error) {
    return safeServerError(error, "Invitation could not be created");
  }
}
