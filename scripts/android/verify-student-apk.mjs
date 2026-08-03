import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import { inspectAndroidApk } from "./inspect-apk.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const relativeApkPath = "android/app/build/outputs/apk/student/hamilton-house-lms-student-debug.apk";
const apkPath = path.join(repositoryRoot, relativeApkPath);
async function main() {
  const [apk, manifest] = await Promise.all([
    stat(apkPath),
    inspectAndroidApk(apkPath),
  ]);
  assert.ok(apk.isFile() && apk.size > 0, "Student APK is missing or empty");
  const { applicationId, applicationLabel, minSdk, targetSdk } = manifest;
  assert.equal(applicationId, "com.eduforge.offlinebooks");
  assert.equal(applicationLabel, "Hamilton House LMS Student");
  assert.equal(manifest.versionCode, 1);
  assert.equal(manifest.versionName, "1.0");
  assert.equal(minSdk, 24);
  assert.equal(targetSdk, 36);
  assert.ok(!manifest.permissions.includes("android.permission.INTERNET"), "Offline APK must not request Internet access");
  console.log(JSON.stringify({ status: "valid", apkPath: relativeApkPath, apkSizeBytes: apk.size, applicationId, applicationLabel, minSdk, targetSdk, internetPermission: false }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
