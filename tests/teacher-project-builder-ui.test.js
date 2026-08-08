import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseBookBuilderHash, teacherProjectHash } from "../src/apps/book-builder/bookBuilderRouter.js";

test("Review Studio dashboard exposes create, progress, open, and duplicate Teacher workflows", async () => {
  const [app, dashboard, api] = await Promise.all([readFile("src/apps/book-builder/BookBuilderApp.jsx", "utf8"), readFile("src/apps/book-builder/BookBuilderDashboard.jsx", "utf8"), readFile("src/apps/book-builder/bookBuilderApi.js", "utf8")]);
  assert.match(app, /requestTeacherProjects/); assert.match(app, /TeacherProjectEditor/); assert.match(dashboard, /Teacher APK Projects/); assert.match(dashboard, /New Teacher APK Project/); assert.match(dashboard, /Project name/); assert.match(dashboard, /Project slug \/ ID/); assert.match(dashboard, /Duplicate/); assert.match(dashboard, /configuredCount/); assert.match(api, /duplicateTeacherProject/);
  assert.doesNotMatch(api, /FileSystem|showOpenFilePicker|absolutePath/);
});

test("Teacher editor uses section navigation, compact authoring modules, and the shared runtime preview", async () => {
  const [editor, authoring, bulk, slot, qa, css] = await Promise.all([
    readFile("src/apps/book-builder/teacher-projects/TeacherProjectEditor.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/teacherProjectAuthoring.js", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectBulkImport.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectAssetSlot.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectQaPanel.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/teacherProjectEditor.css", "utf8"),
  ]);
  for (const heading of ["Overview", "Shell & Animation", "Window Controls", "Units", "Book Editions", "Teacher Toolbar", "Sounds & Assets", "Build & Run"]) assert.match(authoring, new RegExp(heading.replace(/[&]/g, "&")));
  assert.match(editor, /TeacherProjectShell/); assert.match(editor, /materializeTeacherProjectRuntime/); assert.match(editor, /TeacherShellChrome/); assert.match(editor, /1920 × 1080/); assert.match(editor, /16:9/); assert.match(editor, /16:10/); assert.match(editor, /ultrawide/); assert.match(editor, /Import Assets/); assert.match(editor, /teacherShellProgress/); assert.match(editor, /assignSoundGroup/); assert.match(editor, /Remove unused/); assert.match(qa, /Test .* sound/); assert.match(qa, /Simulate active/); assert.match(slot, /onDrop/); assert.doesNotMatch(editor, /<details/);
  assert.match(css, /grid-template-columns: 180px/); assert.match(css, /@media \(max-width: 1500px\)/); assert.match(css, /@media \(max-width: 980px\)/); assert.match(css, /focus-visible/);
  assert.match(bulk, /webkitdirectory/); assert.match(bulk, /Nothing is uploaded until/); assert.match(bulk, /Apply mappings/); assert.match(bulk, /Importing/); assert.match(bulk, /Needs review/); assert.match(bulk, /event\.key !== "Tab"/); assert.match(bulk, /restoreFocus/); assert.doesNotMatch(bulk, /scan-directory|open-path|absolutePath/);
  assert.doesNotMatch(editor, /page import|PDF import|hotspot authoring|teacher answer/i);
});

test("Teacher project routes remain opaque and separate from scanned Book Projects", () => {
  assert.equal(teacherProjectHash("ultimate-b3"), "#/teacher-projects/ultimate-b3"); assert.deepEqual(parseBookBuilderHash("#/teacher-projects/ultimate-b3"), { kind: "teacher-project", projectId: "ultimate-b3", query: new URLSearchParams() }); assert.equal(parseBookBuilderHash("#/teacher-projects/..%2Fescape").kind, "invalid"); assert.equal(parseBookBuilderHash("#/projects/ultimate-b3/overview").kind, "project");
});
