import test from "node:test";
import assert from "node:assert/strict";
import { buildAccountEmail, clearCapturedEmailsForTests, deliverAccountEmail, escapeEmailHtml, getCapturedEmailsForTests, setEmailTransportForTests } from "../netlify/functions/_email-utils.js";

function withEnvironment(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return Promise.resolve().then(callback).finally(() => {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  });
}

test("email templates escape user-controlled HTML and password confirmation has no token", () => {
  assert.equal(escapeEmailHtml('<script>"x"</script>'), "&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
  const message = buildAccountEmail({ templateType: "password_changed", name: "<Admin>" });
  assert.match(message.html, /&lt;Admin&gt;/);
  assert.equal(message.html.includes("token="), false);
});

test("capture is deterministic only for isolated tests", async () => {
  await withEnvironment({ TEST_DATABASE_CONFIRMATION: "isolated-test-database", ACCOUNT_EMAIL_MODE: "capture", APP_PUBLIC_URL: "https://test.example" }, async () => {
    clearCapturedEmailsForTests();
    await deliverAccountEmail({ recipient: "person@example.test", templateType: "password_reset", rawToken: "a".repeat(43), outboxId: "outbox", name: "Person" });
    assert.equal(getCapturedEmailsForTests().length, 1);
  });
  await assert.rejects(() => deliverAccountEmail({ recipient: "person@example.test", templateType: "password_changed", outboxId: "outbox" }), /SMTP configuration is incomplete/);
});

test("preview requires confirmed staging and SMTP refuses incomplete configuration", async () => {
  await withEnvironment({ ACCOUNT_EMAIL_MODE: "preview", APP_PUBLIC_URL: "https://preview.example" }, async () => {
    await assert.rejects(() => deliverAccountEmail({ recipient: "person@example.test", templateType: "password_reset", rawToken: "a".repeat(43), outboxId: "outbox" }), /staging confirmation/);
  });
  await withEnvironment({ ACCOUNT_EMAIL_MODE: "smtp" }, async () => {
    await assert.rejects(() => deliverAccountEmail({ recipient: "person@example.test", templateType: "password_changed", outboxId: "outbox" }), /SMTP configuration is incomplete/);
  });
});

test("SMTP mode uses the injected isolated transport without external email", async () => {
  await withEnvironment({ TEST_DATABASE_CONFIRMATION: "isolated-test-database", ACCOUNT_EMAIL_MODE: "smtp", SMTP_HOST: "smtp.test", SMTP_PORT: "587", SMTP_SECURE: "false", SMTP_USER: "user", SMTP_PASS: "secret", SMTP_FROM: "noreply@eduforge.test" }, async () => {
    let sent;
    setEmailTransportForTests({ sendMail: async (message) => { sent = message; return { messageId: "test-message" }; } });
    const result = await deliverAccountEmail({ recipient: "person@example.test", templateType: "password_changed", outboxId: "outbox", name: "Person" });
    assert.equal(result.state, "sent"); assert.equal(sent.text.includes("EduForge"), true); assert.equal(sent.text.includes("token="), false);
    setEmailTransportForTests(null);
  });
});
