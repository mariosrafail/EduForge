import assert from "node:assert/strict";
import test from "node:test";
import { setSqlForTests } from "../netlify/functions/_auth-utils.js";
import { runtimeReadySql } from "./_runtime-schema-test-helper.js";
import {
  rejectsDashboardIdentityParameters,
  studentDashboardPayload,
  teacherDashboardPayload,
} from "../netlify/functions/_book-content/dashboard-metrics.js";
import { handler } from "../netlify/functions/book-content.js";

function event(query = {}, cookie = "hh_lms_session=test-token") {
  return {
    httpMethod: "GET",
    headers: { cookie, host: "localhost:8888" },
    queryStringParameters: { action: "dashboard-metrics", ...query },
    rawQuery: new URLSearchParams({ action: "dashboard-metrics", ...query }).toString(),
    body: "",
  };
}

function responseBody(response) {
  return JSON.parse(response.body);
}

function mockSql({ user, packages = [], metrics = {}, failMetrics = false }) {
  return runtimeReadySql(async (strings) => {
    const query = strings.join(" ");
    if (query.includes("from auth_sessions")) return user ? [user] : [];
    if (query.includes("select distinct bp.id")) return packages.map((id) => ({ id }));
    if (query.includes("with accessible_packages")) {
      if (failMetrics) throw new Error("sensitive database detail");
      return [metrics];
    }
    throw new Error(`Unexpected query: ${query}`);
  });
}

test("dashboard payload helpers preserve zeroes, null averages, rounding, and deterministic class order", () => {
  assert.deepEqual(teacherDashboardPayload(), {
    role: "teacher",
    metrics: {
      activeBookPackages: 0,
      activeBookComponents: 0,
      activeClasses: 0,
      activeStudents: 0,
      activeAssignments: 0,
    },
  });
  assert.deepEqual(studentDashboardPayload({
    active_book_packages: "2",
    active_book_components: "7",
    pending_assignments: "3",
    completed_assignments: "4",
    scored_assignments: "3",
    average_score: "66.6",
    school_name: "School A",
    class_names: ["Alpha", "Alpha", "Beta"],
    primary_class_name: "Alpha",
    level: "B2",
  }), {
    role: "student",
    metrics: {
      activeBookPackages: 2,
      activeBookComponents: 7,
      pendingAssignments: 3,
      completedAssignments: 4,
      scoredAssignments: 3,
      averageScore: 67,
    },
    profile: {
      schoolName: "School A",
      classNames: ["Alpha", "Beta"],
      primaryClassName: "Alpha",
      level: "B2",
    },
  });
  assert.equal(studentDashboardPayload({ average_score: null }).metrics.averageScore, null);
  assert.equal(studentDashboardPayload({ average_score: 0 }).metrics.averageScore, 0);
});

test("dashboard identity parameters are rejected even when empty", () => {
  assert.equal(rejectsDashboardIdentityParameters({}), false);
  for (const key of ["teacherId", "studentId", "schoolId", "teacher_id", "student_id", "school_id"]) {
    assert.equal(rejectsDashboardIdentityParameters({ [key]: "" }), true);
  }
});

test("dashboard handler enforces authentication, roles, identity scope, cache headers, and safe errors", async (t) => {
  const previousConfirmation = process.env.TEST_DATABASE_CONFIRMATION;
  process.env.TEST_DATABASE_CONFIRMATION = "isolated-test-database";
  t.after(() => {
    setSqlForTests(null);
    if (previousConfirmation === undefined) delete process.env.TEST_DATABASE_CONFIRMATION;
    else process.env.TEST_DATABASE_CONFIRMATION = previousConfirmation;
  });

  setSqlForTests(mockSql({ user: null }));
  const unauthorized = await handler(event({}, ""));
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.headers["Cache-Control"], "private, no-store");
  assert.equal(unauthorized.headers.Vary, "Cookie");

  setSqlForTests(mockSql({ user: {
    id: "00000000-0000-4000-8000-000000000001",
    school_id: "00000000-0000-4000-8000-000000000010",
    role: "admin",
  } }));
  const forbidden = await handler(event());
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.headers.Vary, "Cookie");

  const teacher = {
    id: "00000000-0000-4000-8000-000000000002",
    school_id: "00000000-0000-4000-8000-000000000010",
    role: "teacher",
  };
  setSqlForTests(mockSql({ user: teacher }));
  for (const key of ["teacherId", "studentId", "schoolId"]) {
    const rejected = await handler(event({ [key]: "00000000-0000-4000-8000-000000000099" }));
    assert.equal(rejected.statusCode, 400);
  }

  setSqlForTests(mockSql({
    user: teacher,
    packages: ["00000000-0000-4000-8000-000000000020"],
    metrics: {
      active_book_packages: 1,
      active_book_components: 4,
      active_classes: 2,
      active_students: 8,
      active_assignments: 3,
    },
  }));
  const success = await handler(event());
  assert.equal(success.statusCode, 200);
  assert.deepEqual(responseBody(success).metrics, {
    activeBookPackages: 1,
    activeBookComponents: 4,
    activeClasses: 2,
    activeStudents: 8,
    activeAssignments: 3,
  });
  assert.equal(success.headers["Cache-Control"], "private, no-store");
  assert.equal(success.headers.Vary, "Cookie");

  setSqlForTests(mockSql({ user: teacher, failMetrics: true }));
  const failed = await handler(event());
  assert.equal(failed.statusCode, 500);
  assert.equal(responseBody(failed).error, "Book content API failed");
  assert.doesNotMatch(failed.body, /sensitive database detail/);
  assert.equal(failed.headers.Vary, "Cookie");
});
