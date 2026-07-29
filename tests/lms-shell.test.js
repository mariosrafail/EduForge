import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

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

test("shared portal shell owns desktop rail, accessible drawer, and reduced motion", async () => {
  const [shell, layout, styles] = await Promise.all([
    read("src/components/lms/shared/PortalShell.jsx"),
    read("src/styles/layout.css"),
    read("src/styles/lms-shell.css"),
  ]);

  assert.match(shell, /onMouseEnter=\{openSidebar\}/);
  assert.match(shell, /onFocus=\{openSidebar\}/);
  assert.match(shell, /setTimeout\(\(\) => setExpanded\(false\), 250\)/);
  assert.match(shell, /aria-modal="true"/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /document\.body\.style\.overflow = "hidden"/);
  assert.match(shell, /menuTriggerRef\.current\?\.focus/);
  assert.match(shell, /event\.key !== "Tab"/);
  assert.match(shell, /useReducedMotion/);
  assert.match(shell, /AnimatePresence/);
  assert.match(shell, /aria-current=\{isActive \? "page" : undefined\}/);
  assert.match(layout, /--lms-rail-width: 78px/);
  assert.match(layout, /--lms-rail-expanded-width: 276px/);
  assert.match(layout, /\.portal-sidebar\s*\{[^}]*position: fixed/s);
  assert.match(layout, /\.portal-shell\s*\{[^}]*padding-left: var\(--lms-rail-width\)/s);
  assert.match(layout, /\.portal-shell\.sidebar-expanded\s*\{[^}]*padding-left: var\(--lms-rail-expanded-width\)/s);
  assert.match(layout, /\.portal-sidebar-nav button:hover\s*\{[^}]*translateX\(2px\)/s);
  assert.doesNotMatch(layout, /\.portal-sidebar-nav button:hover[^}]*translateY/s);
  assert.match(styles, /@media \(max-width: 1100px\)[\s\S]*\.portal-mobile-drawer/);
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
