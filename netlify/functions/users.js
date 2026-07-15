import { handler as accountInviteHandler } from "./account-invite.js";
import {
  ensureAuthSchema,
  getSql,
  json,
  publicUser,
  requireRole,
  safeServerError,
} from "./_auth-utils.js";

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
        select u.id,u.school_id,u.full_name,u.email,u.role,u.level,u.status,u.created_at,u.updated_at,
          delivery.delivery_state as invitation_delivery_state
        from app_users u
        left join lateral (select delivery_state from account_email_outbox where user_id=u.id and template_type='account_invitation' order by created_at desc limit 1) delivery on true
        where u.school_id = ${auth.currentUser.school_id}
        order by u.created_at desc
      `;
      return json(200, { users: users.map(publicUser).map((user, index) => ({ ...user, created_at: users[index].created_at, updated_at: users[index].updated_at, invitation_delivery_state: users[index].invitation_delivery_state })) });
    }

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Request body must be valid JSON" });
    }
    return accountInviteHandler({ ...event, body: JSON.stringify({ full_name: payload.full_name ?? payload.name, email: payload.email, role: payload.role, level: payload.level }) });
  } catch (error) {
    if (error.code === "23505") return json(409, { error: "Email already exists" });
    return safeServerError(error, "User API failed");
  }
}
