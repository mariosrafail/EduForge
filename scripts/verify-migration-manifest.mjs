import {
  loadProductionMigrationManifest,
  migrationManifestSummary,
} from "./_migration-readiness.mjs";

try {
  const migrations = await loadProductionMigrationManifest();
  const result = migrationManifestSummary(migrations);
  console.log(
    `Migration manifest verified: ${result.migrationCount} migrations; latest ${result.latestMigration}; fingerprint ${result.manifestFingerprint}.`,
  );
} catch (error) {
  console.error(`Migration manifest verification failed: ${error.message}`);
  process.exitCode = 1;
}
