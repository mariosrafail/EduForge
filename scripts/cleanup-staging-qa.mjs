import { createSafePool, withAdvisoryLock } from "./_staging-db.mjs";
import { QA, QA_SEED_KEYS, qaEntityIds, qaInviteFingerprints } from "./_staging-qa-data.mjs";
import { classifyQaCleanupState } from "./_staging-cleanup-safety.mjs";

const { pool, safeLabel } = createSafePool("staging");
const client = await pool.connect();

try {
  console.log(`Cleaning registered QA data from isolated staging target: ${safeLabel}`);
  const historyBefore = (await pool.query(
    "select filename, checksum_sha256, applied_at from eduforge_migration_history order by filename",
  )).rows;
  await withAdvisoryLock(client, "eduforge:staging:qa-seed", async () => {
    await client.query("begin");
    try {
      const registryExists = (await client.query("select to_regclass('public.staging_qa_registry') is not null as exists")).rows[0].exists;
      if (!registryExists) throw new Error("staging_qa_registry does not exist; refusing unscoped cleanup");
      const registered = await client.query(
        "select entity_type, entity_id from staging_qa_registry where seed_key = any($1::text[]) order by entity_type, entity_id",
        [QA_SEED_KEYS],
      );
      const expectedRegistry = new Set(qaEntityIds().map(([type, id]) => `${type}:${id}`));
      const actualRegistry = new Set(registered.rows.map((row) => `${row.entity_type}:${row.entity_id}`));
      const schoolIds = QA.schools.map((school) => school.id);
      const roots = Number((await client.query(
        `select
          (select count(*) from schools where id = any($1::uuid[])) +
          (select count(*) from publishers where id = $2) as count`,
        [schoolIds, QA.publisher.id],
      )).rows[0].count);
      const cleanupState = classifyQaCleanupState(actualRegistry, expectedRegistry, roots);
      await client.query("delete from class_invite_attempts where request_fingerprint = any($1::text[])", [qaInviteFingerprints()]);
      if (cleanupState === "already-clean") {
        await client.query("commit");
        return;
      }
      for (const school of QA.schools) {
        const row = (await client.query("select name from schools where id = $1", [school.id])).rows[0];
        if (row && row.name !== school.name) throw new Error(`School ${school.id} is not the expected QA school`);
      }
      const publisher = (await client.query("select slug from publishers where id = $1", [QA.publisher.id])).rows[0];
      if (publisher && publisher.slug !== QA.publisher.slug) throw new Error("QA publisher ID belongs to unexpected data");

      await client.query("delete from lesson_assignments where school_id = any($1::uuid[])", [schoolIds]);
      await client.query("delete from schools where id = any($1::uuid[])", [schoolIds]);
      await client.query("delete from publishers where id = $1", [QA.publisher.id]);
      await client.query("delete from staging_qa_registry where seed_key = any($1::text[])", [QA_SEED_KEYS]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });

  const deterministicUserIds = QA.schools.flatMap((school) => Object.values(school.users).map((user) => user.id));
  const remaining = Number((await pool.query(
    `select
      (select count(*) from schools where id = any($1::uuid[])) +
      (select count(*) from app_users where id = any($2::uuid[])) +
      (select count(*) from publishers where id = $3) +
      (select count(*) from auth_sessions where user_id = any($2::uuid[])) +
      (select count(*) from class_invite_attempts where request_fingerprint = any($4::text[])) as count`,
    [QA.schools.map((school) => school.id), deterministicUserIds, QA.publisher.id, qaInviteFingerprints()],
  )).rows[0].count);
  if (remaining) throw new Error(`QA cleanup verification found ${remaining} remaining tagged root/account row(s)`);
  const historyAfter = (await pool.query(
    "select filename, checksum_sha256, applied_at from eduforge_migration_history order by filename",
  )).rows;
  if (JSON.stringify(historyAfter) !== JSON.stringify(historyBefore)) {
    throw new Error("QA cleanup changed migration history");
  }
  console.log("Staging QA cleanup completed idempotently; registered QA rows, sessions, and invite attempts are absent and migration history is unchanged.");
} finally {
  client.release();
  await pool.end();
}
