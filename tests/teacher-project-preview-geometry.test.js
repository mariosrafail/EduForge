import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { containedTeacherStage } from "../src/apps/book-builder/teacher-projects/previewGeometry.js";

test("Teacher preview contains and centers the shared 1920x1080 stage at all offered viewports", () => {
  assert.deepEqual(containedTeacherStage({ width: 1280, height: 720 }), { width: 1280, height: 720, scale: 2 / 3, left: 0, top: 0 });
  assert.deepEqual(containedTeacherStage({ width: 1280, height: 800 }), { width: 1280, height: 800, scale: 2 / 3, left: 0, top: 40 });
  assert.deepEqual(containedTeacherStage({ width: 2560, height: 1080 }), { width: 2560, height: 1080, scale: 1, left: 320, top: 0 });
});

test("preview and native fixed-stage hosts bleed the uploaded background behind contained letterboxing", async () => {
  const [editorCss, fixedCss, app] = await Promise.all([
    readFile("src/apps/book-builder/teacher-projects/teacherProjectEditor.css", "utf8"),
    readFile("src/apps/android-teacher-offline/teacherFixedStage.css", "utf8"),
    readFile("src/apps/android-teacher-project/TeacherProjectApp.jsx", "utf8"),
  ]);
  assert.match(editorCss, /teacher-project-preview-host[^}]*background-color:[^;]+;[^}]*background-position: center;[^}]*background-size: cover;/s);
  assert.match(editorCss, /teacher-project-preview-stage[^}]*background: transparent;/s);
  assert.match(fixedCss, /teacher-fixed-stage-host\[data-viewport-backdrop\][^}]*background-position: center;[^}]*background-size: cover;/s);
  assert.match(app, /viewportBackdrop=\{\{ name: "library"[\s\S]+projectConfig\.background/);
});
