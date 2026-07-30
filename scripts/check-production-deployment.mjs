import { checkProductionDatabase } from "./_production-preflight.mjs";

try {
  const result = await checkProductionDatabase();
  console.log(
    `Production preflight passed: ${result.expectedCount} migrations verified; latest ${result.latestMigration}; tenant integrity clean.`,
  );
} catch (error) {
  console.error(`Production preflight failed: ${error.message}`);
  process.exitCode = 1;
}
