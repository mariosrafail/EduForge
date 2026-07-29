import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  MULTI_SCHOOL,
  MULTI_SCHOOL_DEMO_PASSWORD,
  MULTI_SCHOOL_PLATFORM_ADMIN,
  MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD,
} from "../../scripts/_multi-school-seed-data.mjs";
import { readLocalMultiSchoolMarker } from "../../scripts/_local-multi-school.mjs";

const marker = readLocalMultiSchoolMarker();
const athens = MULTI_SCHOOL.find((school) => school.key === "athens");
const reviewDirectory = process.env.APP_CHROME_REVIEW_DIR || "";
const reviewViewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

async function signInOrdinary(page, role, email) {
  await page.goto(`/#auth-${role}`, { waitUntil: "domcontentloaded" });
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Sign in", exact: true }) });
  await form.getByLabel(role === "student" ? "Email or username" : "Email", { exact: true }).fill(email);
  await form.getByLabel("Password", { exact: true }).fill(MULTI_SCHOOL_DEMO_PASSWORD);
  await form.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".app-chrome")).toBeVisible();
}

async function signInPlatform(page) {
  await page.goto("/platform-admin/", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(MULTI_SCHOOL_PLATFORM_ADMIN.email);
  await page.getByLabel("Password").fill(MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator(".app-chrome")).toBeVisible();
}

const rounded = (box) => Object.fromEntries(
  Object.entries(box).map(([key, value]) => [key, Math.round(value * 10) / 10]),
);

async function measureChrome(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const shell = page.locator(".app-chrome");
  const topbar = page.locator(".app-chrome-topbar");
  const brand = page.locator(".app-chrome-brand-mark");
  const rail = page.locator(".app-chrome-rail");
  const main = page.locator(".app-chrome-main");
  const row = page.locator(".app-chrome-navigation.is-desktop .app-chrome-nav-item").first();
  const icon = row.locator(".app-chrome-nav-icon");

  await topbar.hover();
  await page.waitForTimeout(520);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(shell).toHaveClass(/is-rail-collapsed/);
  const collapsed = {
    shell: {
      box: rounded(await shell.boundingBox()),
      paddingTop: await shell.evaluate((node) => getComputedStyle(node).paddingTop),
    },
    topbar: rounded(await topbar.boundingBox()),
    brand: rounded(await brand.boundingBox()),
    rail: rounded(await rail.boundingBox()),
    main: rounded(await main.boundingBox()),
    row: rounded(await row.boundingBox()),
    icon: rounded(await icon.boundingBox()),
    radius: await topbar.evaluate((node) => getComputedStyle(node).borderRadius),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  };

  await rail.hover();
  await expect(shell).toHaveClass(/is-rail-expanded/);
  await expect(rail).toHaveCSS("width", "276px");
  const expanded = {
    rail: rounded(await rail.boundingBox()),
    main: rounded(await main.boundingBox()),
    row: rounded(await row.boundingBox()),
    icon: rounded(await icon.boundingBox()),
    overflow: await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
  };
  return { collapsed, expanded };
}

function assertGeometry(result, viewport) {
  expect(result.collapsed.topbar).toEqual({ x: 0, y: 0, width: viewport.width, height: 68 });
  expect(result.collapsed.brand.width).toBe(42);
  expect(result.collapsed.brand.height).toBe(42);
  expect(result.collapsed.rail).toEqual({ x: 0, y: 68, width: 78, height: viewport.height - 68 });
  expect(result.collapsed.main.y).toBe(68);
  expect(result.collapsed.main.x).toBe(78);
  expect(result.collapsed.row.height).toBeGreaterThanOrEqual(58);
  expect(result.collapsed.icon.width).toBe(38);
  expect(result.collapsed.icon.height).toBe(38);
  expect(result.collapsed.radius).toBe("0px");
  expect(result.collapsed.overflow).toBeFalsy();
  expect(result.expanded.rail).toEqual({ x: 0, y: 68, width: 276, height: viewport.height - 68 });
  expect(result.expanded.main.x).toBe(276);
  expect(result.expanded.row.height).toBeGreaterThanOrEqual(58);
  expect(result.expanded.icon.width).toBe(38);
  expect(result.expanded.icon.height).toBe(38);
  expect(result.expanded.overflow).toBeFalsy();
}

test("shared chrome has exact Platform Admin and ordinary portal geometry", async ({ page, context }) => {
  test.setTimeout(150_000);
  test.skip(!marker, "Requires npm run demo:multi-school:setup");
  const cases = [
    { name: "Student", signIn: () => signInOrdinary(page, "student", athens.users.find((user) => user.profile === "strong").email) },
    { name: "Teacher", signIn: () => signInOrdinary(page, "teacher", athens.users[1].email) },
    { name: "School Admin", signIn: () => signInOrdinary(page, "admin", athens.users[0].email) },
    { name: "Platform Admin", signIn: () => signInPlatform(page) },
  ];
  const measurements = {};
  if (reviewDirectory) await mkdir(reviewDirectory, { recursive: true });

  for (const entry of cases) {
    await context.clearCookies();
    await page.setViewportSize({ width: 1440, height: 900 });
    await entry.signIn();
    measurements[entry.name] = { "1440x900": await measureChrome(page) };
    console.log(`APP_CHROME_CASE ${entry.name} ${JSON.stringify(measurements[entry.name]["1440x900"])}`);
    assertGeometry(measurements[entry.name]["1440x900"], { width: 1440, height: 900 });

    await page.setViewportSize({ width: 1366, height: 768 });
    measurements[entry.name]["1366x768"] = await measureChrome(page);
    assertGeometry(measurements[entry.name]["1366x768"], { width: 1366, height: 768 });

    if (reviewDirectory) {
      for (const viewport of reviewViewports) {
        await page.setViewportSize(viewport);
        await page.locator(".app-chrome-topbar").hover();
        await page.waitForTimeout(520);
        await page.evaluate(() => window.scrollTo(0, 0));
        const filename = `${entry.name.toLowerCase().replaceAll(" ", "-")}-${viewport.width}x${viewport.height}.png`;
        await page.screenshot({ path: path.join(reviewDirectory, filename) });
        if (viewport.width === 390) {
          await page.getByRole("button", { name: /Open .*navigation/ }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.waitForTimeout(250);
          await page.screenshot({ path: path.join(reviewDirectory, filename.replace(".png", "-drawer.png")) });
          await page.keyboard.press("Escape");
        }
      }
    }
  }

  console.log(`APP_CHROME_GEOMETRY ${JSON.stringify(measurements)}`);
});
