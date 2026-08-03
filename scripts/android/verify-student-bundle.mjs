import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { scanWebBundle } from "../verify-web-bundle-safety.mjs";

const distRoot = path.resolve(process.cwd(), "dist");
const forbidden = [
  ["teacher presentation toolbar", /classroom-teaching-toolbar|Classroom teaching tools/gi],
  ["teacher content pack", /teacher-solutions\.json|teacherContentPackProvider|generatedPackProvider/gi],
  ["teacher answer controls", /teacher-presentation-answer-controls|Presentation answer controls|Show all answers|Hide answers/gi],
  ["authoring answer-key payload", /correctAnswers\s*:/gi],
  ["publisher answer reveal", /Publisher answer|Show publisher model answer/gi],
];

async function filesUnder(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(absolute));
    else if (entry.isFile() && [".html", ".js", ".json"].includes(path.extname(entry.name).toLowerCase())) output.push(absolute);
  }
  return output;
}

const generic = await scanWebBundle(distRoot);
assert.deepEqual(generic.findings, [], `Student bundle failed generic safety checks:\n${JSON.stringify(generic.findings, null, 2)}`);
const findings = [];
for (const file of await filesUnder(distRoot)) {
  const content = await readFile(file, "utf8");
  for (const [label, pattern] of forbidden) {
    pattern.lastIndex = 0;
    const count = [...content.matchAll(pattern)].length;
    if (count) findings.push({ file: path.relative(distRoot, file).replaceAll("\\", "/"), label, count });
  }
}
assert.deepEqual(findings, [], `Student Android bundle contains teacher-only UI or answer data:\n${JSON.stringify(findings, null, 2)}`);
console.log(JSON.stringify({ status: "student-safe", filesScanned: generic.filesScanned, findings: 0 }, null, 2));
