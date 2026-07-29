import { expect, test } from "@playwright/test";
import pg from "pg";
import { MULTI_SCHOOL, MULTI_SCHOOL_DEMO_PASSWORD } from "../../scripts/_multi-school-seed-data.mjs";
import { readLocalMultiSchoolMarker } from "../../scripts/_local-multi-school.mjs";
import { ultimateB2StudentsBookTeacherCatalog } from "../../src/data/ultimate-b2/studentsBookCatalog.js";

const marker = readLocalMultiSchoolMarker();
const athens = MULTI_SCHOOL.find((school) => school.key === "athens");
const piraeus = MULTI_SCHOOL.find((school) => school.key === "piraeus");
const visibleB2Components = ["ultimate-b2-students-book", "ultimate-b2-workbook"];
const visibleComponentsByPackage = {
  "ultimate-b1": ["ultimate-b1-students-book", "ultimate-b1-workbook"],
  "ultimate-b1-plus": ["ultimate-b1-plus-students-book", "ultimate-b1-plus-workbook"],
  "ultimate-b2": visibleB2Components,
};

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
    await pool.query("delete from auth_login_attempts");
  } finally {
    await pool.end();
  }
});

async function signIn(page, role, email) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#auth-${role}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-intro-overlay")).toBeHidden();
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

test("ordinary Student sign-in, sign-out, and clean reauthentication remain functional", async ({ page }) => {
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  const student = athens.users.find((user) => user.profile === "strong");
  await signIn(page, "student", student.email);
  const signOut = page.getByRole("button", { name: "Sign out", exact: true }).first();
  await expect(signOut).toBeVisible();
  await signOut.click();
  await expect(page).toHaveURL(/#\/?home/);
  await signIn(page, "student", student.email);
  await expect(page.getByRole("button", { name: "Sign out", exact: true }).first()).toBeVisible();
});

test("ordinary LMS shell is responsive, keyboard-safe, and shared by every role", async ({ page, context }) => {
  test.setTimeout(90_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await page.goto("/#home", { waitUntil: "domcontentloaded" });
  for (const role of ["School Admin", "Teacher", "Student"]) {
    await expect(page.locator(".role-entry").getByRole("heading", { name: role })).toBeVisible();
  }

  const cases = [
    { role: "student", email: athens.users.find((user) => user.profile === "strong").email, title: "Student portal", section: "Assignments", width: 390, height: 844 },
    { role: "teacher", email: athens.users[1].email, title: "Teacher portal", section: "Classes", width: 768, height: 1024 },
    { role: "admin", email: athens.users[0].email, title: "School Admin", section: "Users", width: 1024, height: 768 },
  ];

  for (const entry of cases) {
    await context.clearCookies();
    await page.setViewportSize({ width: entry.width, height: entry.height });
    await signIn(page, entry.role, entry.email);

    const trigger = page.getByRole("button", { name: `Open ${entry.title} navigation` });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const drawer = page.getByRole("dialog", { name: `${entry.title} navigation` });
    await expect(drawer).toBeVisible();
    await expect(drawer.locator("[aria-current='page']")).toBeFocused();
    const activeDrawerIcon = drawer.locator("[aria-current='page'] .app-chrome-nav-icon");
    await expect(activeDrawerIcon).toHaveCSS("width", "38px");
    await expect(activeDrawerIcon).toHaveCSS("height", "38px");
    expect(await activeDrawerIcon.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("linear-gradient");
    expect(await page.locator(".app-chrome-drawer").count()).toBe(1);
    expect(await page.locator(".mobile-nav-drawer, .portal-mobile-drawer").count()).toBe(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await drawer.getByRole("button", { name: new RegExp(`^${entry.section}`) }).click();
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const adminTrigger = page.getByRole("button", { name: "Open School Admin navigation" });
  await adminTrigger.click();
  const adminDrawer = page.getByRole("dialog", { name: "School Admin navigation" });
  const drawerButtons = adminDrawer.locator("button");
  await drawerButtons.first().focus();
  await page.keyboard.press("Shift+Tab");
  await expect(drawerButtons.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(drawerButtons.first()).toBeFocused();
  await page.locator(".app-chrome-drawer-backdrop").click({ position: { x: 380, y: 400 } });
  await expect(adminDrawer).toBeHidden();
  await expect(adminTrigger).toBeFocused();
  await adminTrigger.click();
  await page.keyboard.press("Escape");
  await expect(adminDrawer).toBeHidden();
  await expect(adminTrigger).toBeFocused();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await adminTrigger.click();
  const reducedMotionDrawer = page.getByRole("dialog", { name: "School Admin navigation" });
  await expect(reducedMotionDrawer).toBeVisible();
  await reducedMotionDrawer.getByRole("button", { name: "Close navigation", exact: true }).click();

  const soundButton = page.getByRole("button", { name: "Sound controls" });
  await expect(soundButton).toBeVisible();
  await soundButton.click();
  const soundDialog = page.getByRole("dialog", { name: "Sound controls" });
  await expect(soundDialog.getByLabel("Sound volume")).toBeVisible();
  await soundDialog.getByLabel("Sound volume").fill("0.65");
  await page.keyboard.press("Escape");
  await expect(soundDialog).toBeHidden();
  await expect(soundButton).toBeFocused();
  await expect(page.getByRole("button", { name: "Account security" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Return to role selection" }).click();
  await expect(page.locator(".role-entry")).toHaveCount(3);
  await signIn(page, "admin", athens.users[0].email);

  const shell = page.locator(".app-chrome");
  const sidebar = page.locator(".app-chrome-rail");
  const main = page.locator(".app-chrome-main");
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await main.hover();
    await page.waitForTimeout(520);
    await expect(shell).toHaveClass(/is-rail-collapsed/);
    await expect(sidebar).toHaveCSS("position", "fixed");
    await expect(sidebar).toHaveCSS("width", "78px");
    const collapsedLayout = await page.evaluate(() => ({
      mainLeft: document.querySelector(".app-chrome-main")?.getBoundingClientRect().left,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    expect(collapsedLayout.mainLeft).toBeGreaterThanOrEqual(78);
    expect(collapsedLayout.pageOverflow).toBeFalsy();

    await sidebar.hover();
    await expect(shell).toHaveClass(/is-rail-expanded/);
    await expect(sidebar).toHaveCSS("width", "276px");
    const expandedLayout = await page.evaluate(() => ({
      mainLeft: document.querySelector(".app-chrome-main")?.getBoundingClientRect().left,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    expect(expandedLayout.mainLeft).toBeGreaterThanOrEqual(276);
    expect(expandedLayout.pageOverflow).toBeFalsy();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await sidebar.hover();
  await expect(shell).toHaveClass(/is-rail-expanded/);
  await main.hover();
  await page.waitForTimeout(100);
  await expect(shell).toHaveClass(/is-rail-expanded/);
  await page.waitForTimeout(200);
  await expect(shell).toHaveClass(/is-rail-collapsed/);
  await page.locator(".app-chrome-navigation.is-desktop button").first().focus();
  await expect(shell).toHaveClass(/is-rail-expanded/);
});

test("real multi-school roles, workflows, licensing, and isolation", async ({ page, context }) => {
  test.setTimeout(90_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => message.type() === "error" && consoleErrors.push(message.text()));
  page.on("requestfailed", (request) => failedRequests.push({
    label: `${request.method()} ${request.url()}`,
    errorText: request.failure()?.errorText || "",
  }));

  await signIn(page, "admin", athens.users[0].email);
  await page.goto("/#admin-users");
  await expect(page.getByText(athens.users.find((user) => user.profile === "strong").name).first()).toBeVisible();
  const users = await page.request.get("/.netlify/functions/users");
  expect((await users.json()).users).toHaveLength(11);
  const hiddenPiraeusUser = await page.request.get(`/.netlify/functions/user?id=${piraeus.users[0].id}`);
  expect(hiddenPiraeusUser.status()).toBe(404);
  const adminCatalog = await api(page, "list");
  expect(adminCatalog.body.bookPackages.map((item) => item.slug)).toEqual(["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"]);
  for (const [slug, expectedComponents] of Object.entries(visibleComponentsByPackage)) {
    const adminTree = await api(page, "", { query: { slug } });
    expect(adminTree.body.bookPackage.components.map((item) => item.slug)).toEqual(expectedComponents);
  }
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
  const teacherB2Tree = await api(page, "", { query: { slug: "ultimate-b2" } });
  expect(teacherB2Tree.response.ok()).toBeTruthy();
  expect(teacherB2Tree.body.bookPackage.components.map((item) => item.slug)).toEqual(visibleB2Components);
  for (const slug of ["ultimate-b2-grammar-book", "ultimate-b2-test-book"]) {
    const hiddenComponent = await api(page, "component", {
      query: { packageSlug: "ultimate-b2", slug },
    });
    expect(hiddenComponent.response.status()).toBe(404);
  }
  await page.goto("/#teacher/books/ultimate-b2", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".book-component-card")).toHaveCount(2);
  await expect(page.getByText("Ultimate B2 Students Book", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ultimate B2 Workbook", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ultimate B2 Grammar Book", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ultimate B2 Test Book", { exact: true })).toHaveCount(0);
  await page.goto("/#teacher/books/ultimate-b2/components/ultimate-b2-workbook", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Ultimate B2 Workbook", exact: true })).toBeVisible();
  for (const slug of ["ultimate-b2-grammar-book", "ultimate-b2-test-book"]) {
    await page.goto(`/#teacher/books/ultimate-b2/components/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "This page link is not available." })).toBeVisible();
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
  const enabledPresentationActivity = ultimateB2StudentsBookTeacherCatalog.units
    .flatMap((unit) => unit.lessons)
    .flatMap((lesson) => lesson.exercises)
    .find((activity) => activity.availability !== "disabled");
  const teacherSolution = await api(page, "teacher-activity-solutions", {
    query: { stableActivityId: enabledPresentationActivity.stableActivityId },
  });
  expect(teacherSolution.response.ok()).toBeTruthy();
  expect(teacherSolution.body.solution.activityId).toBe(enabledPresentationActivity.stableActivityId);
  await page.goto(`/#teacher/books/ultimate-b2/components/students-book/activities/${enabledPresentationActivity.stableActivityId}/presentation`);
  await expect(page.getByText("Teacher presentation", { exact: true }).first()).toBeVisible();

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
  for (const [slug, expectedComponents] of Object.entries(visibleComponentsByPackage)) {
    const studentPackage = await api(page, "", { query: { slug } });
    expect(studentPackage.body.bookPackage.components.map((item) => item.slug)).toEqual(expectedComponents);
  }
  const grades = await api(page, "grades");
  const reviewedGrade = grades.body.grades.find((grade) => grade.id === pending.submissionId);
  expect(reviewedGrade.scorePercent).toBe(83);
  expect(reviewedGrade.teacherFeedback).toBe("Focused evidence and a clear final response.");
  const studentTree = await api(page, "", { query: { slug: "ultimate-b2" } });
  expect(studentTree.body.bookPackage.components.map((item) => item.slug)).toEqual(visibleB2Components);
  expect(JSON.stringify(studentTree.body)).not.toContain("acceptedAnswers");
  expect(JSON.stringify(studentTree.body)).not.toContain("correctAnswers");
  const solutionDenied = await api(page, "teacher-activity-solutions", { query: { activitySlug: benchmark.activitySlug } });
  expect(solutionDenied.response.status()).toBe(403);
  const disabledActivity = ultimateB2StudentsBookTeacherCatalog.units
    .flatMap((unit) => unit.lessons)
    .flatMap((lesson) => lesson.exercises)
    .find((activity) => activity.availability === "disabled");
  expect(disabledActivity).toBeTruthy();
  await page.goto("/#courses/ultimate-b2/components", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".book-component-card")).toHaveCount(2);
  await expect(page.getByText("Ultimate B2 Grammar Book", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ultimate B2 Test Book", { exact: true })).toHaveCount(0);
  for (const slug of ["ultimate-b2-grammar-book", "ultimate-b2-test-book"]) {
    await page.goto(`/#courses/ultimate-b2/components/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "This page link is not available." })).toBeVisible();
  }
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
  const nonOptionalFailures = failedRequests.filter(({ label, errorText }) => (
    !label.includes("/assets/sounds/")
    && !(label.includes("action=asset-access") && errorText === "net::ERR_ABORTED")
  ));
  expect(nonOptionalFailures).toEqual([]);
  const requestCounts = Object.values(Object.groupBy(failedRequests, (request) => request.label)).map((items) => items.length);
  expect(Math.max(0, ...requestCounts)).toBeLessThanOrEqual(4);
});
