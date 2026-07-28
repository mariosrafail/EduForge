import { expect, test } from "@playwright/test";
import pg from "pg";
import { MULTI_SCHOOL, MULTI_SCHOOL_DEMO_PASSWORD } from "../../scripts/_multi-school-seed-data.mjs";
import { readLocalMultiSchoolMarker } from "../../scripts/_local-multi-school.mjs";
import { ultimateB2StudentsBookTeacherCatalog } from "../../src/data/ultimate-b2/studentsBookCatalog.js";

const marker = readLocalMultiSchoolMarker();
const athens = MULTI_SCHOOL.find((school) => school.key === "athens");
const piraeus = MULTI_SCHOOL.find((school) => school.key === "piraeus");

test.afterEach(async () => {
  if (!marker) return;
  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    await pool.query(`
      update activity_submissions s
      set status='awaiting_review', score=null, score_percent=null, teacher_feedback='', reviewed_at=null, reviewed_by=null
      from activity_assignments aa
      where s.activity_assignment_id=aa.id and aa.id=$1 and s.student_id=$2
    `, [athens.assignments[1].id, athens.users.find((user) => user.profile === "strong").id]);
  } finally {
    await pool.end();
  }
});

async function signIn(page, role, email) {
  await page.goto(`/#auth-${role}`, { waitUntil: "domcontentloaded" });
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in", exact: true }) });
  await form.getByLabel(role === "student" ? "Email or username" : "Email", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(MULTI_SCHOOL_DEMO_PASSWORD);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/?${role}`));
}

async function api(page, action = "", options = {}) {
  const query = new URLSearchParams(action ? { action } : {});
  for (const [key, value] of Object.entries(options.query || {})) query.set(key, value);
  const response = await page.request.fetch(`/.netlify/functions/book-content?${query}`, {
    method: options.method || "GET",
    data: options.data,
  });
  return { response, body: await response.json() };
}

test("real multi-school roles, workflows, licensing, and isolation", async ({ page, context }) => {
  test.setTimeout(90_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));

  await signIn(page, "admin", athens.users[0].email);
  await page.goto("/#admin-users");
  await expect(page.getByText(athens.users.find((user) => user.profile === "strong").name).first()).toBeVisible();
  const users = await page.request.get("/.netlify/functions/users");
  expect((await users.json()).users).toHaveLength(11);
  const hiddenPiraeusUser = await page.request.get(`/.netlify/functions/user?id=${piraeus.users[0].id}`);
  expect(hiddenPiraeusUser.status()).toBe(404);
  const adminCatalog = await api(page, "list");
  expect(adminCatalog.body.bookPackages.map((item) => item.slug)).toEqual(["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]);
  const licensing = await page.request.get("/.netlify/functions/book-licensing?action=overview");
  expect((await licensing.json()).packages.map((item) => item.slug)).toEqual(["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]);
  const archivedAdmin = await api(page, "", { query: { slug: "english-journey-6" } });
  expect(archivedAdmin.response.status()).toBe(404);

  await context.clearCookies();
  await signIn(page, "teacher", athens.users[1].email);
  const teacherCatalog = await api(page, "list");
  expect(teacherCatalog.body.bookPackages.map((item) => item.slug)).toEqual(["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]);
  for (const slug of ["ultimate-b1", "ultimate-b1-plus"]) {
    const emptyPackage = await api(page, "", { query: { slug } });
    expect(emptyPackage.response.ok()).toBeTruthy();
    expect(emptyPackage.body.bookPackage.components).toHaveLength(2);
    expect(emptyPackage.body.bookPackage.components.map((item) => item.componentType)).toEqual(["students_book", "workbook"]);
    expect(emptyPackage.body.bookPackage.components.every((item) => item.units.length === 0 && item.coverAssetPath === null)).toBeTruthy();
  }
  await page.goto("/#teacher/books/ultimate-b1/components/ultimate-b1-students-book/exercises", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Ultimate English B1 Students Book", exact: true })).toBeVisible();
  await expect(page.getByText("Content will be added when the publisher files are available.", { exact: true }).first()).toBeVisible();
  const assignments = await api(page, "teacher-assignments");
  expect(assignments.response.ok()).toBeTruthy();
  expect(assignments.body.assignments).toHaveLength(4);
  const benchmark = assignments.body.assignments.find((item) => item.title.startsWith("Auto-scored benchmark"));
  const review = assignments.body.assignments.find((item) => item.title.startsWith("Teacher review"));
  const expired = assignments.body.assignments.find((item) => item.title.startsWith("Expired deadline"));
  const future = assignments.body.assignments.find((item) => item.title.startsWith("Future assignment"));
  expect([benchmark, review, expired, future].every(Boolean)).toBeTruthy();
  expect(new Date(expired.dueAt).getTime()).toBeLessThan(Date.now());
  expect(new Date(future.dueAt).getTime()).toBeGreaterThan(Date.now());

  const benchmarkResults = await api(page, "assignment-results", { query: { assignmentId: benchmark.id } });
  expect(benchmarkResults.body.rows.some((row) => row.scorePercent >= 90)).toBeTruthy();
  expect(benchmarkResults.body.rows.some((row) => row.scorePercent < 50)).toBeTruthy();
  expect(benchmarkResults.body.rows.some((row) => row.status === "Missing")).toBeTruthy();
  const reviewResults = await api(page, "assignment-results", { query: { assignmentId: review.id } });
  const pending = reviewResults.body.rows.find((row) => row.submissionStatus === "awaiting_review");
  expect(pending).toBeTruthy();
  expect(reviewResults.body.rows.some((row) => row.submissionStatus === "reviewed" && row.teacherFeedback)).toBeTruthy();

  await page.goto("/#teacher/books/ultimate-b2/components/students-book/exercises");
  await expect(page.getByText(/unsupported editorial records disabled/i)).toBeVisible();

  const crossSchool = await api(page, "assignment-results", { query: { assignmentId: piraeus.assignments[0].id } });
  expect(crossSchool.response.status()).toBe(403);
  const reviewed = await api(page, "review-submission", {
    method: "POST",
    data: { submissionId: pending.submissionId, scorePercent: 83, teacherFeedback: "Focused evidence and a clear final response." },
  });
  expect(reviewed.response.ok()).toBeTruthy();
  expect(reviewed.body.submission.status).toBe("reviewed");

  await context.clearCookies();
  const strong = athens.users.find((user) => user.profile === "strong");
  await signIn(page, "student", strong.email);
  const strongCatalog = await api(page, "list");
  expect(strongCatalog.body.bookPackages.map((item) => item.slug)).toEqual(["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]);
  const grades = await api(page, "grades");
  const reviewedGrade = grades.body.grades.find((grade) => grade.id === pending.submissionId);
  expect(reviewedGrade.scorePercent).toBe(83);
  expect(reviewedGrade.teacherFeedback).toBe("Focused evidence and a clear final response.");
  const studentTree = await api(page, "", { query: { slug: "ultimate-b2" } });
  expect(JSON.stringify(studentTree.body)).not.toContain("acceptedAnswers");
  expect(JSON.stringify(studentTree.body)).not.toContain("correctAnswers");
  const solutionDenied = await api(page, "teacher-activity-solutions", { query: { activitySlug: benchmark.activitySlug } });
  expect(solutionDenied.response.status()).toBe(403);
  const disabledActivity = ultimateB2StudentsBookTeacherCatalog.units
    .flatMap((unit) => unit.lessons)
    .flatMap((lesson) => lesson.exercises)
    .find((activity) => activity.availability === "disabled");
  expect(disabledActivity).toBeTruthy();
  await page.goto(`/#courses/ultimate-b2/components/students-book/exercises/${disabledActivity.stableActivityId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "This page link is not available." })).toBeVisible();

  await context.clearCookies();
  const noAccess = athens.users.find((user) => user.profile === "expired-code");
  await signIn(page, "student", noAccess.email);
  const emptyCatalog = await api(page, "list");
  expect(emptyCatalog.body.bookPackages).toEqual([]);
  const deniedBook = await api(page, "", { query: { slug: "ultimate-b2" } });
  expect(deniedBook.response.status()).toBe(403);
  const archivedStudent = await api(page, "", { query: { slug: "english-journey-6" } });
  expect(archivedStudent.response.status()).toBe(404);

  const unexpectedConsole = consoleErrors.filter((message) => !/status of (401|403|404) \((Unauthorized|Forbidden|Not Found)\)/.test(message));
  expect(unexpectedConsole).toEqual([]);
  const nonOptionalFailures = failedRequests.filter((request) => !request.includes("/assets/sounds/"));
  expect(nonOptionalFailures).toEqual([]);
  const requestCounts = Object.values(Object.groupBy(failedRequests, (request) => request)).map((items) => items.length);
  expect(Math.max(0, ...requestCounts)).toBeLessThanOrEqual(4);
});
