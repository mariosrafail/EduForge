import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { atomicWriteJson, readJsonFile } from "./atomic-json-store.js";
import { assertNoSymlinkPath, assertSafeId, isPathWithin } from "./path-safety.js";
import { ProjectMutationError } from "./project-mutation-error.js";

const LOCK_SCHEMA_VERSION = "1.0";

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function processIsActive(processId) {
  if (!Number.isSafeInteger(processId) || processId < 1) return false;
  try { process.kill(processId, 0); return true; } catch (error) { return error.code === "EPERM"; }
}

export class ProjectWriteLock {
  constructor({ workspace, projectId, sessionId = randomUUID(), waitMilliseconds = 1500, staleMilliseconds = 5 * 60 * 1000 } = {}) {
    this.workspace = path.resolve(workspace);
    this.projectId = assertSafeId(projectId, "projectId");
    this.sessionId = String(sessionId);
    this.waitMilliseconds = waitMilliseconds;
    this.staleMilliseconds = staleMilliseconds;
    this.lockRoot = path.join(this.workspace, ".publisher-review-studio", "locks");
    this.lockDirectory = path.join(this.lockRoot, `${this.projectId}.lock`);
    this.acquired = false;
  }

  async initializeRoot() {
    await fs.mkdir(this.lockRoot, { recursive: true });
    await assertNoSymlinkPath(this.workspace, this.lockRoot);
    const realWorkspace = await fs.realpath(this.workspace);
    const realRoot = await fs.realpath(this.lockRoot);
    if (!isPathWithin(realWorkspace, realRoot)) throw new ProjectMutationError("project_lock_unavailable", 423);
  }

  async breakConfirmedStaleLock() {
    const metadataPath = path.join(this.lockDirectory, "lock.json");
    let metadata;
    try { metadata = await readJsonFile(metadataPath); } catch { return false; }
    if (metadata.schemaVersion !== LOCK_SCHEMA_VERSION || metadata.projectId !== this.projectId) return false;
    const age = Date.now() - Date.parse(metadata.acquiredAt);
    if (!Number.isFinite(age) || age <= this.staleMilliseconds || processIsActive(metadata.processId)) return false;
    const stalePath = path.join(this.lockRoot, `${this.projectId}.stale-${randomUUID()}`);
    try { await fs.rename(this.lockDirectory, stalePath); } catch (error) { if (error.code === "ENOENT") return true; return false; }
    await fs.rm(stalePath, { recursive: true, force: true });
    return true;
  }

  async acquire() {
    await this.initializeRoot();
    const deadline = Date.now() + this.waitMilliseconds;
    while (true) {
      try {
        await fs.mkdir(this.lockDirectory);
        this.acquired = true;
        await atomicWriteJson(path.join(this.lockDirectory, "lock.json"), {
          schemaVersion: LOCK_SCHEMA_VERSION,
          projectId: this.projectId,
          processId: process.pid,
          sessionId: this.sessionId,
          acquiredAt: new Date().toISOString(),
        }, { allowedRoot: this.lockDirectory });
        return this;
      } catch (error) {
        if (this.acquired) { await this.release(); throw error; }
        if (error.code !== "EEXIST") throw new ProjectMutationError("project_lock_unavailable", 423);
        if (await this.breakConfirmedStaleLock()) continue;
        if (Date.now() >= deadline) throw new ProjectMutationError("project_write_locked", 423);
        await delay(50);
      }
    }
  }

  async release() {
    if (!this.acquired) return;
    this.acquired = false;
    let metadata;
    try { metadata = await readJsonFile(path.join(this.lockDirectory, "lock.json")); } catch { return; }
    if (metadata.processId !== process.pid || metadata.sessionId !== this.sessionId) return;
    await fs.rm(this.lockDirectory, { recursive: true, force: true });
  }
}

export async function withProjectWriteLock(options, callback) {
  const lock = await new ProjectWriteLock(options).acquire();
  try { return await callback(lock); } finally { await lock.release(); }
}
