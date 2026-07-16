import test from "node:test";
import assert from "node:assert/strict";
import { assignmentResultsToCsv } from "../src/services/assignmentsApi.js";

test("assignment CSV export escapes delimiters and neutralizes spreadsheet formulas", () => {
  const csv = assignmentResultsToCsv({
    assignment: { title: "Unit, 2" },
    rows: [{
      studentName: '=HYPERLINK("https://attacker.invalid","click")',
      email: "+441234",
      className: "B2",
      status: "Submitted",
      score: 100,
    }],
  });

  assert.match(csv, /"'=HYPERLINK\(""https:\/\/attacker\.invalid"",""click""\)"/);
  assert.match(csv, /,'\+441234,/);
  assert.match(csv, /,"Unit, 2",/);
});
