import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  createSessionToken,
  emailPattern,
  hashToken,
  sessionCookie,
  sessionMaxAgeSeconds,
} from "./_auth-utils.js";

export const initialPasswordLifetimeMinutes = 60 * 24 * 3;
export const passwordResetLifetimeMinutes = 30;
export const genericForgotPasswordMessage = "If an active account matches that email, password reset instructions will be sent.";
const demoPasswords = new Set(["admin123", "teacher123", "student123", "password123"]);

export function createAccountToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPrivateValue(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function validatePassword(password, normalizedEmail, { allowDemo = false } = {}) {
  const value = String(password ?? "");
  if (value.length < 10) return "Password must be at least 10 characters";
  if (!value.trim()) return "Password cannot contain only whitespace";
  if (value.toLowerCase() === String(normalizedEmail || "").toLowerCase()) return "Password cannot be the same as the email address";
  if (!allowDemo && demoPasswords.has(value.toLowerCase())) return "Choose a password that is not a documented demo password";
  return "";
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export function accountActionUrl(action, rawToken) {
  const publicUrl = String(process.env.APP_PUBLIC_URL || "").trim();
  let parsed;
  try { parsed = new URL(publicUrl); } catch { throw new Error("APP_PUBLIC_URL must be an absolute http(s) URL"); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error("APP_PUBLIC_URL must use http or https");
  parsed.hash = `/${action}?token=${encodeURIComponent(rawToken)}`;
  return parsed.toString();
}

export function requestFingerprint(event) {
  let salt = process.env.ACCOUNT_RATE_LIMIT_SALT;
  const isolated = process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database" || process.env.STAGING_DATABASE_CONFIRMATION === "isolated-staging-database";
  if (!salt && isolated) salt = "isolated-eduforge-account-lifecycle";
  if (!salt) throw new Error("ACCOUNT_RATE_LIMIT_SALT is required");
  const headers = event.headers || {};
  const ip = headers["x-nf-client-connection-ip"] || headers["x-forwarded-for"] || "unknown";
  return hashPrivateValue(`${salt}:${String(ip).split(",")[0].trim()}`);
}

export async function checkRateLimit(sql, { scope, fingerprint, emailHash = null, limit, minutes = 15 }) {
  const rows = await sql`
    select count(*)::int as count
    from account_rate_limit_attempts
    where scope = ${scope}
      and attempted_at > now() - (${minutes} * interval '1 minute')
      and (request_fingerprint = ${fingerprint} or (${emailHash}::text is not null and email_hash = ${emailHash}))
  `;
  return Number(rows[0]?.count || 0) >= limit;
}

export async function recordRateLimitAttempt(sql, { scope, fingerprint, emailHash = null, succeeded = false }) {
  await sql`insert into account_rate_limit_attempts (scope, request_fingerprint, email_hash, succeeded) values (${scope}, ${fingerprint}, ${emailHash}, ${succeeded})`;
}

export function tokenExpiry(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function prepareFreshSession(event) {
  const token = createSessionToken();
  return {
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString(),
    cookie: sessionCookie(token, event),
  };
}

export function lifecycleUser(user) {
  return user ? { id: user.id, full_name: user.full_name, email: user.email, role: user.role, status: user.status, level: user.level ?? null } : null;
}

export function parseJsonBody(event) {
  try { return { value: JSON.parse(event.body || "{}") }; } catch { return { error: "Request body must be valid JSON" }; }
}

export function validateEmail(email) {
  const normalized = String(email ?? "").trim().toLowerCase();
  return emailPattern.test(normalized) ? normalized : "";
}

export async function consumePasswordToken(sql, { rawToken, purpose, passwordHash, session, fingerprint }) {
  return sql`
    with candidate as (
      select t.id, t.user_id from account_tokens t join app_users u on u.id = t.user_id
      where t.token_hash = ${hashToken(rawToken)} and t.purpose = ${purpose}
        and t.used_at is null and t.revoked_at is null and t.expires_at > now()
        and ((${purpose} = 'initial_password' and u.status = 'invited') or (${purpose} = 'password_reset' and u.status = 'active'))
      for update of t
    ), consumed as (
      update account_tokens set used_at = now() where id in (select id from candidate) returning user_id
    ), updated as (
      update app_users set password_hash = ${passwordHash}, password_set_at = now(),
        invitation_accepted_at = case when ${purpose} = 'initial_password' then now() else invitation_accepted_at end,
        status = case when ${purpose} = 'initial_password' then 'active' else status end, updated_at = now()
      where id in (select user_id from consumed)
      returning id, full_name, email, role, status, school_id, level
    ), sessions_removed as (
      delete from auth_sessions where user_id in (select id from updated)
    ), other_tokens as (
      update account_tokens set revoked_at = now()
      where user_id in (select id from updated) and used_at is null and revoked_at is null
    ), fresh_session as (
      insert into auth_sessions (user_id, token_hash, expires_at)
      select id, ${session.tokenHash}, ${session.expiresAt} from updated
    ), event_row as (
      insert into account_security_events (user_id, actor_user_id, school_id, event_type, request_fingerprint)
      select id, id, school_id, case when ${purpose} = 'initial_password' then 'invitation_accepted' else 'password_reset' end, ${fingerprint} from updated
    ) select id, full_name, email, role, status, level from updated
  `;
}
