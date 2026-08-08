import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { exportTeacherProjectApk } from "../lib/teacher-project-builder/export-apk.js";
import { createCompleteTeacherProjectFixture } from "./helpers/teacher-project-fixture.mjs";

test("complete generic Teacher Project exports and verifies a real debug APK", {
  skip: process.env.TEACHER_PROJECT_REAL_APK !== "1" ? "set TEACHER_PROJECT_REAL_APK=1 with Android SDK available" : false,
  timeout: 15 * 60_000,
}, async (t) => {
  const fixture = await createCompleteTeacherProjectFixture({ projectId: "generic-ci-teacher", distinctVisualAssets: true });
  t.after(fixture.cleanup);
  const stages = [];
  const result = await exportTeacherProjectApk({ workspace: fixture.workspace, projectId: "generic-ci-teacher", onStage: (stage) => stages.push(stage) });
  assert.equal(result.report.verification.status, "generic-teacher-project-apk-safe");
  assert.equal(result.report.applicationId, "com.eduforge.offlinebooks");
  assert.ok((await fs.stat(result.apkPath)).size > 0);
  assert.equal(path.basename(result.apkPath), `generic-ci-teacher-r${String(fixture.project.revision).padStart(4, "0")}-debug.apk`);
  assert.deepEqual(stages, ["Validating project", "Building Teacher app", "Verifying Teacher bundle", "Syncing Android", "Building APK", "Verifying APK", "Archiving APK", "Export complete"]);
});
