import bcrypt from "bcryptjs";
import { createSession, emailPattern, getSql, json, normalizeEmail, publicUser } from "./_auth-utils.js";

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
    const { email, password } = validation.value;
    const users = await sql`
      select id, school_id, full_name, email, role, status, password_hash
      from app_users
      where lower(email) = ${email}
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
    return json(500, { error: "Signin failed" });
  }
}
