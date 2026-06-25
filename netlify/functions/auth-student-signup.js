import bcrypt from "bcryptjs";
import { createSession, emailPattern, ensureAuthSchema, getSql, json, normalizeEmail, publicUser, serverError } from "./_auth-utils.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validate(payload) {
  const fullName = String(payload.fullName ?? payload.studentName ?? "").trim();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? "");
  const classCode = String(payload.classCode ?? payload.inviteCode ?? payload.classSlug ?? "").trim();
  const bookCode = String(payload.bookCode ?? "").trim();

  if (!fullName) return { error: "fullName is required" };
  if (!emailPattern.test(email)) return { error: "A valid email is required" };
  if (password.length < 8) return { error: "Password must be at least 8 characters" };
  if (!classCode) return { error: "Class invite code is required for student signup in this MVP" };

  return { value: { fullName, email, password, classCode, bookCode } };
}

async function findClass(sql, classCode) {
  const rows = uuidPattern.test(classCode)
    ? await sql`
        select id, school_id, invite_code, slug
        from classes
        where id = ${classCode} or invite_code = ${classCode} or slug = ${classCode}
        limit 1
      `
    : await sql`
        select id, school_id, invite_code, slug
        from classes
        where invite_code = ${classCode} or slug = ${classCode}
        limit 1
      `;
  return rows[0] || null;
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
    if (validation.error) return json(400, { error: validation.error });

    const sql = getSql();
    await ensureAuthSchema(sql);
    const { fullName, email, password, classCode } = validation.value;

    const classItem = await findClass(sql, classCode);
    if (!classItem?.school_id) {
      return json(400, { error: "A valid class invite code is required for student signup in this MVP" });
    }

    const existing = await sql`select id from app_users where lower(email) = ${email} limit 1`;
    if (existing.length > 0) return json(409, { error: "Email already exists" });

    const passwordHash = await bcrypt.hash(password, 12);
    const users = await sql`
      insert into app_users (school_id, full_name, email, role, level, status, password_hash, auth_provider)
      values (${classItem.school_id}, ${fullName}, ${email}, 'student', null, 'active', ${passwordHash}, 'password')
      returning id, school_id, full_name, email, role, status
    `;

    const session = await createSession(sql, users[0].id, event);
    return json(201, { user: publicUser(users[0]) }, { "Set-Cookie": session.cookie });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") return json(409, { error: "Email already exists" });
    return serverError("Student signup failed. Check database setup and migrations.");
  }
}
