import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";
import { deploymentBuildPolicy } from "../netlify-build.mjs";

export const reviewTargets = Object.freeze({
  lms: Object.freeze({ appMode: "netlify-lms-review", profile: "web-lms", outDir: "dist-netlify/lms" }),
  "ultimate-b2-builder": Object.freeze({ appMode: "netlify-book-builder-review", profile: "book-builder-hosted-review", outDir: "dist-netlify/ultimate-b2-builder" }),
  "ultimate-b2-interactive": Object.freeze({ appMode: "netlify-ultimate-b2-interactive-review", profile: "ultimate-b2-interactive-review", outDir: "dist-netlify/ultimate-b2-interactive" }),
});

export function reviewBuildPolicy(targetName, environment = process.env) {
  const dedicatedBuilderProduction = targetName === "ultimate-b2-builder"
    && environment.NETLIFY === "true"
    && environment.CONTEXT === "production"
    && environment.BRANCH === "dev"
    && environment.HHPLMS_NETLIFY_REVIEW_TARGET === "ultimate-b2-builder";
  const dedicatedViewerProduction = targetName === "ultimate-b2-interactive"
    && environment.NETLIFY === "true"
    && environment.CONTEXT === "production"
    && environment.BRANCH === "dev"
    && environment.HHPLMS_NETLIFY_REVIEW_TARGET === "viewer";
  if (dedicatedBuilderProduction || dedicatedViewerProduction) {
    return { context: "production", runProductionPreflight: false };
  }
  const policy = deploymentBuildPolicy(environment);
  if (policy.context === "production") throw new Error("Review artifacts cannot be built in Netlify production context.");
  return policy;
}

function runMigrationManifestCheck(environment) {
  const npmCli = environment.npm_execpath;
  if (!npmCli) throw new Error("Review builds must be started with npm run.");
  const result = spawnSync(process.execPath, [npmCli, "run", "verify:migration-manifest"], { stdio: "inherit", env: environment });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Migration manifest verification failed with status ${result.status || 1}.`);
}

export async function buildReviewTarget(targetName, environment = process.env, options = {}) {
  const target = reviewTargets[targetName];
  if (!target) throw new Error(`Unknown Netlify review target: ${targetName}`);
  const outDir = options.outDir || target.outDir;
  reviewBuildPolicy(targetName, environment);
  runMigrationManifestCheck(environment);
  process.env.VITE_APP_MODE = target.appMode;
  process.env.HHPLMS_BUILD_PROFILE = target.profile;
  delete process.env.ULTIMATE_B2_CONTENT_ROOT;
  await build({
    configFile: path.resolve("vite.config.js"),
    build: { outDir: path.resolve(outDir), emptyOutDir: true },
  });
  if (targetName === "ultimate-b2-builder") {
    const emittedEntry = path.resolve(outDir, "ultimate-b2-builder.html");
    const rootEntry = path.resolve(outDir, "index.html");
    if (!existsSync(emittedEntry)) throw new Error(`Builder review entry was not emitted: ${emittedEntry}`);
    renameSync(emittedEntry, rootEntry);
  }
  return target;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invoked) {
  buildReviewTarget(process.argv[2]).catch((error) => {
    console.error(`Netlify review build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
