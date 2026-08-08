import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseBookBuilderHash, teacherProjectHash } from "../src/apps/book-builder/bookBuilderRouter.js";

test("Review Studio dashboard exposes a separate Teacher APK Projects workflow", async () => {
  const [app, dashboard, api] = await Promise.all([
    readFile("src/apps/book-builder/BookBuilderApp.jsx", "utf8"),
    readFile("src/apps/book-builder/BookBuilderDashboard.jsx", "utf8"),
    readFile("src/apps/book-builder/bookBuilderApi.js", "utf8"),
  ]);
  assert.match(app, /requestTeacherProjects/);
  assert.match(app, /TeacherProjectEditor/);
  assert.match(dashboard, /Teacher APK Projects/);
  assert.match(dashboard, /New Teacher APK Project/);
  assert.match(dashboard, /Project name/);
  assert.match(dashboard, /Project slug \/ ID/);
  assert.match(api, /\/teacher-projects/);
  assert.doesNotMatch(api, /FileSystem|showOpenFilePicker|webkitRelativePath|absolutePath/);
});

test("Teacher Project editor renders every shell section through shared runtime components", async () => {
  const editor = await readFile("src/apps/book-builder/teacher-projects/TeacherProjectEditor.jsx", "utf8");
  for (const heading of ["Project", "Background &amp; title animation", "Window controls", "Units 1–10", "Book editions", "Teacher toolbar", "Sounds / asset library", "Build &amp; Run"]) assert.match(editor, new RegExp(heading));
  assert.match(editor, /TeacherProjectShell/);
  assert.match(editor, /materializeTeacherProjectRuntime/);
  assert.match(editor, /TeacherShellChrome/);
  assert.match(editor, /1920 × 1080 logical stage/);
  assert.match(editor, /16:9/);
  assert.match(editor, /16:10/);
  assert.match(editor, /ultrawide/);
  assert.match(editor, /Save/);
  assert.match(editor, /Export APK/);
  assert.match(editor, /Run/);
  assert.doesNotMatch(editor, /page import|PDF import|hotspot authoring|teacher answer/i);
});

test("Teacher project routes are opaque hash routes and do not overlap scanned Book Projects", () => {
  assert.equal(teacherProjectHash("ultimate-b3"), "#/teacher-projects/ultimate-b3");
  assert.deepEqual(parseBookBuilderHash("#/teacher-projects/ultimate-b3"), { kind: "teacher-project", projectId: "ultimate-b3", query: new URLSearchParams() });
  assert.equal(parseBookBuilderHash("#/teacher-projects/..%2Fescape").kind, "invalid");
  assert.equal(parseBookBuilderHash("#/projects/ultimate-b3/overview").kind, "project");
});
