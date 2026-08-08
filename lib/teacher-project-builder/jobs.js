import { randomBytes } from "node:crypto";

import { listAdbDevices, installAndLaunchTeacherApk } from "./adb.js";
import {
  exportTeacherProjectApk,
  findReusableTeacherProjectApk,
  TEACHER_PROJECT_REPOSITORY_ROOT,
} from "./export-apk.js";
import { TeacherProjectError } from "./errors.js";
import { TeacherProjectStore } from "./store.js";

const MAX_JOBS = 100;

function publicFailure(error) {
  const code = error?.name === "TeacherProjectError" && /^[a-z0-9_]+$/.test(error.code) ? error.code : "teacher_project_job_failed";
  return { code, message: code.replaceAll("_", " ") };
}

function clonePublicJob(job) {
  return structuredClone({
    jobId: job.jobId,
    type: job.type,
    projectId: job.projectId,
    projectRevision: job.projectRevision,
    status: job.status,
    stage: job.stage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  });
}

export class TeacherProjectJobManager {
  constructor({ workspace, now = () => new Date().toISOString(), exportApk = exportTeacherProjectApk, installApk = installAndLaunchTeacherApk, listDevices = listAdbDevices } = {}) {
    this.workspace = workspace;
    this.now = now;
    this.exportApk = exportApk;
    this.installApk = installApk;
    this.listDevices = listDevices;
    this.store = new TeacherProjectStore({ workspace });
    this.jobs = new Map();
  }

  async validateRevision(projectId, expectedRevision) {
    const status = await this.store.status(projectId);
    if (status.project.revision !== expectedRevision) throw new TeacherProjectError("teacher_project_revision_conflict", 409, { currentRevision: status.project.revision });
    if (!status.completeness.complete) throw new TeacherProjectError("incomplete_teacher_project", 409, { missing: status.completeness.missing });
    return status;
  }

  create(type, projectId, projectRevision, operation) {
    const timestamp = this.now();
    const job = { jobId: randomBytes(16).toString("hex"), type, projectId, projectRevision, status: "queued", stage: "Queued", createdAt: timestamp, updatedAt: timestamp };
    this.jobs.set(job.jobId, job);
    while (this.jobs.size > MAX_JOBS) this.jobs.delete(this.jobs.keys().next().value);
    queueMicrotask(async () => {
      job.status = "running";
      job.updatedAt = this.now();
      const onStage = (stage) => { job.stage = String(stage).replace(/[^A-Za-z ]/g, "").slice(0, 80); job.updatedAt = this.now(); };
      try {
        job.result = await operation(onStage);
        job.status = "complete";
        job.stage = type === "run" ? "Installed and launched" : "Export complete";
      } catch (error) {
        job.status = "failed";
        job.stage = "Failed";
        job.error = publicFailure(error);
      }
      job.updatedAt = this.now();
    });
    return clonePublicJob(job);
  }

  async startExport(projectId, expectedRevision) {
    const status = await this.validateRevision(projectId, expectedRevision);
    return this.create("export", projectId, status.project.revision, async (onStage) => {
      const exported = await this.exportApk({ workspace: this.workspace, projectId, onStage });
      return { apkFilename: exported.apkFilename, reportFilename: exported.reportFilename, build: exported.report };
    });
  }

  async startRun(projectId, expectedRevision, serial) {
    const status = await this.validateRevision(projectId, expectedRevision);
    return this.create("run", projectId, status.project.revision, async (onStage) => {
      let exported = await findReusableTeacherProjectApk({ store: this.store, projectId });
      if (!exported) exported = await this.exportApk({ workspace: this.workspace, projectId, onStage });
      else onStage("Using verified APK");
      onStage("Installing APK");
      const run = await this.installApk({ repositoryRoot: TEACHER_PROJECT_REPOSITORY_ROOT, apkPath: exported.apkPath, serial });
      return { apkFilename: exported.apkFilename, reusedBuild: Boolean(exported.reused), run };
    });
  }

  get(jobId) {
    if (!/^[a-f0-9]{32}$/.test(String(jobId || ""))) throw new TeacherProjectError("teacher_project_job_not_found", 404);
    const job = this.jobs.get(jobId);
    if (!job) throw new TeacherProjectError("teacher_project_job_not_found", 404);
    return clonePublicJob(job);
  }

  async devices() {
    const result = await this.listDevices({ repositoryRoot: TEACHER_PROJECT_REPOSITORY_ROOT });
    return result.available ? result : { available: false, source: result.source, devices: [], error: "adb_not_available" };
  }
}
