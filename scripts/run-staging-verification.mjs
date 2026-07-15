import { spawnSync } from "node:child_process";
import { requireSafeDatabase } from "./_staging-db.mjs";

requireSafeDatabase("staging");

for (const script of ["staging:migrate", "staging:seed", "staging:integrity", "staging:smoke"]) {
  console.log(`\n== ${script} ==`);
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("staging:verify must be started with npm run staging:verify");
  const result = spawnSync(process.execPath, [npmCli, "run", script], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("\nStaging verification passed. QA data remains available for manual UI verification; run npm run staging:cleanup when finished.");
