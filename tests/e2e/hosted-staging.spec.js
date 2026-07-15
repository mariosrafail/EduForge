import { expect, test } from "@playwright/test";

async function signInAsAdmin(page) {
  await page.goto("/#auth-admin");
  await page.getByLabel("Email", { exact: true }).fill(process.env.E2E_ADMIN_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Account security", { exact: true }).first()).toBeVisible();
}

test("admin authentication and account-management shell are tenant-fixed", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/#admin-users");
  await expect(page.getByRole("heading", { name: /users/i }).first()).toBeVisible();
  await expect(page.locator('select[name*="school" i], input[name*="school_id" i]')).toHaveCount(0);
  await expect(page.getByRole("option", { name: /admin/i })).toHaveCount(0);
});

test("account security is reachable and explicit sign out works", async ({ page }) => {
  await signInAsAdmin(page);
  await page.getByText("Account security", { exact: true }).first().click();
  await expect(page.getByRole("heading", { name: /account security/i })).toBeVisible();
  await expect(page.getByLabel(/confirm new password/i)).toBeVisible();
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("forgot-password public messaging does not enumerate accounts", async ({ page }) => {
  const request = async (email) => {
    await page.goto("/#auth-admin");
    await page.getByRole("button", { name: /forgot password/i }).click();
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: /send reset instructions/i }).click();
    return (await page.locator(".inline-status").last().innerText()).trim();
  };
  const known = await request(process.env.E2E_ADMIN_EMAIL);
  const unknown = await request(`unknown-${Date.now()}@qa.invalid`);
  expect(unknown).toBe(known);
});
