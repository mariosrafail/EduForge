import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const NETLIFY_TARGETS = Object.freeze([
  "lms",
  "ultimate-b2-builder",
  "ultimate-b2-interactive",
]);

// Netlify build.ignore semantics are intentionally inverted:
// exit 0 stops the build; exit 1 continues the build.
export const NETLIFY_IGNORE_EXIT_CODES = Object.freeze({ SKIP: 0, BUILD: 1 });

const ALL_TARGETS = NETLIFY_TARGETS;
const BUILDER_ONLY = Object.freeze(["ultimate-b2-builder"]);
const VIEWER_ONLY = Object.freeze(["ultimate-b2-interactive"]);
const LMS_ONLY = Object.freeze(["lms"]);
const BUILDER_AND_VIEWER = Object.freeze(["ultimate-b2-builder", "ultimate-b2-interactive"]);
const LMS_AND_VIEWER = Object.freeze(["lms", "ultimate-b2-interactive"]);
const NO_TARGETS = Object.freeze([]);
const SAFE_COMMIT_REF = /^[0-9a-f]{7,64}$/i;

function hasPrefix(repositoryPath, prefixes) {
  return prefixes.some((prefix) => repositoryPath.startsWith(prefix));
}

export function normalizeRepositoryPath(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (
    !normalized
    || normalized.startsWith("/")
    || /^[A-Za-z]:\//.test(normalized)
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) return null;
  return normalized;
}

export function classifyNetlifyPath(value) {
  const repositoryPath = normalizeRepositoryPath(value);
  if (!repositoryPath) return { path: null, category: "unknown", targets: ALL_TARGETS };

  if (
    repositoryPath === "README.md"
    || hasPrefix(repositoryPath, ["docs/", "tests/"])
  ) return { path: repositoryPath, category: "non-deploying", targets: NO_TARGETS };

  if (
    [
      "package.json",
      "package-lock.json",
      "vite.config.js",
      "scripts/netlify/ignore-site-build.mjs",
      "scripts/netlify-build.mjs",
      "scripts/netlify/committed-hotspot-vite-plugin.mjs",
      "scripts/verify-migration-manifest.mjs",
      "scripts/_migration-readiness.mjs",
      "scripts/generate-runtime-schema-contract.mjs",
      "netlify/functions/_runtime-schema-contract.js",
    ].includes(repositoryPath)
    || hasPrefix(repositoryPath, ["database/", "public/"])
  ) return { path: repositoryPath, category: "all-sites", targets: ALL_TARGETS };

  if (
    repositoryPath === "netlify.toml"
    || repositoryPath === "platform-admin/index.html"
    || repositoryPath === "src/webEntry.jsx"
    || hasPrefix(repositoryPath, ["netlify/functions/", "platform-admin/", "src/apps/lms/", "src/apps/platform-admin/"])
  ) return { path: repositoryPath, category: "lms-only", targets: LMS_ONLY };

  if (
    repositoryPath === "ultimate-b2-builder.html"
    || hasPrefix(repositoryPath, [
      "netlify-sites/ultimate-b2-builder/",
      "src/apps/book-builder/hosted/",
      "src/apps/ultimate-b2-builder/",
    ])
  ) return { path: repositoryPath, category: "builder-only", targets: BUILDER_ONLY };

  if (hasPrefix(repositoryPath, ["netlify-sites/viewer/"])) {
    return { path: repositoryPath, category: "viewer-only", targets: VIEWER_ONLY };
  }

  if (hasPrefix(repositoryPath, ["src/apps/android-teacher-offline/"])) {
    return { path: repositoryPath, category: "viewer-only", targets: VIEWER_ONLY };
  }

  if (
    [
      "scripts/netlify/build-review-target.mjs",
    ].includes(repositoryPath)
  ) return { path: repositoryPath, category: "builder-viewer-shared", targets: BUILDER_AND_VIEWER };

  if (["index.html", "src/main.jsx"].includes(repositoryPath)) {
    return { path: repositoryPath, category: "lms-viewer-shared", targets: LMS_AND_VIEWER };
  }

  // Remaining source is shared or sufficiently intertwined that site exclusivity is not proven.
  if (hasPrefix(repositoryPath, ["src/"])) {
    return { path: repositoryPath, category: "all-sites", targets: ALL_TARGETS };
  }

  // Unknown paths fail open: every site builds.
  return { path: repositoryPath, category: "unknown", targets: ALL_TARGETS };
}

export function classifyChangedPaths(changedPaths) {
  if (!Array.isArray(changedPaths)) throw new TypeError("Changed paths must be an array.");
  const targets = new Set();
  const categories = new Set();
  const unknownPaths = [];
  for (const changedPath of changedPaths) {
    const classification = classifyNetlifyPath(changedPath);
    categories.add(classification.category);
    classification.targets.forEach((target) => targets.add(target));
    if (classification.category === "unknown") unknownPaths.push(classification.path || "<invalid-path>");
  }
  return {
    targets: NETLIFY_TARGETS.filter((target) => targets.has(target)),
    categories: [...categories].sort(),
    unknownPaths,
  };
}

export function affectedNetlifyTargets(changedPaths) {
  return classifyChangedPaths(changedPaths).targets;
}

function assertTarget(target) {
  if (!NETLIFY_TARGETS.includes(target)) throw new Error("Invalid Netlify build target.");
}

export function shouldBuildNetlifyTarget(target, changedPaths) {
  assertTarget(target);
  return affectedNetlifyTargets(changedPaths).includes(target);
}

export function gitChangedPaths(
  cachedCommitRef,
  commitRef,
  { cwd = process.cwd(), execFileSyncImpl = execFileSync } = {},
) {
  const output = execFileSyncImpl("git", [
    "diff",
    "--name-only",
    "--no-renames",
    "--no-ext-diff",
    "--no-textconv",
    "-z",
    cachedCommitRef,
    commitRef,
    "--",
  ], {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return output.split("\0").filter(Boolean);
}

export function decideNetlifyBuild(
  target,
  {
    environment = process.env,
    changedPathsBetween = gitChangedPaths,
  } = {},
) {
  assertTarget(target);
  const cachedCommitRef = String(environment.CACHED_COMMIT_REF || "").trim();
  const commitRef = String(environment.COMMIT_REF || "").trim();

  if (!cachedCommitRef || !commitRef) {
    return { target, action: "build", reason: "missing-commit-ref", changedPathCount: 0 };
  }
  if (!SAFE_COMMIT_REF.test(cachedCommitRef) || !SAFE_COMMIT_REF.test(commitRef)) {
    return { target, action: "build", reason: "unsafe-commit-ref", changedPathCount: 0 };
  }
  if (cachedCommitRef.toLowerCase() === commitRef.toLowerCase()) {
    return { target, action: "build", reason: "same-commit-ref", changedPathCount: 0 };
  }

  let changedPaths;
  try {
    changedPaths = changedPathsBetween(cachedCommitRef, commitRef);
    if (!Array.isArray(changedPaths)) throw new TypeError("Git comparison did not return paths.");
  } catch {
    return { target, action: "build", reason: "git-diff-failed", changedPathCount: 0 };
  }

  let classification;
  try {
    classification = classifyChangedPaths(changedPaths);
  } catch {
    return { target, action: "build", reason: "classification-failed", changedPathCount: changedPaths.length };
  }
  const action = classification.targets.includes(target) ? "build" : "skip";
  const reason = classification.unknownPaths.length
    ? "unknown-path"
    : action === "build" ? "relevant-paths" : "no-relevant-paths";
  return { target, action, reason, changedPathCount: changedPaths.length };
}

export function netlifyIgnoreExitCode(decision) {
  return decision.action === "skip"
    ? NETLIFY_IGNORE_EXIT_CODES.SKIP
    : NETLIFY_IGNORE_EXIT_CODES.BUILD;
}

const invoked = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invoked) {
  try {
    const decision = decideNetlifyBuild(process.argv[2]);
    console.log(
      `Netlify build decision: target=${decision.target} action=${decision.action} reason=${decision.reason} changed=${decision.changedPathCount}`,
    );
    process.exitCode = netlifyIgnoreExitCode(decision);
  } catch {
    console.error("Netlify build decision: action=build reason=invalid-target");
    process.exitCode = NETLIFY_IGNORE_EXIT_CODES.BUILD;
  }
}
