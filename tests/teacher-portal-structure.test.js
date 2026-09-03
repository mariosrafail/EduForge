import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const exportsByFile = {
  TeacherDashboard: "sections/TeacherDashboardSection.jsx",
  TeacherBooks: "sections/TeacherBooksSection.jsx",
  TeacherClasses: "sections/TeacherClassesSection.jsx",
  TeacherStudents: "sections/TeacherStudentsSection.jsx",
  TeacherAssignments: "sections/TeacherAssignmentsSection.jsx",
  TeacherCustomAssignment: "sections/TeacherCustomAssignmentSection.jsx",
  BookPackageSelector: "components/TeacherBookPackageSelector.jsx",
};

test("TeacherPortalSections is a small compatibility barrel with every existing named export", async () => {
  const barrel = await readFile("src/components/lms/teacher/TeacherPortalSections.jsx", "utf8");
  assert.ok(barrel.split(/\r?\n/).length <= 50);
  for (const [name, path] of Object.entries(exportsByFile)) {
    assert.match(barrel, new RegExp(`export \\{ ${name} \\} from "./${path.replaceAll(".", "\\.")}"`));
  }
  const portal = await readFile("src/components/lms/teacher/TeacherPortal.jsx", "utf8");
  assert.match(portal, /from "\.\/TeacherPortalSections\.jsx"/);
});

test("teacher domain modules retain navigation and workflow contracts", async () => {
  const sources = Object.fromEntries(await Promise.all(
    Object.entries(exportsByFile).map(async ([name, path]) => [
      name,
      await readFile(`src/components/lms/teacher/${path}`, "utf8"),
    ]),
  ));
  assert.match(sources.TeacherDashboard, /goToSection/);
  assert.match(sources.TeacherBooks, /getBookPackageTreeWithFallback/);
  assert.match(sources.TeacherBooks, /buildTeacherPresentationHash/);
  assert.match(sources.TeacherClasses, /createTeacherClass/);
  assert.match(sources.TeacherClasses, /listClassStudents/);
  assert.match(sources.TeacherStudents, /useTeacherGradeAnalytics/);
  assert.match(sources.TeacherStudents, /TeacherPerformancePanel/);
  assert.match(sources.TeacherAssignments, /listTeacherAssignments/);
  assert.match(sources.TeacherAssignments, /HomeworkCreator/);
  assert.match(sources.TeacherAssignments, /listTeacherHomeworks/);
  assert.match(sources.TeacherAssignments, /exportAssignmentResultsCsv/);
  assert.match(sources.TeacherAssignments, /TeacherAssignmentReviewWorkspace/);
  assert.match(sources.TeacherCustomAssignment, /TeacherCourseEditor/);
});

test("teacher assignment results use a full-page review workspace", async () => {
  const [section, workspace] = await Promise.all([
    readFile("src/components/lms/teacher/sections/TeacherAssignmentsSection.jsx", "utf8"),
    readFile("src/components/lms/teacher/components/TeacherAssignmentReviewWorkspace.jsx", "utf8"),
  ]);
  assert.doesNotMatch(section, /ResultsModal/);
  assert.match(workspace, /getAssignmentResults/);
  assert.match(workspace, /reviewSubmission/);
  assert.match(workspace, /downloadAssignmentResultsCsv/);
  assert.match(workspace, /Back to assignments/);
});
