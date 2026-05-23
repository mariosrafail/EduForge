import bcrypt from "bcryptjs";
import { createSession, emailPattern, ensureAuthSchema, getSql, json, normalizeEmail, publicUser, serverError } from "./_auth-utils.js";

function validate(payload) {
  const schoolName = String(payload.schoolName ?? "").trim();
  const adminName = String(payload.adminName ?? "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? "");

  if (!schoolName) return { error: "schoolName is required" };
  if (!adminName) return { error: "adminName is required" };
  if (!emailPattern.test(email)) return { error: "A valid email is required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };

  return { value: { schoolName, adminName, email, password } };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  let sql;
  let createdSchoolId = null;

  try {
    const payload = JSON.parse(event.body || "{}");
    const validation = validate(payload);

    if (validation.error) {
      return json(400, { error: validation.error });
    }

    sql = getSql();
    await ensureAuthSchema(sql);
    const { schoolName, adminName, email, password } = validation.value;

    const existing = await sql`
      select id from app_users where lower(email) = ${email} limit 1
    `;

    if (existing.length > 0) {
      return json(409, { error: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const schools = await sql`
      insert into schools (name, logo, primary_color, secondary_color)
      values (${schoolName}, 'HH', '#f97316', '#0b1f3a')
      returning id
    `;
    createdSchoolId = schools[0].id;

    const users = await sql`
      insert into app_users (school_id, full_name, email, role, level, status, password_hash, auth_provider)
      values (${schools[0].id}, ${adminName}, ${email}, 'admin', 'Operations', 'active', ${passwordHash}, 'password')
      returning id, school_id, full_name, email, role, status
    `;

    const session = await createSession(sql, users[0].id, event);

    return json(201, { user: publicUser(users[0]) }, { "Set-Cookie": session.cookie });
  } catch (error) {
    console.error(error);
    if (createdSchoolId && sql) {
      try {
        await sql`delete from schools where id = ${createdSchoolId}`;
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }
    if (error.code === "23505") {
      return json(409, { error: "Email already exists" });
    }
    return serverError("Signup failed. Check database setup and migrations.");
  }
}
