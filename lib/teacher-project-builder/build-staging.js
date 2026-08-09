import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { atomicWriteJson } from "../book-builder/atomic-json-store.js";
import { assertNoSymlinkPath, isPathWithin } from "../book-builder/path-safety.js";
import { stableHash } from "../book-builder/stable-json.js";
import { parseGafSummary } from "../book-builder/profiles/ultimate-air-v2/safe-zip-gaf.js";
import { materializeTeacherProjectRuntime } from "../../src/apps/android-teacher-project/teacherProjectRuntimeContract.js";
import { TeacherProjectError } from "./errors.js";
import { TEACHER_ANDROID_APPLICATION_ID } from "./android-contract.js";
import { teacherProjectReferencedAssetIds } from "./schema.js";

export const TEACHER_PROJECT_BUILD_DIRECTORY = ".build";

function assetAggregateHash(project, assetIds) {
  return stableHash(assetIds.map((assetId) => {
    const asset = project.assets[assetId];
    return { assetId, relativePath: asset.relativePath, sha256: asset.sha256, sizeBytes: asset.sizeBytes };
  }));
}

async function safeResetBuildDirectory(projectDirectory) {
  const buildRoot = path.join(projectDirectory, TEACHER_PROJECT_BUILD_DIRECTORY);
  if (!isPathWithin(projectDirectory, buildRoot) || path.basename(buildRoot) !== TEACHER_PROJECT_BUILD_DIRECTORY) {
    throw new TeacherProjectError("teacher_project_build_path_unsafe", 500);
  }
  const info = await fs.lstat(buildRoot).catch(() => null);
  if (info?.isSymbolicLink()) throw new TeacherProjectError("teacher_project_build_path_unsafe", 400);
  if (info) await fs.rm(buildRoot, { recursive: true, force: true });
  await fs.mkdir(buildRoot);
  await assertNoSymlinkPath(projectDirectory, buildRoot);
  return buildRoot;
}

async function validateGafBundle(project, projectDirectory) {
  const { gaf, sdAtlases, hdAtlases } = project.shell.titleAnimation;
  if (!gaf || !sdAtlases.length || !hdAtlases.length) {
    return { mode: "placeholder", version: null, frameCount: 0, requiredSdAtlases: 0, requiredHdAtlases: 0 };
  }
  const gafAsset = project.assets[gaf];
  const gafPath = path.join(projectDirectory, ...gafAsset.relativePath.split("/"));
  let summary;
  try {
    summary = parseGafSummary(await fs.readFile(gafPath));
  } catch {
    return { mode: "placeholder", version: null, frameCount: 0, requiredSdAtlases: 0, requiredHdAtlases: 0 };
  }
  const atlasIds = summary.sources.map(({ atlasId }) => atlasId);
  const requiredCount = Math.max(0, ...atlasIds);
  if (!requiredCount || sdAtlases.length < requiredCount || hdAtlases.length < requiredCount) {
    return { mode: "placeholder", version: summary.version, frameCount: summary.timeline.frames, requiredSdAtlases: requiredCount, requiredHdAtlases: requiredCount };
  }
  return { mode: "animation", version: summary.version, frameCount: summary.timeline.frames, requiredSdAtlases: requiredCount, requiredHdAtlases: requiredCount };
}

export async function prepareTeacherProjectBuild({ store, projectId }) {
  const { project, completeness, contentHash } = await store.status(projectId);
  const projectDirectory = await store.assertProjectDirectory(projectId);
  const gaf = await validateGafBundle(project, projectDirectory);
  const buildRoot = await safeResetBuildDirectory(projectDirectory);
  const publicRoot = path.join(buildRoot, "public");
  const publicAssetsRoot = path.join(publicRoot, "teacher-project-assets");
  await fs.mkdir(publicAssetsRoot, { recursive: true });
  const assetIds = teacherProjectReferencedAssetIds(project);
  const runtimeAssetUrls = new Map();
  for (const assetId of assetIds) {
    const asset = project.assets[assetId];
    const source = path.join(projectDirectory, ...asset.relativePath.split("/"));
    await assertNoSymlinkPath(projectDirectory, source);
    const extension = path.extname(asset.relativePath).toLowerCase();
    const filename = `${assetId}${extension}`;
    const destination = path.join(publicAssetsRoot, filename);
    await fs.copyFile(source, destination);
    const copied = await fs.readFile(destination);
    if (createHash("sha256").update(copied).digest("hex") !== asset.sha256) throw new TeacherProjectError("teacher_asset_changed", 409, { assetId });
    runtimeAssetUrls.set(assetId, `/teacher-project-assets/${filename}`);
  }
  const runtimeConfig = materializeTeacherProjectRuntime(project, (assetId) => runtimeAssetUrls.get(assetId));
  const runtimeConfigPath = path.join(buildRoot, "runtime-config.json");
  const manifest = {
    schemaVersion: "2.0",
    kind: "teacher-project-build-staging",
    projectId: project.projectId,
    projectRevision: project.revision,
    projectContentHash: contentHash,
    assetAggregateHash: assetAggregateHash(project, assetIds),
    assetIds,
    pageAssetCount: assetIds.filter((assetId) => project.assets[assetId].relativePath.startsWith("assets/pages/")).length,
    content: {
      unitCountWithContent: completeness.contentStatus.unitCountWithContent,
      entryCount: completeness.contentStatus.entryCount,
      completeEntryCount: completeness.contentStatus.completeEntryCount,
      incompleteEntryCount: completeness.contentStatus.incompleteEntryCount,
    },
    placeholders: {
      shellMissingCount: completeness.missingCount,
      incompleteEntryCount: completeness.contentStatus.incompleteEntryCount,
      missingSoundsAreSilent: true,
    },
    gaf,
    applicationId: TEACHER_ANDROID_APPLICATION_ID,
  };
  await atomicWriteJson(runtimeConfigPath, runtimeConfig, { allowedRoot: buildRoot });
  await atomicWriteJson(path.join(buildRoot, "staging-manifest.json"), manifest, { allowedRoot: buildRoot });
  return { project, projectDirectory, buildRoot, publicRoot, runtimeConfigPath, runtimeConfig, manifest };
}

export async function validatePreparedTeacherProjectBuild(prepared) {
  const publicInfo = await fs.lstat(prepared.publicRoot).catch(() => null);
  if (!publicInfo?.isDirectory() || publicInfo.isSymbolicLink()) throw new TeacherProjectError("teacher_project_build_path_unsafe", 500);
  return prepared;
}
