import bcrypt from "bcryptjs";
import { createSession, emailPattern, ensureAuthSchema, getSql, json, normalizeEmail, publicUser, serverError } from "./_auth-utils.js";

function validate(payload) {
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? "");

  if (!emailPattern.test(email)) return { error: "A valid email is required" };
  if (!password) return { error: "Password is required" };

  return { value: { email, password } };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const validation = validate(payload);

    if (validation.error) {
      return json(400, { error: validation.error });
    }

    const sql = getSql();
    await ensureAuthSchema(sql);
    const { email, password } = validation.value;
    const users = await sql`
      select u.id, u.school_id, u.full_name, u.email, u.role, u.status, u.password_hash,
        coalesce(s.status, 'active') as school_status
      from app_users u
      join schools s on s.id = u.school_id
      where lower(u.email) = ${email}
      limit 1
    `;

    const user = users[0];

    if (!user?.password_hash) {
      return json(401, { error: "Invalid email or password" });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return json(401, { error: "Invalid email or password" });
    }

    if (user.status !== "active" || user.school_status !== "active") {
      await sql`delete from auth_sessions where user_id = ${user.id}`;
      return json(403, { error: "This account is not active" });
    }

    const updated = await sql`
      update app_users
      set last_login_at = now()
      where id = ${user.id}
      returning id, school_id, full_name, email, role, status
    `;

    const session = await createSession(sql, user.id, event);

    return json(200, { user: publicUser(updated[0]) }, { "Set-Cookie": session.cookie });
  } catch (error) {
    console.error(error);
    return serverError("Signin failed. Check database setup and migrations.");
  }
}
