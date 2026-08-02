import { expect, test } from "@playwright/test";

const localPilot = process.env.E2E_LOCAL_CONFIRMATION === "isolated-local-pilot";
const password = process.env.E2E_ADMIN_PASSWORD;

async function signIn(page, role, email) {
  await page.goto(`/#auth-${role}`);
  const roleHeading = role === "admin" ? "School Admin access" : role === "teacher" ? "Teacher access" : "Student access";
  await expect(page.getByRole("heading", { name: roleHeading, exact: true })).toBeVisible();
  await expect(page.getByText("Checking current session...")).toHaveCount(0);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in", exact: true }) });
  await form.getByLabel(role === "student" ? "Email or username" : "Email", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/?${role}`));
}

async function signOut(page) {
  const button = page.getByRole("button", { name: "Log out and reset progress", exact: true }).first();
  await expect(button).toBeVisible();
  await button.click();
  await expect(page).toHaveURL(/#\/?home/);
}

async function bookRequest(page, action, options = {}) {
  const query = new URLSearchParams(action ? { action } : {});
  for (const [key, value] of Object.entries(options.query || {})) query.set(key, value);
  const response = options.method === "POST"
    ? await page.request.post(`/.netlify/functions/book-content?${query}`, { data: options.data || {} })
    : await page.request.get(`/.netlify/functions/book-content?${query}`);
  return { response, body: await response.json() };
}

test.describe("isolated local Ultimate B2 pilot", () => {
  test.skip(!localPilot, "Requires the explicitly confirmed isolated local pilot database");

  test("admin, teacher, student, review, and security lifecycle", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "The stateful isolated pilot lifecycle runs once against Chromium");
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await signIn(page, "admin", "elena.admin@example.com");
    await page.goto("/#admin-users");
    await expect(page.getByText(/Maria Antoniou/).first()).toBeVisible();
    await expect(page.getByText(/Anna Georgiou/).first()).toBeVisible();
    const adminUsers = await page.request.get("/.netlify/functions/users");
    expect(adminUsers.ok()).toBeTruthy();
    expect((await adminUsers.json()).users).toHaveLength(3);
    const missingCrossTenantUser = await page.request.get("/.netlify/functions/user?id=00000000-0000-4000-8000-000000000099");
    expect(missingCrossTenantUser.status()).toBe(404);
    await signOut(page);

    await signIn(page, "teacher", "maria.teacher@example.com");
    const classesResult = await bookRequest(page, "classes");
    expect(classesResult.response.ok()).toBeTruthy();
    expect(classesResult.body.classes).toHaveLength(1);
    const classId = classesResult.body.classes[0].id;
    const treeResult = await bookRequest(page, "", { query: { slug: "ultimate-b2" } });
    expect(treeResult.response.ok()).toBeTruthy();
    const exercises = treeResult.body.bookPackage.components
      .flatMap((component) => component.units)
      .flatMap((unit) => unit.lessons)
      .flatMap((lesson) => lesson.exercises);
    const unit1 = exercises.filter((activity) => activity.slug.startsWith("ultimate-b2-sb-u1-"));
    const unit2 = exercises.filter((activity) => activity.slug.startsWith("ultimate-b2-sb-u2-"));
    expect(unit1).toHaveLength(38);
    expect(unit2).toHaveLength(40);
    const autoActivity = exercises.find((activity) => activity.contentJson?.implementationMode === "auto-scored");
    const reviewActivity = exercises.find((activity) => activity.contentJson?.implementationMode === "teacher-reviewed");
    expect(autoActivity).toBeTruthy();
    expect(reviewActivity).toBeTruthy();

    const solutionResult = await bookRequest(page, "teacher-activity-solutions", {
      query: { activitySlug: autoActivity.slug },
    });
    expect(solutionResult.response.ok()).toBeTruthy();
    expect(solutionResult.response.headers()["cache-control"]).toContain("no-store");
    const acceptedAnswers = Object.values(solutionResult.body.solution.questions)
      .map((question) => question.acceptedAnswers[0]);
    const autoAnswers = Object.fromEntries(
      autoActivity.questions.map((question, index) => [question.id, acceptedAnswers[index]]),
    );

    const autoAssignment = await bookRequest(page, "create-assignment", {
      method: "POST",
      data: {
        activityId: autoActivity.id,
        classId,
        title: "E2E automatic scoring",
        idempotencyKey: "e2e-pilot-auto-assignment",
      },
    });
    expect(autoAssignment.response.ok()).toBeTruthy();
    const reviewAssignment = await bookRequest(page, "create-assignment", {
      method: "POST",
      data: {
        activityId: reviewActivity.id,
        classId,
        title: "E2E teacher review",
        idempotencyKey: "e2e-pilot-review-assignment",
      },
    });
    expect(reviewAssignment.response.ok()).toBeTruthy();
    await signOut(page);

    await signIn(page, "student", "anna.student@example.com");
    await page.goto("/#student-assignments");
    await expect(page.getByText("E2E automatic scoring", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("E2E teacher review", { exact: true }).first()).toBeVisible();
    const studentAssignments = await bookRequest(page, "assignments");
    expect(studentAssignments.response.ok()).toBeTruthy();
    expect(JSON.stringify(studentAssignments.body)).not.toContain("acceptedAnswers");
    expect(JSON.stringify(studentAssignments.body)).not.toContain("correctAnswers");

    const autoSubmission = await bookRequest(page, "submit", {
      method: "POST",
      data: {
        activityId: autoActivity.id,
        assignmentId: autoAssignment.body.assignment.id,
        score: 0,
        answers: autoAnswers,
      },
    });
    expect(autoSubmission.response.ok()).toBeTruthy();
    expect(autoSubmission.body.submission.scorePercent).toBe(100);
    const reviewAnswers = Object.fromEntries(
      reviewActivity.questions.map((question) => [question.id, "A supported open response for teacher review."]),
    );
    const pendingSubmission = await bookRequest(page, "submit", {
      method: "POST",
      data: {
        activityId: reviewActivity.id,
        assignmentId: reviewAssignment.body.assignment.id,
        answers: reviewAnswers,
      },
    });
    expect(pendingSubmission.response.ok()).toBeTruthy();
    expect(pendingSubmission.body.submission.status).toBe("awaiting_review");
    expect(pendingSubmission.body.submission.scorePercent).toBeNull();
    const deniedSolution = await bookRequest(page, "teacher-activity-solutions", {
      query: { activitySlug: autoActivity.slug },
    });
    expect(deniedSolution.response.status()).toBe(403);
    await signOut(page);

    await signIn(page, "teacher", "maria.teacher@example.com");
    const autoResults = await bookRequest(page, "assignment-results", {
      query: { assignmentId: autoAssignment.body.assignment.id },
    });
    expect(autoResults.body.rows[0].scorePercent).toBe(100);
    const completedReview = await bookRequest(page, "review-submission", {
      method: "POST",
      data: {
        submissionId: pendingSubmission.body.submission.id,
        scorePercent: 84,
        teacherFeedback: "Clear response with relevant support.",
      },
    });
    expect(completedReview.response.ok()).toBeTruthy();
    expect(completedReview.body.submission.status).toBe("reviewed");
    await signOut(page);

    await signIn(page, "student", "anna.student@example.com");
    const grades = await bookRequest(page, "grades");
    const finalGrade = grades.body.grades.find((grade) => grade.id === pendingSubmission.body.submission.id);
    expect(finalGrade.status).toBe("reviewed");
    expect(finalGrade.scorePercent).toBe(84);
    expect(finalGrade.teacherFeedback).toBe("Clear response with relevant support.");
    const unexpectedConsoleErrors = consoleErrors.filter((message) => !/status of 401 \(Unauthorized\)/.test(message));
    expect(unexpectedConsoleErrors).toEqual([]);
  });
});
