import { getSql, json } from "./_auth-utils.js";
import { runAccountEmailDispatch } from "./_account-email-dispatcher.js";
import { constantTimeSecretMatches, runWithOperationalHistory } from "./_operations-utils.js";

function authorized(event) {
  const supplied = event.headers?.["x-account-dispatch-secret"] || event.headers?.["X-Account-Dispatch-Secret"];
  return constantTimeSecretMatches(supplied, process.env.ACCOUNT_EMAIL_DISPATCH_SECRET);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  if (!authorized(event)) return json(401, { error: "Unauthorized" });
  try {
    const sql = getSql();
    const summary = await runWithOperationalHistory(sql, "email_dispatcher", () => runAccountEmailDispatch({ sql }));
    return json(200, summary);
  } catch {
    return json(500, { error: "Email dispatch failed" });
  }
}
