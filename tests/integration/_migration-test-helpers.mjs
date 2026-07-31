import { loadProductionMigrationManifest } from "../../scripts/_migration-readiness.mjs";

export async function applyCanonicalProductionMigrations(pool) {
  const migrations = await loadProductionMigrationManifest();
  await pool.query(`
    create table eduforge_migration_history(
      filename text primary key,
      checksum_sha256 text not null,
      applied_at timestamptz not null default now()
    )
  `);
  for (const migration of migrations) {
    await pool.query("begin");
    try {
      await pool.query(migration.sql);
      await pool.query(
        "insert into eduforge_migration_history(filename,checksum_sha256) values($1,$2)",
        [migration.filename, migration.checksum],
      );
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback").catch(() => {});
      throw error;
    }
  }
  return migrations;
}
