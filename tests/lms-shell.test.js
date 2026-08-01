import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("user-facing LMS and Platform Admin branding contains no developer identity", async () => {
  const paths = [
    "index.html",
    "platform-admin/index.html",
    "shared/schoolBranding.js",
    "src/components/lms/RoleSelection.jsx",
    "src/components/lms/Shared.jsx",
    "src/components/lms/shared/PortalShell.jsx",
    "src/components/lms/admin/sections/AdminOperationsSections.jsx",
    "src/apps/platform-admin/components/PlatformAdminLogin.jsx",
    "src/apps/platform-admin/components/PlatformAdminShell.jsx",
    "src/apps/platform-admin/sections/SchoolsSection.jsx",
  ];
  const sources = await Promise.all(paths.map(read));
  const visibleSource = sources.join("\n");
  assert.match(visibleSource, /Hamilton House/);
  assert.doesNotMatch(visibleSource, /EduForge|Made by|Made with|Developed by|Created by/i);
  assert.match(sources[0], /<title>Hamilton House LMS<\/title>/);
  assert.match(sources[1], /<title>Platform Administration · Hamilton House<\/title>/);
});

test("ordinary LMS role entry, header, and access gates remain present", async () => {
  const [roles, shared, app] = await Promise.all([
    read("src/components/lms/RoleSelection.jsx"),
    read("src/components/lms/Shared.jsx"),
    read("src/App.jsx"),
  ]);

  for (const role of ["admin", "teacher", "student"]) {
    assert.match(roles, new RegExp(`id: "${role}"`));
    assert.match(app, new RegExp(`requiredRole="${role}"`));
  }
  assert.match(roles, /motion\.button/);
  assert.match(shared, /currentUser\.full_name/);
  assert.match(shared, /onSignOut/);
  assert.doesNotMatch(`${roles}\n${shared}\n${app}`, /href=.*platform-admin|navigateTo\(["']platform-admin/);
});

test("ordinary LMS and Platform Admin compose one neutral accessible chrome", async () => {
  const [shell, platformShell, chrome, chromeStyles, shared, app] = await Promise.all([
    read("src/components/lms/shared/PortalShell.jsx"),
    read("src/apps/platform-admin/components/PlatformAdminShell.jsx"),
    read("src/components/app-chrome/AppChrome.jsx"),
    read("src/styles/app-chrome.css"),
    read("src/components/lms/Shared.jsx"),
    read("src/App.jsx"),
  ]);

  assert.match(shell, /from "\.\.\/\.\.\/app-chrome\/AppChrome\.jsx"/);
  assert.match(platformShell, /from "\.\.\/\.\.\/\.\.\/components\/app-chrome\/AppChrome\.jsx"/);
  assert.match(shell, /<AppChrome/);
  assert.match(platformShell, /<AppChrome/);
  assert.match(chrome, /onMouseEnter=\{onOpen\}/);
  assert.match(chrome, /onFocus=\{onOpen\}/);
  assert.match(chrome, /setTimeout\(\(\) => setExpanded\(false\), 250\)/);
  assert.match(chrome, /role="dialog"/);
  assert.match(chrome, /aria-modal="true"/);
  assert.match(chrome, /event\.key === "Escape"/);
  assert.match(chrome, /document\.body\.style\.overflow = "hidden"/);
  assert.match(chrome, /menuButtonRef\.current\?\.focus/);
  assert.match(chrome, /event\.key !== "Tab"/);
  assert.match(chrome, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(chromeStyles, /--app-chrome-header-height: 68px/);
  assert.match(chromeStyles, /--app-chrome-brand-tile-size: 42px/);
  assert.match(chromeStyles, /--app-chrome-rail-width: 78px/);
  assert.match(chromeStyles, /--app-chrome-rail-expanded-width: 276px/);
  assert.match(chromeStyles, /--app-chrome-nav-row-height: 58px/);
  assert.match(chromeStyles, /--app-chrome-nav-icon-size: 38px/);
  assert.match(chromeStyles, /\.app-chrome-nav-item:hover[^}]*translateX\(2px\)/s);
  assert.doesNotMatch(chromeStyles, /\.app-chrome-nav-item:hover[^}]*translateY/s);
  assert.match(chromeStyles, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(chrome, /useAuth|session|tenant|platformApi|fetch\(/i);
  assert.doesNotMatch(shared, /Object\.entries\(roles\)/);
  assert.doesNotMatch(shared, /mobile-nav-drawer|mobile-menu-backdrop/);
  assert.match(app, /!authenticatedPortalVisible/);
});

test("ordinary authenticated chrome retains concise account and sound utilities", async () => {
  const [shell, shared] = await Promise.all([
    read("src/components/lms/shared/PortalShell.jsx"),
    read("src/components/lms/Shared.jsx"),
  ]);
  assert.match(shell, /aria-label="Sound controls"/);
  assert.match(shell, /aria-label="Sound volume"/);
  assert.match(shell, /toggleMuted/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /pointerdown/);
  assert.match(shell, /Account security/);
  assert.match(shell, /Sign out/);
  assert.match(shell, /ariaLabel: "Return to role selection"/);
  assert.doesNotMatch(shared, /Student[\s\S]*Teacher[\s\S]*School Admin[\s\S]*desktop-header-actions/);
});

test("obsolete authenticated chrome implementations are removed", async () => {
  const cssPaths = [
    "src/styles/admin.css",
    "src/styles/header.css",
    "src/styles/layout.css",
    "src/styles/lms-shell.css",
    "src/styles/responsive.css",
    "src/apps/platform-admin/styles/shell.css",
    "src/apps/platform-admin/styles/responsive.css",
  ];
  const css = (await Promise.all(cssPaths.map(read))).join("\n");
  assert.doesNotMatch(css, /portal-sidebar|portal-mobile-drawer|portal-mobile-bar|portal-menu-trigger/);
  assert.doesNotMatch(css, /pa-sidebar|pa-nav-item|pa-mobile-nav|pa-topbar\s*\{/);
  assert.doesNotMatch(css, /mobile-nav-drawer|mobile-menu-backdrop|desktop-header-actions|sound-volume-control/);
});

test("neutral chrome and Android entrypoints contain no Platform Admin route or import", async () => {
  const sources = await Promise.all([
    read("src/components/app-chrome/AppChrome.jsx"),
    read("src/components/lms/shared/PortalShell.jsx"),
    read("src/apps/android-offline/offlineEntry.jsx"),
    read("src/apps/android-offline/AndroidOfflineApp.jsx"),
    read("src/apps/android-teacher-offline/teacherOfflineEntry.jsx"),
    read("src/apps/android-teacher-offline/TeacherOfflineApp.jsx"),
  ]);
  assert.doesNotMatch(sources.join("\n"), /platform-admin|PlatformAdmin|Platform Administration/);
});

test("all three portals use one shared shell and retain their navigation sections", async () => {
  const [student, studentConfig, teacher, teacherConfig, admin, adminConfig] = await Promise.all([
    read("src/components/lms/student/portal/StudentPortal.jsx"),
    read("src/components/lms/student/portal/studentPortalConfig.js"),
    read("src/components/lms/teacher/TeacherPortal.jsx"),
    read("src/components/lms/teacher/teacherPortalConfig.js"),
    read("src/components/lms/admin/AdminView.jsx"),
    read("src/components/lms/admin/adminPortalConfig.js"),
  ]);

  for (const source of [student, teacher, admin]) assert.match(source, /<PortalShell/);
  for (const label of ["Dashboard", "Books", "Assignments", "Grades"]) assert.match(studentConfig, new RegExp(`label: "${label}"`));
  for (const label of ["Dashboard", "Books", "Classes", "Students", "Assignments", "Custom Assignment"]) assert.match(teacherConfig, new RegExp(`label: "${label}"`));
  for (const label of ["Overview", "School setup", "Users", "Books & classes", "Publisher intelligence", "Integrations"]) assert.match(adminConfig, new RegExp(`label: "${label}"`));
});

test("School Admin is decomposed while mutations and confirmations stay coordinated", async () => {
  const [admin, users, sections] = await Promise.all([
    read("src/components/lms/admin/AdminView.jsx"),
    read("src/components/lms/admin/components/AdminUserTable.jsx"),
    read("src/components/lms/admin/sections/AdminUsersSection.jsx"),
  ]);

  assert.match(admin, /listUsers/);
  assert.match(admin, /listTeacherClasses/);
  assert.match(admin, /window\.confirm/);
  assert.match(admin, /revokeUserSessions/);
  assert.match(admin, /deleteUserRequest/);
  assert.match(sections, /disabled=\{savingUser\}/);
  assert.match(users, /disabled=\{Boolean\(pendingAction\)\}/);
  assert.doesNotMatch(admin, /admin-sidebar|admin-dashboard-shell/);
});
