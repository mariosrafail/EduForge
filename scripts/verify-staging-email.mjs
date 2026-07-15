import { randomBytes, randomUUID } from "node:crypto";
import { deliverAccountEmail } from "../netlify/functions/_email-utils.js";
import { validateDedicatedStagingRecipient } from "./_staging-preflight.mjs";

const required = ["STAGING_DATABASE_CONFIRMATION", "STAGING_ENVIRONMENT_CONFIRMATION", "STAGING_EMAIL_RECIPIENT", "STAGING_EMAIL_CONFIRMATION", "APP_PUBLIC_URL", "ACCOUNT_EMAIL_MODE", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
const missing = required.filter((name) => !String(process.env[name] || "").trim());
if (missing.length) {
  console.error(`Staging email verification not run; missing: ${missing.join(", ")}`);
  process.exit(1);
}
if (process.env.STAGING_DATABASE_CONFIRMATION !== "isolated-staging-database" || process.env.STAGING_ENVIRONMENT_CONFIRMATION !== "hosted-nonproduction-staging") throw new Error("Explicit hosted staging confirmation is required");
if (process.env.ACCOUNT_EMAIL_MODE !== "smtp") throw new Error("Staging email verification requires ACCOUNT_EMAIL_MODE=smtp");
const recipient = validateDedicatedStagingRecipient(process.env.STAGING_EMAIL_RECIPIENT, process.env.STAGING_EMAIL_CONFIRMATION);
const app = new URL(process.env.APP_PUBLIC_URL);
if (app.protocol !== "https:" || !/(staging|stage|qa|sandbox|preview|test)/i.test(app.hostname)) throw new Error("APP_PUBLIC_URL must be clearly hosted staging HTTPS");

const cases = [
  ["account_invitation", randomBytes(32).toString("base64url")],
  ["password_reset", randomBytes(32).toString("base64url")],
  ["password_changed", ""],
];
for (const [templateType, rawToken] of cases) {
  const result = await deliverAccountEmail({ recipient, templateType, rawToken, outboxId: randomUUID(), name: "EduForge Staging QA" });
  if (result.state !== "sent") throw new Error(`${templateType} delivery failed with a sanitized status`);
  console.log(`PASS ${templateType}: accepted by dedicated staging SMTP.`);
}
console.log("Staging SMTP verification completed without printing recipients, links, tokens, or provider details.");
