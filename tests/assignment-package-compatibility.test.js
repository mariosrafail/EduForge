import assert from "node:assert/strict";
import test from "node:test";

import {
  classTargetPackageConflictResponse,
  evaluateClassTargetPackageCompatibility,
  verifyDirectStudentTargetEntitlements,
} from "../netlify/functions/_book-content/assignment-package-compatibility.js";
import {
  assignmentTargetsFailureResponse,
  createAssignment,
} from "../netlify/functions/_book-content/assignment-actions.js";

const packageB1 = "10000000-0000-4000-8000-000000000001";
const packageB2 = "10000000-0000-4000-8000-000000000002";
const studentA = "20000000-0000-4000-8000-000000000001";
const studentB = "20000000-0000-4000-8000-000000000002";
const schoolId = "30000000-0000-4000-8000-000000000001";
const teacherId = "40000000-0000-4000-8000-000000000001";
const classId = "50000000-0000-4000-8000-000000000001";
const activityId = "60000000-0000-4000-8000-000000000001";

test("class-target package compatibility accepts one package and rejects null, mixed, and mismatched boundaries", () => {
  assert.equal(evaluateClassTargetPackageCompatibility([
    { id: "class-a", book_package_id: packageB1 },
    { id: "class-b", book_package_id: packageB1 },
  ], [packageB1, packageB1]), null);
  assert.equal(evaluateClassTargetPackageCompatibility([
    { id: "legacy-class", book_package_id: null },
  ], [packageB1]).conflict, "class-package-unassigned");
  assert.equal(evaluateClassTargetPackageCompatibility([
    { id: "class-a", book_package_id: packageB1 },
    { id: "class-b", book_package_id: packageB2 },
  ], [packageB1]).conflict, "mixed-class-packages");
  assert.equal(evaluateClassTargetPackageCompatibility([
    { id: "class-a", book_package_id: packageB1 },
  ], [packageB2]).conflict, "class-package-mismatch");
  assert.equal(evaluateClassTargetPackageCompatibility([
    { id: "class-a", book_package_id: packageB1 },
  ], [packageB1, packageB2]).conflict, "class-package-mismatch");

  const response = classTargetPackageConflictResponse(
    [{ id: "class-a", book_package_id: packageB1 }],
    [packageB2],
  );
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).conflict, "class-package-mismatch");
});

test("direct student assignment entitlement requires every student in the school to hold target-package access", async () => {
  const calls = [];
  const entitledSql = async (strings, ...values) => {
    calls.push({ text: strings.join("?"), values });
    return [{ id: studentA }, { id: studentB }];
  };
  assert.equal(await verifyDirectStudentTargetEntitlements(entitledSql, [studentA, studentB], packageB1, schoolId), null);
  assert.match(calls[0].text, /access\.book_package_id/);
  assert.ok(calls[0].values.includes(packageB1));
  assert.ok(calls[0].values.includes(schoolId));

  const denied = await verifyDirectStudentTargetEntitlements(async () => [{ id: studentA }], [studentA, studentB], packageB1, schoolId);
  assert.equal(denied.statusCode, 403);
  assert.match(JSON.parse(denied.body).error, /Every directly assigned student/);
  assert.equal(await verifyDirectStudentTargetEntitlements(() => { throw new Error("must not query"); }, [], packageB1, schoolId), null);
});

test("class-targeted standalone assignment rejects a crafted cross-package legacy target before insert", async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("select c.id") && text.includes("from classes c")) {
      return [{ id: classId, teacher_id: teacherId, school_id: schoolId }];
    }
    if (text.includes("from activities activity")) {
      return [{ id: activityId, title: "B1 activity", is_assignable: true, content_json: {}, book_package_id: packageB1 }];
    }
    if (text.includes("from activities a join lessons")) return [{ id: packageB1, package_slug: "ultimate-b1", component_slug: "ultimate-b1-students-book" }];
    if (text.includes("select distinct bp.id")) return [{ id: packageB1 }];
    if (text.includes("select id, teacher_id, school_id, status, book_package_id")) {
      return [{ id: classId, teacher_id: teacherId, school_id: schoolId, status: "active", book_package_id: packageB2 }];
    }
    if (text.includes("insert into activity_assignments")) throw new Error("must reject before insert");
    return [];
  };
  const response = await createAssignment(sql, {
    idempotencyKey: "cross-package-assignment",
    classIds: [classId],
    activityId,
  }, { id: teacherId, school_id: schoolId, role: "teacher" });
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).conflict, "class-package-mismatch");
  assert.equal(calls.some((call) => call.text.includes("insert into activity_assignments")), false);
});

test("assignment target integrity failures receive a stable sanitized 503 without weakening fail-closed verification", () => {
  for (const sourceError of [
    Object.assign(new Error("release_integrity_failed"), { code: "release_integrity_failed", releaseId: "secret-release" }),
    new Error("publication_compiler_mismatch"),
  ]) {
    const response = assignmentTargetsFailureResponse(sourceError);
    assert.equal(response.statusCode, 503);
    const body = JSON.parse(response.body);
    assert.deepEqual(body, {
      error: "Published assignment activities are temporarily unavailable",
      code: "published-assignment-integrity-unavailable",
    });
    assert.doesNotMatch(response.body, /secret-release|hash|compiler/i);
  }
  assert.equal(assignmentTargetsFailureResponse(new Error("database connection unavailable")), null);
});
