import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { verifyTeacherProjectApkArchive } from "../lib/teacher-project-builder/apk-verifier.js";
import { TEACHER_ANDROID_APPLICATION_ID, TEACHER_ANDROID_APPLICATION_LABEL } from "../lib/teacher-project-builder/android-contract.js";
import { buildTeacherProjectWeb } from "../scripts/teacher-project-builder/build-web.mjs";
import { createCompleteTeacherProjectFixture } from "./helpers/teacher-project-fixture.mjs";

function storedZip(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, value] of files) {
    const nameBytes = Buffer.from(name); const content = Buffer.from(value);
    const local = Buffer.alloc(30 + nameBytes.length + content.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(content.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30); content.copy(local, 30 + nameBytes.length); locals.push(local);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(content.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42); nameBytes.copy(central, 46); centrals.push(central); offset += local.length;
  }
  const directory = Buffer.concat(centrals); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

async function filesUnder(root) {
  const result = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(target)); else result.push(target);
  }
  return result;
}

test("APK verifier proves assets/public equals the verified generic dist and rejects B2 leaks", { timeout: 120_000 }, async (t) => {
  const fixture = await createCompleteTeacherProjectFixture({ projectId: "apk-fixture" });
  t.after(fixture.cleanup);
  const built = await buildTeacherProjectWeb({ workspace: fixture.workspace, projectId: "apk-fixture" });
  const distFiles = await filesUnder(built.distRoot);
  const zipFiles = await Promise.all(distFiles.map(async (file) => [`assets/public/${path.relative(built.distRoot, file).replaceAll("\\", "/")}`, await fs.readFile(file)]));
  zipFiles.push(["AndroidManifest.xml", Buffer.from("binary manifest")]);
  const apkPath = path.join(fixture.root, "fixture.apk");
  await fs.writeFile(apkPath, storedZip(zipFiles));
  const inspectApk = async () => ({ applicationId: TEACHER_ANDROID_APPLICATION_ID, applicationLabel: TEACHER_ANDROID_APPLICATION_LABEL, minSdk: 24, targetSdk: 36, permissions: [] });
  const verified = await verifyTeacherProjectApkArchive({ apkPath, distRoot: built.distRoot, project: built.project, stagingManifest: built.manifest, inspectApk });
  assert.equal(verified.status, "generic-teacher-project-apk-safe");
  assert.equal(verified.verifiedProjectAssets, built.manifest.assetIds.length);
  await fs.writeFile(apkPath, storedZip([...zipFiles, ["assets/public/ultimate-b2-teacher-solutions.json", "{}"]]));
  await assert.rejects(() => verifyTeacherProjectApkArchive({ apkPath, distRoot: built.distRoot, project: built.project, stagingManifest: built.manifest, inspectApk }), /forbidden data/);
});
