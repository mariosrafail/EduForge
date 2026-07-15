import bcrypt from "bcryptjs";
import {
  allowedStatuses,
  emailPattern,
  ensureAuthSchema,
  getSql,
  json,
  normalizeEmail,
  normalizeRole,
  normalizeStatus,
  publicUser,
  requireRole,
  safeServerError,
} from "./_auth-utils.js";

const creatableRoles = new Set(["teacher", "student"]);

function validateUserInput(payload) {
  const fullName = String(payload.full_name ?? payload.name ?? "").trim();
  const email = normalizeEmail(payload.email) || null;
  const password = String(payload.password ?? "");
  const role = normalizeRole(payload.role);
  const status = normalizeStatus(payload.status);
  const level = String(payload.level ?? "").trim() || null;

  if (!fullName) return { error: "full_name is required" };
  if (email && !emailPattern.test(email)) return { error: "email must be valid" };
  if (password && password.length < 8) return { error: "password must be at least 8 characters" };
  if (!creatableRoles.has(role)) return { error: "role must be one of: teacher, student" };
  if (!allowedStatuses.has(status)) return { error: "status must be one of: active, invited, paused" };
  if (status === "active" && (!email || !password)) return { error: "active users require an email and password" };

  return { value: { fullName, email, password, role, status, level } };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  if (!["GET", "POST"].includes(event.httpMethod)) return json(405, { error: "Method not allowed" });

  try {
    const sql = getSql();
    await ensureAuthSchema(sql);
    const auth = await requireRole(event, ["admin"], sql);
    if (auth.error) return auth.error;
    if (!auth.currentUser.school_id) return json(403, { error: "Forbidden" });

    if (event.httpMethod === "GET") {
      const users = await sql`
        select id, school_id, full_name, email, role, level, status, created_at, updated_at
        from app_users
        where school_id = ${auth.currentUser.school_id}
        order by created_at desc
      `;
      return json(200, { users: users.map(publicUser).map((user, index) => ({ ...user, created_at: users[index].created_at, updated_at: users[index].updated_at })) });
    }

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Request body must be valid JSON" });
    }
    const validation = validateUserInput(payload);
    if (validation.error) return json(400, { error: validation.error });

    const { fullName, email, password, role, status, level } = validation.value;
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    const inserted = await sql`
      insert into app_users (school_id, full_name, email, role, level, status, password_hash, auth_provider)
      values (${auth.currentUser.school_id}, ${fullName}, ${email}, ${role}, ${level}, ${status}, ${passwordHash}, 'password')
      returning id, school_id, full_name, email, role, level, status, created_at, updated_at
    `;
    return json(201, { user: { ...publicUser(inserted[0]), created_at: inserted[0].created_at, updated_at: inserted[0].updated_at } });
  } catch (error) {
    if (error.code === "23505") return json(409, { error: "Email already exists" });
    return safeServerError(error, "User API failed");
  }
}
