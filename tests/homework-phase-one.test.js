import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assembleStudentHomeworks,
  assembleTeacherHomeworks,
  normalizeHomeworkCreateBody,
} from "../netlify/functions/_book-content/homework-actions.js";
import {
  addSelectedHomeworkActivity,
  buildHomeworkActivityOptions,
  homeworkItemRequest,
  removeSelectedHomeworkActivity,
} from "../src/components/lms/teacher/homeworkUiModel.js";

const teacherId = "11111111-1111-4111-8111-111111111111";
const schoolId = "22222222-2222-4222-8222-222222222222";
const classA = "33333333-3333-4333-8333-333333333333";
const classB = "44444444-4444-4444-8444-444444444444";
const activityA = "55555555-5555-4555-8555-555555555555";
const activityB = "66666666-6666-4666-8666-666666666666";
const releaseId = "77777777-7777-4777-8777-777777777777";

function validBody(overrides = {}) {
  return {
    idempotencyKey: "homework-request-1",
    title: "Unit review",
    teacherNotes: "Complete both activities.",
    worksheetLinks: ["https://example.test/resource"],
    dueAt: "2030-01-02T23:59:00Z",
    classIds: [classB, classA],
    items: [
      { kind: "legacy_activity", activityId: activityA },
      { kind: "published_native", releaseId, nativeActivityId: "native-open-response" },
    ],
    ...overrides,
  };
}

test("Homework creation input is deterministic, ordered, scoped, and duplicate-safe", () => {
  const first = normalizeHomeworkCreateBody(validBody(), { teacherId, schoolId });
  const second = normalizeHomeworkCreateBody(validBody({ classIds: [classA, classB] }), { teacherId, schoolId });
  assert.equal(first.error, undefined);
  assert.equal(first.requestSha256, second.requestSha256, "class order is a recipient set");
  assert.deepEqual(first.items.map((item) => item.kind), ["legacy_activity", "published_native"]);
  assert.notEqual(
    first.requestSha256,
    normalizeHomeworkCreateBody(validBody({ items: [...validBody().items].reverse() }), { teacherId, schoolId }).requestSha256,
    "item order is part of Homework identity",
  );
  assert.match(normalizeHomeworkCreateBody(validBody({ items: [validBody().items[0], validBody().items[0]] }), { teacherId, schoolId }).error, /Duplicate activities/);
  assert.match(normalizeHomeworkCreateBody(validBody({ classIds: [classA, classA] }), { teacherId, schoolId }).error, /Duplicate classId/);
  assert.match(normalizeHomeworkCreateBody(validBody({ items: [validBody().items[0]] }), { teacherId, schoolId }).error, /2-50/);
  assert.match(normalizeHomeworkCreateBody(validBody({ idempotencyKey: "short" }), { teacherId, schoolId }).error, /8-128/);
});

test("teacher aggregation preserves item order, class recipients, result drill-downs, and exact progress", () => {
  const headers = [{ id: "h1", teacher_id: teacherId, title: "Grouped", teacher_notes: "Notes", worksheet_links: [], due_at: null, status: "assigned" }];
  const items = [
    { id: "i2", homework_id: "h1", position: 2, target_kind: "published_native", title: "Second" },
    { id: "i1", homework_id: "h1", position: 1, target_kind: "legacy_activity", title: "First" },
  ];
  const assignments = [
    { id: "a1", homeworkId: "h1", homeworkItemId: "i1", classId: classA, className: "B2 A" },
    { id: "a2", homeworkId: "h1", homeworkItemId: "i2", classId: classA, className: "B2 A" },
  ];
  const [homework] = assembleTeacherHomeworks({
    headers,
    items,
    assignments,
    progress: [{ homework_id: "h1", expected_count: 20, submitted_count: 9, awaiting_review_count: 2, reviewed_count: 3, auto_scored_count: 4 }],
  });
  assert.deepEqual(homework.items.map((item) => item.title), ["First", "Second"]);
  assert.deepEqual(homework.classes, [{ id: classA, name: "B2 A" }]);
  assert.equal(homework.items[0].assignments[0].id, "a1");
  assert.deepEqual(homework.progress, { expected: 20, submitted: 9, missing: 11, awaitingReview: 2, reviewed: 3, autoScored: 4, completionPercent: 45 });
  assert.equal(assembleTeacherHomeworks({ headers, items, assignments, progress: [] })[0].progress.completionPercent, null);
});

test("student aggregation deduplicates multi-class candidates, prefers submitted work, and exposes no activity document", () => {
  const base = {
    homework_id: "h1", homework_title: "Grouped", teacher_notes: "Notes", worksheet_links: [], due_at: null,
    homework_status: "assigned", teacher_name: "Teacher", homework_item_id: "i1", position: 1,
    target_kind: "legacy_activity", activity_id: activityA, activity_title: "First", package_title: "Ultimate B2",
    status: "assigned", submission_id: null, submission_status: null,
  };
  const [homework] = assembleStudentHomeworks([
    { ...base, assignment_id: "a-class-a", class_name: "B2 A" },
    { ...base, assignment_id: "a-class-b", class_name: "B2 B", submission_id: "s1", submission_status: "submitted", score_percent: 80 },
    { ...base, homework_item_id: "i2", position: 2, assignment_id: "a2", activity_id: activityB, activity_title: "Second", class_name: "B2 A" },
  ]);
  assert.equal(homework.itemCount, 2);
  assert.deepEqual(homework.items.map((item) => item.position), [1, 2]);
  assert.equal(homework.items[0].assignmentId, "a-class-b");
  assert.deepEqual(homework.progress, { expected: 2, submitted: 1, missing: 1, awaitingReview: 0, reviewed: 0, completionPercent: 50 });
  assert.equal("activity" in homework.items[0], false);
  assert.equal("target" in homework.items[0], false);
});

test("teacher activity selection supports both target kinds, deterministic selection order, removal, and duplicate prevention", () => {
  const options = buildHomeworkActivityOptions({ components: [{ title: "Students Book", units: [{ title: "Unit 1", lessons: [{ exercises: [{ title: "Legacy", assignmentActivityId: activityA }] }] }] }] }, [{
    target: { kind: "published_native", releaseId, nativeActivityId: "native-open-response" },
    title: "Native", packageTitle: "Ultimate B2", componentTitle: "Students Book", nativeKind: "open-response", assignable: true,
  }]);
  assert.deepEqual(options.map((item) => item.targetKind), ["legacy_activity", "published_native"]);
  let selected = addSelectedHomeworkActivity([], options[1]);
  selected = addSelectedHomeworkActivity(selected, options[0]);
  selected = addSelectedHomeworkActivity(selected, options[1]);
  assert.deepEqual(selected.map((item) => item.title), ["Native", "Legacy"]);
  assert.deepEqual(homeworkItemRequest(selected[0]), options[1].target);
  assert.deepEqual(homeworkItemRequest(selected[1]), { kind: "legacy_activity", activityId: activityA });
  assert.deepEqual(removeSelectedHomeworkActivity(selected, options[1].id).map((item) => item.title), ["Legacy"]);
});

test("migration, API routes, UI grouping, lifecycle guard, and student answer boundary are repository-authoritative", async () => {
  const [migration, manifest, handler, service, teacher, creator, teacherList, student, assignmentActions, contractGenerator] = await Promise.all([
    readFile("database/041_homework_phase_one.sql", "utf8"),
    readFile("database/MIGRATIONS.md", "utf8"),
    readFile("netlify/functions/book-content.js", "utf8"),
    readFile("src/services/assignmentsApi.js", "utf8"),
    readFile("src/components/lms/teacher/sections/TeacherAssignmentsSection.jsx", "utf8"),
    readFile("src/components/lms/teacher/components/HomeworkCreator.jsx", "utf8"),
    readFile("src/components/lms/teacher/components/TeacherHomeworkList.jsx", "utf8"),
    readFile("src/components/lms/student/portal/StudentAssignmentsSection.jsx", "utf8"),
    readFile("netlify/functions/_book-content/assignment-actions.js", "utf8"),
    readFile("scripts/generate-runtime-schema-contract.mjs", "utf8"),
  ]);
  assert.match(manifest, /41\. `041_homework_phase_one\.sql`/);
  assert.match(migration, /create table homeworks/);
  assert.match(migration, /create table homework_items/);
  assert.match(migration, /foreign key \(homework_id, homework_item_id\)/);
  assert.match(migration, /foreign key \(school_id, teacher_id, homework_id\)/);
  assert.match(migration, /activity_assignments_homework_link_check/);
  assert.match(handler, /action === "create-homework"/);
  assert.match(handler, /action === "teacher-homeworks"/);
  assert.match(handler, /action === "student-homeworks"/);
  assert.match(service, /action=create-homework/);
  assert.match(teacher, /standaloneAssignments/);
  assert.match(creator, /selectedActivities\.map\(homeworkItemRequest\)/);
  assert.match(creator, /Create Homework/);
  assert.match(teacherList, /homework\.items\.map/);
  assert.match(teacherList, /onOpenResults/);
  assert.match(student, /homework\.items/);
  assert.match(student, /openActivity\(\{ \.\.\.item/);
  assert.match(assignmentActions, /homework-managed-assignment/);
  assert.match(contractGenerator, /homeworks:/);
  assert.doesNotMatch(student, /modelAnswers|correctAnswers|teacherProjection/);
});
