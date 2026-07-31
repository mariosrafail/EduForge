import { clearSessionCookie, getCookie, getSql, hashToken, json, sessionCookieName } from "./_auth-utils.js";
import {
  requireRuntimeSchema,
  schemaFailureResponse,
  schemaNotReadyResponse,
} from "./_runtime-schema-readiness.js";

export function createSignoutHandler(dependencies = {}) {
  const database = dependencies.getDatabase || getSql;
  const checkReadiness = dependencies.checkReadiness || requireRuntimeSchema;
  return async function signoutHandler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: { "Content-Type": "application/json" }, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const token = getCookie(event, sessionCookieName);

    if (token) {
      const sql = database();
      const readinessError = await checkReadiness(sql);
      if (readinessError) {
        return schemaNotReadyResponse({ "Set-Cookie": clearSessionCookie(event) });
      }
      await sql`
        delete from auth_sessions
        where token_hash = ${hashToken(token)}
      `;
    }

    return json(200, { success: true }, { "Set-Cookie": clearSessionCookie(event) });
  } catch (error) {
    console.error(error);
    const schemaError = schemaFailureResponse(error, { "Set-Cookie": clearSessionCookie(event) });
    if (schemaError) return schemaError;
    return json(500, { error: "Signout failed" }, { "Set-Cookie": clearSessionCookie(event) });
  }
  };
}

export const handler = createSignoutHandler();
