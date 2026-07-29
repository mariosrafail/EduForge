import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = await Promise.all([
  readFile("database/028_platform_administration.sql", "utf8"),
  readFile("netlify/functions/_platform-admin-auth.js", "utf8"),
  readFile("netlify/functions/platform-admin.js", "utf8"),
  readFile("netlify/functions/platform-admin-auth.js", "utf8"),
  readFile("netlify/functions/_auth-utils.js", "utf8"),
  readFile("netlify/functions/auth-signin.js", "utf8"),
  readFile("vite.config.js", "utf8"),
  readFile("netlify.toml", "utf8"),
  readFile("src/apps/platform-admin/platformAdminApi.js", "utf8"),
  readFile("src/apps/platform-admin/PlatformAdminApp.jsx", "utf8"),
  Promise.all([
    "foundation.css", "shell.css", "components.css", "sections.css", "responsive.css",
  ].map((file) => readFile(`src/apps/platform-admin/styles/${file}`, "utf8"))).then((styles) => styles.join("\n")),
  readFile("src/apps/platform-admin/components/PlatformAdminShell.jsx", "utf8"),
  readFile("src/apps/platform-admin/components/PlatformUi.jsx", "utf8"),
  readFile("src/apps/platform-admin/platformAdminNavigation.js", "utf8"),
  readFile("src/apps/lms/LmsApp.jsx", "utf8"),
  readFile("src/components/lms/AuthPage.jsx", "utf8").catch(() => ""),
]);
const [
  migration, platformAuth, platformApi, authHandler, ordinaryAuth, signin, vite, netlify,
  platformClient, platformApp, platformCss, platformShell, platformUi, platformNavigation, ...normalUi
] = files;

test("Platform Admin identity, sessions, and audit are physically separate from ordinary users", () => {
  assert.match(migration, /create table if not exists platform_admins/);
  assert.match(migration, /create table if not exists platform_admin_sessions/);
  assert.match(migration, /create table if not exists platform_admin_audit_log/);
  const adminTable = migration.match(/create table if not exists platform_admins \(([\s\S]*?)\n\);/)?.[1] || "";
  assert.doesNotMatch(adminTable, /school_id|app_users/);
  assert.match(migration, /references platform_admins/);
  assert.match(migration, /token_hash text not null unique/);
  assert.doesNotMatch(migration, /role.*platform_admin/);
});

test("privileged sessions use an eight-hour Strict cookie scoped away from the LMS", () => {
  assert.match(platformAuth, /hh_platform_admin_session/);
  assert.match(platformAuth, /8 \* 60 \* 60/);
  assert.match(platformAuth, /HttpOnly; Path=\/platform-admin; SameSite=Strict/);
  assert.doesNotMatch(platformAuth, /hh_lms_session/);
  assert.match(ordinaryAuth, /hh_lms_session/);
  assert.doesNotMatch(ordinaryAuth, /hh_platform_admin_session/);
});

test("every Platform Admin endpoint requires dedicated authorization and mutations validate Origin", () => {
  assert.match(platformApi, /const auth = await requirePlatformAdmin\(event, sql\)/);
  assert.match(platformApi, /requirePlatformAdminOrigin\(event\)/);
  assert.match(authHandler, /requirePlatformAdmin\(event, sql\)/);
  assert.match(authHandler, /requirePlatformAdminOrigin\(event\)/);
  assert.doesNotMatch(platformApi, /teacher[_-]solutions|acceptedAnswers|correctOptionIds/i);
  assert.doesNotMatch(platformApi, /delete from schools|delete from app_users/i);
});

test("missing privileged authentication is always 401 and never depends on the ordinary cookie", () => {
  const guard = platformAuth.match(/export async function requirePlatformAdmin[\s\S]*?\n}/)?.[0] || "";
  assert.match(guard, /if \(!admin\) return \{ error: unauthorized\(\) \}/);
  assert.doesNotMatch(guard, /sessionCookieName|forbidden\(/);
});

test("the centralized client clears stale privileged state on 401 without consuming genuine 403 errors", () => {
  assert.match(platformClient, /response\.status === 401 && notifyUnauthorized/);
  assert.match(platformClient, /controller\.abort\(\)/);
  assert.match(platformClient, /unauthorizedHandler\?\.\(\)/);
  assert.match(platformClient, /response\.status === 403 && notifySecurityError/);
  assert.match(platformApp, /setData\(\{\}\)/);
  assert.match(platformApp, /setLoading\(\{\}\)/);
  assert.match(platformApp, /history\.replaceState\(\{\}, "", "\/platform-admin\/"\)/);
  assert.match(platformApp, /Your privileged session expired\. Sign in again\./);
  assert.doesNotMatch(platformApp, /localStorage|sessionStorage/);
});

test("Platform Administration navigation is a six-section keyboard and mobile-safe rail", () => {
  for (const label of ["Overview", "Schools", "Users", "Classes", "Book access", "Audit log"]) {
    assert.match(platformNavigation, new RegExp(`label: "${label}"`));
  }
  assert.match(platformShell, /onMouseEnter=\{openRail\}/);
  assert.match(platformShell, /onFocus=\{openRail\}/);
  assert.match(platformShell, /event\.key === "Escape"/);
  assert.match(platformShell, /document\.body\.style\.overflow = "hidden"/);
  assert.match(platformShell, /aria-current=\{activeSection === id \? "page"/);
  assert.match(platformApp, /history\.pushState\(\{\}, "", `\/platform-admin\/\$\{next\}`\)/);
  assert.match(platformApp, /addEventListener\("popstate"/);
});

test("Platform Admin controls use scoped variants, duplicate guards, and reduced motion", () => {
  for (const variant of ["primary", "secondary", "ghost", "warning", "danger", "link"]) {
    assert.match(platformCss, new RegExp(`\\.pa-button-${variant}`));
  }
  assert.match(platformUi, /disabled=\{disabled \|\| loading\}/);
  assert.match(platformCss, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(platformCss, /(^|\n)button\s*\{/);
});

test("Platform Administration uses the EduForge white and orange visual system", () => {
  assert.match(platformCss, /--brand-primary: #f97316/);
  assert.match(platformCss, /--panel: rgba\(255, 255, 255/);
  assert.match(platformCss, /--app-card-radius: 8px/);
  assert.match(platformCss, /--shadow: 0 16px 34px/);
  assert.doesNotMatch(platformCss, /#07111f|#0d1d31|#0b1d31|#1d4ed8|#2563eb/);
});

test("paused schools deny ordinary login and invalidate ordinary sessions without changing users", () => {
  assert.match(signin, /school_status/);
  assert.match(signin, /user\.school_status !== "active"/);
  assert.match(ordinaryAuth, /school\.status/);
  assert.match(platformApi, /delete from auth_sessions using app_users/);
  assert.doesNotMatch(platformApi, /update app_users set status=.*school/i);
});

test("the dedicated entry is built only for web and has production-style Netlify rewrites", () => {
  assert.match(vite, /platform-admin\/index\.html/);
  assert.match(vite, /input: isAndroidOffline \? path\.resolve\(process\.cwd\(\), "index\.html"\) : webInputs/);
  assert.match(netlify, /from = "\/platform-admin\/api\/auth"/);
  assert.match(netlify, /from = "\/platform-admin\/api\/control"/);
  assert.match(netlify, /from = "\/platform-admin\/\*"/);
});

test("normal LMS source and navigation expose no Platform Admin URL or role", () => {
  const source = normalUi.join("\n");
  assert.doesNotMatch(source, /platform-admin|Platform Administration|platform_admin/i);
});

test("audit metadata and browser capabilities exclude destructive or sensitive operations", () => {
  assert.match(migration, /not \(metadata \?\| array\['password','password_hash','session_token','token','database_url','answers','teacher_solutions'\]\)/);
  assert.doesNotMatch(platformApi, /impersonat|reset.*password|activation.*code.*plaintext/i);
  assert.match(platformApi, /phaseOneSlugs = \["ultimate-b1", "ultimate-b1-plus", "ultimate-b2"\]/);
});
