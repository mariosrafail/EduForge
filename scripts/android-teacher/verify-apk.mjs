import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const relativeApkPath = "android/app/build/outputs/apk/debug/app-debug.apk";
const apkPath = path.join(repositoryRoot, relativeApkPath);
const metadataPath = path.join(repositoryRoot, "android/app/build/outputs/apk/debug/output-metadata.json");
const manifestCandidates = [
  "android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml",
  "android/app/build/intermediates/merged_manifest/debug/processDebugManifest/AndroidManifest.xml",
  "android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml",
  "android/app/build/intermediates/packaged_manifests/debug/processDebugManifestForPackage/AndroidManifest.xml",
];

async function firstReadable(paths) {
  for (const candidate of paths) {
    try {
      return { path: candidate, content: await readFile(path.join(repositoryRoot, candidate), "utf8") };
    } catch {
      // Gradle output locations differ slightly between Android Gradle Plugin releases.
    }
  }
  return null;
}

function attribute(xml, elementPattern, name) {
  return xml.match(new RegExp(`<${elementPattern}[^>]*\\bandroid:${name}="([^"]+)"`, "s"))?.[1] || "";
}

async function main() {
  const [apk, outputMetadata, mergedManifest] = await Promise.all([
    stat(apkPath),
    readFile(metadataPath, "utf8").then(JSON.parse),
    firstReadable(manifestCandidates),
  ]);
  assert.ok(apk.isFile() && apk.size > 0, "Teacher APK is missing or empty");
  assert.ok(mergedManifest, "Merged Android manifest was not found");

  const variant = outputMetadata.elements?.[0] || {};
  const versionCode = Number(variant.versionCode);
  const versionName = String(variant.versionName || "");
  const applicationId = String(outputMetadata.applicationId || "");
  const applicationLabel = attribute(mergedManifest.content, "application", "label");
  const minSdk = Number(attribute(mergedManifest.content, "uses-sdk", "minSdkVersion"));
  const targetSdk = Number(attribute(mergedManifest.content, "uses-sdk", "targetSdkVersion"));

  assert.equal(applicationId, "com.eduforge.offlinebooks");
  assert.equal(applicationLabel, "Hamilton House LMS");
  assert.equal(versionCode, 1);
  assert.equal(versionName, "1.0");
  assert.equal(minSdk, 24);
  assert.equal(targetSdk, 36);
  assert.doesNotMatch(mergedManifest.content, /android\.permission\.INTERNET/, "Offline APK must not request Internet access");

  console.log(JSON.stringify({
    status: "valid",
    apkPath: relativeApkPath,
    apkSizeBytes: apk.size,
    apkSizeMiB: Number((apk.size / 1024 / 1024).toFixed(2)),
    applicationId,
    applicationLabel,
    versionCode,
    versionName,
    minSdk,
    targetSdk,
    internetPermission: false,
    manifestSource: mergedManifest.path,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
