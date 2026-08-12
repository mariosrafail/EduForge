import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function runNpmScript(script, environment = process.env) {
  const npmCli = environment.npm_execpath;
  if (!npmCli) throw new Error("deploy:build must be started with npm run deploy:build");
  const result = spawnSync(process.execPath, [npmCli, "run", script], {
    stdio: "inherit",
    env: environment,
  });
  if (result.error) throw result.error;
  if (result.signal) {
    const error = new Error(`${script} terminated by signal ${result.signal}`);
    error.signal = result.signal;
    throw error;
  }
  if (result.status !== 0) {
    const error = new Error(`${script} failed with status ${result.status}`);
    error.status = result.status || 1;
    throw error;
  }
}

export function deploymentBuildPolicy(environment = process.env) {
  const netlify = environment.NETLIFY === "true";
  const context = String(environment.CONTEXT || "").trim();
  if (!netlify) {
    if (context) throw new Error("Netlify deployment context requires NETLIFY=true");
    return { context: "local", runProductionPreflight: false };
  }
  if (!context) throw new Error("Netlify CONTEXT is required");
  if (context === "production") {
    if (environment.BRANCH !== "main") throw new Error("Netlify production builds must use branch main");
    if (!String(environment.COMMIT_REF || "").trim()) throw new Error("Netlify production builds require COMMIT_REF");
    return { context, runProductionPreflight: true };
  }
  if (context === "deploy-preview" || context === "branch-deploy") {
    return { context, runProductionPreflight: false };
  }
  throw new Error(`Unsupported Netlify deployment context: ${context}`);
}

export function runDeploymentBuild({
  environment = process.env,
  runScript = (script) => runNpmScript(script, environment),
} = {}) {
  const reviewTarget = String(environment.HHPLMS_NETLIFY_REVIEW_TARGET || "").trim();
  if (reviewTarget) {
    throw new Error(`Review target ${reviewTarget} cannot use the root LMS Netlify configuration; configure its dedicated Package directory.`);
  }
  runScript("verify:migration-manifest");
  const policy = deploymentBuildPolicy(environment);
  if (policy.runProductionPreflight) runScript("production:preflight");
  else if (policy.context === "local") console.log("Production database preflight is not applicable to this local build.");
  else console.log(`Production database preflight is disabled for Netlify ${policy.context}.`);
  runScript("build");
  return policy;
}

const invokedPath = process.argv[1]
  ? path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])
  : false;
if (invokedPath) {
  try {
    runDeploymentBuild();
  } catch (error) {
    console.error(`Deployment build gate failed: ${error.message}`);
    if (error.signal) process.kill(process.pid, error.signal);
    else process.exitCode = error.status || 1;
  }
}
