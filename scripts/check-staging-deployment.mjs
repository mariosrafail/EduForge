import { checkStagingDeployment } from "./_staging-preflight.mjs";

try {
  const result = await checkStagingDeployment();
  console.log(`Staging preflight passed for ${result.app_host}; ${result.latest_migration}; email mode ${result.email_mode}.`);
} catch (error) {
  console.error(`Staging preflight failed: ${error.message}`);
  process.exitCode = 1;
}
