import { ensureAuthSchema, getSql, json, publicUser, requireAuth } from "./_auth-utils.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const sql = getSql();
    await ensureAuthSchema(sql);
    const auth = await requireAuth(event, sql);
    if (auth.error) return auth.error;

    return json(200, { user: publicUser(auth.currentUser), authenticated: true });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Auth check failed" });
  }
}
