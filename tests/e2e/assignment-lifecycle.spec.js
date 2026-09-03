import { expect, test } from "@playwright/test";
import pg from "pg";
import { MULTI_SCHOOL, MULTI_SCHOOL_DEMO_PASSWORD } from "../../scripts/_multi-school-seed-data.mjs";
import { readLocalMultiSchoolMarker } from "../../scripts/_local-multi-school.mjs";
import { removeAssignmentLifecycleRecords } from "./_assignment-lifecycle-cleanup.mjs";

const marker = readLocalMultiSchoolMarker();
const athens = MULTI_SCHOOL.find((school) => school.key === "athens");
const teacher = athens.users.find((user) => user.role === "teacher");
const targetClass = athens.classes.find((classItem) => classItem.teacherId === teacher.id && classItem.studentIds.length > 0);
const student = athens.users.find((user) => user.id === targetClass.studentIds[0]);
const unsubmittedStudent = athens.users.find((user) => user.id === targetClass.studentIds[1]);
const autoTitle = "Assignment lifecycle auto score";
const reviewTitle = "Assignment lifecycle teacher review";
const deleteTitle = "Assignment lifecycle delete zero";
const closeTitle = "Assignment lifecycle close submitted";
const testTitles = [autoTitle, reviewTitle, deleteTitle, closeTitle];
const lifecycleSubmissionIds = new Set();

async function removeLifecycleRecords() {
  if (!marker) return;
  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    await removeAssignmentLifecycleRecords(pool, {
      teacherId: teacher.id,
      titles: testTitles,
      submissionIds: [...lifecycleSubmissionIds],
    });
    lifecycleSubmissionIds.clear();
  } finally {
    await pool.end();
  }
}

async function signIn(page, role, email) {
  await page.goto(`/#auth-${role}`, { waitUntil: "domcontentloaded" });
  await page.locator(".app-intro-overlay").waitFor({ state: "hidden" });
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in", exact: true }) });
  await form.getByLabel(role === "student" ? "Email or username" : "Email", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(MULTI_SCHOOL_DEMO_PASSWORD);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/?${role}`));
}

async function signOut(page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/#\/?home/);
}

async function createVisibleAssignment(page, { activityLabel, activityPattern, title, dueDate, instructions }) {
  const activitySelect = page.getByLabel("Exercise/activity");
  if (activityPattern) {
    const activityValue = await activitySelect.locator("option").filter({ hasText: activityPattern }).getAttribute("value");
    await activitySelect.selectOption(activityValue);
  } else {
    await activitySelect.selectOption({ label: activityLabel });
  }
  await page.getByLabel("Assignment title").fill(title);
  await page.getByLabel("Due date").fill(dueDate);
  await page.getByLabel("Instructions / teacher notes").fill(instructions);

  const classCheckboxes = page.locator('.teacher-checkbox-panel input[type="checkbox"]');
  for (let index = 0; index < await classCheckboxes.count(); index += 1) {
    if (await classCheckboxes.nth(index).isChecked()) await classCheckboxes.nth(index).uncheck();
  }
  await page.getByLabel(targetClass.name, { exact: true }).check();

  const createResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
    && response.url().includes("/.netlify/functions/book-content?action=create-assignment")
  ));
  await page.getByRole("button", { name: "Assign selected exercise", exact: true }).click();
  const response = await createResponse;
  expect(response.ok()).toBeTruthy();
  await expect(page.getByText(`Assignment created for ${targetClass.name}.`, { exact: true })).toBeVisible();
  await expect(page.locator(".teacher-assignment-table article").filter({ hasText: title })).toBeVisible();
  return response.json();
}

async function openStudentAssignment(page, title) {
  await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  await expect(page.locator(".student-assignment-detail").getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start exercise", exact: true }).click();
  await expect(page).toHaveURL(/#\/student\/assignments\//);
  await expect(page.locator(".student-assignment-workspace-header").getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator('.student-interactive-runtime[data-runtime-mode="assigned"]')).toBeVisible();
}

test.beforeEach(removeLifecycleRecords);
test.afterEach(removeLifecycleRecords);

test("teacher creates assignments, student submits, and teacher results and review persist", async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  const diagnostics = { consoleErrors: [], failedRequests: [], errorResponses: [] };
  page.on("console", (message) => {
    if (message.type() === "error") diagnostics.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => diagnostics.failedRequests.push({
    method: request.method(),
    url: request.url(),
    failure: request.failure()?.errorText || "",
  }));
  page.on("response", async (response) => {
    if (response.status() < 400 || !response.url().startsWith(marker.baseURL)) return;
    diagnostics.errorResponses.push({
      method: response.request().method(),
      status: response.status(),
      url: response.url(),
    });
  });

  try {
    const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    await signIn(page, "teacher", teacher.email);
    await page.goto("/#teacher-assignments", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Assigned digital book exercises." })).toBeVisible();

    const createRequests = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("action=create-assignment")) createRequests.push(request.url());
    });
    const autoAssignment = await createVisibleAssignment(page, {
      activityLabel: "Ultimate B2 Students Book / Unit 1 / Reading · Exercise 3",
      title: autoTitle,
      dueDate,
      instructions: "Complete every reading item and submit your answers.",
    });
    const reviewAssignment = await createVisibleAssignment(page, {
      activityLabel: "Ultimate B2 Students Book / Unit 1 / Unit opener · Exercise 1",
      title: reviewTitle,
      dueDate,
      instructions: "Write a supported response for teacher feedback.",
    });
    expect(createRequests).toHaveLength(2);
    expect(autoAssignment.assignment.id).toBeTruthy();
    expect(reviewAssignment.assignment.id).toBeTruthy();

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".teacher-assignment-table article").filter({ hasText: autoTitle })).toBeVisible();
    await expect(page.locator(".teacher-assignment-table article").filter({ hasText: reviewTitle })).toBeVisible();
    await signOut(page);
    await context.clearCookies();

    await signIn(page, "student", student.email);
    await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(autoTitle, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(reviewTitle, { exact: true }).first()).toBeVisible();

    await openStudentAssignment(page, reviewTitle);
    const reviewWorkspaceUrl = page.url();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(reviewWorkspaceUrl);
    await expect(page.locator(".student-assignment-workspace-header")).toContainText(reviewTitle);
    const reviewInputs = page.getByRole("textbox", { name: /Answer question/ });
    await expect(reviewInputs).toHaveCount(3);
    for (let index = 0; index < await reviewInputs.count(); index += 1) {
      await reviewInputs.nth(index).fill(`Supported review response ${index + 1}.`);
    }
    let reviewSubmitRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("action=submit")) reviewSubmitRequests += 1;
    });
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Submit this assignment?" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Submit this assignment?" })).toBeHidden();
    expect(reviewSubmitRequests).toBe(0);
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    const reviewSubmitResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("action=submit"));
    await page.getByRole("button", { name: "Submit final answers", exact: true }).click();
    const reviewSubmissionResponse = await reviewSubmitResponse;
    expect(reviewSubmissionResponse.ok()).toBeTruthy();
    expect(reviewSubmitRequests).toBe(1);
    const reviewSubmission = (await reviewSubmissionResponse.json()).submission;
    lifecycleSubmissionIds.add(reviewSubmission.id);
    expect(reviewSubmission.status).toBe("awaiting_review");
    await expect(page.locator(".student-assignment-workspace-header")).toContainText("Awaiting teacher review");
    await expect(page.locator(".student-assignment-result-panel")).toContainText("Awaiting teacher review");
    await expect(page.locator('.student-interactive-runtime[data-runtime-mode="review"]')).toContainText("Submitted and locked");

    await page.getByRole("button", { name: "Assignments", exact: true }).click();
    await expect(page.getByText(autoTitle, { exact: true }).first()).toBeVisible();
    await openStudentAssignment(page, autoTitle);
    const autoOptions = page.getByRole("radio");
    await expect(autoOptions).toHaveCount(24);
    for (let index = 0; index < 24; index += 4) {
      await autoOptions.nth(index).check();
    }
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Submit this assignment?" })).toBeVisible();
    const autoSubmitResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("action=submit"));
    await page.getByRole("button", { name: "Submit final answers", exact: true }).click();
    const autoResponse = await autoSubmitResponse;
    expect(autoResponse.ok()).toBeTruthy();
    const autoSubmission = (await autoResponse.json()).submission;
    lifecycleSubmissionIds.add(autoSubmission.id);
    expect(Number.isFinite(autoSubmission.scorePercent)).toBeTruthy();
    await expect(page.locator(".student-assignment-workspace-header")).toContainText("Automatically graded");
    await expect(page.locator(".student-assignment-result-panel")).toContainText(`${autoSubmission.scorePercent}%`);
    await expect(page.locator('.student-interactive-runtime[data-runtime-mode="review"]')).toContainText("Submitted and locked");

    await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: new RegExp(`^${autoTitle}`) }).click();
    await expect(page.locator(".student-assignment-detail")).toContainText("Automatically graded");
    await expect(page.locator(".student-assignment-detail")).toContainText(`${autoSubmission.scorePercent}%`);
    await signOut(page);
    await context.clearCookies();

    await signIn(page, "teacher", teacher.email);
    const analyticsResponse = page.waitForResponse((response) => response.ok() && response.url().includes("action=teacher-grade-analytics"));
    await page.goto("/#teacher-students", { waitUntil: "domcontentloaded" });
    await analyticsResponse;
    await expect(page.locator(".teacher-performance-panel")).toBeVisible();
    expect(await page.locator('.teacher-analytics-chart [role="img"]').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator(".teacher-analytics-legend")).toContainText("Excellent");
    const classAnalyticsResponse = page.waitForResponse((response) => response.ok() && response.url().includes("action=teacher-grade-analytics") && response.url().includes(`classId=${targetClass.id}`));
    await page.locator(".teacher-analytics-filters").getByLabel("Class").selectOption(targetClass.id);
    await classAnalyticsResponse;
    await expect(page.locator(".teacher-analytics-kpis")).toContainText("Submitted");
    await page.goto("/#teacher-assignments", { waitUntil: "domcontentloaded" });
    const autoRow = page.locator(".teacher-assignment-table article").filter({ hasText: autoTitle });
    await autoRow.getByRole("button", { name: "View results", exact: true }).click();
    await expect(page.locator(".teacher-review-workspace")).toBeVisible();
    await expect(page.locator(".teacher-performance-panel")).toBeVisible();
    await expect(page.locator(".teacher-performance-panel").getByText("Score distribution", { exact: true })).toBeVisible();
    await page.locator(".teacher-review-queue").getByRole("button", { name: new RegExp(student.name) }).click();
    await expect(page.locator(".teacher-review-submission").getByLabel("Server score")).toHaveValue(String(autoSubmission.scorePercent));
    await page.getByRole("button", { name: "Back to assignments", exact: true }).click();

    const reviewRow = page.locator(".teacher-assignment-table article").filter({ hasText: reviewTitle });
    await reviewRow.getByRole("button", { name: "Review submissions", exact: true }).click();
    await page.locator(".teacher-review-queue").getByRole("button", { name: new RegExp(student.name) }).click();
    const reviewResultRow = page.locator(".teacher-review-submission");
    await expect(reviewResultRow).toContainText("Awaiting teacher review");
    await reviewResultRow.getByLabel("Teacher score (0–100)").fill("84");
    await reviewResultRow.getByLabel("Student-visible feedback").fill("Clear response with relevant support.");
    const reviewSaveResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("action=review-submission"));
    await reviewResultRow.getByRole("button", { name: "Save review", exact: true }).click();
    expect((await reviewSaveResponse).ok()).toBeTruthy();
    await expect(reviewResultRow).toContainText("Reviewed");
    await expect(reviewResultRow.getByLabel("Student-visible feedback")).toHaveValue("Clear response with relevant support.");

    await page.getByRole("button", { name: "Back to assignments", exact: true }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".teacher-assignment-table article").filter({ hasText: reviewTitle }).getByRole("button", { name: "View results", exact: true }).click();
    await page.locator(".teacher-review-queue").getByRole("button", { name: new RegExp(student.name) }).click();
    const persistedReviewRow = page.locator(".teacher-review-submission");
    await expect(persistedReviewRow).toContainText("Reviewed");
    await expect(persistedReviewRow.getByLabel("Teacher score (0–100)")).toHaveValue("84");
    await expect(persistedReviewRow.getByLabel("Student-visible feedback")).toHaveValue("Clear response with relevant support.");
    await page.getByRole("button", { name: "Back to assignments", exact: true }).click();
    await signOut(page);
    await context.clearCookies();

    await signIn(page, "student", student.email);
    await page.goto("/#student-grades", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    const reviewedGrade = page.locator(".student-grades-table article").filter({ hasText: reviewTitle });
    await expect(reviewedGrade).toContainText("84%");
    await reviewedGrade.getByRole("button", { name: "View feedback", exact: true }).click();
    await expect(page.locator(".student-grade-summary")).toContainText("Clear response with relevant support.");

    const unexpectedConsoleErrors = diagnostics.consoleErrors.filter((message) => !/status of (401 \(Unauthorized\)|404 \(Not Found\))/.test(message));
    const unexpectedFailedRequests = diagnostics.failedRequests.filter((request) => request.failure !== "net::ERR_ABORTED");
    const unexpectedResponses = diagnostics.errorResponses.filter((response) => (
      response.status !== 401
      && !(response.status === 404 && response.url.endsWith("/.netlify/functions/course"))
    ));
    expect(unexpectedFailedRequests).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(unexpectedResponses).toEqual([]);
  } finally {
    await testInfo.attach("assignment-lifecycle-diagnostics", {
      body: JSON.stringify(diagnostics, null, 2),
      contentType: "application/json",
    });
  }
});

test("zero-submission delete and submitted close use confirmations and preserve Student history", async ({ page, context }) => {
  test.setTimeout(240_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  test.skip(!unsubmittedStudent, "Requires a second Student in the isolated target class");

  const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  await signIn(page, "teacher", teacher.email);
  await page.goto("/#teacher-assignments", { waitUntil: "domcontentloaded" });

  await createVisibleAssignment(page, {
    activityPattern: /^Ultimate B2 Students Book \/ Unit 1 \/ Reading.*Exercise 3$/,
    title: deleteTitle,
    dueDate,
    instructions: "Temporary assignment used to verify safe deletion.",
  });
  const deleteRow = page.locator(".teacher-assignment-table article").filter({ hasText: deleteTitle });
  await deleteRow.getByRole("button", { name: "Delete assignment", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Delete assignment?");
  await expect(page.getByRole("dialog")).toContainText("This assignment has no submissions and will be permanently deleted. This cannot be undone.");
  await page.getByRole("dialog").getByRole("button", { name: "Delete assignment", exact: true }).click();
  await expect(page.getByText("Assignment deleted.", { exact: true })).toBeVisible();
  await expect(deleteRow).toHaveCount(0);

  const closeAssignment = await createVisibleAssignment(page, {
    activityPattern: /^Ultimate B2 Students Book \/ Unit 1 \/ Reading.*Exercise 3$/,
    title: closeTitle,
    dueDate,
    instructions: "Submit this assignment before its lifecycle is closed.",
  });
  await signOut(page);
  await context.clearCookies();

  await signIn(page, "student", student.email);
  await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
  const submitted = await page.evaluate(async ({ activityId, assignmentId }) => {
    const assignmentsResponse = await fetch("/.netlify/functions/book-content?action=assignments");
    const assignmentsPayload = await assignmentsResponse.json();
    const assignment = assignmentsPayload.assignments.find((item) => item.assignmentId === assignmentId);
    const answers = Object.fromEntries(assignment.activity.questions.map((question) => {
      const firstOption = question.options?.[0];
      const value = typeof firstOption === "object"
        ? firstOption.value ?? firstOption.label ?? firstOption.text
        : firstOption;
      return [question.id, value ?? "E2E response"];
    }));
    const response = await fetch("/.netlify/functions/book-content?action=submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityId, assignmentId, answers }),
    });
    return { ok: response.ok, body: await response.json() };
  }, { activityId: closeAssignment.assignment.activityId, assignmentId: closeAssignment.assignment.id });
  expect(submitted.ok, JSON.stringify(submitted.body)).toBeTruthy();
  const submission = submitted.body.submission;
  lifecycleSubmissionIds.add(submission.id);
  await signOut(page);
  await context.clearCookies();

  await signIn(page, "teacher", teacher.email);
  await page.goto("/#teacher-assignments", { waitUntil: "domcontentloaded" });
  const closeRow = page.locator(".teacher-assignment-table article").filter({ hasText: closeTitle });
  await expect(closeRow.getByRole("button", { name: "Delete assignment", exact: true })).toHaveCount(0);
  await closeRow.getByRole("button", { name: "Close assignment", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Close assignment?");
  await expect(page.getByRole("dialog")).toContainText("Students who have not submitted will no longer be able to submit. Existing submissions, scores and feedback will be preserved.");
  await page.getByRole("dialog").getByRole("button", { name: "Close assignment", exact: true }).click();
  await expect(page.getByText("Assignment closed. Existing results were preserved.", { exact: true })).toBeVisible();
  await expect(closeRow).toContainText("Closed");
  await expect(closeRow.getByRole("button", { name: "View results", exact: true })).toBeVisible();
  await signOut(page);
  await context.clearCookies();

  await signIn(page, "student", unsubmittedStudent.email);
  await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: new RegExp(`^${closeTitle}`) }).click();
  const closedDetail = page.locator(".student-assignment-detail");
  await expect(closedDetail).toContainText("Closed");
  await expect(closedDetail).toContainText("This assignment has been closed and is no longer available for submission.");
  await expect(closedDetail.getByRole("button", { name: "Start exercise", exact: true })).toHaveCount(0);
  await signOut(page);
  await context.clearCookies();

  await signIn(page, "student", student.email);
  await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: new RegExp(`^${closeTitle}`) }).click();
  await expect(page.locator(".student-assignment-detail")).toContainText(`${submission.scorePercent}%`);
  await expect(page.locator(".student-assignment-detail").getByRole("button", { name: "View results", exact: true })).toBeVisible();
  expect(closeAssignment.assignment.id).toBeTruthy();
});
