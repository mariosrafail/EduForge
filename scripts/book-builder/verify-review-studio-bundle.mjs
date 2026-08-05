import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const builderRoot = path.resolve(process.argv[2] || path.join(repositoryRoot, "dist-book-builder"));
const textExtensions = new Set([".html", ".js", ".css", ".json", ".map"]);
const forbidden = [
  ["Node filesystem implementation", /(?:node:fs|from["']fs["']|readFileSync|createReadStream|fs\.promises)/gi],
  ["server workspace implementation", /(?:canonicalApplicationRealPath|selectedOuterRealPath|selectedOuterPath|local-source-binding\.json|review-studio-workspace\.mjs)/gi],
  ["server source resolution", /(?:assertNoSymlinkPath|realPathWithin|sourceRoot\s*=\s*path\.)/gi],
  ["absolute Windows path", /[A-Za-z]:[\\/](?:Users|home|AppData)[\\/]/g],
  ["absolute Unix user path", /\/(?:Users|home)\/[A-Za-z0-9._-]+\//g],
  ["publisher source-root locator", /Contents[\\/]Resources[\\/]/gi],
  ["Teacher artifact filename", /(?:teacher-solution-candidates|answer-evidence-index)\.json/gi],
  ["answer payload key", /["'](?:acceptedAnswers|correctAnswers|answerValues?|modelAnswer|rawDecodedIwb|decodedXml|iwbKey|discoveredKey)["']\s*:/gi],
  ["synthetic Teacher secret", /HHPLMS_SYNTHETIC_TEACHER_SECRET_M4A_7D3C9F/g],
  ["test session token", /synthetic-session-token/g],
];

async function filesUnder(root) {
  const files = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(absolute));
    else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(absolute);
  }
  return files;
}

const info = await fs.stat(builderRoot).catch(() => null);
assert.ok(info?.isDirectory(), "dist-book-builder is missing; run npm run build:book-builder first");
const files = await filesUnder(builderRoot);
const findings = [];
for (const file of files) {
  const content = await fs.readFile(file, "utf8");
  for (const [label, pattern] of forbidden) {
    pattern.lastIndex = 0;
    const count = [...content.matchAll(pattern)].length;
    if (count) findings.push({ file: path.relative(builderRoot, file).replaceAll("\\", "/"), label, count });
  }
}
assert.deepEqual(findings, [], `Review Studio client bundle contains forbidden server or sensitive data:\n${JSON.stringify(findings, null, 2)}`);
assert.ok(files.some((file) => path.basename(file) === "builder.html"), "Builder HTML output is missing");
process.stdout.write(`${JSON.stringify({ status: "builder-client-safe", filesScanned: files.length, findings: 0 }, null, 2)}\n`);
