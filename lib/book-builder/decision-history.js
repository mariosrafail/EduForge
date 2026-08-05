import fs from "node:fs/promises";
import path from "node:path";

import { atomicWriteJson, readJsonFile } from "./atomic-json-store.js";
import { assertNoSymlinkPath, assertSafeId } from "./path-safety.js";
import { ProjectMutationError } from "./project-mutation-error.js";
import { stableHash } from "./stable-json.js";

export const DECISION_HISTORY_SCHEMA_VERSION = "1.0";

function entryName(revision, mutationId) { return `revision-${String(revision).padStart(6, "0")}-${mutationId}.json`; }

export class DecisionHistoryStore {
  constructor(projectDirectory) {
    this.projectDirectory = path.resolve(projectDirectory);
    this.root = path.join(this.projectDirectory, "decision-history");
    this.pendingRoot = path.join(this.root, "pending");
    this.entriesRoot = path.join(this.root, "entries");
    this.snapshotsRoot = path.join(this.root, "decision-snapshots");
  }

  async initialize() {
    await fs.mkdir(this.pendingRoot, { recursive: true });
    await fs.mkdir(this.entriesRoot, { recursive: true });
    await fs.mkdir(this.snapshotsRoot, { recursive: true });
    await assertNoSymlinkPath(this.projectDirectory, this.root);
    return this;
  }

  pendingPath(mutationId) { return path.join(this.pendingRoot, `${assertSafeId(mutationId, "mutationId")}.json`); }

  async findEntry(mutationId) {
    assertSafeId(mutationId, "mutationId");
    const names = await fs.readdir(this.entriesRoot).catch(() => []);
    const name = names.find((item) => item.endsWith(`-${mutationId}.json`));
    return name ? readJsonFile(path.join(this.entriesRoot, name)) : null;
  }

  async writePending(record) {
    await atomicWriteJson(this.pendingPath(record.mutationId), { schemaVersion: DECISION_HISTORY_SCHEMA_VERSION, ...record, state: "pending" }, { allowedRoot: this.pendingRoot });
  }

  async writeSnapshot(revision, approvedDecisions, timestamp) {
    const target = path.join(this.snapshotsRoot, `revision-${String(revision).padStart(6, "0")}.json`);
    const exists = await fs.lstat(target).catch(() => null);
    if (!exists) await atomicWriteJson(target, { schemaVersion: DECISION_HISTORY_SCHEMA_VERSION, revision, approvedDecisions, createdAt: timestamp }, { allowedRoot: this.snapshotsRoot });
  }

  async commit(record) {
    const entry = { ...record, schemaVersion: DECISION_HISTORY_SCHEMA_VERSION, state: "committed" };
    delete entry.previousApprovedDecisions;
    await atomicWriteJson(path.join(this.entriesRoot, entryName(entry.resultingRevision, entry.mutationId)), entry, { allowedRoot: this.entriesRoot });
    await fs.rm(this.pendingPath(entry.mutationId), { force: true });
    return entry;
  }

  async reconcile(project) {
    const names = (await fs.readdir(this.pendingRoot).catch(() => [])).filter((name) => name.endsWith(".json")).sort();
    const diagnostics = [];
    for (const name of names) {
      let pending;
      try { pending = await readJsonFile(path.join(this.pendingRoot, name)); } catch { throw new ProjectMutationError("decision_recovery_ambiguous", 423, { diagnostic: "pending_record_invalid" }); }
      if (pending.schemaVersion !== DECISION_HISTORY_SCHEMA_VERSION || pending.state !== "pending") throw new ProjectMutationError("decision_recovery_ambiguous", 423, { diagnostic: "pending_record_invalid" });
      if (project.revision === pending.previousRevision && stableHash(project.approvedDecisions) === stableHash(pending.previousApprovedDecisions)) {
        await fs.rm(path.join(this.pendingRoot, name), { force: true });
        diagnostics.push({ mutationId: pending.mutationId, outcome: "rolled_back_before_project_write" });
        continue;
      }
      if (project.revision === pending.resultingRevision && stableHash(project.approvedDecisions) === pending.resultingApprovedDecisionsDigest) {
        if (!await this.findEntry(pending.mutationId)) await this.commit(pending);
        else await fs.rm(path.join(this.pendingRoot, name), { force: true });
        diagnostics.push({ mutationId: pending.mutationId, outcome: "finalized_after_project_write" });
        continue;
      }
      throw new ProjectMutationError("decision_recovery_ambiguous", 423, { diagnostic: "pending_project_state_mismatch" });
    }
    return diagnostics;
  }

  async summaries({ limit = 100 } = {}) {
    const names = (await fs.readdir(this.entriesRoot).catch(() => [])).filter((name) => name.endsWith(".json")).sort().reverse().slice(0, limit);
    const entries = [];
    for (const name of names) {
      const item = await readJsonFile(path.join(this.entriesRoot, name));
      entries.push({
        revision: item.resultingRevision, operation: item.operation, decisionId: item.changedDecision?.id || null,
        kind: item.changedDecision?.kind || null, targetId: item.changedDecision?.targetId || null,
        targetType: item.changedDecision?.targetType || null, beforeState: item.changedDecision?.beforeState || null,
        afterState: item.changedDecision?.afterState || null, timestamp: item.committedAt, mutationId: item.mutationId,
      });
    }
    return entries;
  }
}
