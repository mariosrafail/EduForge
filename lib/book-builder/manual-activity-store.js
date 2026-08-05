import fs from "node:fs/promises";
import path from "node:path";

import { atomicWriteJson, readJsonFile } from "./atomic-json-store.js";
import { serializeManualActivitiesArtifact } from "./manual-activity-contract.js";
import { serializeManualActivitySolutionsArtifact } from "./manual-activity-solutions.js";
import { assertNoSymlinkPath } from "./path-safety.js";

export const MANUAL_ACTIVITIES_RELATIVE_PATH = "authoring/manual-activities.json";
export const MANUAL_ACTIVITY_SOLUTIONS_RELATIVE_PATH = "internal/manual-activity-solutions.json";

export function emptyManualActivitiesArtifact() {
  return { schemaVersion: "1.0", audience: "student-safe-authoring", activities: [] };
}
export function emptyManualActivitySolutionsArtifact() {
  return { schemaVersion: "1.0", audience: "teacher-only-internal", classification: "local-only", activities: [] };
}

async function readOptional(filePath, fallback) {
  try { return await readJsonFile(filePath); } catch (error) {
    if (/Required JSON file is missing/.test(error.message)) return structuredClone(fallback);
    throw error;
  }
}

export class ManualActivityStore {
  constructor(projectDirectory) {
    this.projectDirectory = path.resolve(projectDirectory);
    this.studentPath = path.join(this.projectDirectory, ...MANUAL_ACTIVITIES_RELATIVE_PATH.split("/"));
    this.teacherPath = path.join(this.projectDirectory, ...MANUAL_ACTIVITY_SOLUTIONS_RELATIVE_PATH.split("/"));
  }

  async validatePaths() {
    await assertNoSymlinkPath(this.projectDirectory, path.dirname(this.studentPath));
    await assertNoSymlinkPath(this.projectDirectory, path.dirname(this.teacherPath));
    return this;
  }

  async readStudent() {
    const artifact = await readOptional(this.studentPath, emptyManualActivitiesArtifact());
    JSON.parse(serializeManualActivitiesArtifact(artifact));
    return artifact;
  }

  async readTeacher(activities) {
    const artifact = await readOptional(this.teacherPath, emptyManualActivitySolutionsArtifact());
    JSON.parse(serializeManualActivitySolutionsArtifact(artifact, activities));
    return artifact;
  }

  async readAll() {
    const student = await this.readStudent();
    return { student, teacher: await this.readTeacher(student.activities) };
  }

  async writeStudent(artifact) {
    const normalized = JSON.parse(serializeManualActivitiesArtifact(artifact));
    await atomicWriteJson(this.studentPath, normalized, { allowedRoot: this.projectDirectory });
    return normalized;
  }

  async writeTeacher(artifact, activities) {
    const normalized = JSON.parse(serializeManualActivitySolutionsArtifact(artifact, activities));
    await atomicWriteJson(this.teacherPath, normalized, { allowedRoot: this.projectDirectory });
    return normalized;
  }

  async pathState(kind) {
    const filePath = kind === "student" ? this.studentPath : this.teacherPath;
    const info = await fs.lstat(filePath).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
    return { exists: Boolean(info), value: info ? await readJsonFile(filePath) : null };
  }

  async restore(kind, snapshot) {
    const filePath = kind === "student" ? this.studentPath : this.teacherPath;
    if (snapshot.exists) await atomicWriteJson(filePath, snapshot.value, { allowedRoot: this.projectDirectory });
    else await fs.rm(filePath, { force: true });
  }
}
