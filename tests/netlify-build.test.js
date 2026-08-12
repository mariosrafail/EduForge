import test from "node:test";
import assert from "node:assert/strict";
import {
  deploymentBuildPolicy,
  runDeploymentBuild,
} from "../scripts/netlify-build.mjs";

function run(environment) {
  const scripts = [];
  const policy = runDeploymentBuild({ environment, runScript: (script) => scripts.push(script) });
  return { scripts, policy };
}

test("production context verifies, preflights, then builds", () => {
  const result = run({ NETLIFY: "true", CONTEXT: "production", BRANCH: "main", COMMIT_REF: "abc123" });
  assert.deepEqual(result.scripts, ["verify:migration-manifest", "production:preflight", "build"]);
  assert.equal(result.policy.runProductionPreflight, true);
});

test("production preflight failure blocks the Vite build and propagates status", () => {
  const scripts = [];
  assert.throws(() => runDeploymentBuild({
    environment: { NETLIFY: "true", CONTEXT: "production", BRANCH: "main", COMMIT_REF: "abc123" },
    runScript: (script) => {
      scripts.push(script);
      if (script === "production:preflight") throw Object.assign(new Error("blocked"), { status: 17 });
    },
  }), /blocked/);
  assert.deepEqual(scripts, ["verify:migration-manifest", "production:preflight"]);
});

test("preview and branch deploy verify and build without production access", () => {
  for (const context of ["deploy-preview", "branch-deploy"]) {
    const result = run({ NETLIFY: "true", CONTEXT: context });
    assert.deepEqual(result.scripts, ["verify:migration-manifest", "build"]);
    assert.equal(result.policy.runProductionPreflight, false);
  }
});

test("review target markers fail before every root LMS build or preflight script", () => {
  for (const reviewTarget of ["ultimate-b2-builder", "viewer", "future-static-review"]) {
    const scripts = [];
    assert.throws(() => runDeploymentBuild({
      environment: {
        NETLIFY: "true",
        CONTEXT: "production",
        BRANCH: "dev",
        COMMIT_REF: "review123",
        HHPLMS_NETLIFY_REVIEW_TARGET: reviewTarget,
      },
      runScript: (script) => scripts.push(script),
    }), new RegExp(`Review target ${reviewTarget} cannot use the root LMS Netlify configuration`));
    assert.deepEqual(scripts, []);
  }
});

test("Netlify context and production identity fail closed", () => {
  assert.throws(() => deploymentBuildPolicy({ NETLIFY: "true" }), /CONTEXT is required/);
  assert.throws(
    () => deploymentBuildPolicy({ CONTEXT: "production", BRANCH: "main", COMMIT_REF: "abc" }),
    /requires NETLIFY=true/,
  );
  assert.throws(() => deploymentBuildPolicy({ NETLIFY: "true", CONTEXT: "future-context" }), /Unsupported/);
  assert.throws(
    () => deploymentBuildPolicy({ NETLIFY: "true", CONTEXT: "production", BRANCH: "dev", COMMIT_REF: "abc" }),
    /branch main/,
  );
  assert.throws(
    () => deploymentBuildPolicy({ NETLIFY: "true", CONTEXT: "production", BRANCH: "main" }),
    /COMMIT_REF/,
  );
});

test("local deployment build verifies and builds without production credentials", () => {
  const result = run({});
  assert.deepEqual(result.scripts, ["verify:migration-manifest", "build"]);
  assert.equal(result.policy.context, "local");
});

test("manifest failure and build failure propagate without continuing", () => {
  const manifestScripts = [];
  assert.throws(() => runDeploymentBuild({
    environment: {},
    runScript: (script) => {
      manifestScripts.push(script);
      throw new Error("manifest failed");
    },
  }), /manifest failed/);
  assert.deepEqual(manifestScripts, ["verify:migration-manifest"]);

  const buildScripts = [];
  assert.throws(() => runDeploymentBuild({
    environment: {},
    runScript: (script) => {
      buildScripts.push(script);
      if (script === "build") throw Object.assign(new Error("build failed"), { status: 9 });
    },
  }), /build failed/);
  assert.deepEqual(buildScripts, ["verify:migration-manifest", "build"]);
});
