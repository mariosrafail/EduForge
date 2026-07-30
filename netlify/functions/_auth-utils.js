import { randomBytes, createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import pg from "pg";

export const allowedRoles = new Set(["admin", "teacher", "student"]);
export const allowedStatuses = new Set(["active", "invited", "paused"]);
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const sessionCookieName = "hh_lms_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export const jsonHeaders = {
  "Content-Type": "application/json",
};

let testSqlOverride = null;
let localPool = null;

function localPostgresTemplate(connectionString) {
  localPool ||= new pg.Pool({ connectionString });
  const queryTemplate = (queryable) => async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) {
      text += `$${index + 1}${strings[index + 1]}`;
    }
    return (await queryable.query(text, values)).rows;
  };
  const template = queryTemplate(localPool);
  template.authLoginTransaction = async (lockValues, callback) => {
    const client = await localPool.connect();
    const transactionSql = queryTemplate(client);
    try {
      await client.query("begin");
      await transactionSql`
        select pg_advisory_xact_lock(lock_key)
        from (
          select distinct hashtextextended(value, 0) as lock_key
          from unnest(${lockValues}::text[]) value
        ) locks
        order by lock_key
      `;
      const result = await callback(transactionSql);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  template.schoolProvisioningTransaction = async (email, callback) => {
    const client = await localPool.connect();
    const transactionSql = queryTemplate(client);
    try {
      await client.query("begin");
      await transactionSql`select pg_advisory_xact_lock(hashtextextended(${"school-provisioning:" + email}, 0))`;
      const result = await callback(transactionSql);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  return template;
}

export function setSqlForVerification(sql) {
  const testConfirmed = process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";
  const stagingConfirmed = process.env.STAGING_DATABASE_CONFIRMATION === "isolated-staging-database";
  if (!testConfirmed && !stagingConfirmed) {
    throw new Error("SQL verification override requires an explicitly confirmed isolated database");
  }
  testSqlOverride = sql || null;
}

export const setSqlForTests = setSqlForVerification;

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...jsonHeaders, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

export function unauthorized(message = "Unauthorized") {
  return json(401, { error: message });
}

export function forbidden(message = "Forbidden") {
  return json(403, { error: message });
}

export function notFound(message = "Resource not found") {
  return json(404, { error: message });
}

export function serverError(message = "Authentication service failed") {
  return json(500, { error: message });
}

export function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || "";
}

export function isDatabaseNotConfiguredError(error) {
  return error?.code === "DATABASE_NOT_CONFIGURED" || String(error?.message || "").includes("DATABASE_URL is not configured");
}

export function databaseNotConfiguredResponse() {
  return json(503, {
    error: "Database is not configured",
    detail: "Set DATABASE_URL in .env when running npm run dev:netlify",
    details: "Set DATABASE_URL in .env when running npm run dev:netlify",
  });
}

export function getSql() {
  if (testSqlOverride) return testSqlOverride;
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    const error = new Error("DATABASE_URL is not configured");
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }
  const parsed = new URL(databaseUrl);
  if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    if (process.env.LOCAL_DATABASE_CONFIRMATION !== "isolated-local-pilot") {
      throw new Error("Loopback PostgreSQL requires LOCAL_DATABASE_CONFIRMATION=isolated-local-pilot");
    }
    return localPostgresTemplate(databaseUrl);
  }
  return neon(databaseUrl);
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
    level: user.level ?? null,
  };
}

export const safePublicUser = publicUser;

export function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export function requireSameSchool(resourceSchoolId, currentUser) {
  if (!resourceSchoolId || !currentUser?.school_id || String(resourceSchoolId) !== String(currentUser.school_id)) {
    return forbidden();
  }
  return null;
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
    select u.id, u.school_id, u.full_name, u.email, u.role, u.status, u.level
    from auth_sessions s
    join app_users u on u.id = s.user_id
    join schools school on school.id = u.school_id
    where s.token_hash = ${tokenHash}
      and s.expires_at > now()
      and u.status = 'active'
      and coalesce(school.status, 'active') = 'active'
    limit 1
  `;

  return rows[0] ?? null;
}

/**
 * Resolve the existing opaque session cookie to an active database user.
 * Callers receive a response object instead of an exception for expected auth failures.
 */
export async function requireAuth(event, sql = null) {
  const database = sql || getSql();
  const token = getCookie(event, sessionCookieName);
  if (!token) return { error: unauthorized() };

  const currentUser = await currentUserFromEvent(database, event);
  if (!currentUser) return { error: unauthorized() };
  return { sql: database, currentUser };
}

export async function requireRole(event, allowedRoleList, sql = null) {
  const auth = await requireAuth(event, sql);
  if (auth.error) return auth;
  const roles = Array.isArray(allowedRoleList) ? allowedRoleList : [allowedRoleList];
  if (!roles.includes(auth.currentUser.role)) return { ...auth, error: forbidden() };
  return auth;
}

export function safeServerError(error, message = "Request failed") {
  console.error(error);
  return json(500, { error: message });
}
