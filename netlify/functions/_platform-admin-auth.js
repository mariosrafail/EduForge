import { createHash, randomBytes } from "node:crypto";
import {
  forbidden,
  getCookie,
  getSql,
  hashToken,
  json,
  normalizeEmail,
  unauthorized,
} from "./_auth-utils.js";
import { platformAdminLoginIdentifiers } from "./_platform-admin-login-rate-limit.js";

export const platformAdminCookieName = "hh_platform_admin_session";
export const platformAdminSessionMaxAgeSeconds = 8 * 60 * 60;
const forbiddenAuditKey = /password|hash|token|secret|database|answer|solution/i;

function localHost(event) {
  const host = String(event?.headers?.host || event?.headers?.Host || "").split(":")[0].toLowerCase();
  return ["localhost", "127.0.0.1", "::1"].includes(host);
}

export function publicPlatformAdmin(admin) {
  if (!admin) return null;
  return {
    id: admin.id,
    full_name: admin.full_name,
    email: admin.email,
    status: admin.status,
    last_login_at: admin.last_login_at || null,
  };
}

export function platformAdminCookie(token, event) {
  const secure = localHost(event) ? "" : "; Secure";
  return `${platformAdminCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/platform-admin; SameSite=Strict; Max-Age=${platformAdminSessionMaxAgeSeconds}${secure}`;
}

export function clearPlatformAdminCookie(event) {
  const secure = localHost(event) ? "" : "; Secure";
  return `${platformAdminCookieName}=; HttpOnly; Path=/platform-admin; SameSite=Strict; Max-Age=0${secure}`;
}

export function platformAdminRequestFingerprint(event) {
  return platformAdminLoginIdentifiers(event, "").requestFingerprint;
}

export function requirePlatformAdminOrigin(event) {
  const origin = String(event.headers?.origin || event.headers?.Origin || "");
  const host = String(event.headers?.host || event.headers?.Host || "");
  if (!origin || !host) return forbidden("Origin validation failed");
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return forbidden("Origin validation failed");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.host.toLowerCase() !== host.toLowerCase()) {
    return forbidden("Origin validation failed");
  }
  return null;
}

export function parsePlatformAdminBody(event) {
  try {
    return { value: JSON.parse(event.body || "{}") };
  } catch {
    return { error: json(400, { error: "Request body must be valid JSON" }) };
  }
}

export function safeAuditMetadata(metadata = {}) {
  const result = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (forbiddenAuditKey.test(key)) throw new Error(`Unsafe audit metadata key: ${key}`);
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) result[key] = value;
  }
  return result;
}

export async function writePlatformAdminAudit(sql, {
  platformAdminId,
  action,
  targetType,
  targetId = null,
  targetSchoolId = null,
  metadata = {},
}) {
  const safeMetadata = safeAuditMetadata(metadata);
  await sql`
    insert into platform_admin_audit_log(
      platform_admin_id, action, target_type, target_id, target_school_id, metadata
    ) values (
      ${platformAdminId || null}, ${action}, ${targetType}, ${targetId ? String(targetId) : null},
      ${targetSchoolId || null}, ${JSON.stringify(safeMetadata)}::jsonb
    )
  `;
}

export async function createPlatformAdminSession(sql, platformAdminId, event) {
  const previousToken = getCookie(event, platformAdminCookieName);
  if (previousToken) {
    await sql`
      update platform_admin_sessions set revoked_at=coalesce(revoked_at,now())
      where token_hash=${hashToken(previousToken)} and revoked_at is null
    `;
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + platformAdminSessionMaxAgeSeconds * 1000).toISOString();
  const fingerprint = platformAdminRequestFingerprint(event);
  const userAgent = String(event.headers?.["user-agent"] || event.headers?.["User-Agent"] || "");
  const userAgentHash = userAgent ? createHash("sha256").update(userAgent).digest("hex") : null;
  await sql`
    insert into platform_admin_sessions(
      platform_admin_id, token_hash, expires_at, request_fingerprint, user_agent_hash
    ) values (${platformAdminId}, ${hashToken(token)}, ${expiresAt}, ${fingerprint}, ${userAgentHash})
  `;
  return { token, cookie: platformAdminCookie(token, event), expiresAt };
}

export async function revokePlatformAdminSession(sql, event) {
  const token = getCookie(event, platformAdminCookieName);
  if (!token) return null;
  const rows = await sql`
    update platform_admin_sessions
    set revoked_at=coalesce(revoked_at,now())
    where token_hash=${hashToken(token)}
    returning platform_admin_id
  `;
  return rows[0]?.platform_admin_id || null;
}

export async function currentPlatformAdminFromEvent(sql, event) {
  const token = getCookie(event, platformAdminCookieName);
  if (!token) return null;
  const rows = await sql`
    select a.id,a.full_name,a.email,a.status,a.last_login_at,s.id session_id
    from platform_admin_sessions s
    join platform_admins a on a.id=s.platform_admin_id
    where s.token_hash=${hashToken(token)}
      and s.revoked_at is null
      and s.expires_at>now()
      and a.status='active'
    limit 1
  `;
  if (!rows[0]) return null;
  await sql`update platform_admin_sessions set last_seen_at=now() where id=${rows[0].session_id}`;
  return rows[0];
}

export async function requirePlatformAdmin(event, sql = null) {
  const database = sql || getSql();
  const admin = await currentPlatformAdminFromEvent(database, event);
  if (!admin) return { error: unauthorized() };
  return { sql: database, platformAdmin: admin };
}

export { normalizeEmail };
