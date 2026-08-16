import { spawnSync } from "node:child_process";
import { checkStagingDeployment } from "./_staging-preflight.mjs";

const verifiedEnvironment = { ...process.env };
await checkStagingDeployment(verifiedEnvironment);
// Migration consumes the full verified contract. Subsequent target-only tools
// retain the generic collision guard without requiring an operator shell change.
const targetOnlyEnvironment = { ...verifiedEnvironment };
delete targetOnlyEnvironment.DATABASE_URL;

for (const script of ["staging:migrate", "staging:seed", "staging:integrity", "staging:smoke"]) {
  console.log(`\n== ${script} ==`);
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("staging:verify must be started with npm run staging:verify");
  const result = spawnSync(process.execPath, [npmCli, "run", script], {
    stdio: "inherit",
    env: script === "staging:migrate" ? verifiedEnvironment : targetOnlyEnvironment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("\nStaging verification passed. QA data remains available for manual UI verification; run npm run staging:cleanup when finished.");
