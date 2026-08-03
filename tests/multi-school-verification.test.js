import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { multiSchoolSeedSubmissionIds } from "../scripts/_multi-school-seed-data.mjs";

test("multi-school canonical submission IDs are deterministic and unique", () => {
  const submissionIds = multiSchoolSeedSubmissionIds();
  assert.equal(submissionIds.length, 27);
  assert.equal(new Set(submissionIds).size, submissionIds.length);
  assert.ok(submissionIds.every((id) => id.startsWith("d1700000-0060-4000-8000-")));
});

test("Ultimate B2 source matrices intentionally contain two reading and 78 enabled activities", async () => {
  const matrices = await Promise.all([
    readFile("books/ultimate-b2/generated/editorial/unit-01.implementation-matrix.json", "utf8").then(JSON.parse),
    readFile("books/ultimate-b2/generated/editorial/unit-02.implementation-matrix.json", "utf8").then(JSON.parse),
  ]);
  const activities = matrices.flatMap((matrix) => matrix.activities);
  const enabled = activities.filter((activity) => activity.implementationMode !== "unsupported-disabled");
  const reading = enabled.filter((activity) => activity.implementationMode === "reading-content");

  assert.equal(enabled.length, 78);
  assert.deepEqual(reading.map((activity) => activity.stableNormalizedId), [
    "ultimate-b2-sb-u1-p1-o2",
    "ultimate-b2-sb-u2-p2-o2",
  ]);
});
