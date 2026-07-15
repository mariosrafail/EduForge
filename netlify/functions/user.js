import {
  allowedRoles,
  allowedStatuses,
  getSql,
  isValidUuid,
  json,
  normalizeRole,
  normalizeStatus,
  publicUser,
  requireRole,
  safeServerError,
} from "./_auth-utils.js";

function getUserId(event) {
  return new URLSearchParams(event.rawQuery || "").get("id");
}

async function wouldRemoveFinalActiveAdmin(sql, user, nextRole, nextStatus) {
  if (user.role !== "admin" || user.status !== "active") return false;
  if (nextRole === "admin" && nextStatus === "active") return false;
  const rows = await sql`
    select count(*)::int as count
    from app_users
    where school_id = ${user.school_id}
      and role = 'admin'
      and status = 'active'
  `;
  return Number(rows[0]?.count || 0) <= 1;
}

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  if (!["GET", "PATCH", "DELETE"].includes(event.httpMethod)) return json(405, { error: "Method not allowed" });

  const id = getUserId(event);
  if (!isValidUuid(id)) return json(400, { error: "id must be a valid UUID" });

  try {
    const sql = getSql();
    const auth = await requireRole(event, ["admin"], sql);
    if (auth.error) return auth.error;

    const rows = await sql`
      select id, school_id, full_name, email, role, level, status, created_at, updated_at
      from app_users
      where id = ${id} and school_id = ${auth.currentUser.school_id}
      limit 1
    `;
    const user = rows[0];
    if (!user) return json(404, { error: "User not found" });

    if (event.httpMethod === "GET") return json(200, { user: publicUser(user) });

    if (event.httpMethod === "PATCH") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { error: "Request body must be valid JSON" });
      }
      const fullName = body.full_name === undefined && body.name === undefined ? user.full_name : String(body.full_name ?? body.name).trim();
      const role = body.role === undefined ? user.role : normalizeRole(body.role);
      const status = body.status === undefined ? user.status : normalizeStatus(body.status);
      const level = body.level === undefined ? user.level : String(body.level || "").trim() || null;
      if (!fullName) return json(400, { error: "full_name is required" });
      if (!allowedRoles.has(role)) return json(400, { error: "role must be one of: admin, teacher, student" });
      if (!allowedStatuses.has(status)) return json(400, { error: "status must be one of: active, invited, paused" });
      if (await wouldRemoveFinalActiveAdmin(sql, user, role, status)) {
        return json(409, { error: "A school must retain at least one active admin" });
      }

      const updated = await sql`
        update app_users
        set full_name = ${fullName}, role = ${role}, status = ${status}, level = ${level}
        where id = ${id} and school_id = ${auth.currentUser.school_id}
        returning id, school_id, full_name, email, role, level, status, created_at, updated_at
      `;
      if (status !== "active") await sql`delete from auth_sessions where user_id = ${id}`;
      return json(200, { user: publicUser(updated[0]) });
    }

    if (await wouldRemoveFinalActiveAdmin(sql, user, "deleted", "deleted")) {
      return json(409, { error: "A school must retain at least one active admin" });
    }
    await sql`delete from app_users where id = ${id} and school_id = ${auth.currentUser.school_id}`;
    return json(200, { deleted: true });
  } catch (error) {
    return safeServerError(error, "User API failed");
  }
}
