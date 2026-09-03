import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import { accessiblePackageIds, canAccessBookPackage } from "../netlify/functions/_book-package-access.js";
import { getBookAssetAccess } from "../netlify/functions/_book-asset-access.js";
import {
  getUltimateB2LocalAsset,
  localUltimateB2AssetUrl,
  resolveAllowlistedUltimateB2AssetFile,
} from "../netlify/functions/_ultimate-b2-local-assets.js";
import {
  initialTeacherBooksState,
  teacherBooksPresentation,
  teacherBooksReducer,
} from "../src/components/lms/teacher/teacherBooksState.js";

function capturingSql(rowsForQuery) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    return rowsForQuery(text, values, calls.length - 1);
  };
  sql.calls = calls;
  return sql;
}

test("teacher package access supports explicit teacher scope and active owned classes within the tenant", async () => {
  const sql = capturingSql(() => [{ id: "package-1" }]);
  assert.deepEqual(await accessiblePackageIds(sql, {
    id: "teacher-1",
    school_id: "school-a",
    role: "teacher",
  }), ["package-1"]);
  const query = sql.calls[0].text;
  assert.match(query, /book_access[\s\S]+role_scope = 'teacher'/);
  assert.match(query, /classes[\s\S]+c\.teacher_id[\s\S]+c\.school_id[\s\S]+c\.status/);
  assert.deepEqual(sql.calls[0].values, ["teacher-1", "school-a", "teacher-1", "school-a"]);
});

test("teacher without an entitlement has an empty package result", async () => {
  const sql = capturingSql(() => []);
  assert.deepEqual(await accessiblePackageIds(sql, {
    id: "teacher-1",
    school_id: "school-a",
    role: "teacher",
  }), []);
});

test("admin package access is school-scoped and never returns every active package", async () => {
  const sql = capturingSql(() => [{ id: "package-a" }]);
  assert.deepEqual(await accessiblePackageIds(sql, {
    id: "admin-a",
    school_id: "school-a",
    role: "admin",
  }), ["package-a"]);
  const query = sql.calls[0].text;
  assert.match(query, /role_scope = 'school_admin'/);
  assert.match(query, /classes[\s\S]+c\.school_id/);
  assert.match(query, /activation_code_batches[\s\S]+batch\.school_id/);
  assert.doesNotMatch(query, /^select id from book_packages where status = 'active'$/);
  assert.ok(sql.calls[0].values.every((value) => value === "admin-a" || value === "school-a"));
});

test("student package policy remains explicit student-scoped book access", async () => {
  const sql = capturingSql(() => [{ id: "package-a" }]);
  assert.deepEqual(await accessiblePackageIds(sql, {
    id: "student-a",
    school_id: "school-a",
    role: "student",
  }), ["package-a"]);
  assert.match(sql.calls[0].text, /role_scope = 'student'/);
  assert.doesNotMatch(sql.calls[0].text, /from classes/);
});

test("package checks require an active resolved package and an allowed package id", async () => {
  const sql = capturingSql((_text, _values, index) => index === 0 ? [{ id: "package-a" }] : [{ id: "package-a" }]);
  assert.equal(await canAccessBookPackage(sql, {
    id: "teacher-a",
    school_id: "school-a",
    role: "teacher",
  }, { packageSlug: "ultimate-b2" }), true);
  assert.match(sql.calls[0].text, /status = 'active'/);
});

test("local Ultimate B2 registry resolves representative cover, Unit 1, Unit 2, audio and video assets", async () => {
  const keys = [
    "ultimate-b2.students-book.cover",
    "ultimate-b2.students-book.unit-1.part-1.page-image",
    "ultimate-b2.students-book.unit-2.page-19",
    "ultimate-b2.students-book.unit-1.reading.text-audio",
    "ultimate-b2.students-book.unit-2.reading.video-intro",
  ];
  for (const key of keys) assert.ok(getUltimateB2LocalAsset(key), key);

  for (const key of keys.slice(0, 3)) {
    const asset = getUltimateB2LocalAsset(key);
    await access(await resolveAllowlistedUltimateB2AssetFile(asset));
  }
  assert.equal(getUltimateB2LocalAsset("ultimate-b2.students-book.unknown"), null);
});

test("local protected asset access returns only logical metadata and an authenticated endpoint", async () => {
  const sql = capturingSql((text) => {
    if (text.includes("from book_assets")) return [];
    return [{ id: "package-a" }];
  });
  const response = await getBookAssetAccess(sql, {
    id: "teacher-a",
    school_id: "school-a",
    role: "teacher",
  }, { logicalKey: "ultimate-b2.students-book.unit-1.part-1.page-image" }, {
    localRequestHost: "localhost:8888",
  });
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.url, localUltimateB2AssetUrl(getUltimateB2LocalAsset(payload.asset.logicalKey)));
  assert.doesNotMatch(JSON.stringify(payload), /Contents[\\/]Resources|unit[\\/]1[\\/]parts|src[\\/]assets/);
});

test("unentitled and unknown local protected assets return one non-disclosing 404", async () => {
  const deniedSql = capturingSql((text) => {
    if (text.includes("from book_assets")) return [];
    if (text.includes("select id from book_packages")) return [{ id: "package-a" }];
    return [];
  });
  const denied = await getBookAssetAccess(deniedSql, {
    id: "teacher-b",
    school_id: "school-b",
    role: "teacher",
  }, { logicalKey: "ultimate-b2.students-book.cover" }, { localRequestHost: "localhost:8888" });
  assert.equal(denied.statusCode, 404);
  assert.deepEqual(JSON.parse(denied.body), { error: "Book asset not found" });

  const unknown = await getBookAssetAccess(deniedSql, {
    id: "teacher-b",
    school_id: "school-b",
    role: "teacher",
  }, { logicalKey: "ultimate-b2.students-book.unknown" }, { localRequestHost: "localhost:8888" });
  assert.equal(unknown.statusCode, 404);
});

test("teacher book state preserves valid data after a later API failure and distinguishes empty from error", () => {
  const loaded = teacherBooksReducer(initialTeacherBooksState, {
    type: "loaded",
    packages: [{ id: "ultimate-b2", components: [{ id: "students-book" }] }],
  });
  const failed = teacherBooksReducer(loaded, { type: "failed", error: "Network unavailable" });
  assert.deepEqual(failed.packages, loaded.packages);
  assert.equal(teacherBooksPresentation(failed), "ready");
  const switchedUser = teacherBooksReducer(failed, { type: "loading", reset: true, ownerId: "teacher-b" });
  assert.deepEqual(switchedUser.packages, []);
  assert.equal(switchedUser.ownerId, "teacher-b");
  assert.equal(teacherBooksPresentation(switchedUser), "loading");
  assert.equal(teacherBooksPresentation({ packages: [], loading: false, error: "", loaded: true }), "empty");
  assert.equal(teacherBooksPresentation({ packages: [], loading: false, error: "Forbidden", loaded: false }), "error");
});

test("demo entitlement migration is narrowly scoped and idempotent", async () => {
  const migration = await readFile("database/023_demo_teacher_ultimate_b2_access.sql", "utf8");
  assert.match(migration, /Hamilton House ELT Demo/);
  assert.match(migration, /maria\.teacher@example\.com[\s\S]+app_user\.role = 'teacher'/);
  assert.match(migration, /elena\.admin@example\.com[\s\S]+app_user\.role = 'admin'/);
  assert.match(migration, /package_record\.slug = 'ultimate-b2'/);
  assert.match(migration, /on conflict \(user_id, book_package_id, role_scope\) do nothing/);
  assert.doesNotMatch(migration, /password|activation[_ ]code/i);
});
