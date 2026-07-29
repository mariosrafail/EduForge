import { expect, test } from "@playwright/test";
import pg from "pg";
import bcrypt from "bcryptjs";
import {
  MULTI_SCHOOL,
  MULTI_SCHOOL_DEMO_PASSWORD,
  MULTI_SCHOOL_PLATFORM_ADMIN,
  MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD,
} from "../../scripts/_multi-school-seed-data.mjs";
import { readLocalMultiSchoolMarker } from "../../scripts/_local-multi-school.mjs";
import { setSqlForTests } from "../../netlify/functions/_auth-utils.js";
import { handler as platformAuthHandler } from "../../netlify/functions/platform-admin-auth.js";

const marker = readLocalMultiSchoolMarker();
const temporarySchoolName = "Platform E2E Fictional School";
const temporaryAdminEmail = "platform-e2e-admin@multi-school.dev.invalid";
let temporarySchoolId = null;
let temporaryAdminId = null;

function databaseTag(pool) {
  const queryTemplate = (queryable) => async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await queryable.query(text, values)).rows;
  };
  const template = queryTemplate(pool);
  template.authLoginTransaction = async (lockValues, callback) => {
    const client = await pool.connect();
    const transactionSql = queryTemplate(client);
    try {
      await client.query("begin");
      await transactionSql`
        select pg_advisory_xact_lock(lock_key)
        from (
          select distinct hashtextextended(value, 0) as lock_key
          from unnest(${lockValues}::text[]) value
        ) locks
        order by lock_key
      `;
      const result = await callback(transactionSql);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };
  return template;
}

async function control(page, action, body) {
  const response = await page.request.post(`/platform-admin/api/control?action=${action}`, {
    data: body,
    headers: { Origin: marker?.baseURL || "http://127.0.0.1:8888" },
  });
  return { response, body: await response.json() };
}

async function signInPlatform(page) {
  await page.getByLabel("Email").fill(MULTI_SCHOOL_PLATFORM_ADMIN.email);
  await page.getByLabel("Password").fill(MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Restricted operator area")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

async function navigatePlatform(page, label) {
  const target = page.getByRole("button", { name: label, exact: true });
  if (!await target.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Open Platform Administration navigation" }).click();
  }
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/platform-admin/${label === "Book access" ? "access" : label === "Audit log" ? "audit" : label.toLowerCase()}$`));
}

test.afterEach(async () => {
  if (!marker) return;
  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    const school = temporarySchoolId || (await pool.query("select id from schools where name=$1", [temporarySchoolName])).rows[0]?.id;
    const user = temporaryAdminId || (await pool.query("select id from app_users where email=$1", [temporaryAdminEmail])).rows[0]?.id;
    const targetIds = [school, user].filter(Boolean).map(String);
    if (targetIds.length) {
      await pool.query("delete from platform_admin_audit_log where target_id=any($1::text[]) or target_school_id=$2", [targetIds, school || null]);
    }
    await pool.query("delete from platform_admin_login_attempts");
    await pool.query(`
      delete from platform_admin_audit_log
      where action in ('login_pair_rate_limited','login_source_rate_limited','login_account_risk_detected')
    `);
    if (school) await pool.query("delete from schools where id=$1 and name=$2", [school, temporarySchoolName]);
  } finally {
    await pool.end();
    temporarySchoolId = null;
    temporaryAdminId = null;
  }
});

test("account-wide pressure cannot lock out a Platform Admin with the correct password", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await page.goto("/platform-admin/", { waitUntil: "domcontentloaded" });
  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  const previousSalt = process.env.PLATFORM_ADMIN_RATE_LIMIT_SALT;
  const previousConfirmation = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.PLATFORM_ADMIN_RATE_LIMIT_SALT = "local-multi-school-platform-admin-rate-limit-only";
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  setSqlForTests(databaseTag(pool));
  try {
    for (let index = 0; index < 20; index += 1) {
      const response = await platformAuthHandler({
        httpMethod: "POST",
        headers: {
          host: "127.0.0.1:8888",
          origin: marker.baseURL,
          "x-nf-client-connection-ip": `127.20.0.${index + 1}`,
        },
        queryStringParameters: { action: "login" },
        rawQuery: "action=login",
        body: JSON.stringify({
          email: MULTI_SCHOOL_PLATFORM_ADMIN.email,
          password: "Definitely-Wrong-Platform-Password!",
        }),
      });
      expect(response.statusCode).toBe(index === 19 ? 429 : 401);
    }
  } finally {
    setSqlForTests(null);
    if (previousSalt === undefined) delete process.env.PLATFORM_ADMIN_RATE_LIMIT_SALT;
    else process.env.PLATFORM_ADMIN_RATE_LIMIT_SALT = previousSalt;
    if (previousConfirmation === undefined) delete process.env.TEST_DATABASE_CONFIRMATION;
    else process.env.TEST_DATABASE_CONFIRMATION = previousConfirmation;
    await pool.end();
  }

  await signInPlatform(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await signInPlatform(page);
});

test("Platform Admin local control-plane walkthrough and session separation", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/platform-admin/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "EduForge Platform Administration" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("platform-admin-desktop-login.png"), fullPage: true });
  await page.getByLabel("Email").fill(MULTI_SCHOOL[0].users[0].email);
  await page.getByLabel("Password").fill(MULTI_SCHOOL_DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password");

  await signInPlatform(page);
  const platformFailures = [];
  page.on("response", (response) => {
    if (response.url().includes("/platform-admin/api/") && response.status() >= 400) {
      platformFailures.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.screenshot({ path: testInfo.outputPath("platform-admin-desktop-overview.png"), fullPage: true });

  const ordinaryMeBeforeLogin = await page.request.get("/.netlify/functions/auth-me");
  expect(ordinaryMeBeforeLogin.status()).toBe(401);

  for (const [label, filename] of [["Schools", "schools"], ["Users", "users"], ["Classes", "classes"], ["Book access", "book-access"], ["Audit log", "audit-log"]]) {
    await navigatePlatform(page, label);
    await page.screenshot({ path: testInfo.outputPath(`platform-admin-desktop-${filename}.png`), fullPage: true });
  }

  await navigatePlatform(page, "Schools");
  for (const school of MULTI_SCHOOL) await expect(page.getByRole("button", { name: school.name })).toBeVisible();
  await page.getByRole("button", { name: MULTI_SCHOOL[0].name }).click();
  await expect(page.getByText(/1 admins · 2 teachers · 8 students · 3 classes/)).toBeVisible();
  await page.getByRole("button", { name: "← All schools" }).click();
  await page.getByRole("button", { name: MULTI_SCHOOL[1].name }).click();
  await expect(page.getByText(/1 admins · 2 teachers · 8 students · 3 classes/)).toBeVisible();
  await page.getByRole("button", { name: "← All schools" }).click();

  await page.getByLabel("New school name").fill(temporarySchoolName);
  await page.getByRole("button", { name: "Create school" }).click();
  await expect(page.getByRole("button", { name: temporarySchoolName })).toBeVisible();
  const schoolRows = await page.request.get(`/platform-admin/api/control?action=schools&search=${encodeURIComponent(temporarySchoolName)}`);
  temporarySchoolId = (await schoolRows.json()).schools[0].id;

  const invited = await control(page, "create-user", {
    school_id: temporarySchoolId,
    full_name: "Platform E2E School Admin",
    email: temporaryAdminEmail,
    role: "admin",
  });
  expect(invited.response.status()).toBe(201);
  temporaryAdminId = invited.body.user.id;

  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  const temporaryPassword = "Platform-E2E-Ordinary-2026!";
  try {
    const passwordHash = await bcrypt.hash(temporaryPassword, 12);
    await pool.query(`
      update app_users set password_hash=$2,status='active',password_set_at=now(),invitation_accepted_at=now()
      where id=$1
    `, [temporaryAdminId, passwordHash]);
    await pool.query("update account_tokens set revoked_at=now() where user_id=$1 and revoked_at is null", [temporaryAdminId]);
  } finally {
    await pool.end();
  }

  expect((await control(page, "school-status", { id: temporarySchoolId, status: "paused" })).response.ok()).toBeTruthy();
  const ordinaryContext = await browser.newContext({ baseURL: marker.baseURL });
  const ordinaryPage = await ordinaryContext.newPage();
  const pausedLogin = await ordinaryPage.request.post("/.netlify/functions/auth-signin", { data: { email: temporaryAdminEmail, password: temporaryPassword } });
  expect(pausedLogin.status()).toBe(403);

  expect((await control(page, "school-status", { id: temporarySchoolId, status: "active" })).response.ok()).toBeTruthy();
  const restoredLogin = await ordinaryPage.request.post("/.netlify/functions/auth-signin", { data: { email: temporaryAdminEmail, password: temporaryPassword } });
  expect(restoredLogin.status()).toBe(200);
  expect((await ordinaryPage.request.get("/.netlify/functions/auth-me")).status()).toBe(200);
  expect((await control(page, "revoke-user-sessions", { id: temporaryAdminId })).response.ok()).toBeTruthy();
  expect((await ordinaryPage.request.get("/.netlify/functions/auth-me")).status()).toBe(401);
  await ordinaryContext.close();

  await navigatePlatform(page, "Audit log");
  for (const action of ["school_created", "ordinary_user_invited", "school_paused", "school_reactivated", "ordinary_sessions_revoked"]) {
    await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.getByRole("button", { name: "Open Platform Administration navigation" }).click();
  const mobileNavigation = page.getByRole("dialog", { name: "Platform Administration navigation" });
  await expect(mobileNavigation).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mobileNavigation).toHaveCount(0);
  for (const [label, filename] of [["Overview", "overview"], ["Schools", "schools"], ["Users", "users"], ["Book access", "book-access"], ["Audit log", "audit-log"]]) {
    await navigatePlatform(page, label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath(`platform-admin-tablet-${filename}.png`), fullPage: true });
  }
  expect(platformFailures).toEqual([]);

  const normalContext = await browser.newContext({ baseURL: marker.baseURL });
  const normalPage = await normalContext.newPage();
  await normalPage.goto("/", { waitUntil: "domcontentloaded" });
  await expect(normalPage.locator('a[href*="/platform-admin"], button:has-text("Platform Administration")')).toHaveCount(0);
  await normalContext.close();
});

test("revoked privileged session clears all loaded data and recovers through login", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await page.goto("/platform-admin/", { waitUntil: "domcontentloaded" });
  await signInPlatform(page);
  await navigatePlatform(page, "Schools");
  await expect(page.getByRole("button", { name: MULTI_SCHOOL[0].name })).toBeVisible();

  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    await pool.query("update platform_admin_sessions set revoked_at=now() where platform_admin_id=$1 and revoked_at is null", [MULTI_SCHOOL_PLATFORM_ADMIN.id]);
  } finally {
    await pool.end();
  }

  let controlRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/platform-admin/api/control")) controlRequests += 1;
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("Your privileged session expired. Sign in again.")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByText(MULTI_SCHOOL[0].name)).toHaveCount(0);
  await expect(page).toHaveURL(/\/platform-admin\/$/);
  await page.waitForTimeout(500);
  expect(controlRequests).toBe(1);

  await signInPlatform(page);
  await expect(page.getByText("Your privileged session expired. Sign in again.")).toHaveCount(0);
});

test("reload after database-style session invalidation shows no stale dashboard and allows re-login", async ({ page }) => {
  test.setTimeout(60_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await page.goto("/platform-admin/", { waitUntil: "domcontentloaded" });
  await signInPlatform(page);
  await navigatePlatform(page, "Users");
  await expect(page.getByText(MULTI_SCHOOL[0].users[0].email)).toBeVisible();

  const pool = new pg.Pool({ connectionString: marker.databaseUrl });
  try {
    await pool.query("delete from platform_admin_sessions where platform_admin_id=$1", [MULTI_SCHOOL_PLATFORM_ADMIN.id]);
  } finally {
    await pool.end();
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByText(MULTI_SCHOOL[0].users[0].email)).toHaveCount(0);
  await signInPlatform(page);
  for (const label of ["Overview", "Schools", "Users", "Classes", "Book access", "Audit log"]) {
    await navigatePlatform(page, label);
  }
});

test("invalid Origin remains 403 without destroying the valid session, and host cookies stay isolated", async ({ page, browser }) => {
  test.setTimeout(60_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await page.goto("/platform-admin/", { waitUntil: "domcontentloaded" });
  await signInPlatform(page);
  const forbidden = await page.request.post("/platform-admin/api/control?action=create-school", {
    data: { name: "Forbidden Origin School" },
    headers: { Origin: "https://invalid-origin.example" },
  });
  expect(forbidden.status()).toBe(403);
  expect((await page.request.get("/platform-admin/api/auth?action=me")).status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  const localhostContext = await browser.newContext({ baseURL: "http://localhost:8888" });
  const localhostPage = await localhostContext.newPage();
  await localhostPage.goto("/platform-admin/", { waitUntil: "domcontentloaded" });
  await expect(localhostPage.getByLabel("Email")).toBeVisible();
  await expect(localhostPage.getByText(MULTI_SCHOOL[0].name)).toHaveCount(0);
  await localhostContext.close();
});

test("Platform Administration remains page-overflow free across required desktop and tablet viewports", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await page.goto("/platform-admin/", { waitUntil: "domcontentloaded" });
  await signInPlatform(page);
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const label of ["Overview", "Schools", "Users", "Classes", "Book access", "Audit log"]) {
      await navigatePlatform(page, label);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
    }
  }
});
