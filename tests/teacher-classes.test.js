import test from "node:test";
import assert from "node:assert/strict";
import { addOrReplaceTeacherClass } from "../src/hooks/useTeacherClasses.js";

test("a newly created teacher class is added without touching removed demo state", () => {
  const existing = [{ id: "class-a", name: "A" }, { id: "class-b", name: "B" }];
  const created = { id: "class-c", name: "C" };
  assert.deepEqual(addOrReplaceTeacherClass(existing, created), [created, ...existing]);

  const updated = { id: "class-a", name: "A updated" };
  assert.deepEqual(addOrReplaceTeacherClass(existing, updated), [updated, existing[1]]);
});
