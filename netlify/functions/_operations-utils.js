import { createHash, timingSafeEqual } from "node:crypto";

export function buildIdentifier() {
  return String(process.env.COMMIT_REF || process.env.DEPLOY_ID || process.env.BUILD_ID || "unknown").slice(0, 128);
}

export function constantTimeSecretMatches(supplied, expected) {
  const left = createHash("sha256").update(String(supplied || "")).digest();
  const right = createHash("sha256").update(String(expected || "")).digest();
  return Boolean(supplied && expected) && timingSafeEqual(left, right);
}

export async function runWithOperationalHistory(sql, runType, operation) {
  const rows = await sql`
    insert into operational_runs (run_type, build_identifier)
    values (${runType}, ${buildIdentifier()}) returning id
  `;
  const runId = rows[0].id;
  try {
    const counts = await operation();
    await sql`
      update operational_runs
      set finished_at=now(), succeeded=true, aggregate_counts=${JSON.stringify(counts)}::jsonb
      where id=${runId}
    `;
    return counts;
  } catch (error) {
    const failureCode = String(error?.code || "operation_failed").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 64) || "operation_failed";
    await sql`
      update operational_runs
      set finished_at=now(), succeeded=false, failure_code=${failureCode}
      where id=${runId}
    `;
    throw error;
  }
}
