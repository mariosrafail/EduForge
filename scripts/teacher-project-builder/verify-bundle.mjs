import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const TEXT_EXTENSIONS = new Set([".html", ".js", ".css", ".json", ".xml", ".txt"]);
const FORBIDDEN = [
  ["Ultimate B2 content pack", /ultimate-b2-students-book|generatedPackProvider|teacherContentPackProvider/gi],
  ["Ultimate B2 solutions", /teacher-solutions|teacher solution candidate|acceptedAnswers|correctAnswers/gi],
  ["Ultimate B2 pages or media", /ultimateB2(?:Page|Media|Activity)|android-content-packs\/ultimate-b2/gi],
  ["Publisher Review Studio client", /Publisher Review Studio|__hhplms\/book-builder|BookBuilderApp/gi],
  ["external network endpoint", /https?:\/\/(?!(?:www\.w3\.org\/(?:2000\/svg|1999\/xlink|1998\/Math\/MathML|XML\/1998\/namespace)|localhost\/|react\.dev\/errors\/))/gi],
  ["absolute Windows path", /[A-Za-z]:[\\/](?:Users|home|AppData)[\\/]/g],
  ["absolute Unix user path", /\/(?:Users|home)\/[A-Za-z0-9._-]+\//g],
];

async function filesUnder(root) {
  const result = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(target));
    else if (entry.isFile()) result.push(target);
  }
  return result;
}

export async function verifyTeacherProjectBundle({ distRoot, project, stagingManifest, fixedLogoSha256 }) {
  const root = path.resolve(distRoot);
  const info = await fs.stat(root).catch(() => null);
  assert.ok(info?.isDirectory(), "Generic Teacher project dist is missing");
  const files = await filesUnder(root);
  assert.ok(files.length > 0, "Generic Teacher project dist is empty");
  assert.equal(files.some((file) => file.endsWith(".map")), false, "Generic Teacher project bundle must not contain source maps");
  const findings = [];
  for (const file of files.filter((candidate) => TEXT_EXTENSIONS.has(path.extname(candidate).toLowerCase()))) {
    const content = await fs.readFile(file, "utf8");
    for (const [label, pattern] of FORBIDDEN) {
      pattern.lastIndex = 0;
      const count = [...content.matchAll(pattern)].length;
      if (count) findings.push({ file: path.relative(root, file).replaceAll("\\", "/"), label, count });
    }
  }
  assert.deepEqual(findings, [], `Generic Teacher project bundle contains forbidden data:\n${JSON.stringify(findings, null, 2)}`);
  const hashes = new Map();
  for (const file of files) {
    const bytes = await fs.readFile(file);
    const hash = createHash("sha256").update(bytes).digest("hex");
    hashes.set(hash, [...(hashes.get(hash) || []), path.relative(root, file).replaceAll("\\", "/")]);
  }
  for (const assetId of stagingManifest.assetIds) {
    const asset = project.assets[assetId];
    assert.ok(hashes.has(asset.sha256), `Selected project asset ${assetId} is absent from the generic bundle`);
  }
  assert.ok(hashes.has(fixedLogoSha256), "Fixed Hamilton House logo is absent from the generic bundle");
  const projectAssets = files.filter((file) => path.relative(root, file).replaceAll("\\", "/").startsWith("teacher-project-assets/"));
  assert.equal(projectAssets.length, stagingManifest.assetIds.length, "Generic bundle project asset allowlist differs from staging manifest");
  return {
    status: "generic-teacher-project-bundle-safe",
    filesScanned: files.length,
    bytes: (await Promise.all(files.map((file) => fs.stat(file)))).reduce((sum, file) => sum + file.size, 0),
    projectAssetCount: projectAssets.length,
    findings: 0,
  };
}
