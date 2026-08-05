import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertNoSymlinkPath, assertSafeId, isPathWithin } from "./path-safety.js";
import { stableJson } from "./stable-json.js";

export function resolveProjectDirectory(workspace, projectId) {
  assertSafeId(projectId, "projectId");
  const projectsRoot = path.resolve(workspace, "projects");
  const projectDirectory = path.resolve(projectsRoot, projectId);
  if (!isPathWithin(projectsRoot, projectDirectory)) throw new Error("Project directory escapes the workspace");
  return projectDirectory;
}

export async function validateWorkspaceLocation(workspace, { repositoryRoot, sourceRoot } = {}) {
  const resolved = path.resolve(workspace);
  if (repositoryRoot && isPathWithin(repositoryRoot, resolved)) throw new Error("Book Builder workspace must be outside the repository");
  if (sourceRoot && (isPathWithin(sourceRoot, resolved) || isPathWithin(resolved, sourceRoot))) throw new Error("Book Builder workspace must be separate from the selected source");
  await fs.mkdir(resolved, { recursive: true });
  const real = await fs.realpath(resolved);
  if (repositoryRoot) {
    const realRepo = await fs.realpath(repositoryRoot);
    if (isPathWithin(realRepo, real)) throw new Error("Book Builder workspace resolves inside the repository");
  }
  if (sourceRoot) {
    const realSource = await fs.realpath(sourceRoot);
    if (isPathWithin(realSource, real) || isPathWithin(real, realSource)) throw new Error("Book Builder workspace resolves into the selected source");
  }
  return real;
}

export async function readJsonFile(filePath) {
  let raw;
  try { raw = await fs.readFile(filePath, "utf8"); } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Required JSON file is missing: ${path.basename(filePath)}`);
    throw error;
  }
  try { return JSON.parse(raw); } catch (error) { throw new Error(`Corrupted JSON in ${path.basename(filePath)}: ${error.message}`); }
}

export async function atomicWriteJson(filePath, value, { allowedRoot, expectedRevision } = {}) {
  const target = path.resolve(filePath);
  const root = path.resolve(allowedRoot || path.dirname(target));
  if (!isPathWithin(root, target)) throw new Error("Atomic JSON target escapes its allowed root");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await assertNoSymlinkPath(root, path.dirname(target));
  if (expectedRevision !== undefined) {
    const existing = await readJsonFile(target);
    if (existing.revision !== expectedRevision) throw new Error(`Revision conflict: expected ${expectedRevision}, found ${existing.revision}`);
  }
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, stableJson(value), { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

export async function atomicWriteText(filePath, value, { allowedRoot } = {}) {
  const target = path.resolve(filePath);
  const root = path.resolve(allowedRoot || path.dirname(target));
  if (!isPathWithin(root, target)) throw new Error("Atomic text target escapes its allowed root");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await assertNoSymlinkPath(root, path.dirname(target));
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, String(value).replaceAll("\r\n", "\n"), { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

export async function atomicWriteBytes(filePath, value, { allowedRoot } = {}) {
  const target = path.resolve(filePath);
  const root = path.resolve(allowedRoot || path.dirname(target));
  if (!isPathWithin(root, target)) throw new Error("Atomic binary target escapes its allowed root");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await assertNoSymlinkPath(root, path.dirname(target));
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, value, { flag: "wx" });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}
