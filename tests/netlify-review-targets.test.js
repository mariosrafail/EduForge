import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { BUILD_PROFILE_IDS, buildProfiles, resolveBuildProfile } from "../src/config/buildProfiles.js";
import { reviewBuildPolicy, reviewTargets } from "../scripts/netlify/build-review-target.mjs";
import { deploymentBuildPolicy } from "../scripts/netlify-build.mjs";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");

function tomlString(configuration, section, key) {
  const header = `[${section}]`;
  const sectionStart = configuration.indexOf(header);
  if (sectionStart < 0) return undefined;
  const remainder = configuration.slice(sectionStart + header.length);
  const nextSection = remainder.search(/^\[/m);
  const sectionBody = nextSection < 0 ? remainder : remainder.slice(0, nextSection);
  return sectionBody.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"\\s*$`, "m"))?.[1];
}

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) files.push(...await filesUnder(child));
    else if (entry.isFile()) files.push(entry.name);
  }
  return files;
}

test("dedicated Builder site package isolates build output and Netlify Functions", async () => {
  const [builderNetlify, rootNetlify] = await Promise.all([
    read("netlify-sites/ultimate-b2-builder/netlify.toml"),
    read("netlify.toml"),
  ]);
  const functionFiles = await filesUnder(new URL("../netlify-sites/ultimate-b2-builder/functions/", import.meta.url));

  assert.equal(tomlString(builderNetlify, "build", "command"), "npm run build:netlify:ultimate-b2-builder");
  assert.equal(tomlString(builderNetlify, "build", "publish"), "dist-netlify/ultimate-b2-builder");
  assert.equal(tomlString(builderNetlify, "build.environment", "HHPLMS_NETLIFY_REVIEW_TARGET"), "ultimate-b2-builder");
  assert.equal(tomlString(builderNetlify, "functions", "directory"), "netlify-sites/ultimate-b2-builder/functions");
  assert.doesNotMatch(builderNetlify, /(?:^|["/])netlify\/functions(?:["/]|$)/m);
  assert.doesNotMatch(builderNetlify, /\[\[redirects\]\]|\/\.netlify\/functions|DATABASE_URL|ULTIMATE_B2_CONTENT_ROOT|AUTH_RATE_LIMIT_SALT|PLATFORM_ADMIN_RATE_LIMIT_SALT|HHPLMS_STAGING_QA_PASSWORD|neon\.tech|__hhplms/i);
  assert.deepEqual(functionFiles.filter((file) => /\.(?:[cm]?[jt]sx?|go)$/i.test(file)), []);

  assert.equal(tomlString(rootNetlify, "build", "command"), "npm run deploy:build");
  assert.equal(tomlString(rootNetlify, "build", "publish"), "dist");
  assert.equal(tomlString(rootNetlify, "build", "functions"), "netlify/functions");
  assert.match(rootNetlify, /from = "\/platform-admin\/api\/auth"/);
});

test("Netlify review targets have explicit isolated profiles and outputs", () => {
  assert.deepEqual(Object.keys(reviewTargets), ["lms", "ultimate-b2-builder", "ultimate-b2-interactive"]);
  assert.deepEqual(new Set(Object.values(reviewTargets).map((target) => target.outDir)), new Set([
    "dist-netlify/lms", "dist-netlify/ultimate-b2-builder", "dist-netlify/ultimate-b2-interactive",
  ]));
  assert.equal(resolveBuildProfile(BUILD_PROFILE_IDS.BUILDER_LOCAL_AUTHORING).builderMutations, true);
  assert.equal(resolveBuildProfile(BUILD_PROFILE_IDS.BUILDER_LOCAL_AUTHORING).builderReadOnly, false);
  assert.equal(resolveBuildProfile(BUILD_PROFILE_IDS.BUILDER_HOSTED_REVIEW).builderMutations, false);
  assert.equal(resolveBuildProfile(BUILD_PROFILE_IDS.BUILDER_HOSTED_REVIEW).builderReadOnly, true);
  assert.equal(resolveBuildProfile(BUILD_PROFILE_IDS.INTERACTIVE_HOSTED_REVIEW).teacherSolutions, false);
  assert.equal(resolveBuildProfile(BUILD_PROFILE_IDS.ANDROID_TEACHER_OFFLINE).teacherSolutions, true);
  assert.equal(resolveBuildProfile(BUILD_PROFILE_IDS.ANDROID_STUDENT_OFFLINE).teacherSolutions, false);
  assert.equal(Object.keys(buildProfiles).length, 7);
});

test("review build policy allows local and review contexts", () => {
  assert.equal(reviewBuildPolicy("ultimate-b2-builder", {}).context, "local");
  assert.equal(reviewBuildPolicy("ultimate-b2-builder", { NETLIFY: "true", CONTEXT: "branch-deploy", BRANCH: "dev" }).context, "branch-deploy");
  assert.equal(reviewBuildPolicy("ultimate-b2-interactive", { NETLIFY: "true", CONTEXT: "deploy-preview", BRANCH: "feature" }).context, "deploy-preview");
});

test("only the explicitly marked dedicated Builder site may use production context on dev", () => {
  const production = { NETLIFY: "true", CONTEXT: "production", COMMIT_REF: "abc" };
  const marker = { HHPLMS_NETLIFY_REVIEW_TARGET: "ultimate-b2-builder" };
  assert.deepEqual(reviewBuildPolicy("ultimate-b2-builder", { ...production, BRANCH: "dev", ...marker }), {
    context: "production", runProductionPreflight: false,
  });

  assert.throws(() => reviewBuildPolicy("ultimate-b2-builder", { ...production, BRANCH: "dev" }), /must use branch main/);
  assert.throws(() => reviewBuildPolicy("ultimate-b2-builder", { ...production, BRANCH: "dev", HHPLMS_NETLIFY_REVIEW_TARGET: "wrong-target" }), /must use branch main/);
  assert.throws(() => reviewBuildPolicy("ultimate-b2-builder", { ...production, BRANCH: "main", ...marker }), /cannot be built/);
  assert.throws(() => reviewBuildPolicy("ultimate-b2-builder", { ...production, BRANCH: "feature", ...marker }), /must use branch main/);
  assert.throws(() => reviewBuildPolicy("ultimate-b2-interactive", { ...production, BRANCH: "main", ...marker }), /cannot be built/);
  assert.throws(() => reviewBuildPolicy("arbitrary-review", { ...production, BRANCH: "main", ...marker }), /cannot be built/);

  assert.equal(deploymentBuildPolicy({ ...production, BRANCH: "main" }).runProductionPreflight, true);
  assert.throws(() => deploymentBuildPolicy({ ...production, BRANCH: "dev", ...marker }), /must use branch main/);
});

test("hosted Builder graph is deliberately repository-backed and mutation-free", async () => {
  const [hosted, local, entry] = await Promise.all([
    read("src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx"),
    read("src/apps/ultimate-b2-builder/UltimateB2BuilderApp.jsx"),
    read("src/apps/ultimate-b2-builder/activityBuilderEntry.jsx"),
  ]);
  const tabs = hosted.match(/<nav className="ultimate-b2-builder-tabs"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.deepEqual([...tabs.matchAll(/>(Hotspot Builder|Activity Builder|UI Controller)</g)].map((match) => match[1]), ["Hotspot Builder", "Activity Builder", "UI Controller"]);
  assert.match(hosted, /Read-only review/);
  assert.match(hosted, /virtual:ultimate-b2-runtime-hotspots/);
  assert.match(hosted, /NormalizedStudentsBookActivity/);
  assert.doesNotMatch(hosted, /__hhplms|\bfetch\s*\(|FormData|method\s*:\s*["']POST|Add Activity|onPublisherActivityCreated/);
  assert.match(local, /__hhplms\/ultimate-b2-publisher-activities/);
  assert.match(local, /fetch\(publisherActivityEndpoint/);
  assert.match(entry, /virtual:ultimate-b2-builder-app/);
});

test("Interactive provider split excludes solutions from hosted review and retains strict Android Teacher data", async () => {
  const [app, review, reviewProvider, teacher, validation, vite, networkGuard] = await Promise.all([
    read("src/apps/android-teacher-offline/TeacherOfflineApp.jsx"),
    read("src/apps/android-teacher-offline/reviewPackProvider.js"),
    read("src/apps/android-teacher-offline/reviewContentPackProvider.js"),
    read("src/apps/android-teacher-offline/generatedPackProvider.js"),
    read("src/apps/android-teacher-offline/packValidation.js"),
    read("vite.config.js"),
    read("src/apps/android-teacher-offline/teacherOfflineNetworkGuard.js"),
  ]);
  assert.match(app, /virtual:ultimate-b2-interactive-pack-provider/);
  assert.doesNotMatch(review, /import teacherSolutions/);
  assert.doesNotMatch(review, /teacher-solutions\.json/);
  assert.doesNotMatch(reviewProvider, /teacherSolutions|teacher-solutions\.json/);
  assert.match(teacher, /import teacherSolutions/);
  assert.match(teacher, /getOfflineTeacherSolution/);
  assert.match(validation, /requireTeacherSolutions/);
  assert.match(validation, /validateReviewContentPack/);
  assert.match(validation, /validateTeacherContentPack/);
  assert.match(vite, /isHostedInteractiveReview/);
  assert.match(vite, /NoTeacherAnswerUi/);
  assert.doesNotMatch(vite, /hostname|window\.location|Netlify URL/i);
  assert.match(networkGuard, /\.netlify\\\/functions\|api\\\/\|auth\\\//);
});

test("review documentation preserves the three-site matrix and existing production boundary", async () => {
  const documentation = await read("docs/netlify-review-targets.md");
  assert.match(documentation, /dist-netlify\/lms/);
  assert.match(documentation, /dist-netlify\/ultimate-b2-builder/);
  assert.match(documentation, /dist-netlify\/ultimate-b2-interactive/);
  assert.match(documentation, /Step 4: configure the dedicated Builder site/i);
  assert.match(documentation, /Production branch[^\n]*`dev`/);
  assert.match(documentation, /no branch-deploy configuration is required/i);
  assert.match(documentation, /Package directory[^\n]*`netlify-sites\/ultimate-b2-builder`/);
  assert.match(documentation, /https:\/\/<builder-site-name>\.netlify\.app/);
  assert.match(documentation, /main-only production rule/);
  assert.match(documentation, /HHPLMS_NETLIFY_REVIEW_TARGET[^\n]*ultimate-b2-builder/);
  assert.match(documentation, /ULTIMATE_B2_CONTENT_ROOT.*local publisher configuration/);
});
