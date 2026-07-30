import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  quantityLabel,
  studentCardMetric,
  studentGradeSummary,
  studentProfilePresentation,
  teacherSectionMetric,
} from "../src/components/lms/shared/portalDashboardPresentation.js";

const loading = { loading: true, error: "", data: null };
const unavailable = { loading: false, error: "network failed", data: null };
const teacherSuccess = {
  loading: false,
  error: "",
  data: {
    role: "teacher",
    metrics: {
      activeBookComponents: 1,
      activeClasses: 0,
      activeStudents: 2,
      activeAssignments: 1,
    },
  },
};
const studentSuccess = {
  loading: false,
  error: "",
  data: {
    role: "student",
    metrics: {
      activeBookComponents: 0,
      pendingAssignments: 1,
      completedAssignments: 2,
      scoredAssignments: 0,
      averageScore: null,
    },
    profile: {
      schoolName: "Live School",
      classNames: ["Alpha"],
      primaryClassName: "Alpha",
      level: "B1",
    },
  },
};

test("dashboard presentation distinguishes loading, unavailable, zero, singular, and plural values", () => {
  assert.equal(quantityLabel(1, "active class", "active classes"), "1 active class");
  assert.equal(quantityLabel(2, "active class", "active classes"), "2 active classes");
  assert.equal(teacherSectionMetric({ id: "books" }, loading), "Loading…");
  assert.equal(teacherSectionMetric({ id: "books" }, unavailable), "Unavailable");
  assert.equal(teacherSectionMetric({ id: "books" }, teacherSuccess), "1 active component");
  assert.equal(teacherSectionMetric({ id: "classes" }, teacherSuccess), "0 active classes");
  assert.equal(teacherSectionMetric({ id: "students" }, teacherSuccess), "2 active students");
  assert.equal(teacherSectionMetric({ id: "assignments" }, teacherSuccess), "1 active assignment");
  assert.equal(teacherSectionMetric({ id: "custom-assignment", capabilityLabel: "Editor available" }, unavailable), "Editor available");

  assert.equal(studentCardMetric("books", loading), "Loading…");
  assert.equal(studentCardMetric("books", unavailable), "Unavailable");
  assert.equal(studentCardMetric("books", studentSuccess), "0 active components");
  assert.equal(studentCardMetric("assignments", studentSuccess), "1 pending assignment");
  assert.equal(studentCardMetric("grades", studentSuccess), "No scored work yet");
});

test("student profile and grade summary use live combinations without inventing values", () => {
  assert.deepEqual(studentProfilePresentation(loading), { detail: "Loading…", tag: "Loading…" });
  assert.deepEqual(studentProfilePresentation(unavailable), { detail: "Unavailable", tag: "Unavailable" });
  assert.deepEqual(studentProfilePresentation(studentSuccess), { detail: "Alpha / Live School", tag: "B1 class" });
  assert.deepEqual(studentProfilePresentation({
    loading: false,
    error: "",
    data: { profile: { schoolName: "", primaryClassName: null, level: null } },
  }), { detail: "No active class yet", tag: "Active account" });
  assert.deepEqual(studentGradeSummary(studentSuccess), {
    average: "No scored work",
    completed: "2",
    pending: "1",
  });
  assert.deepEqual(studentGradeSummary({
    loading: false,
    error: "",
    data: { metrics: { averageScore: 0, completedAssignments: 1, pendingAssignments: 0 } },
  }), { average: "0%", completed: "1", pending: "0" });
});

test("portal sources request session-scoped metrics and contain no audited dashboard constants", async () => {
  const paths = [
    "src/components/lms/teacher/teacherPortalConfig.js",
    "src/components/lms/teacher/sections/TeacherDashboardSection.jsx",
    "src/components/lms/teacher/TeacherPortal.jsx",
    "src/components/lms/student/studentPortalData.js",
    "src/components/lms/student/portal/StudentDashboardSection.jsx",
    "src/components/lms/student/portal/StudentPortalSections.jsx",
    "src/components/lms/student/portal/StudentPortal.jsx",
  ];
  const sources = Object.fromEntries(await Promise.all(paths.map(async (path) => [path, await readFile(path, "utf8")])));
  const combined = Object.values(sources).join("\n");
  for (const fabricated of [
    "4 active components",
    "3 B2 classes",
    "55 demo students",
    "4 active assignments",
    "3 pending",
    "78% average",
    "Ultimate B2 A / Hamilton House demo",
    "B2 active",
  ]) {
    assert.doesNotMatch(combined, new RegExp(fabricated.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(sources["src/components/lms/teacher/TeacherPortal.jsx"], /getPortalDashboardMetrics\(\{ signal: controller\.signal \}\)/);
  assert.match(sources["src/components/lms/student/portal/StudentPortal.jsx"], /getPortalDashboardMetrics\(\{ signal: controller\.signal \}\)/);
  assert.doesNotMatch(combined, /getPortalDashboardMetrics\([^)]*(teacherId|studentId|schoolId)/);
  assert.match(sources["src/components/lms/student/portal/StudentPortalSections.jsx"], /loadingGrades \? "Loading…" : gradeError \? "Unavailable" : latestFeedback/);
  assert.match(sources["src/components/lms/student/portal/StudentPortalSections.jsx"], /Live grade summary metrics are unavailable/);
  assert.match(sources["src/components/lms/student/portal/StudentDashboardSection.jsx"], /Live dashboard metrics and profile details are unavailable/);
});
