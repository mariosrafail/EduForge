import fs from "node:fs/promises";
import path from "node:path";

import { atomicWriteJson, readJsonFile } from "./atomic-json-store.js";
import { assertNoSymlinkPath, assertSafeId } from "./path-safety.js";
import { ProjectMutationError } from "./project-mutation-error.js";
import { stableHash } from "./stable-json.js";

export const MANUAL_ACTIVITY_HISTORY_SCHEMA_VERSION = "1.0";

function entryName(revision, mutationId) { return `revision-${String(revision).padStart(6, "0")}-${mutationId}.json`; }

export class ManualActivityHistoryStore {
  constructor(projectDirectory) {
    this.projectDirectory = path.resolve(projectDirectory);
    this.root = path.join(this.projectDirectory, "manual-activity-history");
    this.pendingRoot = path.join(this.root, "pending");
    this.entriesRoot = path.join(this.root, "entries");
    this.studentSnapshotsRoot = path.join(this.root, "student-snapshots");
    this.teacherSnapshotsRoot = path.join(this.root, "internal-solution-snapshots");
  }

  async initialize() {
    for (const target of [this.pendingRoot, this.entriesRoot, this.studentSnapshotsRoot, this.teacherSnapshotsRoot]) await fs.mkdir(target, { recursive: true });
    await assertNoSymlinkPath(this.projectDirectory, this.root);
    return this;
  }

  pendingPath(mutationId) { return path.join(this.pendingRoot, `${assertSafeId(mutationId, "mutationId")}.json`); }
  snapshotPath(kind, mutationId) { return path.join(kind === "student" ? this.studentSnapshotsRoot : this.teacherSnapshotsRoot, `${assertSafeId(mutationId, "mutationId")}.json`); }

  async findEntry(mutationId) {
    assertSafeId(mutationId, "mutationId");
    const name = (await fs.readdir(this.entriesRoot).catch(() => [])).find((item) => item.endsWith(`-${mutationId}.json`));
    return name ? readJsonFile(path.join(this.entriesRoot, name)) : null;
  }

  async writeSnapshots(mutationId, student, teacher, timestamp) {
    await atomicWriteJson(this.snapshotPath("student", mutationId), { schemaVersion: MANUAL_ACTIVITY_HISTORY_SCHEMA_VERSION, createdAt: timestamp, ...student }, { allowedRoot: this.studentSnapshotsRoot });
    await atomicWriteJson(this.snapshotPath("teacher", mutationId), { schemaVersion: MANUAL_ACTIVITY_HISTORY_SCHEMA_VERSION, createdAt: timestamp, ...teacher }, { allowedRoot: this.teacherSnapshotsRoot });
  }

  async readSnapshot(kind, mutationId) {
    const value = await readJsonFile(this.snapshotPath(kind, mutationId));
    if (value.schemaVersion !== MANUAL_ACTIVITY_HISTORY_SCHEMA_VERSION || typeof value.exists !== "boolean") throw new ProjectMutationError("manual_activity_recovery_ambiguous", 423, { diagnostic: `${kind}_snapshot_invalid` });
    return { exists: value.exists, value: value.value };
  }

  async writePending(record) {
    await atomicWriteJson(this.pendingPath(record.mutationId), { schemaVersion: MANUAL_ACTIVITY_HISTORY_SCHEMA_VERSION, ...record, state: "pending" }, { allowedRoot: this.pendingRoot });
  }

  async commit(record) {
    const entry = { ...record, schemaVersion: MANUAL_ACTIVITY_HISTORY_SCHEMA_VERSION, state: "committed" };
    delete entry.previousDigests; delete entry.resultingDigests;
    await atomicWriteJson(path.join(this.entriesRoot, entryName(entry.resultingRevision, entry.mutationId)), entry, { allowedRoot: this.entriesRoot });
    await fs.rm(this.pendingPath(entry.mutationId), { force: true });
    return entry;
  }

  async reconcile({ project, studentState, teacherState, store }) {
    const names = (await fs.readdir(this.pendingRoot).catch(() => [])).filter((name) => name.endsWith(".json")).sort();
    const diagnostics = [];
    for (const name of names) {
      let pending;
      try { pending = await readJsonFile(path.join(this.pendingRoot, name)); } catch { throw new ProjectMutationError("manual_activity_recovery_ambiguous", 423, { diagnostic: "pending_record_invalid" }); }
      if (pending.schemaVersion !== MANUAL_ACTIVITY_HISTORY_SCHEMA_VERSION || pending.state !== "pending") throw new ProjectMutationError("manual_activity_recovery_ambiguous", 423, { diagnostic: "pending_record_invalid" });
      const current = { project: stableHash(project), student: stableHash(studentState), teacher: stableHash(teacherState) };
      const previous = pending.previousDigests; const resulting = pending.resultingDigests;
      if (project.revision === pending.previousRevision && current.project === previous.project) {
        if (current.student !== previous.student || current.teacher !== previous.teacher) {
          const studentSnapshot = await this.readSnapshot("student", pending.mutationId);
          const teacherSnapshot = await this.readSnapshot("teacher", pending.mutationId);
          await store.restore("student", studentSnapshot);
          await store.restore("teacher", teacherSnapshot);
        }
        await fs.rm(path.join(this.pendingRoot, name), { force: true });
        diagnostics.push({ mutationId: pending.mutationId, outcome: "rolled_back_before_project_write" });
        continue;
      }
      if (project.revision === pending.resultingRevision && current.project === resulting.project && current.student === resulting.student && current.teacher === resulting.teacher) {
        if (!await this.findEntry(pending.mutationId)) await this.commit(pending); else await fs.rm(path.join(this.pendingRoot, name), { force: true });
        diagnostics.push({ mutationId: pending.mutationId, outcome: "finalized_after_project_write" });
        continue;
      }
      throw new ProjectMutationError("manual_activity_recovery_ambiguous", 423, { diagnostic: "pending_project_or_artifact_state_mismatch" });
    }
    return diagnostics;
  }

  async summaries({ limit = 100 } = {}) {
    const names = (await fs.readdir(this.entriesRoot).catch(() => [])).filter((name) => name.endsWith(".json")).sort().reverse().slice(0, limit);
    return Promise.all(names.map(async (name) => { const item = await readJsonFile(path.join(this.entriesRoot, name)); return { revision: item.resultingRevision, operation: item.operation, activityId: item.activityId, type: item.type, hierarchy: item.hierarchy, statusBefore: item.statusBefore, statusAfter: item.statusAfter, timestamp: item.committedAt, mutationId: item.mutationId }; }));
  }
}
