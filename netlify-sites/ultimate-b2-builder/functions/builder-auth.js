import bcrypt from "bcryptjs";

import {
  builderEmailPattern,
  clearBuilderCookie,
  createBuilderSession,
  getBuilderSql,
  json,
  normalizeBuilderEmail,
  parseBuilderBody,
  publicBuilderUser,
  requireBuilderOrigin,
  requireBuilderUser,
  revokeBuilderSession,
  safeBuilderServerError,
  writeBuilderAudit,
} from "../server/_builder-auth.js";
import {
  beginBuilderLoginAttempt,
  builderLoginIdentifiers,
  builderRateLimitMessage,
  completeBuilderLoginAttempt,
} from "../server/_builder-login-rate-limit.js";

const genericLoginError = "Invalid email or password";
const dummyPasswordHash = "$2b$12$TbcfsTmq6FFDE.aOFgkBuelsJsvqk.140AXzYhTFlta7idf64o.c6";

function rateLimited(result) {
  return json(429, { error: builderRateLimitMessage }, { "Retry-After": String(result.retryAfter) });
}

const thresholdAuditAction = {
  pair: "login_pair_rate_limited",
  source: "login_source_rate_limited",
  account: "login_account_risk_detected",
};

async function auditThreshold(sql, user, result, writeAudit) {
  const action = thresholdAuditAction[result.thresholdDimension];
  if (!user || !action) return;
  await writeAudit(sql, {
    builderUserId: user.id,
    action,
    targetId: user.id,
    metadata: { dimension: result.thresholdDimension, category: "threshold" },
  });
}

async function login(event, sql, dependencies) {
  const originError = requireBuilderOrigin(event);
  if (originError) return originError;
  const parsed = parseBuilderBody(event);
  if (parsed.error) return parsed.error;
  const email = normalizeBuilderEmail(parsed.value.email);
  const password = String(parsed.value.password || "");
  if (!builderEmailPattern.test(email) || !password) return json(401, { error: genericLoginError });

  const identifiers = dependencies.identifiers(event, email);
  const attempt = await dependencies.beginAttempt(sql, identifiers);
  if (attempt.limited) return rateLimited(attempt);

  const users = await sql`
    select id,full_name,email,role,status,password_hash,last_login_at
    from builder_users where lower(email)=${email} limit 1
  `;
  const user = users[0] || null;
  const validPassword = await dependencies.comparePassword(password, user?.password_hash || dummyPasswordHash);
  const outcome = !user || !validPassword
    ? "invalid_credentials"
    : user.status === "active" && user.role === "developer" ? "authenticated" : "rejected_account";
  const result = await dependencies.completeAttempt(sql, {
    ...identifiers,
    attemptId: attempt.attemptId,
    builderUserId: user?.id || null,
    outcome,
  });

  if (outcome === "invalid_credentials") {
    await auditThreshold(sql, user, result, dependencies.writeAudit);
    if (result.limited) return rateLimited(result);
    return json(401, { error: genericLoginError });
  }
  if (outcome === "rejected_account") return json(401, { error: genericLoginError });

  const updated = await sql`
    update builder_users set last_login_at=now() where id=${user.id}
    returning id,full_name,email,role,status,last_login_at
  `;
  const session = await dependencies.createSession(sql, user.id, event);
  await dependencies.writeAudit(sql, {
    builderUserId: user.id,
    action: "login_succeeded",
    targetId: user.id,
    metadata: { session_hours: 8, recovery: attempt.accountLimited },
  });
  return json(200, { authenticated: true, builderUser: publicBuilderUser(updated[0]) }, { "Set-Cookie": session.cookie });
}

async function logout(event, sql, dependencies) {
  const originError = requireBuilderOrigin(event);
  if (originError) return originError;
  const auth = await requireBuilderUser(event, sql);
  if (auth.error) return json(200, { success: true }, { "Set-Cookie": clearBuilderCookie(event) });
  await revokeBuilderSession(sql, event);
  await dependencies.writeAudit(sql, {
    builderUserId: auth.builderUser.id,
    action: "logout",
    targetId: auth.builderUser.id,
  });
  return json(200, { success: true }, { "Set-Cookie": clearBuilderCookie(event) });
}

export function createBuilderAuthHandler(overrides = {}) {
  const dependencies = {
    getDatabase: overrides.getDatabase || getBuilderSql,
    comparePassword: overrides.comparePassword || bcrypt.compare,
    identifiers: overrides.identifiers || builderLoginIdentifiers,
    beginAttempt: overrides.beginAttempt || beginBuilderLoginAttempt,
    completeAttempt: overrides.completeAttempt || completeBuilderLoginAttempt,
    createSession: overrides.createSession || createBuilderSession,
    writeAudit: overrides.writeAudit || writeBuilderAudit,
  };
  return async function builderAuthHandler(event) {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
    try {
      const sql = dependencies.getDatabase();
      const action = new URLSearchParams(event.rawQuery || "").get("action") || event.queryStringParameters?.action || "me";
      if (event.httpMethod === "POST" && action === "login") return login(event, sql, dependencies);
      if (event.httpMethod === "POST" && action === "logout") return logout(event, sql, dependencies);
      if (event.httpMethod !== "GET" || action !== "me") return json(405, { error: "Method not allowed" });
      const auth = await requireBuilderUser(event, sql);
      if (auth.error) return auth.error;
      return json(200, { authenticated: true, builderUser: publicBuilderUser(auth.builderUser) });
    } catch (error) {
      return safeBuilderServerError(error);
    }
  };
}

export const handler = createBuilderAuthHandler();
