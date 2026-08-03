import { expect, test } from "@playwright/test";
import pg from "pg";
import { MULTI_SCHOOL, MULTI_SCHOOL_DEMO_PASSWORD } from "../../scripts/_multi-school-seed-data.mjs";
import { readLocalMultiSchoolMarker } from "../../scripts/_local-multi-school.mjs";

const marker = readLocalMultiSchoolMarker();
const athens = MULTI_SCHOOL.find((school) => school.key === "athens");
const teacher = athens.users.find((user) => user.role === "teacher");
const targetClass = athens.classes.find((classItem) => classItem.teacherId === teacher.id && classItem.studentIds.length > 0);
const student = athens.users.find((user) => user.id === targetClass.studentIds[0]);
const autoTitle = "Assignment lifecycle auto score";
const reviewTitle = "Assignment lifecycle teacher review";
const testTitles = [autoTitle, reviewTitle];

async function removeLifecycleRecords() {
  if (!marker) return;
  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    await pool.query(
      "delete from activity_assignments where teacher_id=$1 and title=any($2::text[])",
      [teacher.id, testTitles],
    );
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

async function createVisibleAssignment(page, { activityLabel, title, dueDate, instructions }) {
  await page.getByLabel("Exercise/activity").selectOption({ label: activityLabel });
  await page.getByLabel("Assignment title").fill(title);
  await page.getByLabel("Due date").fill(dueDate);
  await page.getByLabel("Instructions / teacher notes").fill(instructions);

  for (const classItem of athens.classes.filter((item) => item.teacherId === teacher.id)) {
    const checkbox = page.getByLabel(classItem.name, { exact: true });
    if (classItem.id === targetClass.id) {
      if (!await checkbox.isChecked()) await checkbox.check();
    } else if (await checkbox.isChecked()) {
      await checkbox.uncheck();
    }
  }

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
    const reviewInputs = page.getByRole("textbox", { name: /Answer question/ });
    await expect(reviewInputs).toHaveCount(3);
    for (let index = 0; index < await reviewInputs.count(); index += 1) {
      await reviewInputs.nth(index).fill(`Supported review response ${index + 1}.`);
    }
    const reviewSubmitResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("action=submit"));
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    const reviewSubmissionResponse = await reviewSubmitResponse;
    expect(reviewSubmissionResponse.ok()).toBeTruthy();
    expect((await reviewSubmissionResponse.json()).submission.status).toBe("awaiting_review");
    await expect(page.getByText(/Submitted · Awaiting teacher review/)).toBeVisible();

    await page.getByRole("button", { name: "Assignments", exact: true }).click();
    await expect(page.getByText(autoTitle, { exact: true }).first()).toBeVisible();
    await openStudentAssignment(page, autoTitle);
    const autoOptions = page.getByRole("radio");
    await expect(autoOptions).toHaveCount(24);
    for (let index = 0; index < 24; index += 4) {
      await autoOptions.nth(index).check();
    }
    const autoSubmitResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("action=submit"));
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    const autoResponse = await autoSubmitResponse;
    expect(autoResponse.ok()).toBeTruthy();
    const autoSubmission = (await autoResponse.json()).submission;
    expect(Number.isFinite(autoSubmission.scorePercent)).toBeTruthy();
    await expect(page.getByText(new RegExp(`${autoSubmission.correctCount}/${autoSubmission.totalCount} correct.*${autoSubmission.scorePercent}%`))).toBeVisible();

    await page.goto("/#student-assignments", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: new RegExp(`^${autoTitle}`) }).click();
    await expect(page.locator(".student-assignment-detail")).toContainText("Automatically graded");
    await expect(page.locator(".student-assignment-detail")).toContainText(`${autoSubmission.scorePercent}%`);
    await signOut(page);
    await context.clearCookies();

    await signIn(page, "teacher", teacher.email);
    await page.goto("/#teacher-assignments", { waitUntil: "domcontentloaded" });
    const autoRow = page.locator(".teacher-assignment-table article").filter({ hasText: autoTitle });
    await autoRow.getByRole("button", { name: "View results", exact: true }).click();
    const autoResultRow = page.locator(".results-modal-list article").filter({ hasText: student.name });
    await expect(autoResultRow).toContainText(`${autoSubmission.scorePercent}%`);
    await page.getByRole("button", { name: "Close results", exact: true }).click();

    const reviewRow = page.locator(".teacher-assignment-table article").filter({ hasText: reviewTitle });
    await reviewRow.getByRole("button", { name: "View results", exact: true }).click();
    const reviewResultRow = page.locator(".results-modal-list article").filter({ hasText: student.name });
    await expect(reviewResultRow).toContainText("Awaiting teacher review");
    await reviewResultRow.getByLabel("Score (0-100)").fill("84");
    await reviewResultRow.getByLabel("Teacher feedback").fill("Clear response with relevant support.");
    const reviewSaveResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("action=review-submission"));
    await reviewResultRow.getByRole("button", { name: "Save feedback", exact: true }).click();
    expect((await reviewSaveResponse).ok()).toBeTruthy();
    await expect(reviewResultRow).toContainText("Reviewed");
    await expect(reviewResultRow.getByLabel("Teacher feedback")).toHaveValue("Clear response with relevant support.");

    await page.getByRole("button", { name: "Close results", exact: true }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".teacher-assignment-table article").filter({ hasText: reviewTitle }).getByRole("button", { name: "View results", exact: true }).click();
    const persistedReviewRow = page.locator(".results-modal-list article").filter({ hasText: student.name });
    await expect(persistedReviewRow).toContainText("Reviewed");
    await expect(persistedReviewRow.getByLabel("Score (0-100)")).toHaveValue("84");
    await expect(persistedReviewRow.getByLabel("Teacher feedback")).toHaveValue("Clear response with relevant support.");
    await page.getByRole("button", { name: "Close results", exact: true }).click();
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
