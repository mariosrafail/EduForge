import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handler } from "../netlify/functions/auth-student-signup.js";

function event(body) {
  return {
    httpMethod: "POST",
    headers: { host: "localhost:8888", "x-nf-client-connection-ip": "127.0.0.1" },
    body: JSON.stringify({
      fullName: "Policy Student",
      email: "policy-student@example.test",
      classCode: "VALIDA12",
      ...body,
    }),
  };
}

test("Student signup rejects password-policy failures before database access", async () => {
  const cases = [
    ["x".repeat(9), {}, "Password must be at least 10 characters"],
    ["x".repeat(129), {}, "Password must be at most 128 characters"],
    [" ".repeat(10), {}, "Password cannot contain only whitespace"],
    ["POLICY-STUDENT@EXAMPLE.TEST", {}, "Password cannot be the same as the email address"],
    ["password123", {}, "Choose a password that is not a documented demo password"],
  ];

  for (const [password, overrides, error] of cases) {
    const response = await handler(event({ password, ...overrides }));
    assert.equal(response.statusCode, 400);
    assert.deepEqual(JSON.parse(response.body), { error });
    assert.equal(response.headers?.["Set-Cookie"], undefined);
  }
  const source = await readFile("netlify/functions/auth-student-signup.js", "utf8");
  assert.ok(source.indexOf("validatePassword(password, email)") < source.indexOf("const sql = database()"));
  assert.ok(source.indexOf("validatePassword(password, email)") < source.indexOf("const classItem = await findClass"));
  assert.ok(source.indexOf("validatePassword(password, email)") < source.indexOf("const passwordHash = await hashPassword"));
});
