import { currentUserFromEvent, ensureAuthSchema, getCookie, getSql, json, publicUser, sessionCookieName } from "./_auth-utils.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    if (!getCookie(event, sessionCookieName)) {
      return json(401, { error: "Not signed in" });
    }

    const sql = getSql();
    await ensureAuthSchema(sql);
    const user = await currentUserFromEvent(sql, event);

    if (!user) {
      return json(401, { error: "Not signed in" });
    }

    return json(200, { user: publicUser(user) });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Auth check failed" });
  }
}
