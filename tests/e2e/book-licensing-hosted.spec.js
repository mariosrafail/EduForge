import { expect, test } from "@playwright/test";

const licensingVariables = ["E2E_SCHOOL_A_ADMIN_EMAIL", "E2E_SCHOOL_A_ADMIN_PASSWORD", "E2E_SCHOOL_A_STUDENT1_EMAIL", "E2E_SCHOOL_A_STUDENT2_EMAIL", "E2E_SCHOOL_A_STUDENT_PASSWORD", "E2E_SCHOOL_B_ADMIN_EMAIL", "E2E_SCHOOL_B_ADMIN_PASSWORD", "E2E_ULTIMATE_B2_PACKAGE_ID", "E2E_SCHOOL_A_TEACHER_ID"];
const assignmentVariables = ["E2E_SCHOOL_A_TEACHER_EMAIL", "E2E_SCHOOL_A_TEACHER_PASSWORD", "E2E_SCHOOL_A_CLASS_ID", "E2E_ASSIGNABLE_ACTIVITY_ID", "E2E_SCHOOL_A_STUDENT1_ID", "E2E_SCHOOL_A_STUDENT2_ID"];

async function signIn(page, role, email, password) {
  await page.goto(`/#auth-${role}`);
  await page.getByLabel(role === "student" ? "Email or username" : "Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(new RegExp(`#auth-${role}$`));
}

async function api(page, path, options = {}) {
  const response = await page.request.fetch(path, options);
  return { status: response.status(), body: await response.json() };
}

test("hosted one-time licensing redemption and school isolation", async ({ page, context }) => {
  test.skip(licensingVariables.some((name) => !process.env[name]), `Requires ${licensingVariables.join(", ")}`);
  await signIn(page, "admin", process.env.E2E_SCHOOL_A_ADMIN_EMAIL, process.env.E2E_SCHOOL_A_ADMIN_PASSWORD);
  const generated = await api(page, "/.netlify/functions/book-licensing?action=generate-batch", {
    method: "POST",
    data: { bookPackageId: process.env.E2E_ULTIMATE_B2_PACKAGE_ID, quantity: 1, label: `Hosted E2E ${Date.now()}`, requestKey: crypto.randomUUID() },
  });
  expect(generated.status).toBe(201);
  const accessCode = generated.body.codes[0];
  const batchId = generated.body.batch.id;
  expect(accessCode).toBeTruthy();

  await context.clearCookies();
  await signIn(page, "student", process.env.E2E_SCHOOL_A_STUDENT1_EMAIL, process.env.E2E_SCHOOL_A_STUDENT_PASSWORD);
  await page.goto("/#student-books");
  await page.getByLabel("Book access code").fill(accessCode);
  await page.getByRole("button", { name: "Activate book" }).click();
  await expect(page.getByText(/is now active on your account/i)).toBeVisible();
  await expect(page.getByText(/Ultimate B2/i).first()).toBeVisible();

  await context.clearCookies();
  await signIn(page, "student", process.env.E2E_SCHOOL_A_STUDENT2_EMAIL, process.env.E2E_SCHOOL_A_STUDENT_PASSWORD);
  const duplicate = await api(page, "/.netlify/functions/book-licensing?action=redeem", { method: "POST", data: { code: accessCode } });
  expect(duplicate.status).toBe(400);

  await context.clearCookies();
  await signIn(page, "admin", process.env.E2E_SCHOOL_B_ADMIN_EMAIL, process.env.E2E_SCHOOL_B_ADMIN_PASSWORD);
  const foreignBatch = await api(page, `/.netlify/functions/book-licensing?action=batch&batchId=${batchId}`);
  expect(foreignBatch.status).toBe(404);
  const overview = await api(page, "/.netlify/functions/book-licensing?action=overview");
  expect(overview.body.batches.some((batch) => batch.id === batchId)).toBe(false);
  const users = await api(page, "/.netlify/functions/users");
  expect(users.body.users.some((user) => user.email === process.env.E2E_SCHOOL_A_ADMIN_EMAIL)).toBe(false);
  const classes = await api(page, `/.netlify/functions/book-content?action=classes&teacherId=${process.env.E2E_SCHOOL_A_TEACHER_ID}`);
  expect(classes.body.classes || []).toHaveLength(0);
});

test("hosted teacher assignment, student submission, feedback, and student isolation", async ({ page, context }) => {
  const required = [...assignmentVariables, ...licensingVariables.filter((name) => name.includes("STUDENT"))];
  test.skip(required.some((name) => !process.env[name]), `Requires ${required.join(", ")}`);
  await signIn(page, "teacher", process.env.E2E_SCHOOL_A_TEACHER_EMAIL, process.env.E2E_SCHOOL_A_TEACHER_PASSWORD);
  const created = await api(page, "/.netlify/functions/book-content?action=create-assignment", { method: "POST", data: { activityId: process.env.E2E_ASSIGNABLE_ACTIVITY_ID, classId: process.env.E2E_SCHOOL_A_CLASS_ID, title: `Hosted isolation assignment ${Date.now()}` } });
  expect(created.status).toBe(201);
  const assignment = created.body.assignments[0];

  await context.clearCookies();
  await signIn(page, "student", process.env.E2E_SCHOOL_A_STUDENT1_EMAIL, process.env.E2E_SCHOOL_A_STUDENT_PASSWORD);
  const visible = await api(page, "/.netlify/functions/book-content?action=assignments");
  expect(visible.body.assignments.some((item) => item.assignmentId === assignment.id || item.id === assignment.id)).toBe(true);
  const submitted = await api(page, "/.netlify/functions/book-content?action=submit", { method: "POST", data: { activityId: process.env.E2E_ASSIGNABLE_ACTIVITY_ID, assignmentId: assignment.id, answers: {} } });
  expect(submitted.status).toBe(201);

  await context.clearCookies();
  await signIn(page, "teacher", process.env.E2E_SCHOOL_A_TEACHER_EMAIL, process.env.E2E_SCHOOL_A_TEACHER_PASSWORD);
  const results = await api(page, `/.netlify/functions/book-content?action=assignment-results&assignmentId=${assignment.id}`);
  const studentRow = results.body.rows.find((row) => row.studentId === process.env.E2E_SCHOOL_A_STUDENT1_ID);
  expect(studentRow.submissionId).toBeTruthy();
  const reviewed = await api(page, "/.netlify/functions/book-content?action=review-submission", { method: "POST", data: { submissionId: studentRow.submissionId, teacherFeedback: "Hosted E2E feedback" } });
  expect(reviewed.status).toBe(200);

  await context.clearCookies();
  await signIn(page, "student", process.env.E2E_SCHOOL_A_STUDENT1_EMAIL, process.env.E2E_SCHOOL_A_STUDENT_PASSWORD);
  const ownGrades = await api(page, "/.netlify/functions/book-content?action=grades");
  expect(JSON.stringify(ownGrades.body)).toContain("Hosted E2E feedback");

  await context.clearCookies();
  await signIn(page, "student", process.env.E2E_SCHOOL_A_STUDENT2_EMAIL, process.env.E2E_SCHOOL_A_STUDENT_PASSWORD);
  const foreignResults = await api(page, `/.netlify/functions/book-content?action=assignment-results&assignmentId=${assignment.id}`);
  expect(foreignResults.status).toBe(403);
  const tamperedGrades = await api(page, `/.netlify/functions/book-content?action=grades&studentId=${process.env.E2E_SCHOOL_A_STUDENT1_ID}`);
  expect(JSON.stringify(tamperedGrades.body)).not.toContain(studentRow.submissionId);
});
