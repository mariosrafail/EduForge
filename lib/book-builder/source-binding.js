import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertSafeId } from "./path-safety.js";

export function defaultBookBuilderWorkspace(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    if (!env.LOCALAPPDATA) throw new Error("LOCALAPPDATA is required to resolve the Book Builder workspace");
    return path.join(env.LOCALAPPDATA, "HamiltonHouseLMS", "BookBuilder");
  }
  const localData = env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(localData, "HamiltonHouseLMS", "BookBuilder");
}

export function createLocalSourceBinding({ projectId, resolution, now = new Date().toISOString(), bindingId = randomUUID() }) {
  assertSafeId(projectId, "projectId");
  return {
    schemaVersion: "1.0",
    bindingId,
    projectId,
    selectedOuterPath: resolution.selectedAbsolutePath,
    selectedOuterRealPath: resolution.selectedRealPath,
    canonicalApplicationRoot: resolution.canonicalAppRoot,
    canonicalApplicationRealPath: resolution.canonicalAppRoot,
    sourceKind: resolution.kind,
    createdAt: now,
    lastScannedAt: now,
  };
}
