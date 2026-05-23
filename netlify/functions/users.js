import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import { ensureAuthSchema } from "./_auth-utils.js";

const allowedRoles = new Set(["admin", "teacher", "student"]);
const allowedStatuses = new Set(["active", "invited", "paused"]);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const headers = {
  "Content-Type": "application/json",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  return neon(process.env.DATABASE_URL);
}

function normalizeRole(role) {
  return String(role ?? "").trim().toLowerCase();
}

function normalizeStatus(status) {
  return String(status ?? "invited").trim().toLowerCase();
}

async function ensureDemoSchool(sql) {
  const existing = await sql`
    select id, name, logo, primary_color, secondary_color
    from schools
    where name = 'Hamilton House ELT Demo'
    order by created_at asc
    limit 1
  `;

  if (existing.length > 0) {
    return existing[0];
  }

  const inserted = await sql`
    insert into schools (name, logo, primary_color, secondary_color)
    values ('Hamilton House ELT Demo', 'HH', '#f97316', '#0b1f3a')
    returning id, name, logo, primary_color, secondary_color
  `;

  return inserted[0];
}

function validateUserInput(payload) {
  const fullName = String(payload.full_name ?? payload.name ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase() || null;
  const password = String(payload.password ?? "");
  const role = normalizeRole(payload.role);
  const status = normalizeStatus(payload.status);
  const level = String(payload.level ?? "").trim() || null;
  const schoolId = String(payload.school_id ?? "").trim() || null;

  if (!fullName) {
    return { error: "full_name is required" };
  }

  if (email && !emailPattern.test(email)) {
    return { error: "email must be valid" };
  }

  if (password && password.length < 8) {
    return { error: "password must be at least 8 characters" };
  }

  if (!allowedRoles.has(role)) {
    return { error: "role must be one of: admin, teacher, student" };
  }

  if (!allowedStatuses.has(status)) {
    return { error: "status must be one of: active, invited, paused" };
  }

  if (schoolId && !uuidPattern.test(schoolId)) {
    return { error: "school_id must be a valid UUID" };
  }

  return { value: { fullName, email, password, role, status, level, schoolId } };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    const sql = getSql();

    if (event.httpMethod === "GET") {
      const params = new URLSearchParams(event.rawQuery || "");
      const schoolId = params.get("school_id");

      if (schoolId && !uuidPattern.test(schoolId)) {
        return json(400, { error: "school_id must be a valid UUID" });
      }

      await ensureDemoSchool(sql);

      const users = schoolId
        ? await sql`
            select id, school_id, full_name, email, role, level, status, created_at, updated_at
            from app_users
            where school_id = ${schoolId}
            order by created_at desc
          `
        : await sql`
            select id, school_id, full_name, email, role, level, status, created_at, updated_at
            from app_users
            order by created_at desc
          `;

      return json(200, { users });
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");
      const validation = validateUserInput(payload);

      if (validation.error) {
        return json(400, { error: validation.error });
      }

      const { fullName, email, password, role, status, level } = validation.value;
      await ensureAuthSchema(sql);
      const school = validation.value.schoolId
        ? { id: validation.value.schoolId }
        : await ensureDemoSchool(sql);
      const passwordHash = password ? await bcrypt.hash(password, 12) : null;

      const inserted = await sql`
        insert into app_users (school_id, full_name, email, role, level, status, password_hash, auth_provider)
        values (${school.id}, ${fullName}, ${email}, ${role}, ${level}, ${status}, ${passwordHash}, 'password')
        returning id, school_id, full_name, email, role, level, status, created_at, updated_at
      `;

      return json(201, { user: inserted[0] });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    if (error.code === "23505") {
      return json(409, { error: "Email already exists" });
    }
    return json(500, { error: "User API failed", detail: error.message });
  }
}
