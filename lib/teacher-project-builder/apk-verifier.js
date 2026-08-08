import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { readSafeZipEntries } from "../book-builder/profiles/ultimate-air-v2/safe-zip-gaf.js";

const TEXT_ENTRY = /\.(?:html?|m?js|css|json|xml|txt)$/i;
const CAPACITOR_GENERATED_WEB_FILES = new Set(["cordova.js", "cordova_plugins.js"]);
const FORBIDDEN = [
  ["Ultimate B2 runtime asset", /ultimate-b2-(?:students-book|teacher-solutions)|ultimateB2(?:Page|Media|Activity)/gi],
  ["B2 content or solutions", /teacher-solutions|acceptedAnswers|correctAnswers|android-content-packs|generatedPackProvider/gi],
  ["Publisher Review Studio", /Publisher Review Studio|__hhplms\/book-builder|BookBuilderApp/gi],
  ["external endpoint", /https?:\/\/(?!(?:www\.w3\.org\/(?:2000\/svg|1999\/xlink|1998\/Math\/MathML|XML\/1998\/namespace)|localhost\/|react\.dev\/errors\/))/gi],
  ["local developer path", /(?:[A-Za-z]:[\\/](?:Users|home|AppData)[\\/]|\/(?:Users|home)\/[A-Za-z0-9._-]+\/)/g],
];

async function filesUnder(root) {
  const files = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function verifyTeacherProjectApkArchive({ apkPath, distRoot, project, stagingManifest, inspectApk }) {
  const apkBytes = await fs.readFile(apkPath);
  const entries = readSafeZipEntries(apkBytes);
  const findings = [];
  for (const [entryPath, entry] of entries) {
    for (const [label, pattern] of FORBIDDEN.slice(0, 3)) {
      pattern.lastIndex = 0;
      if (pattern.test(entryPath)) findings.push({ entry: entryPath, label });
    }
    if (!entryPath.startsWith("assets/public/") || !TEXT_ENTRY.test(entryPath) || entry.uncompressedSize > 8 * 1024 * 1024) continue;
    const content = entry.content.toString("utf8");
    for (const [label, pattern] of FORBIDDEN) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) findings.push({ entry: entryPath, label });
    }
  }
  assert.deepEqual(findings, [], `Generic Teacher APK contains forbidden data: ${JSON.stringify(findings)}`);
  assert.equal([...entries.keys()].some((name) => name.endsWith(".map")), false, "Generic Teacher APK must not contain source maps");

  const distFiles = await filesUnder(distRoot);
  for (const file of distFiles) {
    const relative = path.relative(distRoot, file).replaceAll("\\", "/");
    const packaged = entries.get(`assets/public/${relative}`);
    assert.ok(packaged, `APK is missing web asset ${relative}`);
    assert.equal(sha256(packaged.content), sha256(await fs.readFile(file)), `APK web asset changed: ${relative}`);
  }
  const packagedPublicFiles = [...entries.keys()].filter((name) => name.startsWith("assets/public/") && !name.endsWith("/"));
  const extraPublicFiles = packagedPublicFiles.map((name) => name.slice("assets/public/".length)).filter((name) => !distFiles.some((file) => path.relative(distRoot, file).replaceAll("\\", "/") === name));
  assert.ok(extraPublicFiles.every((name) => CAPACITOR_GENERATED_WEB_FILES.has(name)), `APK assets/public has unexpected files: ${extraPublicFiles.join(", ")}`);
  assert.equal(packagedPublicFiles.length, distFiles.length + extraPublicFiles.length, "APK assets/public differs from the verified generic dist plus Capacitor bridge files");
  for (const assetId of stagingManifest.assetIds) {
    assert.ok([...entries.values()].some((entry) => entry.path.startsWith("assets/public/teacher-project-assets/") && sha256(entry.content) === project.assets[assetId].sha256), `APK is missing selected project asset ${assetId}`);
  }

  const manifest = await inspectApk(apkPath);
  assert.equal(manifest.applicationId, "com.eduforge.offlinebooks");
  assert.equal(manifest.applicationLabel, "Hamilton House LMS Teacher");
  assert.ok(!manifest.permissions.includes("android.permission.INTERNET"), "Generic Teacher APK must remain offline");
  return {
    status: "generic-teacher-project-apk-safe",
    apkSha256: sha256(apkBytes),
    apkSizeBytes: apkBytes.length,
    archiveEntries: entries.size,
    verifiedWebFiles: distFiles.length,
    capacitorGeneratedWebFiles: extraPublicFiles,
    verifiedProjectAssets: stagingManifest.assetIds.length,
    applicationId: manifest.applicationId,
    applicationLabel: manifest.applicationLabel,
    minSdk: manifest.minSdk,
    targetSdk: manifest.targetSdk,
    internetPermission: false,
    findings: 0,
  };
}
