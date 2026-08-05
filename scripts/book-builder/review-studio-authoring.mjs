import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { isPathWithin } from "../../lib/book-builder/path-safety.js";
import { ProjectMutationService } from "../../lib/book-builder/project-mutation.js";
import { ProjectMutationError } from "../../lib/book-builder/project-mutation-error.js";

export const AUTHORING_CONFIRMATION = "local-book-project-writes";

async function existingRealDirectory(value, code) {
  const selected = path.resolve(value);
  const info = await fs.lstat(selected).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new ProjectMutationError(code, 400);
  return fs.realpath(selected);
}

export async function validateAuthoringWorkspace(workspace, { repositoryRoot, testOnlyAllowTemporary = false } = {}) {
  const realWorkspace = await existingRealDirectory(workspace, "authoring_workspace_unavailable");
  const realRepository = repositoryRoot ? await fs.realpath(repositoryRoot) : null;
  if (realRepository && (isPathWithin(realRepository, realWorkspace) || isPathWithin(realWorkspace, realRepository))) {
    throw new ProjectMutationError("authoring_workspace_repository_contained", 400);
  }
  const realTemp = await fs.realpath(os.tmpdir());
  if (!testOnlyAllowTemporary && isPathWithin(realTemp, realWorkspace)) throw new ProjectMutationError("authoring_workspace_temporary", 400);
  const projectsRoot = path.join(realWorkspace, "projects");
  const projectEntries = await fs.readdir(projectsRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of projectEntries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const bindingPath = path.join(projectsRoot, entry.name, "local-source-binding.json");
    const raw = await fs.readFile(bindingPath, "utf8").catch(() => null);
    if (!raw) continue;
    let binding;
    try { binding = JSON.parse(raw); } catch { throw new ProjectMutationError("authoring_workspace_binding_ambiguous", 400); }
    for (const source of [binding.selectedOuterRealPath, binding.canonicalApplicationRealPath].filter(Boolean)) {
      const realSource = await fs.realpath(path.resolve(source)).catch(() => null);
      if (!realSource || isPathWithin(realSource, realWorkspace) || isPathWithin(realWorkspace, realSource)) {
        throw new ProjectMutationError("authoring_workspace_source_contained", 400);
      }
    }
  }
  return realWorkspace;
}

export async function createProjectMutationService({ reader, projectId, workspace, sessionId, hooks } = {}) {
  const projectDirectory = await reader.projectDirectory(projectId);
  return new ProjectMutationService({
    workspace,
    projectDirectory,
    projectId,
    sessionId,
    hooks,
    loadArtifacts: async (project) => {
      const [components, pages, hotspots, activities, reviews] = await Promise.all([
        reader.readArtifact(projectId, "components", { optional: true, project }),
        reader.readArtifact(projectId, "pages", { optional: true, project }),
        reader.readArtifact(projectId, "hotspots", { optional: true, project }),
        reader.readArtifact(projectId, "activities", { optional: true, project }),
        reader.readArtifact(projectId, "reviews", { optional: true, project }),
      ]);
      return { components, pages, hotspots, activities, reviews };
    },
  });
}
