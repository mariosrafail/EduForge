import { neon } from "@neondatabase/serverless";

const allowedRoles = new Set(["admin", "teacher", "student"]);
const allowedStatuses = new Set(["active", "invited", "paused"]);
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
  return String(status ?? "").trim().toLowerCase();
}

function getUserId(event) {
  const params = new URLSearchParams(event.rawQuery || "");
  return params.get("id");
}

function validatePatch(payload) {
  const updates = {};

  if ("full_name" in payload || "name" in payload) {
    const fullName = String(payload.full_name ?? payload.name ?? "").trim();
    if (!fullName) return { error: "full_name cannot be empty" };
    updates.fullName = fullName;
  }

  if ("email" in payload) {
    updates.email = String(payload.email ?? "").trim() || null;
  }

  if ("role" in payload) {
    const role = normalizeRole(payload.role);
    if (!allowedRoles.has(role)) {
      return { error: "role must be one of: admin, teacher, student" };
    }
    updates.role = role;
  }

  if ("level" in payload) {
    updates.level = String(payload.level ?? "").trim() || null;
  }

  if ("status" in payload) {
    const status = normalizeStatus(payload.status);
    if (!allowedStatuses.has(status)) {
      return { error: "status must be one of: active, invited, paused" };
    }
    updates.status = status;
  }

  if (Object.keys(updates).length === 0) {
    return { error: "No supported fields provided" };
  }

  return { value: updates };
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    const id = getUserId(event);

    if (!id) {
      return json(400, { error: "id query parameter is required" });
    }

    if (!uuidPattern.test(id)) {
      return json(400, { error: "id must be a valid UUID" });
    }

    const sql = getSql();

    if (event.httpMethod === "PATCH") {
      const payload = JSON.parse(event.body || "{}");
      const validation = validatePatch(payload);

      if (validation.error) {
        return json(400, { error: validation.error });
      }

      const current = await sql`
        select id, school_id, full_name, email, role, level, status
        from app_users
        where id = ${id}
        limit 1
      `;

      if (current.length === 0) {
        return json(404, { error: "User not found" });
      }

      const next = { ...current[0], ...validation.value };

      const updated = await sql`
        update app_users
        set
          full_name = ${next.fullName ?? next.full_name},
          email = ${next.email},
          role = ${next.role},
          level = ${next.level},
          status = ${next.status}
        where id = ${id}
        returning id, school_id, full_name, email, role, level, status, created_at, updated_at
      `;

      return json(200, { user: updated[0] });
    }

    if (event.httpMethod === "DELETE") {
      const deleted = await sql`
        delete from app_users
        where id = ${id}
        returning id
      `;

      if (deleted.length === 0) {
        return json(404, { error: "User not found" });
      }

      return json(200, { deleted: true, id: deleted[0].id });
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    return json(500, { error: "User API failed", detail: error.message });
  }
}
