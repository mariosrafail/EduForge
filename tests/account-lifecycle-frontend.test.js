import test from "node:test";
import assert from "node:assert/strict";
import { passwordsMatch } from "../src/utils/accountLifecycle.js";

test("password confirmation blocks empty or mismatched submissions", () => {
  assert.equal(passwordsMatch("", ""), false);
  assert.equal(passwordsMatch("Strong-password-2026", "different"), false);
  assert.equal(passwordsMatch("Strong-password-2026", "Strong-password-2026"), true);
});
