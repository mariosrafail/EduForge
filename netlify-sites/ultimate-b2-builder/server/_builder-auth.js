import { createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

import { builderLoginIdentifiers } from "./_builder-login-rate-limit.js";

export const builderCookieName = "hh_builder_session";
export const builderSessionMaxAgeSeconds = 8 * 60 * 60;
export const builderEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const forbiddenAuditKey = /password|hash|token|secret|database|answer|solution/i;

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

export function normalizeBuilderEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function hashBuilderToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

export function getBuilderSql(environment = process.env) {
  const databaseUrl = String(environment.DATABASE_URL || "");
  if (!databaseUrl) throw new Error("DATABASE_URL is required for Builder authentication");
  const parsed = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
  return neon(databaseUrl);
}

function header(event, name) {
  const entry = Object.entries(event?.headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry ? String(entry[1]) : "";
}

function localHost(event) {
  return ["localhost", "127.0.0.1", "::1"].includes(header(event, "host").split(":")[0].toLowerCase());
}

export function getCookie(event, name) {
  const cookie = header(event, "cookie");
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return "";
}

export function builderCookie(token, event) {
  const secure = localHost(event) ? "" : "; Secure";
  return `${builderCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${builderSessionMaxAgeSeconds}${secure}`;
}

export function clearBuilderCookie(event) {
  const secure = localHost(event) ? "" : "; Secure";
  return `${builderCookieName}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}

export function requireBuilderOrigin(event) {
  const origin = header(event, "origin");
  const host = header(event, "host");
  if (!origin || !host) return json(403, { error: "Origin validation failed" });
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.host.toLowerCase() !== host.toLowerCase()) {
      return json(403, { error: "Origin validation failed" });
    }
  } catch {
    return json(403, { error: "Origin validation failed" });
  }
  return null;
}

export function parseBuilderBody(event) {
  try {
    return { value: JSON.parse(event.body || "{}") };
  } catch {
    return { error: json(400, { error: "Request body must be valid JSON" }) };
  }
}

export function publicBuilderUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
    last_login_at: user.last_login_at || null,
  };
}

export function safeBuilderAuditMetadata(metadata = {}) {
  const result = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (forbiddenAuditKey.test(key)) throw new Error(`Unsafe Builder audit metadata key: ${key}`);
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) result[key] = value;
  }
  return result;
}

export async function writeBuilderAudit(sql, {
  builderUserId,
  action,
  targetType = "builder_user",
  targetId = null,
  metadata = {},
}) {
  await sql`
    insert into builder_audit_log(builder_user_id, action, target_type, target_id, metadata)
    values (${builderUserId || null}, ${action}, ${targetType}, ${targetId ? String(targetId) : null},
      ${JSON.stringify(safeBuilderAuditMetadata(metadata))}::jsonb)
  `;
}

export async function createBuilderSession(sql, builderUserId, event) {
  const previousToken = getCookie(event, builderCookieName);
  if (previousToken) {
    await sql`
      update builder_sessions set revoked_at=coalesce(revoked_at,now())
      where token_hash=${hashBuilderToken(previousToken)} and revoked_at is null
    `;
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + builderSessionMaxAgeSeconds * 1000).toISOString();
  const requestFingerprint = builderLoginIdentifiers(event, "").requestFingerprint;
  const userAgent = header(event, "user-agent");
  const userAgentHash = userAgent ? createHash("sha256").update(userAgent).digest("hex") : null;
  await sql`
    insert into builder_sessions(builder_user_id, token_hash, expires_at, request_fingerprint, user_agent_hash)
    values (${builderUserId}, ${hashBuilderToken(token)}, ${expiresAt}, ${requestFingerprint}, ${userAgentHash})
  `;
  return { token, cookie: builderCookie(token, event), expiresAt };
}

export async function revokeBuilderSession(sql, event) {
  const token = getCookie(event, builderCookieName);
  if (!token) return null;
  const rows = await sql`
    update builder_sessions set revoked_at=coalesce(revoked_at,now())
    where token_hash=${hashBuilderToken(token)} and revoked_at is null
    returning builder_user_id
  `;
  return rows[0]?.builder_user_id || null;
}

export async function currentBuilderUserFromEvent(sql, event) {
  const token = getCookie(event, builderCookieName);
  if (!token) return null;
  const rows = await sql`
    select u.id,u.full_name,u.email,u.role,u.status,u.last_login_at,s.id session_id
    from builder_sessions s join builder_users u on u.id=s.builder_user_id
    where s.token_hash=${hashBuilderToken(token)}
      and s.revoked_at is null and s.expires_at>now()
      and u.status='active' and u.role='developer'
    limit 1
  `;
  if (!rows[0]) return null;
  await sql`update builder_sessions set last_seen_at=now() where id=${rows[0].session_id}`;
  return rows[0];
}

export async function requireBuilderUser(event, sql) {
  const user = await currentBuilderUserFromEvent(sql, event);
  if (!user) return { error: json(401, { error: "Unauthorized" }) };
  return { builderUser: user };
}

export function safeBuilderServerError() {
  console.error("Builder authentication failed");
  return json(500, { error: "Builder authentication failed" });
}
