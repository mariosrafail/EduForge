import test from "node:test";
import assert from "node:assert/strict";
import {
  accountActionUrl,
  createAccountToken,
  genericForgotPasswordMessage,
  hashPrivateValue,
  maximumPasswordLength,
  minimumPasswordLength,
  validAccountTokenInput,
  validatePassword,
} from "../netlify/functions/_account-lifecycle-utils.js";
import {
  passwordPolicyMaximumLength,
  passwordPolicyMinimumLength,
} from "../src/config/passwordPolicy.js";

test("account tokens are high entropy and hashes do not expose input", () => {
  const first=createAccountToken(); const second=createAccountToken();
  assert.notEqual(first,second); assert.ok(first.length>=43); assert.equal(hashPrivateValue(first).includes(first),false);
});

test("authoritative lifecycle password policy preserves exact boundaries and semantics", () => {
  const email = "user@example.com";
  const unchanged = "A-unique-long-passphrase";
  assert.equal(validatePassword("x".repeat(9), email), "Password must be at least 10 characters");
  assert.equal(validatePassword("x".repeat(10), email), "");
  assert.equal(validatePassword("x".repeat(128), email), "");
  assert.equal(validatePassword("x".repeat(129), email), "Password must be at most 128 characters");
  assert.equal(validatePassword("", email), "Password must be at least 10 characters");
  assert.equal(validatePassword(" ".repeat(10), email), "Password cannot contain only whitespace");
  assert.equal(validatePassword(" visible  ", email), "");
  assert.equal(validatePassword("USER@EXAMPLE.COM", email), "Password cannot be the same as the email address");
  assert.equal(validatePassword("password123", email), "Choose a password that is not a documented demo password");
  assert.equal(validatePassword("password123", email, { allowDemo: true }), "");
  assert.equal(validatePassword(unchanged, email), "");
  assert.equal(unchanged, "A-unique-long-passphrase");
  assert.equal(validatePassword("ασφαλής κωδικός 2026", email), "");
  assert.equal(minimumPasswordLength, passwordPolicyMinimumLength);
  assert.equal(maximumPasswordLength, passwordPolicyMaximumLength);
  assert.equal(validAccountTokenInput(createAccountToken()),true);
  assert.equal(validAccountTokenInput("x".repeat(129)),false);
  assert.equal(validAccountTokenInput("not valid token spaces"),false);
});

test("action URLs require an absolute http(s) public URL", () => {
  const previous=process.env.APP_PUBLIC_URL;
  process.env.APP_PUBLIC_URL="https://staging.example.test/app";
  assert.match(accountActionUrl("reset-password","opaque"),/#\/reset-password\?token=opaque$/);
  process.env.APP_PUBLIC_URL="javascript:alert(1)";
  assert.throws(()=>accountActionUrl("reset-password","opaque"),/http or https/);
  if(previous===undefined)delete process.env.APP_PUBLIC_URL;else process.env.APP_PUBLIC_URL=previous;
  assert.match(genericForgotPasswordMessage,/If an active account/);
});
