import { getSql, json } from "./_auth-utils.js";
import { buildIdentifier, constantTimeSecretMatches } from "./_operations-utils.js";

function privateAuthorized(event) {
  const supplied = event.headers?.["x-operational-monitoring-secret"] || event.headers?.["X-Operational-Monitoring-Secret"];
  return constantTimeSecretMatches(supplied, process.env.OPERATIONAL_MONITORING_SECRET);
}

export async function handler(event) {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const wantsPrivate = String(event.queryStringParameters?.detail || "") === "private";
  if (wantsPrivate && !privateAuthorized(event)) return json(401, { error: "Unauthorized" });
  try {
    const sql = getSql();
    await sql`select 1 as healthy`;
    const basic = { status: "ok", database: "ok", build: buildIdentifier() };
    if (!wantsPrivate) return json(200, basic);
    const [migration, outbox, tokenAnomalies, rateBacklog, integrity, lastDispatcher] = await Promise.all([
      sql`select filename from eduforge_migration_history order by applied_at desc, filename desc limit 1`,
      sql`select count(*) filter(where delivery_state in ('queued','retryable'))::int pending, count(*) filter(where delivery_state='exhausted')::int exhausted, count(*) filter(where delivery_state='sending' and claimed_at<now()-interval '15 minutes')::int stale_claims, count(*) filter(where delivery_state in ('failed','exhausted') and created_at>now()-interval '24 hours')::int recent_failures from account_email_outbox`,
      sql`select count(*)::int count from account_tokens where used_at is null and revoked_at is null and expires_at < now()-interval '30 days'`,
      sql`select count(*)::int count from account_rate_limit_attempts where attempted_at < now()-interval '7 days'`,
      sql`select coalesce(sum(null_school_rows),0)::int count from tenant_integrity_issues`,
      sql`select finished_at, succeeded from operational_runs where run_type='email_dispatcher' order by started_at desc limit 1`,
    ]);
    return json(200, {
      ...basic,
      migration: migration[0]?.filename || "unknown",
      outbox: outbox[0] || { pending: 0, exhausted: 0, stale_claims: 0, recent_failures: 0 },
      expired_token_anomalies: Number(tokenAnomalies[0]?.count || 0),
      rate_limit_cleanup_backlog: Number(rateBacklog[0]?.count || 0),
      tenant_integrity_issues: Number(integrity[0]?.count || 0),
      dispatcher_last_run: lastDispatcher[0] || null,
    });
  } catch {
    return json(503, { status: "unavailable", database: "unavailable", build: buildIdentifier() });
  }
}
