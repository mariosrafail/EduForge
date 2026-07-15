import test from "node:test";
import assert from "node:assert/strict";
import { accountActionUrl, createAccountToken, genericForgotPasswordMessage, hashPrivateValue, validAccountTokenInput, validatePassword } from "../netlify/functions/_account-lifecycle-utils.js";

test("account tokens are high entropy and hashes do not expose input", () => {
  const first=createAccountToken(); const second=createAccountToken();
  assert.notEqual(first,second); assert.ok(first.length>=43); assert.equal(hashPrivateValue(first).includes(first),false);
});

test("lifecycle password policy rejects weak and demo credentials", () => {
  assert.match(validatePassword("short","user@example.com"),/10/);
  assert.match(validatePassword("          ","user@example.com"),/whitespace/);
  assert.match(validatePassword("user@example.com","user@example.com"),/email/);
  assert.match(validatePassword("password123","user@example.com"),/demo/);
  assert.equal(validatePassword("A-unique-long-passphrase","user@example.com"),"");
  assert.match(validatePassword("x".repeat(129),"user@example.com"),/at most 128/);
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
