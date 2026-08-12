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

const targetPatterns = Object.freeze({
  "ultimate-b2-builder": [
    ...privateDataPatterns,
    ["local authoring endpoint", /__hhplms\//gi],
    ["HTTP mutation client", /method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)["']/gi],
    ["Platform Admin bundle", /Platform Administration|platform-admin-root/gi],
  ],
  "ultimate-b2-interactive": [
    ...privateDataPatterns,
    ["Teacher answer control", /Show all answers|Hide answers|Publisher answer|teacher-presentation-answer-controls/gi],
    ["Netlify runtime dependency", /["']\/\.netlify\/functions/gi],
    ["API runtime dependency", /["']\/api\//gi],
    ["auth runtime dependency", /["']\/auth\//gi],
    ["external runtime service", /https?:\/\/(?:fonts\.(?:googleapis|gstatic)\.com|[^\s"']*(?:sentry|segment|google-analytics|googletagmanager)[^\s"']*)/gi],
    ["Platform Admin bundle", /Platform Administration|platform-admin-root/gi],
  ],
});

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
  const generic = await scanWebBundle(root);
  assert.deepEqual(generic.findings, [], `${targetName} failed generic web safety:\n${JSON.stringify(generic.findings, null, 2)}`);
  const findings = [];
  for (const file of await textFiles(root)) {
    const content = await readFile(file, "utf8");
    for (const [label, pattern] of targetPatterns[targetName] || []) {
      if (label === "Teacher answer control" && path.extname(file).toLowerCase() === ".css") continue;
      pattern.lastIndex = 0;
      const count = [...content.matchAll(pattern)].length;
      if (count) findings.push({ file: path.relative(root, file).replaceAll("\\", "/"), label, count });
    }
  }
  assert.deepEqual(findings, [], `${targetName} contains forbidden hosted-review content:\n${JSON.stringify(findings, null, 2)}`);
  return { target: targetName, filesScanned: generic.filesScanned, findings: 0, status: "safe" };
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invoked) verifyReviewBundle(process.argv[2]).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
