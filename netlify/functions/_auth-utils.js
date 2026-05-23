import { randomBytes, createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const allowedRoles = new Set(["admin", "teacher", "student"]);
export const allowedStatuses = new Set(["active", "invited", "paused"]);
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const sessionCookieName = "hh_lms_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export const jsonHeaders = {
  "Content-Type": "application/json",
};

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

export function serverError(message = "Authentication service failed") {
  return json(500, { error: message });
}

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  return neon(process.env.DATABASE_URL);
}

export async function ensureAuthSchema(sql) {
  await sql`create extension if not exists pgcrypto`;
  await sql`
    alter table app_users
    add column if not exists password_hash text,
    add column if not exists last_login_at timestamptz,
    add column if not exists auth_provider text default 'password'
  `;
  await sql`
    update app_users
    set auth_provider = 'password'
    where auth_provider is null
  `;
  await sql`
    create table if not exists auth_sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references app_users(id) on delete cascade,
      token_hash text not null,
      expires_at timestamptz not null,
      created_at timestamptz default now()
    )
  `;
  await sql`create index if not exists auth_sessions_token_hash_idx on auth_sessions (token_hash)`;
  await sql`create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id)`;
}

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function normalizeRole(role) {
  return String(role ?? "").trim().toLowerCase();
}

export function normalizeStatus(status) {
  return String(status ?? "invited").trim().toLowerCase();
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    school_id: user.school_id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

export function getCookie(event, name) {
  const cookieHeader = event.headers.cookie || event.headers.Cookie || "";
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const match = cookies.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

export function sessionCookie(token, event) {
  const host = event.headers.host || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const secure = isLocal ? "" : "; Secure";
  return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}${secure}`;
}

export function clearSessionCookie(event) {
  const host = event.headers.host || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const secure = isLocal ? "" : "; Secure";
  return `${sessionCookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`;
}

export async function createSession(sql, userId, event) {
  const token = createSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString();

  await sql`
    insert into auth_sessions (user_id, token_hash, expires_at)
    values (${userId}, ${tokenHash}, ${expiresAt})
  `;

  return {
    token,
    cookie: sessionCookie(token, event),
  };
}

export async function currentUserFromEvent(sql, event) {
  const token = getCookie(event, sessionCookieName);
  if (!token) return null;

  const tokenHash = hashToken(token);
  const rows = await sql`
    select u.id, u.school_id, u.full_name, u.email, u.role, u.status
    from auth_sessions s
    join app_users u on u.id = s.user_id
    where s.token_hash = ${tokenHash}
      and s.expires_at > now()
    limit 1
  `;

  return rows[0] ?? null;
}
