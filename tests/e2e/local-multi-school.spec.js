import { expect, test } from "@playwright/test";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { hashToken } from "../../netlify/functions/_auth-utils.js";
import { MULTI_SCHOOL, MULTI_SCHOOL_DEMO_PASSWORD } from "../../scripts/_multi-school-seed-data.mjs";
import { readLocalMultiSchoolMarker } from "../../scripts/_local-multi-school.mjs";
import { ultimateB2StudentsBookTeacherCatalog } from "../../src/data/ultimate-b2/studentsBookCatalog.js";

const marker = readLocalMultiSchoolMarker();
const athens = MULTI_SCHOOL.find((school) => school.key === "athens");
const piraeus = MULTI_SCHOOL.find((school) => school.key === "piraeus");
const onboardingEmail = "password-policy-onboarding@multi-school.dev.invalid";
const onboardingPassword = "Public-Student-Onboarding-2026!";
const emptyMetricsSchoolName = "Empty Metrics School";
const emptyMetricsEmail = "empty-metrics@student.dev.invalid";
const emptyMetricsPassword = "Empty-Metrics-Student-2026!";
const temporaryAthensBrandName = "Athens Branding E2E";
const importedTeacherEmail = "csv-teacher@e2e.example.invalid";
const importedStudentEmails = ["csv-student-one@e2e.example.invalid", "csv-student-two@e2e.example.invalid"];
const importedEmails = [importedTeacherEmail, ...importedStudentEmails];
const importedPassword = "CSV-Imported-Student-2026!";
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
    await pool.query("delete from account_security_events where user_id in (select id from app_users where email=any($1::text[]))", [importedEmails]);
    await pool.query("delete from account_email_outbox where recipient_email=any($1::text[])", [importedEmails]);
    await pool.query("delete from app_users where email=any($1::text[])", [importedEmails]);
    await pool.query("delete from account_security_events where school_id=$1 and event_type='user_csv_import_completed'", [athens.id]);
    await pool.query("delete from app_users where email=$1", [onboardingEmail]);
    await pool.query("delete from schools where name=$1", [emptyMetricsSchoolName]);
    await pool.query(
      "update schools set name=$2,logo=$3,primary_color=$4,secondary_color=$5 where id=$1",
      [athens.id, athens.name, athens.branding.logo, athens.branding.primary, athens.branding.secondary],
    );
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

test("School Admin CSV import previews, commits, persists, isolates tenants, and uses invitation acceptance", async ({ page, context }) => {
  test.setTimeout(150_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    await pool.query("delete from account_security_events where user_id in (select id from app_users where email=any($1::text[]))", [importedEmails]);
    await pool.query("delete from account_email_outbox where recipient_email=any($1::text[])", [importedEmails]);
    await pool.query("delete from app_users where email=any($1::text[])", [importedEmails]);
  } finally {
    await pool.end();
  }

  await signIn(page, "admin", athens.users[0].email);
  await page.goto("/#admin-users", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await expect(page.getByText("Invitation account saved to the database.", { exact: true })).toHaveCount(0);

  const input = page.locator('input[type="file"][accept=".csv,text/csv"]');
  await input.setInputFiles({
    name: "invalid-user-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "full_name,email,role,level",
      `Duplicate One,${importedStudentEmails[0]},Student,B2`,
      `Duplicate Two,${importedStudentEmails[0].toUpperCase()},Teacher,C1`,
    ].join("\n")),
  });
  await expect(page.getByText(/2 duplicate rows/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import 0 invitation accounts" })).toBeDisabled();
  const invalidPool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    expect((await invalidPool.query("select count(*)::int count from app_users where email=any($1::text[])", [importedEmails])).rows[0].count).toBe(0);
  } finally {
    await invalidPool.end();
  }

  await input.setInputFiles({
    name: "valid-user-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "full_name,email,role,level",
      `CSV Example Teacher,${importedTeacherEmail},Teacher,B2`,
      `CSV Example Student One,${importedStudentEmails[0]},Student,A2`,
      `CSV Example Student Two,${importedStudentEmails[1]},Student,`,
    ].join("\r\n")),
  });
  await expect(page.getByText("3 rows: 3 valid and 0 invalid.", { exact: true })).toBeVisible();
  await expect(page.locator(".user-import-preview strong").filter({ hasText: "CSV Example Teacher" })).toBeVisible();
  await expect(page.locator(".user-import-preview strong").filter({ hasText: "CSV Example Student One" })).toBeVisible();
  const beforeCommitPool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    expect((await beforeCommitPool.query("select count(*)::int count from app_users where email=any($1::text[])", [importedEmails])).rows[0].count).toBe(0);
  } finally {
    await beforeCommitPool.end();
  }

  await page.getByRole("button", { name: "Import 3 invitation accounts" }).click();
  await expect(page.locator(".inline-status").getByText("Creating invitation accounts…", { exact: true })).toBeVisible();
  await expect(page.getByText("3 invitation accounts created and 3 invitation emails sent.", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".user-data-table strong").filter({ hasText: "CSV Example Student One" })).toBeVisible();
  await expect(page.locator(".user-data-table").getByText(importedStudentEmails[0], { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".user-data-table").getByText(importedStudentEmails[0], { exact: true })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/#\/?home/);
  await context.clearCookies();
  await signIn(page, "admin", piraeus.users[0].email);
  await page.goto("/#admin-users", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(importedStudentEmails[0], { exact: true })).toHaveCount(0);

  const rawToken = randomBytes(32).toString("base64url");
  const tokenPool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    await tokenPool.query(
      `update account_tokens set token_hash=$2,expires_at=now()+interval '1 day'
       where user_id=(select id from app_users where email=$1) and purpose='initial_password'`,
      [importedStudentEmails[0], hashToken(rawToken)],
    );
  } finally {
    await tokenPool.end();
  }
  await context.clearCookies();
  await page.goto(`/#accept-invitation?token=${encodeURIComponent(rawToken)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Accept invitation" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(importedPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill(importedPassword);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/#\/?student/, { timeout: 15_000 });
  const me = await page.request.get("/.netlify/functions/auth-me");
  expect(me.status()).toBe(200);
  expect((await me.json()).user.school_id).toBe(athens.id);
});

test("Student class-invite onboarding enforces the centralized password policy", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  const invitedClass = athens.classes[0];
  const cleanupPool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    await cleanupPool.query("delete from app_users where email=$1", [onboardingEmail]);
  } finally {
    await cleanupPool.end();
  }

  await page.goto(`/#join-class/${invitedClass.invite}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: `You are joining: ${invitedClass.name}` })).toBeVisible();
  await page.getByRole("button", { name: "Create student account" }).click();

  const createForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Create account", exact: true }) });
  await createForm.getByLabel("Student name").fill("Password Policy Student");
  await createForm.getByLabel("Email").fill(onboardingEmail);
  const passwordInput = createForm.getByLabel("Password");
  await expect(passwordInput).toHaveAttribute("minlength", "10");
  await expect(passwordInput).toHaveAttribute("maxlength", "128");
  await expect(passwordInput).toHaveAttribute("autocomplete", "new-password");
  await expect(page.locator(`#${await passwordInput.getAttribute("aria-describedby")}`)).toContainText("Use 10–128 characters");

  await passwordInput.fill("NineChars");
  await createForm.getByRole("button", { name: "Create account", exact: true }).click();
  expect(await passwordInput.evaluate((input) => input.validationMessage)).not.toBe("");
  await createForm.evaluate((form) => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true })));
  await expect(page.getByText("Password must be at least 10 characters", { exact: true })).toBeVisible();

  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    const count = (await pool.query("select count(*)::int count from app_users where email=$1", [onboardingEmail])).rows[0].count;
    expect(count).toBe(0);
  } finally {
    await pool.end();
  }

  await passwordInput.fill(onboardingPassword);
  await createForm.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: `You are joining: ${invitedClass.name}` })).toBeVisible();
  await expect(page.getByText("You are already in this class.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue to student portal" }).click();
  await expect(page.getByText("Student portal", { exact: true }).first()).toBeVisible();

  const me = await page.request.get("/.netlify/functions/auth-me");
  expect(me.status()).toBe(200);
  const user = (await me.json()).user;
  expect(user.school_id).toBe(athens.id);
  const foreignUser = await page.request.get(`/.netlify/functions/user?id=${piraeus.users[0].id}`);
  expect(foreignUser.status()).toBe(403);

  const membershipPool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    const membership = await membershipPool.query(`
      select count(*)::int count
      from class_students cs join app_users u on u.id=cs.student_id
      where cs.class_id=$1 and u.email=$2 and cs.status='active'
    `, [invitedClass.id, onboardingEmail]);
    expect(membership.rows[0].count).toBe(1);
  } finally {
    await membershipPool.end();
  }

  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await expect(page).toHaveURL(/#\/?home/);
  await signIn(page, "student", onboardingEmail, onboardingPassword);
  await expect(page.getByText("Student portal", { exact: true }).first()).toBeVisible();
});

async function signIn(page, role, email, password = MULTI_SCHOOL_DEMO_PASSWORD) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#auth-${role}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".app-intro-overlay")).toBeHidden();
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in", exact: true }) });
  await form.getByLabel(role === "student" ? "Email or username" : "Email", { exact: true }).fill(email);
  const passwordInput = form.getByLabel("Password", { exact: true });
  await expect(passwordInput).not.toHaveAttribute("minlength");
  await expect(passwordInput).toHaveAttribute("autocomplete", "current-password");
  await passwordInput.fill(password);
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

function countLabel(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
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

test("School Admin branding saves, survives refresh, remains tenant-scoped, and preserves failed drafts", async ({ page, context }) => {
  test.setTimeout(120_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await signIn(page, "admin", athens.users[0].email);
  await page.goto("/#admin-school-setup", { waitUntil: "domcontentloaded" });
  const schoolName = page.getByLabel("School name");
  const logo = page.getByLabel("Logo / mark text");
  const primary = page.getByLabel("Primary color");
  const secondary = page.getByLabel("Secondary color");
  await expect(schoolName).toHaveValue(athens.name, { timeout: 15_000 });
  await expect(logo).toHaveValue(athens.branding.logo);
  await expect(primary).toHaveValue(athens.branding.primary);
  await expect(secondary).toHaveValue(athens.branding.secondary);

  await schoolName.fill(temporaryAthensBrandName);
  await logo.fill("AE");
  await primary.selectOption("#166534");
  await secondary.fill("#223344");
  await expect(page.getByText("Unsaved preview changes", { exact: true })).toBeVisible();
  await expect(page.locator(".portal-preview")).toContainText(temporaryAthensBrandName);
  await expect(page.locator(".app-chrome-brand-copy small")).toHaveText(athens.name);
  await page.getByRole("button", { name: "Save school profile", exact: true }).click();
  await expect(page.getByText("School profile saved.", { exact: true })).toBeVisible();
  await expect(page.locator(".app-chrome-brand-copy small")).toHaveText(temporaryAthensBrandName);
  await expect(page.locator(".eduforge-app")).toHaveCSS("--brand-primary", "#166534");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(schoolName).toHaveValue(temporaryAthensBrandName);
  await expect(primary).toHaveValue("#166534");
  await expect(secondary).toHaveValue("#223344");
  const savedProfile = await page.request.get("/.netlify/functions/school-profile");
  expect((await savedProfile.json()).school.name).toBe(temporaryAthensBrandName);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/#\/?home/);
  await expect(page.locator("body")).not.toContainText(temporaryAthensBrandName);
  await context.clearCookies();
  await signIn(page, "admin", piraeus.users[0].email);
  await page.goto("/#admin-school-setup", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("School name")).toHaveValue(piraeus.name, { timeout: 15_000 });
  await expect(page.locator(".app-chrome-brand-copy small")).toHaveText(piraeus.name);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/#\/?home/);
  await context.clearCookies();
  await signIn(page, "admin", athens.users[0].email);
  await page.goto("/#admin-school-setup", { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("School name")).toHaveValue(temporaryAthensBrandName, { timeout: 15_000 });
  await page.getByLabel("School name").fill(athens.name);
  await page.getByLabel("Logo / mark text").fill(athens.branding.logo);
  await page.getByLabel("Primary color").selectOption(athens.branding.primary);
  await page.getByLabel("Secondary color").fill(athens.branding.secondary);
  await page.getByRole("button", { name: "Save school profile", exact: true }).click();
  await expect(page.getByText("School profile saved.", { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("School name")).toHaveValue(athens.name);

  await page.route("**/.netlify/functions/school-profile", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Rejected E2E branding update" }) });
    } else {
      await route.continue();
    }
  });
  await page.getByLabel("School name").fill("Rejected Branding Draft");
  await page.getByRole("button", { name: "Save school profile", exact: true }).click();
  await expect(page.getByText(/School profile could not be saved.*Rejected E2E branding update/)).toBeVisible();
  await expect(page.getByText("School profile saved.", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("School name")).toHaveValue("Rejected Branding Draft");
  await expect(page.locator(".app-chrome-brand-copy small")).toHaveText(athens.name);
  await page.unroute("**/.netlify/functions/school-profile");
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(page.getByLabel("School name")).toHaveValue(athens.name);

  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    const rows = (await pool.query(
      "select id,name,logo,primary_color,secondary_color from schools where id=any($1::uuid[]) order by id",
      [[athens.id, piraeus.id]],
    )).rows;
    const finalAthens = rows.find((school) => school.id === athens.id);
    const finalPiraeus = rows.find((school) => school.id === piraeus.id);
    expect(finalAthens).toMatchObject({
      name: athens.name,
      logo: athens.branding.logo,
      primary_color: athens.branding.primary,
      secondary_color: athens.branding.secondary,
    });
    expect(finalPiraeus).toMatchObject({
      name: piraeus.name,
      logo: piraeus.branding.logo,
      primary_color: piraeus.branding.primary,
      secondary_color: piraeus.branding.secondary,
    });
  } finally {
    await pool.end();
  }
});

test("Teacher and Student dashboards render only authenticated live metrics, including a true empty account", async ({ page, context }) => {
  test.setTimeout(90_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await signIn(page, "teacher", athens.users[1].email);
  const teacherMetrics = await api(page, "dashboard-metrics");
  expect(teacherMetrics.response.status()).toBe(200);
  const teacher = teacherMetrics.body.metrics;
  await expect(page.locator(".teacher-dashboard-card small")).toHaveText([
    countLabel(teacher.activeBookComponents, "active component"),
    countLabel(teacher.activeClasses, "active class", "active classes"),
    countLabel(teacher.activeStudents, "active student"),
    countLabel(teacher.activeAssignments, "active assignment"),
    "Editor available",
  ]);
  await expect(page.locator("body")).not.toContainText("55 demo students");
  await expect(page.locator("body")).not.toContainText("3 B2 classes");

  await context.clearCookies();
  const strong = athens.users.find((user) => user.profile === "strong");
  await signIn(page, "student", strong.email);
  const studentMetrics = await api(page, "dashboard-metrics");
  expect(studentMetrics.response.status()).toBe(200);
  const student = studentMetrics.body;
  const average = student.metrics.averageScore === null ? "No scored work yet" : `${student.metrics.averageScore}% average`;
  await expect(page.locator(".student-dashboard-card small")).toHaveText([
    countLabel(student.metrics.activeBookComponents, "active component"),
    countLabel(student.metrics.pendingAssignments, "pending assignment"),
    average,
  ]);
  await expect(page.locator(".student-profile-strip")).toContainText(student.profile.primaryClassName);
  await expect(page.locator(".student-profile-strip")).toContainText(student.profile.schoolName);
  await page.locator(".student-dashboard-card").filter({ hasText: "Grades" }).click();
  const summary = page.locator(".student-grade-summary");
  await expect(summary.locator("strong").nth(0)).toHaveText(
    student.metrics.averageScore === null ? "No scored work" : `${student.metrics.averageScore}%`,
  );
  await expect(summary.locator("strong").nth(1)).toHaveText(String(student.metrics.completedAssignments));
  await expect(summary.locator("strong").nth(2)).toHaveText(String(student.metrics.pendingAssignments));
  await expect(page.locator("body")).not.toContainText("78% average");
  await expect(page.locator("body")).not.toContainText("Hamilton House demo");

  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    const schoolId = (await pool.query(
      "insert into schools (name) values ($1) returning id",
      [emptyMetricsSchoolName],
    )).rows[0].id;
    const passwordHash = await bcrypt.hash(emptyMetricsPassword, 4);
    await pool.query(
      `insert into app_users (school_id, full_name, email, role, status, password_hash, auth_provider)
       values ($1, 'Empty Metrics Student', $2, 'student', 'active', $3, 'password')`,
      [schoolId, emptyMetricsEmail, passwordHash],
    );
  } finally {
    await pool.end();
  }

  await context.clearCookies();
  await signIn(page, "student", emptyMetricsEmail, emptyMetricsPassword);
  await expect(page.locator(".student-dashboard-card small")).toHaveText([
    "0 active components",
    "0 pending assignments",
    "No scored work yet",
  ]);
  await expect(page.locator(".student-profile-strip")).toContainText(emptyMetricsSchoolName);
  await expect(page.locator(".student-profile-strip")).toContainText("Active account");
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
  await expect(page.locator("body")).not.toContainText("11/16 submitted");
  await expect(page.locator("body")).not.toContainText("Assigned to 2 classes");
  await expect(page.locator("body")).not.toContainText("Teacher feedback ready");
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
    && !(label.includes("action=dashboard-metrics") && errorText === "net::ERR_ABORTED")
    && !(label.includes("/school-profile") && errorText === "net::ERR_ABORTED")
  ));
  expect(nonOptionalFailures).toEqual([]);
  const requestCounts = Object.values(Object.groupBy(failedRequests, (request) => request.label)).map((items) => items.length);
  expect(Math.max(0, ...requestCounts)).toBeLessThanOrEqual(4);
});
