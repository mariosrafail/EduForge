import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const distRoot = path.resolve(process.cwd(), "dist");
const textExtensions = new Set([".html", ".js", ".css", ".json", ".xml", ".txt"]);
const forbidden = [
  ["Netlify function path", /\.netlify\/functions/gi],
  ["teacher web solutions action", /teacher-activity-solutions/gi],
  ["student submission action", /(?:submit-assignment|submit-activity|student-submission)/gi],
  ["analytics endpoint", /(?:google-analytics\.com|googletagmanager\.com|segment\.io|sentry\.io)/gi],
  ["external font host", /(?:fonts\.googleapis\.com|fonts\.gstatic\.com)/gi],
  ["publisher source path", /Contents[\\/]Resources[\\/]/gi],
  ["local developer path", /[A-Za-z]:[\\/]Users[\\/]/g],
];

async function filesUnder(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function main() {
  assert.ok((await stat(distRoot)).isDirectory(), "Teacher offline dist directory is missing");
  const files = await filesUnder(distRoot);
  const findings = [];
  for (const file of files.filter((candidate) => textExtensions.has(path.extname(candidate).toLowerCase()))) {
    const content = await readFile(file, "utf8");
    for (const [label, pattern] of forbidden) {
      pattern.lastIndex = 0;
      const matches = content.match(pattern);
      if (matches?.length) findings.push({
        file: path.relative(distRoot, file).replaceAll("\\", "/"),
        label,
        count: matches.length,
      });
    }
  }
  assert.deepEqual(findings, [], `Offline teacher bundle contains forbidden runtime dependencies:\n${JSON.stringify(findings, null, 2)}`);
  console.log(JSON.stringify({
    status: "offline-safe",
    filesScanned: files.length,
    totalBytes: (await Promise.all(files.map(async (file) => (await stat(file)).size))).reduce((sum, size) => sum + size, 0),
    findings: 0,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
