import test from "node:test";
import assert from "node:assert/strict";
import { canEditOwnedContent, requireResourceRole } from "../netlify/functions/_resource-access.js";
import { isValidInviteCode, normalizeInviteCode, publicClassInviteRow } from "../netlify/functions/_class-utils.js";

const schoolA = "00000000-0000-4000-8000-000000000001";
const schoolB = "00000000-0000-4000-8000-000000000002";
const teacher = { id: "00000000-0000-4000-8000-000000000010", school_id: schoolA, role: "teacher" };
const admin = { id: "00000000-0000-4000-8000-000000000011", school_id: schoolA, role: "admin" };

test("class invite codes reject slugs and UUIDs", () => {
  assert.equal(isValidInviteCode("ABC12345"), true);
  assert.equal(normalizeInviteCode(" abc12345 "), "ABC12345");
  assert.equal(isValidInviteCode("english-b2-a"), false);
  assert.equal(isValidInviteCode("00000000-0000-4000-8000-000000000001"), false);
});

test("public invite response does not expose identifiers or invite secrets", () => {
  const result = publicClassInviteRow({
    id: "class-id",
    slug: "guessed-slug",
    inviteCode: "ABC12345",
    name: "B2 A",
    level: "B2",
    assignedBook: "Ultimate B2",
    teacherName: "Teacher",
    students: 22,
    status: "active",
  });
  assert.deepEqual(result, {
    name: "B2 A",
    level: "B2",
    assignedBook: "Ultimate B2",
    teacher: "Teacher",
    teacherName: "Teacher",
    status: "active",
  });
});

test("teacher may edit only their own custom content in their school", () => {
  assert.equal(canEditOwnedContent(teacher, { school_id: schoolA, ownership_type: "custom", created_by: teacher.id }), true);
  assert.equal(canEditOwnedContent(teacher, { school_id: schoolA, ownership_type: "official", created_by: teacher.id }), false);
  assert.equal(canEditOwnedContent(teacher, { school_id: schoolB, ownership_type: "custom", created_by: teacher.id }), false);
});

test("school admin may edit official school content but not another tenant", () => {
  assert.equal(canEditOwnedContent(admin, { school_id: schoolA, ownership_type: "official" }), true);
  assert.equal(canEditOwnedContent(admin, { school_id: schoolB, ownership_type: "official" }), false);
});

test("resource role guard cannot be confused with request authentication", () => {
  assert.equal(requireResourceRole(teacher, ["teacher"]), null);
  assert.equal(requireResourceRole(teacher, ["student"]).statusCode, 403);
});
