import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const getActions = [
  "class-by-invite",
  "teacher-activity-solutions",
  "asset-access",
  "list",
  "activity",
  "component",
  "access",
  "school-metrics",
  "teacher-assignments",
  "assignments",
  "grades",
  "assignment-results",
  "class-students",
  "teacher-students",
  "page-hotspots",
  "book-activities",
  "book-activity",
  "book-media-assets",
  "classes",
];

const postActions = [
  "activate",
  "assign",
  "create-assignment",
  "submit",
  "score-book-activity",
  "review-submission",
  "create-class",
  "join-class",
  "save-page-hotspots",
  "create-book-activity",
  "update-book-activity",
  "delete-book-activity",
  "create-book-media-asset",
];

test("book-content entry retains every explicit GET and POST action contract", async () => {
  const entry = await readFile("netlify/functions/book-content.js", "utf8");
  for (const action of [...getActions, ...postActions]) {
    assert.match(entry, new RegExp(`query\\.action === "${action}"`), `missing action ${action}`);
  }
  assert.match(entry, /fetchPackageTree\(sql, query\)/, "tree/default package route must remain");
  assert.match(entry, /Unsupported POST action/);
  assert.match(entry, /Method not allowed/);
  assert.match(entry, /Assignment database migration is missing/);
  assert.match(entry, /databaseNotConfiguredResponse/);
});

test("book-content remains a thin compatible entry over cohesive domain modules", async () => {
  const entry = await readFile("netlify/functions/book-content.js", "utf8");
  const modules = [
    "shared",
    "assignment-actions",
    "submission-actions",
    "class-actions",
    "hotspot-actions",
    "book-activity-actions",
    "media-asset-actions",
  ];
  assert.ok(entry.split(/\r?\n/).length <= 400);
  for (const moduleName of modules) assert.match(entry, new RegExp(`_book-content/${moduleName}\\.js`));
  for (const helper of [
    "stripStudentAnswerKeys",
    "studentSafeActivityPayload",
    "validateSubmittedAnswers",
    "isSubmittedAnswerCorrect",
    "canAccessTeacherScopedRow",
    "canAccessStudentScopedRow",
    "getTeacherActivitySolutions",
    "browserSafeBookActivityPayload",
    "scoreBookActivityRecord",
  ]) {
    assert.match(entry, new RegExp(`\\b${helper}\\b`), `missing compatibility export ${helper}`);
  }
});
