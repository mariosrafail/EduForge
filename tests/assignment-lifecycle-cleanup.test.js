import assert from "node:assert/strict";
import test from "node:test";
import { removeAssignmentLifecycleRecords } from "./e2e/_assignment-lifecycle-cleanup.mjs";

function fakePool({ remaining = { submissions: 0, assignments: 0 } } = {}) {
  const calls = [];
  const client = {
    async query(text, parameters) {
      calls.push({ text: text.trim(), parameters });
      if (/^select\s/i.test(text.trim())) return { rows: [remaining], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push({ text: "release" });
    },
  };
  return { calls, pool: { async connect() { return client; } } };
}

test("assignment lifecycle cleanup deletes only records owned by its teacher, titles, and submission IDs", async () => {
  const { calls, pool } = fakePool();
  const teacherId = "d1700000-0010-4000-8000-000000000066";
  const titles = ["Assignment lifecycle auto score", "Assignment lifecycle teacher review"];
  const submissionIds = ["11111111-1111-4111-8111-111111111111"];

  await removeAssignmentLifecycleRecords(pool, { teacherId, titles, submissionIds });

  assert.deepEqual(calls.map(({ text }) => text.split(/\s+/).slice(0, 3).join(" ")), [
    "begin",
    "delete from activity_submissions",
    "delete from activity_assignments",
    "select (select count(*)::int",
    "commit",
    "release",
  ]);
  assert.match(calls[1].text, /id=any\(\$3::uuid\[\]\)/);
  assert.match(calls[1].text, /teacher_id=\$1 and title=any\(\$2::text\[\]\)/);
  assert.deepEqual(calls[1].parameters, [teacherId, titles, submissionIds]);
  assert.deepEqual(calls[2].parameters, [teacherId, titles]);
});

test("assignment lifecycle cleanup rolls back if owned records remain", async () => {
  const { calls, pool } = fakePool({ remaining: { submissions: 1, assignments: 0 } });
  await assert.rejects(
    removeAssignmentLifecycleRecords(pool, {
      teacherId: "d1700000-0010-4000-8000-000000000066",
      titles: ["Assignment lifecycle auto score"],
      submissionIds: ["11111111-1111-4111-8111-111111111111"],
    }),
    /left owned records behind/,
  );
  assert.ok(calls.some(({ text }) => text === "rollback"));
});
