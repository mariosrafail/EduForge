import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createBlankTeacherProject, teacherProjectCompleteness } from "../lib/teacher-project-builder/schema.js";
import { materializeTeacherProjectRuntime, TEACHER_PROJECT_PLACEHOLDER_IMAGE } from "../src/apps/android-teacher-project/teacherProjectRuntimeContract.js";
import { createCompleteTeacherProjectFixture } from "./helpers/teacher-project-fixture.mjs";

test("generic Teacher project runtime materializes shell controls and ordered page content", async (t) => {
  const fixture = await createCompleteTeacherProjectFixture();
  t.after(fixture.cleanup);
  assert.equal(teacherProjectCompleteness(fixture.project).complete, true);
  const runtime = materializeTeacherProjectRuntime(fixture.project, (assetId, asset) => `/fixture/${assetId}${asset.relativePath.slice(asset.relativePath.lastIndexOf("."))}`);
  assert.equal(runtime.units.length, 10);
  assert.equal(runtime.editions.length, 4);
  assert.equal(runtime.editions[0].id, "students-book");
  assert.equal(runtime.toolbar.length, 18);
  assert.equal(Object.keys(runtime.soundMap).length, 35);
  assert.deepEqual(Object.keys(runtime.chrome), ["settings", "minimize", "close"]);
  assert.deepEqual(runtime.content.studentsBook.units[0].entries.map(({ pageLabel }) => pageLabel), ["5", "6-7", "8-9"]);
  assert.equal(runtime.content.studentsBook.units[0].entries[2].layout, "double-pair");
});

test("generic Teacher runtime substitutes compact grey images and silence for missing assignments", () => {
  const project = createBlankTeacherProject({ projectId: "placeholder-project", displayName: "Placeholder Project" });
  project.content.studentsBook.units[0].entries.push({
    id: "entry-00000000-0000-4000-8000-000000000099",
    sectionTitle: "Draft page",
    pageLabel: "1",
    layout: "single-page",
    image: null,
  });
  const runtime = materializeTeacherProjectRuntime(project, () => null);
  assert.equal(runtime.background, TEACHER_PROJECT_PLACEHOLDER_IMAGE);
  assert.equal(runtime.chrome.settings.image, TEACHER_PROJECT_PLACEHOLDER_IMAGE);
  assert.equal(runtime.units[0].normal, TEACHER_PROJECT_PLACEHOLDER_IMAGE);
  assert.equal(runtime.units[0].active, TEACHER_PROJECT_PLACEHOLDER_IMAGE);
  assert.equal(runtime.content.studentsBook.units[0].entries[0].image, TEACHER_PROJECT_PLACEHOLDER_IMAGE);
  assert.deepEqual(runtime.soundMap, {});
  assert.match(TEACHER_PROJECT_PLACEHOLDER_IMAGE, /^data:image\/svg\+xml,/);
});

test("generic runtime source graph has no static Ultimate B2 pack, content, solution, or monolithic asset import", async () => {
  const files = [
    "src/apps/android-teacher-project/TeacherProjectApp.jsx",
    "src/apps/android-teacher-project/TeacherProjectShell.jsx",
    "src/apps/android-teacher-project/TeacherProjectTitleAnimation.jsx",
    "src/apps/android-teacher-project/TeacherProjectPresentation.jsx",
    "src/apps/android-teacher-project/TeacherProjectUnitOverview.jsx",
    "src/apps/android-teacher-project/TeacherProjectPageViewer.jsx",
    "src/apps/android-teacher-project/TeacherProjectNavigation.jsx",
    "src/apps/android-teacher-project/teacherProjectEntry.jsx",
    "src/apps/android-teacher-project/teacherProjectSound.js",
    "src/apps/android-teacher-project/teacherProjectRuntimeContract.js",
    "src/apps/android-teacher-offline/ClassroomToolbar.jsx",
  ];
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /generatedPackProvider|teacherContentPackProvider|legacyClassroomAssets|ultimateB2(?:Page|Media|Activity)|teacher-solutions/);
  assert.match(source, /virtual:teacher-project-config/);
  const vite = await readFile("vite.config.js", "utf8");
  assert.match(vite, /isAndroidTeacherProject/);
  assert.match(vite, /teacherProjectVitePlugin/);
});

test("generic shell click controls resolve their assigned project sound without changing textbook media", async () => {
  const [shell, toolbar, chrome, sounds] = await Promise.all([
    readFile("src/apps/android-teacher-project/TeacherProjectShell.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/ClassroomToolbar.jsx", "utf8"),
    readFile("src/apps/android-teacher-offline/TeacherShellChrome.jsx", "utf8"),
    readFile("src/apps/android-teacher-project/teacherProjectSound.js", "utf8"),
  ]);
  for (const source of [shell, toolbar, chrome]) assert.match(source, /data-teacher-control-id/);
  assert.match(sounds, /soundMap\[button\.dataset\.teacherControlId\]/);
  assert.match(sounds, /activeSound\.currentTime = 0/);
  assert.match(sounds, /activeSound\.volume = audio\[volumeKey\] \/ 100/);
  assert.match(sounds, /textbookMediaIsPlaying/);
});
