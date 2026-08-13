import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanWebBundle } from "../verify-web-bundle-safety.mjs";

const roots = Object.freeze({
  lms: "dist-netlify/lms",
  "ultimate-b2-builder": "dist-netlify/ultimate-b2-builder",
  "ultimate-b2-interactive": "dist-netlify/ultimate-b2-interactive",
});

const privateDataPatterns = [
  ["local Windows path", /[A-Za-z]:[\\/]Users[\\/]/g],
  ["local Nextcloud path", /\bNextcloud\b/gi],
  ["publisher application path", /Ultimate English B2\.app/gi],
  ["workspace variable", /ULTIMATE_B2_CONTENT_ROOT/g],
  ["source-private classification", /source-private/gi],
  ["teacher-private classification", /teacher-private/gi],
  ["Teacher solution file", /teacher-solutions\.json|_ultimate-b2-reading-(?:exercise-4|debate-club)-solution\.json/gi],
  ["serialized accepted answers", /["']acceptedAnswers["']\s*:/g],
  ["serialized correct option", /["']correctOptionIds?["']\s*:/g],
  ["Complete Sentences answer mapping", /revealedWord/gi],
  ["private reveal payload", /["']revealText["']\s*:/gi],
  ["model answer payload", /["']modelAnswers?["']\s*:/gi],
  ["publisher IWB provenance", /decoded-publisher-iwb|iwbSha256|decodedSha256/gi],
  ["Reading publisher response", /In my opinion, watching a film at home is better|Many people say that watching films at home is cheaper/gi],
  ["Open Response publisher model answer", /Films are an art form which involve many artistic processes/gi],
  ["database URL", /postgres(?:ql)?:\/\/[^\s"'`]+/gi],
  ["Neon hostname", /[a-z0-9.-]+\.neon\.tech\b/gi],
];

const teacherAnswerPatternLabels = new Set([
  "Teacher solution file",
  "serialized accepted answers",
  "serialized correct option",
  "Complete Sentences answer mapping",
  "private reveal payload",
  "model answer payload",
  "Reading publisher response",
  "Open Response publisher model answer",
]);

const teacherReviewPrivateDataPatterns = privateDataPatterns.filter(([label]) => !teacherAnswerPatternLabels.has(label));

const targetPatterns = Object.freeze({
  "ultimate-b2-builder": [
    ...privateDataPatterns,
    ["local authoring endpoint", /__hhplms\//gi],
    ["hosted authoring mutation", /(?:authoring|workspace|write-capability|repositoryFileTarget)[\s\S]{0,120}method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/gi],
    ["unapproved destructive client", /method\s*:\s*["'](?:PATCH|DELETE)["']/gi],
    ["direct Function client", /["']\/\.netlify\/functions/gi],
    ["root API client", /["']\/api\//gi],
    ["Platform Admin API client", /["']\/platform-admin\//gi],
    ["Platform Admin bundle", /Platform Administration|platform-admin-root/gi],
  ],
  "ultimate-b2-interactive": [
    ...teacherReviewPrivateDataPatterns,
    ["Netlify runtime dependency", /["']\/\.netlify\/functions/gi],
    ["API runtime dependency", /["']\/api\//gi],
    ["auth runtime dependency", /["']\/auth\//gi],
    ["absolute Builder preview origin", /https:\/\/hhplms-builder\.netlify\.app/gi],
    ["external runtime service", /https?:\/\/(?:fonts\.(?:googleapis|gstatic)\.com|[^\s"']*(?:sentry|segment|google-analytics|googletagmanager)[^\s"']*)/gi],
    ["Platform Admin bundle", /Platform Administration|platform-admin-root/gi],
  ],
});

async function verifyBuilderMutationSources() {
  const contentClientPath = path.resolve("src/apps/book-builder/hosted/builderContentApi.js");
  const contentClient = await readFile(contentClientPath, "utf8");
  assert.match(contentClient, /const builderContentApiRoot = ["']\/builder\/api\/content["']/);
  assert.match(contentClient, /method: ["']PUT["']/);
  assert.match(contentClient, /credentials: ["']same-origin["']/);
  assert.doesNotMatch(contentClient, /__hhplms|\/\.netlify\/functions|["']\/api\/|platform-admin|repositoryFileTarget|write-capability/i);
  assert.equal([...contentClient.matchAll(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/g)].length, 1);

  const hostedSources = [
    "src/apps/book-builder/hosted/hostedBuilderEntry.jsx",
    "src/apps/book-builder/hosted/HostedAuthenticatedBookBuilderApp.jsx",
    "src/apps/book-builder/hosted/HostedBookBuilderApp.jsx",
    "src/apps/book-builder/hosted/hostedBuilderAdapters.jsx",
    "src/apps/book-builder/hosted/HostedViewerPreview.jsx",
    "src/apps/book-builder/hosted/hostedViewerPreviewUrl.js",
    "src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx",
    "src/apps/ultimate-b2-builder/HostedUltimateB2HotspotBuilder.jsx",
  ];
  for (const sourcePath of hostedSources) {
    const source = await readFile(path.resolve(sourcePath), "utf8");
    assert.doesNotMatch(source, /__hhplms|\/\.netlify\/functions|["']\/api\/|platform-admin|repositoryFileTarget|write-capability/i);
    assert.doesNotMatch(source, /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
  }

  const [html, hostedEntry, hostedWorkspace, previewFrame, previewUrl] = await Promise.all([
    readFile(path.resolve("ultimate-b2-builder.html"), "utf8"),
    readFile(path.resolve("src/apps/book-builder/hosted/hostedBuilderEntry.jsx"), "utf8"),
    readFile(path.resolve("src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx"), "utf8"),
    readFile(path.resolve("src/apps/book-builder/hosted/HostedViewerPreview.jsx"), "utf8"),
    readFile(path.resolve("src/apps/book-builder/hosted/hostedViewerPreviewUrl.js"), "utf8"),
  ]);
  assert.match(html, /src\/apps\/book-builder\/hosted\/hostedBuilderEntry\.jsx/);
  assert.doesNotMatch(`${html}\n${hostedEntry}`, /activityBuilderEntry|TeacherOffline|NormalizedStudentsBookActivity|Listening|MultipleChoice|virtual:book-builder-app/);
  assert.doesNotMatch(hostedWorkspace, /NormalizedStudentsBookActivity|TeacherOfflineLibrary|ClassroomToolsProvider|android-teacher-offline|hostedReviewUiAssets|ACTIVITY_MODES/);
  assert.match(previewUrl, /https:\/\/hhplms-viewer\.netlify\.app/);
  assert.match(previewFrame, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(`${previewFrame}\n${previewUrl}`, /postMessage|contentWindow|document\.domain|credentials|token|session/i);
}

async function verifyTeacherReviewSourcesAndArtifact(root) {
  const [profiles, vite, embedded, solutions] = await Promise.all([
    readFile(path.resolve("src/config/buildProfiles.js"), "utf8"),
    readFile(path.resolve("vite.config.js"), "utf8"),
    readFile(path.resolve("src/apps/android-teacher-offline/TeacherOfflineEmbeddedActivity.jsx"), "utf8"),
    readFile(path.resolve("src/apps/android-teacher-offline/hostedReviewTeacherSolutions.js"), "utf8"),
  ]);
  assert.match(profiles, /INTERACTIVE_HOSTED_REVIEW[\s\S]*teacherSolutions:\s*true[\s\S]*teacherPresentation:\s*true/);
  assert.match(vite, /buildProfile\.teacherPresentation[\s\S]*TeacherAnswerUi\.jsx/);
  assert.match(vite, /ultimate-b2-interactive-review[\s\S]*hostedReviewTeacherSolutions\.js/);
  assert.match(embedded, /activeBuildProfile\.teacherPresentation[\s\S]*TEACHER_PRESENTATION_OFFLINE/);
  assert.match(solutions, /teacher-solutions\.json[\s\S]*getOfflineTeacherSolution/);

  const artifactText = (await Promise.all((await textFiles(root)).map((file) => readFile(file, "utf8")))).join("\n");
  assert.match(artifactText, /Ultimate B2 Teacher Review/);
  assert.match(artifactText, /Show all answers/);
  assert.match(artifactText, /Publisher answer/);
  assert.match(artifactText, /binge-watching/);
  assert.doesNotMatch(artifactText, /builderContentApiRoot|\/builder\/api\/auth|\/builder\/api\/content/);
}

async function verifySlimBuilderArtifact(root) {
  const forbiddenExtensions = new Set([".aac", ".m4a", ".mp3", ".ogg", ".wav", ".m4v", ".mp4", ".webm", ".gaf"]);
  const forbidden = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && forbiddenExtensions.has(path.extname(entry.name).toLowerCase())) {
        forbidden.push(path.relative(root, absolute).replaceAll("\\", "/"));
      }
    }
  };
  await visit(root);
  assert.deepEqual(forbidden, [], `Builder emitted Viewer-only media/runtime assets:\n${forbidden.join("\n")}`);
}

async function sourceFilesUnder(root, relative = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFilesUnder(root, child));
    else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|go)$/i.test(entry.name)) files.push(child.replaceAll("\\", "/"));
  }
  return files;
}

async function verifyBuilderFunctionLayout() {
  const functionsRoot = path.resolve("netlify-sites/ultimate-b2-builder/functions");
  const serverRoot = path.resolve("netlify-sites/ultimate-b2-builder/server");
  assert.deepEqual((await sourceFilesUnder(functionsRoot)).sort(), ["builder-auth.js", "builder-content.js", "builder-preview.js"]);
  assert.deepEqual((await sourceFilesUnder(serverRoot)).sort(), [
    "_builder-auth.js", "_builder-content-registry.js", "_builder-content-security.js",
    "_builder-content-store.js", "_builder-content.js", "_builder-login-rate-limit.js", "_builder-preview.js",
  ]);
  for (const entry of ["builder-auth.js", "builder-content.js", "builder-preview.js"]) {
    const source = await readFile(path.join(functionsRoot, entry), "utf8");
    assert.match(source, /export const handler = createBuilder(?:Auth|Content|Preview)Handler\(\)/);
  }
}

async function textFiles(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await textFiles(absolute));
    else if (entry.isFile() && [".html", ".js", ".css", ".json", ".txt", ".xml"].includes(path.extname(entry.name).toLowerCase())) output.push(absolute);
  }
  return output;
}

export async function verifyReviewBundle(targetName) {
  const relativeRoot = roots[targetName];
  if (!relativeRoot) throw new Error(`Unknown review bundle target: ${targetName}`);
  const root = path.resolve(relativeRoot);
  assert.ok((await stat(root).catch(() => null))?.isDirectory(), `${targetName} review output is missing.`);
  const teacherReview = targetName === "ultimate-b2-interactive";
  const generic = await scanWebBundle(root, { allowTeacherAnswers: teacherReview });
  assert.deepEqual(generic.findings, [], `${targetName} failed generic web safety:\n${JSON.stringify(generic.findings, null, 2)}`);
  if (targetName === "ultimate-b2-builder") {
    await verifyBuilderFunctionLayout();
    await verifyBuilderMutationSources();
    await verifySlimBuilderArtifact(root);
  }
  if (teacherReview) await verifyTeacherReviewSourcesAndArtifact(root);
  const findings = [];
  const builderApiRoutes = new Set();
  for (const file of await textFiles(root)) {
    const content = await readFile(file, "utf8");
    if (targetName === "ultimate-b2-builder") {
      for (const match of content.matchAll(/\/builder\/api\/[a-z0-9/_-]*/gi)) builderApiRoutes.add(match[0]);
    }
    for (const [label, pattern] of targetPatterns[targetName] || []) {
      if (label === "Teacher answer control" && path.extname(file).toLowerCase() === ".css") continue;
      pattern.lastIndex = 0;
      const count = [...content.matchAll(pattern)].length;
      if (count) findings.push({ file: path.relative(root, file).replaceAll("\\", "/"), label, count });
    }
  }
  if (targetName === "ultimate-b2-builder") {
    for (const route of builderApiRoutes) {
      if (!route.startsWith("/builder/api/auth") && !route.startsWith("/builder/api/content")) {
        findings.push({ file: "<bundle>", label: "unapproved Builder API route", count: 1 });
      }
    }
    assert.ok([...builderApiRoutes].some((route) => route.startsWith("/builder/api/auth")), "Builder auth route is missing from bundle.");
    assert.ok([...builderApiRoutes].some((route) => route.startsWith("/builder/api/content")), "Builder content route is missing from bundle.");
  }
  assert.deepEqual(findings, [], `${targetName} contains forbidden hosted-review content:\n${JSON.stringify(findings, null, 2)}`);
  return { target: targetName, filesScanned: generic.filesScanned, findings: 0, status: "safe" };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invoked) verifyReviewBundle(process.argv[2]).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
