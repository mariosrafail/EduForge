import { clearSessionCookie, ensureAuthSchema, getCookie, getSql, hashToken, json, sessionCookieName } from "./_auth-utils.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const token = getCookie(event, sessionCookieName);

    if (token) {
      const sql = getSql();
      await ensureAuthSchema(sql);
      await sql`
        delete from auth_sessions
        where token_hash = ${hashToken(token)}
      `;
    }

    return json(200, { success: true }, { "Set-Cookie": clearSessionCookie(event) });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Signout failed" }, { "Set-Cookie": clearSessionCookie(event) });
  }
}
