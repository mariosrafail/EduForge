import assert from "node:assert/strict";
import test from "node:test";
import {
  ADOPTION_CSV_COLUMNS,
  adoptionRowsToCsv,
  safeAdoptionFilename,
  spreadsheetSafeText,
} from "../netlify/functions/_csv-utils.js";

const generatedAt = "2026-07-30T20:15:00.000Z";
const baseRow = {
  schoolName: "Athens, Academy",
  publisherName: 'Publisher "One"',
  packageTitle: "Ultimate\r\nB2",
  packageSlug: "ultimate-b2",
  level: "B2",
  codesGenerated: 4,
  codesRedeemed: 1,
  codesUnused: 1,
  codesExpired: 1,
  codesRevoked: 1,
  activeStudentEntitlements: 2,
  activeTeacherEntitlements: 1,
  activeAssignments: 3,
  uniqueSubmittedAssignments: 4,
  uniqueStudentsSubmitted: 2,
  scoredSubmissions: 3,
  averageScorePercent: 71,
  lastSubmissionAt: "2026-07-30T10:00:00.000Z",
};

test("adoption CSV has exact columns, UTC values, deterministic rows, escaping, and empty score semantics", () => {
  const rows = [
    baseRow,
    { ...baseRow, packageTitle: "Second", packageSlug: "second", averageScorePercent: null, lastSubmissionAt: null },
  ];
  const snapshot = structuredClone(rows);
  const csv = adoptionRowsToCsv(rows, generatedAt);
  assert.equal(csv.slice(1).split("\r\n")[0], ADOPTION_CSV_COLUMNS.join(","));
  assert.equal(csv.match(/2026-07-30T20:15:00\.000Z/g).length, 2);
  assert.match(csv, /"Athens, Academy"/);
  assert.match(csv, /"Publisher ""One"""/);
  assert.match(csv, /"Ultimate\r\nB2"/);
  assert.match(csv, /2026-07-30T20:15:00\.000Z/);
  assert.match(csv, /2026-07-30T10:00:00\.000Z/);
  assert.match(csv, /Second,second,B2,4,1,1,1,1,2,1,3,4,2,3,,$/);
  assert.deepEqual(rows, snapshot);
});

test("all formula-style textual values are neutralized after optional whitespace", () => {
  for (const value of ["=x", "+x", "-x", "@x", " \t=SUM(A1:A2)"]) {
    assert.equal(spreadsheetSafeText(value), `'${value}`);
  }
  const csv = adoptionRowsToCsv([{
    ...baseRow,
    schoolName: "=school",
    publisherName: " +publisher",
    packageTitle: "-package",
    packageSlug: "@slug",
    level: " =level",
  }], generatedAt);
  for (const unsafe of ["=school", " +publisher", "-package", "@slug", " =level"]) {
    assert.ok(csv.includes(`'${unsafe}`));
  }
});

test("CSV and filename exclude personal, answer, tenant, and activation-code material", () => {
  const csv = adoptionRowsToCsv([baseRow], generatedAt);
  for (const forbidden of [
    "student@example.invalid",
    "full_name",
    "school_id",
    "student_id",
    "teacher_id",
    "answers",
    "teacher_feedback",
    "ABCD-EFGH",
    "••••-EFGH",
  ]) assert.equal(csv.includes(forbidden), false);
  assert.equal(safeAdoptionFilename("Αθήνα / Academy\r\n", generatedAt), "eduforge-adoption-academy-2026-07-30.csv");
  assert.match(safeAdoptionFilename("=../../School", generatedAt), /^eduforge-adoption-school-2026-07-30\.csv$/);
});
