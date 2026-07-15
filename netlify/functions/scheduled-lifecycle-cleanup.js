import { getSql } from "./_auth-utils.js";
import { runLifecycleCleanup } from "./_lifecycle-cleanup.js";
import { runWithOperationalHistory } from "./_operations-utils.js";

export async function runScheduledLifecycleCleanup(sql = getSql()) {
  return runWithOperationalHistory(sql, "lifecycle_cleanup", () => runLifecycleCleanup({ sql }));
}

export default async function scheduledLifecycleCleanup() {
  await runScheduledLifecycleCleanup();
  return new Response(null, { status: 204 });
}

export const config = { schedule: "17 2 * * *" };
