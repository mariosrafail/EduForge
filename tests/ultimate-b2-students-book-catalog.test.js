import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildStudentsBookCatalog,
  catalogStatsFromUnits,
  findStudentsBookImplementation,
  ultimateB2StudentsBookCatalog,
  ultimateB2StudentsBookTeacherCatalog,
} from "../src/data/ultimate-b2/studentsBookCatalog.js";

function exercises(catalog) {
  return catalog.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.exercises));
}

function exercisesForUnit(catalog, unitNumber) {
  return exercises({ units: catalog.units.filter((unit) => unit.unitNumber === unitNumber) });
}

test("Students Book catalog exposes exactly Units 1 and 2 with 38 and 40 active activities", () => {
  assert.deepEqual(ultimateB2StudentsBookCatalog.units.map((unit) => unit.unitNumber), [1, 2]);
  assert.equal(exercisesForUnit(ultimateB2StudentsBookCatalog, 1).length, 38);
  assert.equal(exercisesForUnit(ultimateB2StudentsBookCatalog, 2).length, 40);
  assert.deepEqual(ultimateB2StudentsBookCatalog.stats, {
    unitCount: 2,
    activityCount: 78,
    disabledActivityCount: 0,
    uniqueActivityCount: 78,
  });
});

test("student catalog contains 78 unique stable IDs and excludes all 12 disabled records", () => {
  const studentExercises = exercises(ultimateB2StudentsBookCatalog);
  const teacherExercises = exercises(ultimateB2StudentsBookTeacherCatalog);
  const stableIds = studentExercises.map((exercise) => exercise.stableActivityId);
  const disabled = teacherExercises.filter((exercise) => exercise.availability === "disabled");

  assert.equal(stableIds.length, 78);
  assert.equal(new Set(stableIds).size, 78);
  assert.equal(disabled.length, 12);
  assert.ok(studentExercises.every((exercise) => exercise.availability === "enabled"));
  assert.ok(disabled.every((exercise) => exercise.assignable === false));
  assert.ok(disabled.every((exercise) => exercise.availableToStudent === false));
  assert.ok(disabled.every((exercise) => exercise.locked === true));
});

test("every active row resolves through the normalized Students Book implementation finder", () => {
  for (const exercise of exercises(ultimateB2StudentsBookCatalog)) {
    const implementation = findStudentsBookImplementation(exercise.stableActivityId);
    assert.ok(implementation, exercise.stableActivityId);
    assert.equal(implementation.stableNormalizedId, exercise.stableActivityId);
    assert.equal(implementation.availability, "enabled");
  }
});

test("obsolete three-item demo keys are aliases only and never catalog row IDs", () => {
  const stableIds = new Set(exercises(ultimateB2StudentsBookCatalog).map((exercise) => exercise.stableActivityId));
  assert.equal(stableIds.has("video-intro"), false);
  assert.equal(stableIds.has("reading-ex3"), false);
  assert.equal(stableIds.has("reading-ex4"), false);
  assert.equal(findStudentsBookImplementation("video-intro").stableNormalizedId, "ultimate-b2-sb-u2-p2-o1");
  assert.equal(findStudentsBookImplementation("reading-ex3").stableNormalizedId, "ultimate-b2-sb-u2-p2-o3");
  assert.equal(findStudentsBookImplementation("reading-ex4").stableNormalizedId, "ultimate-b2-sb-u2-p2-o4");
});

test("student and teacher routes carry stable normalized IDs", async () => {
  const routes = await readFile("src/utils/hashRoutes.js", "utf8");
  assert.match(routes, /exercise\.stableActivityId \|\| exercise\.activityKey/);
  assert.match(routes, /ultimate-b2-sb-u\[12\]-p\\d\+-o\\d\+/);
  assert.match(routes, /teacher-preview-/);
});

test("header statistics are derived from catalog rows", async () => {
  assert.deepEqual(catalogStatsFromUnits(ultimateB2StudentsBookCatalog.units), ultimateB2StudentsBookCatalog.stats);
  const detailSource = await readFile("src/components/lms/books/BookComponentDetail.jsx", "utf8");
  assert.match(detailSource, /visibleUnitCount/);
  assert.match(detailSource, /getActiveExercises\(component\)/);
  assert.match(detailSource, /activities available/);
  assert.doesNotMatch(detailSource, /3 demo items active|Publisher content placeholders locked[^<]*recovered-students-book/);
});

test("catalog covers representative activities from every implemented mode in both units", () => {
  const unit1 = exercisesForUnit(ultimateB2StudentsBookCatalog, 1);
  const unit2 = exercisesForUnit(ultimateB2StudentsBookCatalog, 2);
  for (const mode of ["auto-scored", "teacher-reviewed", "unscored-practice"]) {
    assert.ok(unit1.some((exercise) => exercise.implementationMode === mode), `Unit 1 ${mode}`);
    assert.ok(unit2.some((exercise) => exercise.implementationMode === mode), `Unit 2 ${mode}`);
  }
  assert.ok(unit2.some((exercise) => exercise.implementationMode === "reading-content"));
});

test("database IDs merge onto stable rows without making disabled records assignable", () => {
  const activeDatabaseId = "11111111-1111-4111-8111-111111111111";
  const disabledDatabaseId = "22222222-2222-4222-8222-222222222222";
  const databaseUnits = [{
    id: "database-unit",
    lessons: [{
      id: "database-lesson",
      exercises: [
        { id: activeDatabaseId, slug: "ultimate-b2-sb-u1-p1-o1" },
        { id: disabledDatabaseId, slug: "ultimate-b2-sb-u1-p8-o3", isAssignable: true },
      ],
    }],
  }];
  const catalog = buildStudentsBookCatalog({ includeDisabled: true, databaseUnits });
  const rows = exercises(catalog);
  const active = rows.find((exercise) => exercise.stableActivityId === "ultimate-b2-sb-u1-p1-o1");
  const disabled = rows.find((exercise) => exercise.stableActivityId === "ultimate-b2-sb-u1-p8-o3");

  assert.equal(active.assignmentActivityId, activeDatabaseId);
  assert.equal(active.assignmentReady, true);
  assert.equal(disabled.assignmentActivityId, disabledDatabaseId);
  assert.equal(disabled.assignable, false);
  assert.equal(disabled.assignmentReady, false);
});

test("assignment and submission safeguards cover disabled, practice, and reading modes", async () => {
  const [server, migration, manifest] = await Promise.all([
    Promise.all([
      readFile("netlify/functions/_book-content/assignment-actions.js", "utf8"),
      readFile("netlify/functions/_book-content/submission-actions.js", "utf8"),
    ]).then((parts) => parts.join("\n")),
    readFile("database/022_ultimate_b2_students_book_assignment_modes.sql", "utf8"),
    readFile("database/MIGRATIONS.md", "utf8"),
  ]);
  assert.match(server, /activity\.is_assignable === false/);
  assert.match(server, /unsupported-disabled/);
  assert.match(server, /\["unscored-practice", "reading-content"\]\.includes\(implementationMode\)/);
  assert.match(migration, /'auto-scored'[\s\S]*'teacher-reviewed'[\s\S]*'unscored-practice'[\s\S]*'reading-content'/);
  assert.match(manifest, /022_ultimate_b2_students_book_assignment_modes\.sql/);
});

test("Book pages remains wired alongside the recovered contents catalog", async () => {
  const [packageSource, detailSource] = await Promise.all([
    readFile("src/data/ultimate-b2/ultimateB2Package.js", "utf8"),
    readFile("src/components/lms/books/BookComponentDetail.jsx", "utf8"),
  ]);
  assert.match(packageSource, /pageUnits: ultimateB2StudentsBookPageUnits/);
  assert.match(detailSource, /BookPagesView/);
  assert.match(detailSource, /Contents \/ Exercises/);
  assert.match(detailSource, /Book pages/);
});
