import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handler } from "../netlify/functions/auth-signup.js";

const source = await readFile("netlify/functions/auth-signup.js", "utf8");

test("public school signup is denied before parsing or provisioning", async () => {
  for (const body of [
    JSON.stringify({
      schoolName: "Valid Looking School",
      adminName: "Valid Admin",
      email: "admin@example.test",
      password: "Never-Hashed-Password",
    }),
    "{malformed",
  ]) {
    const response = await handler({ httpMethod: "POST", body });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(JSON.parse(response.body), { error: "School account creation is invitation-only" });
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(response.headers["Set-Cookie"], undefined);
  }

  assert.doesNotMatch(source, /getSql|bcrypt|createSession|insert into|account_tokens|account_email_outbox|auth_sessions/i);
});

test("closed signup preserves compatibility method contracts", async () => {
  const options = await handler({ httpMethod: "OPTIONS" });
  assert.equal(options.statusCode, 204);
  assert.equal(options.body, "");
  assert.equal(options.headers["Cache-Control"], "no-store");

  const get = await handler({ httpMethod: "GET" });
  assert.equal(get.statusCode, 405);
  assert.deepEqual(JSON.parse(get.body), { error: "Method not allowed" });
  assert.equal(get.headers["Cache-Control"], "no-store");
});
