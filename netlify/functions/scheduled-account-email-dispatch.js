import { getSql } from "./_auth-utils.js";
import { runAccountEmailDispatch } from "./_account-email-dispatcher.js";
import { runWithOperationalHistory } from "./_operations-utils.js";

export async function runScheduledEmailDispatch(sql = getSql()) {
  return runWithOperationalHistory(sql, "email_dispatcher", () => runAccountEmailDispatch({ sql }));
}

export default async function scheduledAccountEmailDispatch() {
  await runScheduledEmailDispatch();
  return new Response(null, { status: 204 });
}

export const config = { schedule: "*/15 * * * *" };
