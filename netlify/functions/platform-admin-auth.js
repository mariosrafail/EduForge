import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { emailPattern, getSql, json, safeServerError } from "./_auth-utils.js";
import {
  clearPlatformAdminCookie,
  createPlatformAdminSession,
  parsePlatformAdminBody,
  platformAdminLoginLimit,
  platformAdminLoginWindowMinutes,
  platformAdminRequestFingerprint,
  publicPlatformAdmin,
  requirePlatformAdmin,
  requirePlatformAdminOrigin,
  revokePlatformAdminSession,
  writePlatformAdminAudit,
  normalizeEmail,
} from "./_platform-admin-auth.js";

const genericLoginError = "Invalid email or password";
const dummyPasswordHash = "$2b$12$TbcfsTmq6FFDE.aOFgkBuelsJsvqk.140AXzYhTFlta7idf64o.c6";

async function login(event, sql) {
  const originError = requirePlatformAdminOrigin(event);
  if (originError) return originError;
  const parsed = parsePlatformAdminBody(event);
  if (parsed.error) return parsed.error;
  const email = normalizeEmail(parsed.value.email);
  const password = String(parsed.value.password || "");
  if (!emailPattern.test(email) || !password) return json(401, { error: genericLoginError });

  const fingerprint = platformAdminRequestFingerprint(event);
  const emailHash = createHash("sha256").update(email).digest("hex");
  const admins = await sql`
    select id,full_name,email,status,password_hash,last_login_at
    from platform_admins where lower(email)=${email} limit 1
  `;
  const admin = admins[0] || null;
  const attempts = await sql`
    select count(*)::int count from platform_admin_login_attempts
    where attempted_at>now()-(${platformAdminLoginWindowMinutes}*interval '1 minute')
      and succeeded=false
      and (request_fingerprint=${fingerprint} or email_hash=${emailHash})
  `;
  if (Number(attempts[0]?.count || 0) >= platformAdminLoginLimit) {
    await sql`
      insert into platform_admin_login_attempts(platform_admin_id,request_fingerprint,email_hash)
      values(${admin?.id || null},${fingerprint},${emailHash})
    `;
    if (admin) {
      await writePlatformAdminAudit(sql, {
        platformAdminId: admin.id,
        action: "login_rate_limited",
        targetType: "platform_admin",
        targetId: admin.id,
        metadata: { reason: "threshold_reached" },
      });
    }
    return json(429, { error: "Too many login attempts. Try again later." }, { "Retry-After": "900" });
  }

  const validPassword = await bcrypt.compare(password, admin?.password_hash || dummyPasswordHash);
  const accepted = Boolean(admin && admin.status === "active" && validPassword);
  await sql`
    insert into platform_admin_login_attempts(platform_admin_id,request_fingerprint,email_hash,succeeded)
    values(${admin?.id || null},${fingerprint},${emailHash},${accepted})
  `;
  if (!accepted) {
    if (admin && Number(attempts[0]?.count || 0) + 1 === platformAdminLoginLimit) {
      await writePlatformAdminAudit(sql, {
        platformAdminId: admin.id,
        action: "login_failure_threshold",
        targetType: "platform_admin",
        targetId: admin.id,
        metadata: { reason: "invalid_credentials" },
      });
    }
    return json(401, { error: genericLoginError });
  }

  const updated = await sql`
    update platform_admins set last_login_at=now() where id=${admin.id}
    returning id,full_name,email,status,last_login_at
  `;
  const session = await createPlatformAdminSession(sql, admin.id, event);
  await writePlatformAdminAudit(sql, {
    platformAdminId: admin.id,
    action: "login_succeeded",
    targetType: "platform_admin",
    targetId: admin.id,
    metadata: { session_hours: 8 },
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

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  try {
    const sql = getSql();
    const action = new URLSearchParams(event.rawQuery || "").get("action") || event.queryStringParameters?.action || "me";
    if (event.httpMethod === "POST" && action === "login") return login(event, sql);
    if (event.httpMethod === "POST" && action === "logout") return logout(event, sql);
    if (event.httpMethod !== "GET" || action !== "me") return json(405, { error: "Method not allowed" });
    const auth = await requirePlatformAdmin(event, sql);
    if (auth.error) return auth.error;
    return json(200, { authenticated: true, platformAdmin: publicPlatformAdmin(auth.platformAdmin) });
  } catch (error) {
    return safeServerError(error, "Platform authentication failed");
  }
}
