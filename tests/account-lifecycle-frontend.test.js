import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { passwordsMatch } from "../src/utils/accountLifecycle.js";
import {
  passwordPolicyGuidance,
  passwordPolicyMaximumLength,
  passwordPolicyMinimumLength,
} from "../src/config/passwordPolicy.js";

test("password confirmation blocks empty or mismatched submissions", () => {
  assert.equal(passwordsMatch("", ""), false);
  assert.equal(passwordsMatch("Strong-password-2026", "different"), false);
  assert.equal(passwordsMatch("Strong-password-2026", "Strong-password-2026"), true);
});

test("password-establishment screens use shared accessible policy metadata", async () => {
  const [authView, lifecycleView] = await Promise.all([
    readFile("src/components/lms/AuthView.jsx", "utf8"),
    readFile("src/components/lms/AccountLifecycleView.jsx", "utf8"),
  ]);

  assert.equal(passwordPolicyMinimumLength, 10);
  assert.equal(passwordPolicyMaximumLength, 128);
  assert.match(passwordPolicyGuidance, /10–128 characters/);
  assert.match(authView, /autoComplete="current-password"/);
  assert.match(authView, /placeholder="Enter your password"/);
  assert.doesNotMatch(authView, /Minimum 8 characters|8 characters/);
  assert.match(authView, /minLength=\{passwordPolicyMinimumLength\}/);
  assert.match(authView, /maxLength=\{passwordPolicyMaximumLength\}/);
  assert.match(authView, /autoComplete="new-password"/);
  assert.match(authView, /aria-describedby="student-new-password-guidance"/);
  assert.match(authView, /role === "admin"[\s\S]*provisioned by the publisher/);
  assert.match(authView, /role === "teacher"[\s\S]*created and activated by a school administrator/);
  assert.match(authView, /role === "student"[\s\S]*handleStudentJoin/);
  assert.match(lifecycleView, /autoComplete="current-password"/);
  assert.equal((lifecycleView.match(/autoComplete="new-password"/g) || []).length, 2);
  assert.equal((lifecycleView.match(/aria-describedby="new-password-guidance"/g) || []).length, 2);
});
