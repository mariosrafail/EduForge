import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseAdbDevices, listAdbDevices, installAndLaunchTeacherApk } from "../lib/teacher-project-builder/adb.js";
import { TEACHER_ANDROID_MAIN_ACTIVITY } from "../lib/teacher-project-builder/android-contract.js";
import { TeacherProjectJobManager } from "../lib/teacher-project-builder/jobs.js";
import { createCompleteTeacherProjectFixture } from "./helpers/teacher-project-fixture.mjs";

async function finishedJob(manager, jobId) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const job = manager.get(jobId);
    if (!["queued", "running"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("job did not finish");
}

test("ADB discovery output is sanitized and fixed serial install/launch arguments are used", async () => {
  const parsed = parseAdbDevices("List of devices attached\nemulator-5554 device product:sdk model:Pixel_8 device:emu transport_id:1\nunauthorized-one unauthorized\ninvalid/serial device\n");
  assert.deepEqual(parsed, [
    { serial: "emulator-5554", state: "device", product: "sdk", model: "Pixel 8", device: "emu" },
    { serial: "unauthorized-one", state: "unauthorized", product: "", model: "", device: "" },
  ]);
  const calls = [];
  const runProcess = async (command, args) => {
    calls.push({ command, args });
    return { stdout: args[0] === "devices" ? "List of devices attached\nemulator-5554 device model:Pixel_8\n" : "Success\n", stderr: "", exitCode: 0 };
  };
  const environment = { ANDROID_ADB_PATH: process.execPath };
  const discovery = await listAdbDevices({ repositoryRoot: path.resolve("."), environment, runProcess });
  assert.equal(discovery.devices[0].serial, "emulator-5554");
  const result = await installAndLaunchTeacherApk({ repositoryRoot: path.resolve("."), apkPath: path.resolve("fixture.apk"), serial: "emulator-5554", environment, runProcess });
  assert.equal(result.replacedExistingDebugApp, true);
  assert.deepEqual(calls.at(-2).args.slice(0, 4), ["-s", "emulator-5554", "install", "-r"]);
  assert.deepEqual(calls.at(-1).args, ["-s", "emulator-5554", "shell", "am", "start", "-n", TEACHER_ANDROID_MAIN_ACTIVITY]);
  await assert.rejects(() => installAndLaunchTeacherApk({ repositoryRoot: ".", apkPath: "x", serial: "bad serial;rm", environment, runProcess }), /invalid_android_device_serial/);
});

test("Teacher jobs expose sanitized progress, serialize export intent, and run saved revisions", async (t) => {
  const fixture = await createCompleteTeacherProjectFixture({ projectId: "job-fixture" });
  t.after(fixture.cleanup);
  const artifact = path.join(fixture.root, "fixture.apk");
  await fs.writeFile(artifact, "apk");
  const exportCalls = [];
  const manager = new TeacherProjectJobManager({
    workspace: fixture.workspace,
    exportApk: async ({ projectId, onStage }) => {
      exportCalls.push(projectId); onStage("Building APK");
      return { apkPath: artifact, apkFilename: "job-fixture-r0008-debug.apk", reportFilename: "job-fixture-r0008-build.json", report: { projectId } };
    },
    installApk: async ({ serial }) => ({ status: "launched", serial, replacedExistingDebugApp: true }),
    listDevices: async () => ({ available: true, source: "test", devices: [{ serial: "emulator-5554", state: "device", model: "Pixel" }] }),
  });
  const created = await manager.startExport("job-fixture", fixture.project.revision);
  assert.equal(created.status, "queued");
  const completed = await finishedJob(manager, created.jobId);
  assert.equal(completed.status, "complete");
  assert.equal(completed.result.apkFilename, "job-fixture-r0008-debug.apk");
  assert.doesNotMatch(JSON.stringify(completed), /[A-Z]:\\|\/home\//);
  assert.deepEqual(exportCalls, ["job-fixture"]);
  await assert.rejects(() => manager.startExport("job-fixture", fixture.project.revision - 1), /teacher_project_revision_conflict/);
  const devices = await manager.devices();
  assert.equal(devices.devices[0].serial, "emulator-5554");
});
