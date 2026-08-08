import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { atomicWriteBytes, atomicWriteJson, readJsonFile } from "../book-builder/atomic-json-store.js";
import { assertNoSymlinkPath, isPathWithin } from "../book-builder/path-safety.js";
import { inspectTeacherAsset } from "./asset-inspection.js";
import { TEACHER_PROJECT_ASSET_FOLDERS, TEACHER_PROJECT_LIMITS } from "./constants.js";
import { TeacherProjectError, teacherProjectError } from "./errors.js";
import {
  assertTeacherAssetId,
  assertTeacherProjectId,
  createBlankTeacherProject,
  teacherProjectCompleteness,
  teacherProjectContentHash,
  teacherProjectReferencedAssetIds,
  teacherProjectSummary,
  validateTeacherProject,
  validateTeacherProjectDraft,
} from "./schema.js";

export const TEACHER_PROJECTS_DIRECTORY = "teacher-projects";
export const TEACHER_PROJECT_MANIFEST = "teacher-project.json";

async function existingNonSymlinkDirectory(target, code) {
  const info = await fs.lstat(target).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new TeacherProjectError(code, 400);
  return fs.realpath(target);
}

export class TeacherProjectStore {
  constructor({ workspace, now = () => new Date().toISOString() } = {}) {
    if (!workspace) throw new TeacherProjectError("teacher_project_workspace_required", 500);
    this.workspace = path.resolve(workspace);
    this.root = path.join(this.workspace, TEACHER_PROJECTS_DIRECTORY);
    this.now = now;
  }

  async initialize({ create = false } = {}) {
    const realWorkspace = await existingNonSymlinkDirectory(this.workspace, "teacher_project_workspace_unavailable");
    if (create) await fs.mkdir(this.root, { recursive: true });
    const rootInfo = await fs.lstat(this.root).catch(() => null);
    if (rootInfo) {
      if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new TeacherProjectError("teacher_projects_root_unsafe", 400);
      await assertNoSymlinkPath(realWorkspace, this.root);
      const realRoot = await fs.realpath(this.root);
      if (!isPathWithin(realWorkspace, realRoot)) throw new TeacherProjectError("teacher_projects_root_unsafe", 400);
    }
    return this;
  }

  projectDirectory(projectId) {
    const safeId = assertTeacherProjectId(projectId);
    const target = path.join(this.root, safeId);
    if (!isPathWithin(this.root, target)) throw new TeacherProjectError("invalid_teacher_project_id", 400);
    return target;
  }

  manifestPath(projectId) {
    return path.join(this.projectDirectory(projectId), TEACHER_PROJECT_MANIFEST);
  }

  async assertProjectDirectory(projectId) {
    await this.initialize();
    const target = this.projectDirectory(projectId);
    const info = await fs.lstat(target).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new TeacherProjectError("teacher_project_not_found", 404);
    await assertNoSymlinkPath(this.root, target);
    return target;
  }

  async load(projectId) {
    try {
      const directory = await this.assertProjectDirectory(projectId);
      const project = validateTeacherProject(await readJsonFile(path.join(directory, TEACHER_PROJECT_MANIFEST)));
      if (project.projectId !== projectId) throw new TeacherProjectError("teacher_project_identity_mismatch", 400);
      return project;
    } catch (error) {
      throw teacherProjectError(error, "teacher_project_load_failed");
    }
  }

  async create({ projectId, displayName }) {
    await this.initialize({ create: true });
    const directory = this.projectDirectory(projectId);
    try {
      await fs.mkdir(directory);
    } catch (error) {
      if (error.code === "EEXIST") throw new TeacherProjectError("teacher_project_already_exists", 409);
      throw error;
    }
    try {
      for (const folder of TEACHER_PROJECT_ASSET_FOLDERS) await fs.mkdir(path.join(directory, "assets", folder), { recursive: true });
      await fs.mkdir(path.join(directory, "exports"), { recursive: true });
      const project = createBlankTeacherProject({ projectId, displayName, now: this.now() });
      await atomicWriteJson(path.join(directory, TEACHER_PROJECT_MANIFEST), project, { allowedRoot: directory });
      return project;
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
      throw teacherProjectError(error, "teacher_project_create_failed");
    }
  }

  async duplicate(sourceProjectId, { projectId, displayName }) {
    const source = await this.load(sourceProjectId);
    const blank = createBlankTeacherProject({ projectId, displayName, now: this.now() });
    await this.initialize({ create: true });
    const destination = this.projectDirectory(blank.projectId);
    try {
      await fs.mkdir(destination);
    } catch (error) {
      if (error.code === "EEXIST") throw new TeacherProjectError("teacher_project_already_exists", 409);
      throw error;
    }
    try {
      for (const folder of TEACHER_PROJECT_ASSET_FOLDERS) await fs.mkdir(path.join(destination, "assets", folder), { recursive: true });
      await fs.mkdir(path.join(destination, "exports"), { recursive: true });
      for (const [assetId, metadata] of Object.entries(source.assets)) {
        const content = await this.assetContent(sourceProjectId, assetId);
        const target = path.join(destination, ...metadata.relativePath.split("/"));
        if (!isPathWithin(destination, target)) throw new TeacherProjectError("invalid_teacher_asset_path", 400);
        await atomicWriteBytes(target, content.bytes, { allowedRoot: destination });
      }
      const duplicate = validateTeacherProject({
        ...source,
        projectId: blank.projectId,
        displayName: blank.displayName,
        revision: 1,
        savedAt: blank.savedAt,
        shell: structuredClone(source.shell),
        content: structuredClone(source.content),
        assets: structuredClone(source.assets),
        build: structuredClone(source.build),
      });
      await atomicWriteJson(path.join(destination, TEACHER_PROJECT_MANIFEST), duplicate, { allowedRoot: destination });
      return duplicate;
    } catch (error) {
      await fs.rm(destination, { recursive: true, force: true }).catch(() => {});
      throw teacherProjectError(error, "teacher_project_duplicate_failed");
    }
  }

  async list() {
    await this.initialize();
    const entries = await fs.readdir(this.root, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const projects = [];
    const diagnostics = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try { projects.push(teacherProjectSummary(await this.load(entry.name))); }
      catch (error) { diagnostics.push({ projectId: /^[a-z0-9-]{1,64}$/.test(entry.name) ? entry.name : "unavailable", code: teacherProjectError(error).code }); }
    }
    return { projects, diagnostics };
  }

  async save(projectId, draft) {
    const current = await this.load(projectId);
    const normalized = validateTeacherProjectDraft(draft, current);
    if (normalized.expectedRevision !== current.revision) throw new TeacherProjectError("teacher_project_revision_conflict", 409, { currentRevision: current.revision });
    const comparable = { ...current, displayName: normalized.displayName, shell: normalized.shell, content: normalized.content };
    validateTeacherProject(comparable);
    if (teacherProjectContentHash(comparable) === teacherProjectContentHash(current)) return current;
    const next = validateTeacherProject({ ...comparable, revision: current.revision + 1, savedAt: this.now() });
    const directory = await this.assertProjectDirectory(projectId);
    await atomicWriteJson(this.manifestPath(projectId), next, { allowedRoot: directory, expectedRevision: current.revision });
    return next;
  }

  async importAsset(projectId, { bytes, originalFilename, descriptor }) {
    const current = await this.load(projectId);
    const imported = await inspectTeacherAsset({ bytes, originalFilename, descriptor, now: this.now() });
    const existing = current.assets[imported.metadata.assetId];
    if (existing) return { project: current, asset: existing, deduplicated: true, inspection: imported.inspection.gaf ? { gaf: imported.inspection.gaf } : null };
    const totalBytes = Object.values(current.assets).reduce((sum, asset) => sum + asset.sizeBytes, 0) + imported.metadata.sizeBytes;
    if (totalBytes > TEACHER_PROJECT_LIMITS.totalAssetBytes) throw new TeacherProjectError("teacher_project_assets_too_large", 413, { limitBytes: TEACHER_PROJECT_LIMITS.totalAssetBytes });
    const directory = await this.assertProjectDirectory(projectId);
    const destination = path.join(directory, ...imported.metadata.relativePath.split("/"));
    if (!isPathWithin(directory, destination)) throw new TeacherProjectError("invalid_teacher_asset_path", 400);
    await atomicWriteBytes(destination, imported.bytes, { allowedRoot: directory });
    const next = validateTeacherProject({
      ...current,
      revision: current.revision + 1,
      savedAt: this.now(),
      assets: { ...current.assets, [imported.metadata.assetId]: imported.metadata },
    });
    try {
      await atomicWriteJson(this.manifestPath(projectId), next, { allowedRoot: directory, expectedRevision: current.revision });
    } catch (error) {
      await fs.rm(destination, { force: true }).catch(() => {});
      throw error;
    }
    return { project: next, asset: imported.metadata, deduplicated: false, inspection: imported.inspection.gaf ? { gaf: imported.inspection.gaf } : null };
  }

  async assetContent(projectId, assetId) {
    assertTeacherAssetId(assetId, { nullable: false });
    const project = await this.load(projectId);
    const metadata = project.assets[assetId];
    if (!metadata) throw new TeacherProjectError("teacher_asset_not_found", 404);
    const directory = await this.assertProjectDirectory(projectId);
    const target = path.join(directory, ...metadata.relativePath.split("/"));
    if (!isPathWithin(directory, target)) throw new TeacherProjectError("teacher_asset_not_found", 404);
    await assertNoSymlinkPath(directory, target);
    const info = await fs.lstat(target).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink() || info.size !== metadata.sizeBytes) throw new TeacherProjectError("teacher_asset_not_found", 404);
    const bytes = await fs.readFile(target);
    if (createHash("sha256").update(bytes).digest("hex") !== metadata.sha256) throw new TeacherProjectError("teacher_asset_changed", 409);
    return { metadata, bytes };
  }

  async removeAsset(projectId, assetId, expectedRevision) {
    const current = await this.load(projectId);
    assertTeacherAssetId(assetId, { nullable: false });
    if (expectedRevision !== current.revision) throw new TeacherProjectError("teacher_project_revision_conflict", 409, { currentRevision: current.revision });
    if (teacherProjectReferencedAssetIds(current).includes(assetId)) throw new TeacherProjectError("teacher_asset_still_referenced", 409);
    const metadata = current.assets[assetId];
    if (!metadata) throw new TeacherProjectError("teacher_asset_not_found", 404);
    const assets = { ...current.assets };
    delete assets[assetId];
    const next = validateTeacherProject({ ...current, assets, revision: current.revision + 1, savedAt: this.now() });
    const directory = await this.assertProjectDirectory(projectId);
    await atomicWriteJson(this.manifestPath(projectId), next, { allowedRoot: directory, expectedRevision: current.revision });
    const target = path.join(directory, ...metadata.relativePath.split("/"));
    if (isPathWithin(directory, target)) await fs.rm(target, { force: true }).catch(() => {});
    return next;
  }

  async status(projectId) {
    const project = await this.load(projectId);
    return { project, completeness: teacherProjectCompleteness(project), contentHash: teacherProjectContentHash(project) };
  }
}

export async function createTeacherProjectStore(options) {
  return new TeacherProjectStore(options).initialize();
}
