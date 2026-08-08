import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { assertNoSymlinkPath, isPathWithin } from "../book-builder/path-safety.js";
import { stableJson } from "../book-builder/stable-json.js";
import { inspectAndroidApk } from "../../scripts/android/inspect-apk.mjs";
import { buildTeacherProjectWeb } from "../../scripts/teacher-project-builder/build-web.mjs";
import { verifyTeacherProjectApkArchive } from "./apk-verifier.js";
import { runFixedProcess } from "./fixed-process.js";
import { TeacherProjectError } from "./errors.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const capacitorCli = path.join(repositoryRoot, "node_modules", "@capacitor", "cli", "bin", "capacitor");
const gradleRunner = path.join(repositoryRoot, "scripts", "android", "run-gradle.mjs");
const gradleApk = path.join(repositoryRoot, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
let androidBuildQueue = Promise.resolve();

function revisionTag(revision) {
  return `r${String(revision).padStart(4, "0")}`;
}

function queueAndroidBuild(operation) {
  const result = androidBuildQueue.then(operation, operation);
  androidBuildQueue = result.catch(() => {});
  return result;
}

async function safeExportsDirectory(store, projectId) {
  const projectDirectory = await store.assertProjectDirectory(projectId);
  const exportsDirectory = path.join(projectDirectory, "exports");
  if (!isPathWithin(projectDirectory, exportsDirectory)) throw new TeacherProjectError("teacher_export_path_unsafe", 500);
  const info = await fs.lstat(exportsDirectory).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new TeacherProjectError("teacher_export_path_unsafe", 400);
  await assertNoSymlinkPath(projectDirectory, exportsDirectory);
  return exportsDirectory;
}

async function replacePreservingPrevious(temporary, destination) {
  const backup = `${destination}.${randomBytes(8).toString("hex")}.previous`;
  const existed = Boolean(await fs.lstat(destination).catch(() => null));
  let completed = false;
  if (existed) await fs.rename(destination, backup);
  try {
    await fs.rename(temporary, destination);
    completed = true;
  } catch (error) {
    if (existed) {
      try { await fs.rename(backup, destination); }
      catch { throw new TeacherProjectError("teacher_export_recovery_required", 500); }
    }
    throw error;
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
    if (completed) await fs.rm(backup, { force: true }).catch(() => {});
  }
}

async function atomicArchive(source, destination) {
  const temporary = `${destination}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.copyFile(source, temporary);
  await replacePreservingPrevious(temporary, destination);
}

async function atomicBuildReport(report, destination) {
  const temporary = `${destination}.${randomBytes(8).toString("hex")}.tmp`;
  await fs.writeFile(temporary, stableJson(report), { encoding: "utf8", flag: "wx" });
  await replacePreservingPrevious(temporary, destination);
}

export async function exportTeacherProjectApk({
  workspace,
  projectId,
  onStage = () => {},
  buildWeb = buildTeacherProjectWeb,
  runProcess = runFixedProcess,
  inspectApk = inspectAndroidApk,
  builtAt = () => new Date().toISOString(),
} = {}) {
  return queueAndroidBuild(async () => {
    const prepared = await buildWeb({ workspace, projectId, onStage });
    const env = { ...process.env, CAPACITOR_BUILD_MODE: "teacher" };
    onStage("Syncing Android");
    await runProcess(process.execPath, [capacitorCli, "sync", "android"], { cwd: repositoryRoot, env });
    onStage("Building APK");
    await runProcess(process.execPath, [gradleRunner, "--teacher", "assembleDebug"], { cwd: repositoryRoot, env });
    const sourceInfo = await fs.stat(gradleApk).catch(() => null);
    if (!sourceInfo?.isFile() || sourceInfo.size === 0) throw new TeacherProjectError("teacher_apk_missing", 500);
    const exportsDirectory = await safeExportsDirectory(prepared.store || { assertProjectDirectory: async () => prepared.projectDirectory }, projectId);
    const base = `${projectId}-${revisionTag(prepared.project.revision)}`;
    const apkFilename = `${base}-debug.apk`;
    const reportFilename = `${base}-build.json`;
    const apkPath = path.join(exportsDirectory, apkFilename);
    onStage("Verifying APK");
    const verification = await verifyTeacherProjectApkArchive({ apkPath: gradleApk, distRoot: prepared.distRoot, project: prepared.project, stagingManifest: prepared.manifest, inspectApk });
    onStage("Archiving APK");
    await atomicArchive(gradleApk, apkPath);
    const report = {
      schemaVersion: "1.0",
      kind: "teacher-project-debug-build",
      projectId,
      projectRevision: prepared.project.revision,
      projectContentHash: prepared.manifest.projectContentHash,
      projectAssetAggregateHash: prepared.manifest.assetAggregateHash,
      builtAt: builtAt(),
      applicationId: verification.applicationId,
      applicationLabel: verification.applicationLabel,
      apk: { filename: apkFilename, sha256: verification.apkSha256, sizeBytes: verification.apkSizeBytes },
      verification,
      tools: { node: process.versions.node, capacitor: "8.4.x", gradleTask: "assembleDebug", androidBuildMode: "teacher" },
    };
    await atomicBuildReport(report, path.join(exportsDirectory, reportFilename));
    onStage("Export complete");
    return { status: "complete", apkPath, apkFilename, reportFilename, report };
  });
}

export async function findReusableTeacherProjectApk({ store, projectId }) {
  const { project, contentHash } = await store.status(projectId);
  const exportsDirectory = await safeExportsDirectory(store, projectId);
  const base = `${projectId}-${revisionTag(project.revision)}`;
  const reportFilename = `${base}-build.json`;
  const apkFilename = `${base}-debug.apk`;
  try {
    const report = JSON.parse(await fs.readFile(path.join(exportsDirectory, reportFilename), "utf8"));
    const apkPath = path.join(exportsDirectory, apkFilename);
    const bytes = await fs.readFile(apkPath);
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (report.projectRevision !== project.revision || report.projectContentHash !== contentHash || report.apk?.filename !== apkFilename || report.apk?.sha256 !== hash) return null;
    return { apkPath, apkFilename, reportFilename, report, reused: true };
  } catch { return null; }
}

export { repositoryRoot as TEACHER_PROJECT_REPOSITORY_ROOT };
