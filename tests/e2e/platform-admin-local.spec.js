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

const marker = readLocalMultiSchoolMarker();
const temporarySchoolName = "Platform E2E Fictional School";
const temporaryAdminEmail = "platform-e2e-admin@multi-school.dev.invalid";
let temporarySchoolId = null;
let temporaryAdminId = null;

async function control(page, action, body) {
  const response = await page.request.post(`/platform-admin/api/control?action=${action}`, {
    data: body,
    headers: { Origin: marker?.baseURL || "http://127.0.0.1:8888" },
  });
  return { response, body: await response.json() };
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
    if (school) await pool.query("delete from schools where id=$1 and name=$2", [school, temporarySchoolName]);
  } finally {
    await pool.end();
    temporarySchoolId = null;
    temporaryAdminId = null;
  }
});

test("Platform Admin local control-plane walkthrough and session separation", async ({ page, browser }) => {
  test.setTimeout(120_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");

  await page.goto("/platform-admin/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "EduForge Platform Administration" })).toBeVisible();
  await page.getByLabel("Email").fill(MULTI_SCHOOL[0].users[0].email);
  await page.getByLabel("Password").fill(MULTI_SCHOOL_DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password");

  await page.getByLabel("Email").fill(MULTI_SCHOOL_PLATFORM_ADMIN.email);
  await page.getByLabel("Password").fill(MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Privileged area")).toBeVisible();

  const ordinaryMeBeforeLogin = await page.request.get("/.netlify/functions/auth-me");
  expect(ordinaryMeBeforeLogin.status()).toBe(401);

  await page.getByRole("button", { name: "Schools", exact: true }).click();
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

  await page.getByRole("button", { name: "Audit log" }).click();
  for (const action of ["school_created", "ordinary_user_invited", "school_paused", "school_reactivated", "ordinary_sessions_revoked"]) {
    await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  const normalContext = await browser.newContext({ baseURL: marker.baseURL });
  const normalPage = await normalContext.newPage();
  await normalPage.goto("/", { waitUntil: "domcontentloaded" });
  await expect(normalPage.locator('a[href*="/platform-admin"], button:has-text("Platform Administration")')).toHaveCount(0);
  await normalContext.close();
});
