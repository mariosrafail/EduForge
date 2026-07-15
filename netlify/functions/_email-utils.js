import { accountActionUrl } from "./_account-lifecycle-utils.js";

let capturedMessages = [];

function isolatedEnvironment() {
  return process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database" || process.env.STAGING_DATABASE_CONFIRMATION === "isolated-staging-database";
}

export function clearCapturedEmailsForTests() {
  if (!isolatedEnvironment()) throw new Error("Email capture requires an explicitly isolated database");
  capturedMessages = [];
}

export function getCapturedEmailsForTests() {
  if (!isolatedEnvironment()) throw new Error("Email capture requires an explicitly isolated database");
  return structuredClone(capturedMessages);
}

export async function deliverAccountEmail({ recipient, templateType, rawToken = "", outboxId, name = "" }) {
  const mode = process.env.ACCOUNT_EMAIL_MODE || (isolatedEnvironment() ? "capture" : "provider");
  const action = templateType === "account_invitation" ? "accept-invitation" : "reset-password";
  const actionUrl = rawToken ? accountActionUrl(action, rawToken) : "";

  if (mode === "capture") {
    if (!isolatedEnvironment()) throw new Error("Email capture is disabled outside isolated environments");
    capturedMessages.push({ recipient, templateType, actionUrl, outboxId, name });
    return { state: "captured", reference: `capture:${outboxId}` };
  }
  if (mode === "preview") {
    if (process.env.STAGING_DATABASE_CONFIRMATION !== "isolated-staging-database") throw new Error("Email preview requires isolated staging confirmation");
    return { state: "preview", reference: `preview:${outboxId}`, previewUrl: actionUrl };
  }
  return { state: "provider_required", reference: "provider:not-configured" };
}

export async function markEmailDelivery(sql, outboxId, delivery) {
  await sql`
    update account_email_outbox
    set delivery_state = ${delivery.state}, provider_reference = ${delivery.reference || null},
        attempt_count = attempt_count + 1,
        delivered_at = case when ${delivery.state} = 'sent' then now() else delivered_at end
    where id = ${outboxId}
  `;
}
