import bcrypt from "bcryptjs";
import { emailPattern, getSql, json, safeServerError } from "./_auth-utils.js";
import {
  clearPlatformAdminCookie,
  createPlatformAdminSession,
  parsePlatformAdminBody,
  publicPlatformAdmin,
  requirePlatformAdmin,
  requirePlatformAdminOrigin,
  revokePlatformAdminSession,
  writePlatformAdminAudit,
  normalizeEmail,
} from "./_platform-admin-auth.js";
import {
  beginPlatformAdminLoginAttempt,
  completePlatformAdminLoginAttempt,
  platformAdminLoginIdentifiers,
  platformAdminRateLimitMessage,
} from "./_platform-admin-login-rate-limit.js";

const genericLoginError = "Invalid email or password";
const dummyPasswordHash = "$2b$12$TbcfsTmq6FFDE.aOFgkBuelsJsvqk.140AXzYhTFlta7idf64o.c6";

function rateLimited(result) {
  return json(429, { error: platformAdminRateLimitMessage }, { "Retry-After": String(result.retryAfter) });
}

const thresholdAuditAction = {
  pair: "login_pair_rate_limited",
  source: "login_source_rate_limited",
  account: "login_account_risk_detected",
};

async function auditThreshold(sql, admin, result, writeAudit) {
  const action = thresholdAuditAction[result.thresholdDimension];
  if (!admin || !action) return;
  await writeAudit(sql, {
    platformAdminId: admin.id,
    action,
    targetType: "platform_admin",
    targetId: admin.id,
    metadata: { dimension: result.thresholdDimension, category: "threshold" },
  });
}

async function login(event, sql, dependencies) {
  const originError = requirePlatformAdminOrigin(event);
  if (originError) return originError;
  const parsed = parsePlatformAdminBody(event);
  if (parsed.error) return parsed.error;
  const email = normalizeEmail(parsed.value.email);
  const password = String(parsed.value.password || "");
  if (!emailPattern.test(email) || !password) return json(401, { error: genericLoginError });

  const identifiers = dependencies.identifiers(event, email);
  const attempt = await dependencies.beginAttempt(sql, identifiers);
  if (attempt.limited) return rateLimited(attempt);

  const admins = await sql`
    select id,full_name,email,status,password_hash,last_login_at
    from platform_admins where lower(email)=${email} limit 1
  `;
  const admin = admins[0] || null;
  const validPassword = await dependencies.comparePassword(password, admin?.password_hash || dummyPasswordHash);
  const outcome = !admin || !validPassword
    ? "invalid_credentials"
    : admin.status === "active" ? "authenticated" : "rejected_account";
  const result = await dependencies.completeAttempt(sql, {
    ...identifiers,
    attemptId: attempt.attemptId,
    platformAdminId: admin?.id || null,
    outcome,
  });

  if (outcome === "invalid_credentials") {
    await auditThreshold(sql, admin, result, dependencies.writeAudit);
    if (result.limited) return rateLimited(result);
    return json(401, { error: genericLoginError });
  }
  if (outcome === "rejected_account") return json(401, { error: genericLoginError });

  const updated = await sql`
    update platform_admins set last_login_at=now() where id=${admin.id}
    returning id,full_name,email,status,last_login_at
  `;
  const session = await dependencies.createSession(sql, admin.id, event);
  await dependencies.writeAudit(sql, {
    platformAdminId: admin.id,
    action: "login_succeeded",
    targetType: "platform_admin",
    targetId: admin.id,
    metadata: { session_hours: 8, recovery: attempt.accountLimited },
  });
  return json(200, { platformAdmin: publicPlatformAdmin(updated[0]) }, { "Set-Cookie": session.cookie });
}

async function logout(event, sql) {
  const originError = requirePlatformAdminOrigin(event);
  if (originError) return originError;
  const auth = await requirePlatformAdmin(event, sql);
  if (auth.error) return json(200, { success: true }, { "Set-Cookie": clearPlatformAdminCookie(event) });
  await revokePlatformAdminSession(sql, event);
  await writePlatformAdminAudit(sql, {
    platformAdminId: auth.platformAdmin.id,
    action: "logout",
    targetType: "platform_admin",
    targetId: auth.platformAdmin.id,
  });
  return json(200, { success: true }, { "Set-Cookie": clearPlatformAdminCookie(event) });
}

export function createPlatformAdminAuthHandler(overrides = {}) {
  const dependencies = {
    getDatabase: overrides.getDatabase || getSql,
    comparePassword: overrides.comparePassword || bcrypt.compare,
    identifiers: overrides.identifiers || platformAdminLoginIdentifiers,
    beginAttempt: overrides.beginAttempt || beginPlatformAdminLoginAttempt,
    completeAttempt: overrides.completeAttempt || completePlatformAdminLoginAttempt,
    createSession: overrides.createSession || createPlatformAdminSession,
    writeAudit: overrides.writeAudit || writePlatformAdminAudit,
  };
  return async function platformAdminAuthHandler(event) {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
    try {
      const sql = dependencies.getDatabase();
      const action = new URLSearchParams(event.rawQuery || "").get("action") || event.queryStringParameters?.action || "me";
      if (event.httpMethod === "POST" && action === "login") return login(event, sql, dependencies);
      if (event.httpMethod === "POST" && action === "logout") return logout(event, sql);
      if (event.httpMethod !== "GET" || action !== "me") return json(405, { error: "Method not allowed" });
      const auth = await requirePlatformAdmin(event, sql);
      if (auth.error) return auth.error;
      return json(200, { authenticated: true, platformAdmin: publicPlatformAdmin(auth.platformAdmin) });
    } catch (error) {
      return safeServerError(error, "Platform authentication failed");
    }
  };
}

export const handler = createPlatformAdminAuthHandler();
