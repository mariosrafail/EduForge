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
  assert.match(sources.TeacherStudents, /listTeacherStudents/);
  assert.match(sources.TeacherAssignments, /listTeacherAssignments/);
  assert.match(sources.TeacherAssignments, /createAssignment/);
  assert.match(sources.TeacherAssignments, /getAssignmentResults/);
  assert.match(sources.TeacherAssignments, /exportAssignmentResultsCsv/);
  assert.match(sources.TeacherCustomAssignment, /TeacherCourseEditor/);
});

test("teacher results modal retains refresh, review, and close behavior", async () => {
  const modal = await readFile("src/components/lms/teacher/components/TeacherResultsModal.jsx", "utf8");
  assert.match(modal, /getAssignmentResults/);
  assert.match(modal, /reviewSubmission/);
  assert.match(modal, /onReviewSaved/);
  assert.match(modal, /onClose/);
});
