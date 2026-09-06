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
const otherSchool = MULTI_SCHOOL.find((school) => school.id !== athens.id);
const otherSchoolStudent = otherSchool.users.find((user) => user.role === "student");
const lifecycleTitle = "Assignment lifecycle Homework";
const structureLockTitle = "Assignment lifecycle structure lock";
const testTitles = [lifecycleTitle, structureLockTitle];
const autoActivityPattern = /^Ultimate B2 Students Book \/ Unit 1 \/ Reading.*Exercise 3$/;
const reviewActivityPattern = /^Ultimate B2 Students Book \/ Unit 1 \/ Unit opener.*Exercise 1$/;
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

async function createVisibleHomework(page, { activityPatterns, title, dueDate, instructions }) {
  const creator = page.locator(".homework-creator");
  const activitySelect = creator.getByLabel("Activity", { exact: true });
  const selectedActivities = [];
  for (const activityPattern of activityPatterns) {
    const option = activitySelect.locator("option").filter({ hasText: activityPattern });
    await expect(option).toHaveCount(1);
    const activityId = await option.getAttribute("value");
    const activityLabel = await option.textContent();
    expect(activityId).toBeTruthy();
    await activitySelect.selectOption(activityId);
    await creator.getByRole("button", { name: "Add", exact: true }).click();
    selectedActivities.push({ activityId, activityLabel: activityLabel.trim() });
  }
  await expect(creator.getByText(`Selected activities (${activityPatterns.length})`, { exact: true })).toBeVisible();
  await creator.getByLabel("Homework title", { exact: true }).fill(title);
  await creator.getByLabel("Due date", { exact: true }).fill(dueDate);
  await creator.getByLabel("Instructions / teacher notes", { exact: true }).fill(instructions);

  const classCheckboxes = creator.locator('.teacher-checkbox-panel input[type="checkbox"]');
  for (let index = 0; index < await classCheckboxes.count(); index += 1) {
    if (await classCheckboxes.nth(index).isChecked()) await classCheckboxes.nth(index).uncheck();
  }
  await creator.getByLabel(targetClass.name, { exact: true }).check();

  const createResponse = page.waitForResponse((response) => (
    response.request().method() === "POST"
    && response.url().includes("/.netlify/functions/book-content?action=create-homework")
  ));
  await creator.getByRole("button", { name: "Create Homework", exact: true }).click();
  const response = await createResponse;
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload.homework.itemCount).toBe(activityPatterns.length);
  await expect(page.locator(".inline-status.success")).toContainText(title);
  await expect(page.locator(".inline-status.success")).toContainText(`${activityPatterns.length} activities`);
  await expect(page.locator(".teacher-homework-card").filter({ hasText: title })).toBeVisible();
  return { homework: payload.homework, selectedActivities };
}

function homeworkAssignment(homework, activityId) {
  const item = homework.items.find((candidate) => String(candidate.activityId) === String(activityId));
  expect(item, `Homework item ${activityId} must exist`).toBeTruthy();
  const assignment = item.assignments.find((candidate) => String(candidate.classId) === String(targetClass.id));
  expect(assignment, `Homework assignment for ${targetClass.name} must exist`).toBeTruthy();
  return { item, assignment };
}

async function openStudentHomeworkActivity(page, { title, item, assignment }) {
  await page.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  await expect(page.locator(".student-assignment-detail").getByRole("heading", { name: title, exact: true })).toBeVisible();
  const homeworkItem = page.locator(".student-homework-items li").filter({ has: page.getByText(item.title, { exact: true }) });
  await expect(homeworkItem).toHaveCount(1);
  await homeworkItem.getByRole("button", { name: "Open activity", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#\/student\/assignments\/${assignment.id}$`));
  await expect(page.locator(".student-assignment-workspace-header").getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.locator('.student-interactive-runtime[data-runtime-mode="assigned"]')).toBeVisible();
}

test.beforeEach(removeLifecycleRecords);
test.afterEach(removeLifecycleRecords);

test("teacher creates Homework, student submits both activities, and teacher results and review persist", async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  const diagnostics = { consoleErrors: [], failedRequests: [], errorResponses: [], solutionRequests: [] };
  let learnerSession = false;
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
  page.on("request", (request) => {
    if (learnerSession
      && /solution|teacher-project|answer-key/i.test(request.url())
      && !request.url().endsWith("/src/apps/android-teacher-offline/noOfflineSolutions.js")) {
      diagnostics.solutionRequests.push(request.url());
    }
  });

  try {
    const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    await signIn(page, "teacher", teacher.email);
    await page.goto("/#teacher-assignments", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Assignments", exact: true })).toBeVisible();

    const createRequests = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("action=create-homework")) createRequests.push(request.url());
    });
    const created = await createVisibleHomework(page, {
      activityPatterns: [autoActivityPattern, reviewActivityPattern],
      title: lifecycleTitle,
      dueDate,
      instructions: "Complete the reading and written-response activities, then submit each final answer set.",
    });
    expect(createRequests).toHaveLength(1);
    const autoTarget = homeworkAssignment(created.homework, created.selectedActivities[0].activityId);
    const reviewTarget = homeworkAssignment(created.homework, created.selectedActivities[1].activityId);
    expect(autoTarget.item.position).toBe(1);
    expect(reviewTarget.item.position).toBe(2);

    await page.reload({ waitUntil: "domcontentloaded" });
    const createdHomeworkCard = page.locator(".teacher-homework-card").filter({ hasText: lifecycleTitle });
    await expect(createdHomeworkCard).toContainText("2 activities");
    await expect(createdHomeworkCard.getByText(autoTarget.item.title, { exact: true })).toBeVisible();
    await expect(createdHomeworkCard.getByText(reviewTarget.item.title, { exact: true })).toBeVisible();
    await signOut(page);
    await context.clearCookies();

    learnerSession = true;
    await signIn(page, "student", otherSchoolStudent.email);
    await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(lifecycleTitle, { exact: true })).toHaveCount(0);
    await signOut(page);
    await context.clearCookies();

    await signIn(page, "student", student.email);
    await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".student-assignment-sidebar").getByText(lifecycleTitle, { exact: true })).toBeVisible();

    await openStudentHomeworkActivity(page, { title: lifecycleTitle, ...reviewTarget });
    const reviewWorkspaceUrl = page.url();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(reviewWorkspaceUrl);
    await expect(page.locator(".student-assignment-workspace-header")).toContainText(lifecycleTitle);
    const reviewInputs = page.getByRole("textbox", { name: /Answer question/ });
    await expect(reviewInputs).toHaveCount(3);
    const reviewSubmit = page.getByRole("button", { name: "Submit", exact: true });
    await expect(reviewSubmit).toBeDisabled();
    const responseBoxes = await reviewInputs.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()));
    expect(responseBoxes.every((box) => box.width > 100 && box.height > 40)).toBeTruthy();
    await reviewInputs.nth(0).fill("Supported review response 1.");
    await expect(reviewInputs.nth(0)).toHaveValue("Supported review response 1.");
    await expect(reviewSubmit).toBeDisabled();
    await reviewInputs.nth(1).fill("Supported review response 2.");
    await expect(reviewSubmit).toBeDisabled();
    await reviewInputs.nth(2).fill("   ");
    await expect(reviewSubmit).toBeDisabled();
    await reviewInputs.nth(2).fill("Supported review response 3.");
    await expect(reviewSubmit).toBeEnabled();
    await reviewInputs.nth(0).fill("");
    await expect(reviewSubmit).toBeDisabled();
    await reviewInputs.nth(0).fill("Supported review response 1.");
    await expect(reviewSubmit).toBeEnabled();
    const studentSubmitPayloads = [];
    page.on("request", (request) => {
      if (request.method() !== "POST" || !request.url().includes("action=submit")) return;
      studentSubmitPayloads.push(request.postDataJSON());
    });
    await reviewSubmit.click();
    await expect(page.getByRole("dialog", { name: "Submit this assignment?" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Submit this assignment?" })).toBeHidden();
    expect(studentSubmitPayloads).toHaveLength(0);
    await reviewSubmit.click();
    const reviewSubmitResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("action=submit"));
    await page.getByRole("button", { name: "Submit final answers", exact: true }).click();
    const reviewSubmissionResponse = await reviewSubmitResponse;
    expect(reviewSubmissionResponse.ok()).toBeTruthy();
    expect(studentSubmitPayloads).toHaveLength(1);
    expect(studentSubmitPayloads[0].assignmentId).toBe(reviewTarget.assignment.id);
    expect(studentSubmitPayloads[0].activityId).toBe(reviewTarget.item.activityId);
    expect(studentSubmitPayloads[0].answers).toEqual({
      1: "Supported review response 1.",
      2: "Supported review response 2.",
      3: "Supported review response 3.",
    });
    expect(studentSubmitPayloads[0]).not.toHaveProperty("scorePercent");
    expect(studentSubmitPayloads[0]).not.toHaveProperty("correctAnswers");
    const reviewSubmission = (await reviewSubmissionResponse.json()).submission;
    lifecycleSubmissionIds.add(reviewSubmission.id);
    expect(reviewSubmission.status).toBe("awaiting_review");
    await expect(page.locator(".student-assignment-workspace-header")).toContainText("Awaiting teacher review");
    await expect(page.locator(".student-assignment-result-panel")).toContainText("Awaiting teacher review");
    await expect(page.locator('.student-interactive-runtime[data-runtime-mode="review"]')).toContainText("Submitted and locked");

    await page.getByRole("button", { name: "Assignments", exact: true }).click();
    await expect(page.locator(".student-assignment-sidebar").getByText(lifecycleTitle, { exact: true })).toBeVisible();
    await openStudentHomeworkActivity(page, { title: lifecycleTitle, ...autoTarget });
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
    expect(studentSubmitPayloads).toHaveLength(2);
    expect(studentSubmitPayloads[1].assignmentId).toBe(autoTarget.assignment.id);
    expect(studentSubmitPayloads[1].activityId).toBe(autoTarget.item.activityId);
    expect(studentSubmitPayloads[1]).not.toHaveProperty("scorePercent");
    expect(studentSubmitPayloads[1]).not.toHaveProperty("correctAnswers");
    const autoSubmission = (await autoResponse.json()).submission;
    lifecycleSubmissionIds.add(autoSubmission.id);
    expect(Number.isFinite(autoSubmission.scorePercent)).toBeTruthy();
    await expect(page.locator(".student-assignment-workspace-header")).toContainText("Automatically graded");
    await expect(page.locator(".student-assignment-result-panel")).toContainText(`${autoSubmission.scorePercent}%`);
    await expect(page.locator('.student-interactive-runtime[data-runtime-mode="review"]')).toContainText("Submitted and locked");

    await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: new RegExp(`^${lifecycleTitle}`) }).click();
    const submittedAutoItem = page.locator(".student-homework-items li").filter({ has: page.getByText(autoTarget.item.title, { exact: true }) });
    await expect(submittedAutoItem).toContainText("Automatically graded");
    await submittedAutoItem.getByRole("button", { name: "View result", exact: true }).click();
    await expect(page.locator(".student-assignment-result-panel")).toContainText(`${autoSubmission.scorePercent}%`);
    await signOut(page);
    await context.clearCookies();
    learnerSession = false;

    await signIn(page, "teacher", teacher.email);
    const analyticsResponse = page.waitForResponse((response) => response.ok() && response.url().includes("action=teacher-grade-analytics"));
    await page.goto("/#teacher-students", { waitUntil: "domcontentloaded" });
    await analyticsResponse;
    await expect(page.locator(".teacher-performance-panel")).toBeVisible();
    expect(await page.locator('.teacher-analytics-chart [role="img"]').count()).toBeGreaterThanOrEqual(3);
    await expect(page.locator(".teacher-analytics-legend").filter({ hasText: "Excellent" })).toContainText("Excellent");
    const classAnalyticsResponse = page.waitForResponse((response) => response.ok() && response.url().includes("action=teacher-grade-analytics") && response.url().includes(`classId=${targetClass.id}`));
    await page.locator(".teacher-analytics-filters").getByLabel("Class").selectOption(targetClass.id);
    await classAnalyticsResponse;
    await expect(page.locator(".teacher-analytics-kpis")).toContainText("Submitted");
    await page.goto("/#teacher-assignments", { waitUntil: "domcontentloaded" });
    let homeworkCard = page.locator(".teacher-homework-card").filter({ hasText: lifecycleTitle });
    const autoRow = homeworkCard.locator(".teacher-homework-items li").filter({ has: page.getByText(autoTarget.item.title, { exact: true }) });
    await autoRow.getByRole("button", { name: "Results", exact: true }).click();
    await expect(page.locator(".teacher-review-workspace")).toBeVisible();
    await expect(page.locator(".teacher-performance-panel")).toBeVisible();
    await expect(page.locator(".teacher-performance-panel").getByText("Score distribution", { exact: true })).toBeVisible();
    await page.locator(".teacher-review-queue").getByRole("button", { name: new RegExp(student.name) }).click();
    await expect(page.locator(".teacher-review-submission").getByLabel("Server score")).toHaveValue(String(autoSubmission.scorePercent));
    await page.getByRole("button", { name: "Back to assignments", exact: true }).click();

    homeworkCard = page.locator(".teacher-homework-card").filter({ hasText: lifecycleTitle });
    const reviewRow = homeworkCard.locator(".teacher-homework-items li").filter({ has: page.getByText(reviewTarget.item.title, { exact: true }) });
    await reviewRow.getByRole("button", { name: "Results", exact: true }).click();
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
    homeworkCard = page.locator(".teacher-homework-card").filter({ hasText: lifecycleTitle });
    await homeworkCard.locator(".teacher-homework-items li").filter({ has: page.getByText(reviewTarget.item.title, { exact: true }) }).getByRole("button", { name: "Results", exact: true }).click();
    await page.locator(".teacher-review-queue").getByRole("button", { name: new RegExp(student.name) }).click();
    const persistedReviewRow = page.locator(".teacher-review-submission");
    await expect(persistedReviewRow).toContainText("Reviewed");
    await expect(persistedReviewRow.getByLabel("Teacher score (0–100)")).toHaveValue("84");
    await expect(persistedReviewRow.getByLabel("Student-visible feedback")).toHaveValue("Clear response with relevant support.");
    await page.getByRole("button", { name: "Back to assignments", exact: true }).click();
    await signOut(page);
    await context.clearCookies();

    await signIn(page, "student", student.email);
    learnerSession = true;
    await page.goto("/#student-grades", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    const reviewedGrade = page.locator(".student-grades-table article")
      .filter({ hasText: lifecycleTitle })
      .filter({ has: page.getByText("reviewed", { exact: true }) });
    await expect(reviewedGrade).toContainText("84%");
    await reviewedGrade.getByRole("button", { name: "View feedback", exact: true }).click();
    await expect(page.locator(".student-grade-summary")).toContainText("Clear response with relevant support.");

    const unexpectedConsoleErrors = diagnostics.consoleErrors.filter((message) => !/status of (401 \(Unauthorized\)|404 \(Not Found\))/.test(message));
    const unexpectedFailedRequests = diagnostics.failedRequests.filter((request) => request.failure !== "net::ERR_ABORTED");
    const unexpectedResponses = diagnostics.errorResponses.filter((response) => (
      response.status !== 401
      && !(response.status === 404 && response.url.endsWith("/.netlify/functions/course"))
      && !(response.status === 404 && response.url.includes("action=active-component-release"))
    ));
    expect(unexpectedFailedRequests).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(unexpectedResponses).toEqual([]);
    expect(diagnostics.solutionRequests).toEqual([]);
  } finally {
    await testInfo.attach("assignment-lifecycle-diagnostics", {
      body: JSON.stringify(diagnostics, null, 2),
      contentType: "application/json",
    });
  }
});

test("Homework structure locks after real learner work while results and other recipients remain available", async ({ page, context }) => {
  test.setTimeout(240_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  test.skip(!unsubmittedStudent, "Requires a second Student in the isolated target class");

  const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  await signIn(page, "teacher", teacher.email);
  await page.goto("/#teacher-assignments", { waitUntil: "domcontentloaded" });
  const created = await createVisibleHomework(page, {
    activityPatterns: [autoActivityPattern, reviewActivityPattern],
    title: structureLockTitle,
    dueDate,
    instructions: "Verify the current Homework structure lifecycle with real learner work.",
  });
  const autoTarget = homeworkAssignment(created.homework, created.selectedActivities[0].activityId);
  let homeworkCard = page.locator(".teacher-homework-card").filter({ hasText: structureLockTitle });
  await expect(homeworkCard).toContainText("Activities, order, classes, and Homework details can be edited until learner work exists.");
  await homeworkCard.getByRole("button", { name: "Edit", exact: true }).click();
  let editor = page.locator(".homework-editor");
  await expect(editor.getByLabel("Activity", { exact: true })).toBeEnabled();
  await expect(editor.getByLabel(targetClass.name, { exact: true })).toBeEnabled();
  for (const removeButton of await editor.getByRole("button", { name: /Remove/ }).all()) await expect(removeButton).toBeEnabled();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await signOut(page);
  await context.clearCookies();

  await signIn(page, "student", student.email);
  await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
  await openStudentHomeworkActivity(page, { title: structureLockTitle, ...autoTarget });
  const autoOptions = page.getByRole("radio");
  await expect(autoOptions).toHaveCount(24);
  for (let index = 0; index < 24; index += 4) await autoOptions.nth(index).check();
  let submitRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("action=submit")) submitRequests += 1;
  });
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Submit this assignment?" })).toBeVisible();
  const submitResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("action=submit"));
  await page.getByRole("button", { name: "Submit final answers", exact: true }).click();
  const submittedResponse = await submitResponse;
  expect(submittedResponse.ok()).toBeTruthy();
  expect(submitRequests).toBe(1);
  const submission = (await submittedResponse.json()).submission;
  lifecycleSubmissionIds.add(submission.id);
  await expect(page.locator('.student-interactive-runtime[data-runtime-mode="review"]')).toContainText("Submitted and locked");
  await signOut(page);
  await context.clearCookies();

  await signIn(page, "teacher", teacher.email);
  await page.goto("/#teacher-assignments", { waitUntil: "domcontentloaded" });
  homeworkCard = page.locator(".teacher-homework-card").filter({ hasText: structureLockTitle });
  await expect(homeworkCard).toContainText("Learner work exists; activity order and classes are locked");
  const resultItem = homeworkCard.locator(".teacher-homework-items li").filter({ has: page.getByText(autoTarget.item.title, { exact: true }) });
  await resultItem.getByRole("button", { name: "Results", exact: true }).click();
  await page.locator(".teacher-review-queue").getByRole("button", { name: new RegExp(student.name) }).click();
  await expect(page.locator(".teacher-review-submission").getByLabel("Server score")).toHaveValue(String(submission.scorePercent));
  await page.getByRole("button", { name: "Back to assignments", exact: true }).click();

  homeworkCard = page.locator(".teacher-homework-card").filter({ hasText: structureLockTitle });
  await homeworkCard.getByRole("button", { name: "Edit", exact: true }).click();
  editor = page.locator(".homework-editor");
  await expect(editor).toContainText("Learner work already exists. Exercises, activity order, and classes are read-only");
  await expect(editor.getByLabel("Activity", { exact: true })).toBeDisabled();
  await expect(editor.getByLabel(targetClass.name, { exact: true })).toBeDisabled();
  await expect(editor.getByLabel("Homework title", { exact: true })).toBeEnabled();
  for (const removeButton of await editor.getByRole("button", { name: /Remove/ }).all()) await expect(removeButton).toBeDisabled();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await signOut(page);
  await context.clearCookies();

  await signIn(page, "student", unsubmittedStudent.email);
  await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
  await openStudentHomeworkActivity(page, { title: structureLockTitle, ...autoTarget });
  await expect(page.locator('.student-interactive-runtime[data-runtime-mode="assigned"]')).toBeVisible();
});
