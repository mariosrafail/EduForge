import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseBookBuilderHash, teacherProjectHash } from "../src/apps/book-builder/bookBuilderRouter.js";

test("Review Studio dashboard exposes create, progress, open, and duplicate Teacher workflows", async () => {
  const [app, dashboard, api] = await Promise.all([readFile("src/apps/book-builder/BookBuilderApp.jsx", "utf8"), readFile("src/apps/book-builder/BookBuilderDashboard.jsx", "utf8"), readFile("src/apps/book-builder/bookBuilderApi.js", "utf8")]);
  assert.match(app, /requestTeacherProjects/); assert.match(app, /TeacherProjectEditor/); assert.match(dashboard, /Teacher APK Projects/); assert.match(dashboard, /New Teacher APK Project/); assert.match(dashboard, /Project name/); assert.match(dashboard, /Project slug \/ ID/); assert.match(dashboard, /Duplicate/); assert.match(dashboard, /configuredCount/); assert.match(api, /duplicateTeacherProject/);
  assert.doesNotMatch(api, /FileSystem|showOpenFilePicker|absolutePath/);
});

test("Teacher editor uses accessible top tabs, optional shared preview, and focused page authoring modules", async () => {
  const [editor, authoring, bulk, pages, entry, picker, topTabs, slot, qa, css] = await Promise.all([
    readFile("src/apps/book-builder/teacher-projects/TeacherProjectEditor.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/teacherProjectAuthoring.js", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectBulkImport.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectPagesEditor.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectPageEntryCard.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectPageImagePicker.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectTopTabs.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectAssetSlot.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/TeacherProjectQaPanel.jsx", "utf8"), readFile("src/apps/book-builder/teacher-projects/teacherProjectEditor.css", "utf8"),
  ]);
  for (const heading of ["Overview", "Units & Pages", "Shell & Animation", "Window Controls", "Units", "Book Editions", "Teacher Toolbar", "Sounds & Assets", "Build & Run"]) assert.match(authoring, new RegExp(heading.replace(/[&]/g, "&")));
  assert.match(editor, /TeacherProjectPresentation/); assert.match(editor, /materializeTeacherProjectRuntime/); assert.match(editor, /TeacherShellChrome/); assert.match(editor, /1920 × 1080/); assert.match(editor, /16:9/); assert.match(editor, /16:10/); assert.match(editor, /ultrawide/); assert.match(editor, /Import Assets/); assert.match(editor, /teacherShellProgress/); assert.match(editor, /teacherContentProgress/); assert.match(editor, /assignSoundGroup/); assert.match(editor, /Remove unused/); assert.match(editor, /previewOpen/); assert.match(editor, /aria-pressed=\{previewOpen\}/); assert.match(qa, /Test .* sound/); assert.match(qa, /Simulate active/); assert.match(slot, /onDrop/);
  assert.match(topTabs, /role="tablist"/); assert.match(topTabs, /role="tab"/); assert.match(topTabs, /ArrowRight/); assert.match(topTabs, /aria-selected/);
  assert.match(pages, /Import Images/); assert.match(pages, /Add Page \/ Spread/); assert.match(pages, /role="tablist"/); assert.match(pages, /Students Book Units/); assert.match(pages, /expandedIds/); assert.match(pages, /TeacherProjectPageImagePicker/); assert.match(pages, /naturalCompare/); assert.doesNotMatch(pages, /teacher-pages-units/);
  assert.match(entry, /One spread image/); assert.match(entry, /Two page images/); assert.match(entry, /Move entry/); assert.match(entry, /Choose from library/); assert.match(entry, /Upload new/); assert.match(entry, /Internal ID/); assert.doesNotMatch(entry, /GripVertical/);
  assert.match(picker, /role="dialog"/); assert.match(picker, /aria-modal="true"/); assert.match(picker, /event\.key === "Escape"/); assert.match(picker, /restoreFocus/); assert.match(picker, /Filter by filename/);
  assert.doesNotMatch([pages, entry, picker].join("\n"), /PDF|OCR|hotspot|activity/i);
  assert.doesNotMatch(css, /grid-template-columns: 180px/); assert.doesNotMatch(css, /teacher-project-navigation/); assert.match(css, /teacher-project-top-tabs/); assert.match(css, /teacher-pages-unit-tabs/); assert.match(css, /min-width: 1600px/); assert.match(css, /@media \(max-width: 980px\)/); assert.match(css, /focus-visible/); assert.match(css, /teacher-visually-hidden-file/);
  assert.match(bulk, /webkitdirectory/); assert.match(bulk, /Nothing is uploaded until/); assert.match(bulk, /Apply mappings/); assert.match(bulk, /Importing/); assert.match(bulk, /Needs review/); assert.match(bulk, /event\.key !== "Tab"/); assert.match(bulk, /restoreFocus/); assert.doesNotMatch(bulk, /scan-directory|open-path|absolutePath/);
  assert.doesNotMatch(editor, /PDF import|hotspot authoring|teacher answer/i);
});

test("Teacher project routes remain opaque and separate from scanned Book Projects", () => {
  assert.equal(teacherProjectHash("ultimate-b3"), "#/teacher-projects/ultimate-b3"); assert.deepEqual(parseBookBuilderHash("#/teacher-projects/ultimate-b3"), { kind: "teacher-project", projectId: "ultimate-b3", query: new URLSearchParams() }); assert.equal(parseBookBuilderHash("#/teacher-projects/..%2Fescape").kind, "invalid"); assert.equal(parseBookBuilderHash("#/projects/ultimate-b3/overview").kind, "project");
});
