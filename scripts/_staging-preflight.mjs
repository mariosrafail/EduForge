import { createHash } from "node:crypto";
import { loadProductionMigrationManifest, requireSafeDatabase } from "./_staging-db.mjs";
import { requireQaPassword } from "./_staging-qa-data.mjs";

const requiredNames = [
  "STAGING_DATABASE_URL", "STAGING_DATABASE_CONFIRMATION", "STAGING_ENVIRONMENT_CONFIRMATION",
  "DATABASE_URL", "APP_PUBLIC_URL", "STAGING_PRODUCTION_APP_URL", "PRODUCTION_DATABASE_FINGERPRINT",
  "ACCOUNT_RATE_LIMIT_SALT", "INVITE_RATE_LIMIT_SALT", "ACCOUNT_EMAIL_DISPATCH_SECRET",
  "OPERATIONAL_MONITORING_SECRET", "ACCOUNT_EMAIL_MODE",
  "EDUFORGE_STAGING_QA_PASSWORD",
];
const placeholderPattern = /(replace|placeholder|example\.invalid|changeme|change-me|your[_-]|dummy|secret123)/i;
const commonMailboxDomains = new Set(["gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com"]);

function required(environment, names = requiredNames) {
  const missing = names.filter((name) => !String(environment[name] || "").trim());
  if (missing.length) throw new Error(`Missing required staging variables: ${missing.join(", ")}`);
}

function parsedUrl(value, name, protocols) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  if (!protocols.includes(url.protocol)) throw new Error(`${name} uses an unsupported protocol`);
  return url;
}

function databaseFingerprint(value) {
  const url = parsedUrl(value, "STAGING_DATABASE_URL", ["postgres:", "postgresql:"]);
  const identity = `${url.hostname.toLowerCase()}:${url.port || "5432"}/${url.pathname.replace(/^\//, "").toLowerCase()}`;
  return createHash("sha256").update(identity).digest("hex");
}

export function validateDedicatedStagingRecipient(value, confirmation) {
  if (confirmation !== "dedicated-nonproduction-inbox") throw new Error("STAGING_EMAIL_CONFIRMATION must confirm a dedicated non-production inbox");
  const recipient = String(value || "").trim().toLowerCase();
  const match = recipient.match(/^[^\s@]+@([^\s@]+)$/);
  if (!match) throw new Error("STAGING_EMAIL_RECIPIENT must be a valid email address");
  if (commonMailboxDomains.has(match[1])) throw new Error("STAGING_EMAIL_RECIPIENT must not use a personal mailbox provider");
  if (!/(staging|stage|qa|test|sandbox|mailtrap|mailhog|ethereal)/.test(recipient)) throw new Error("STAGING_EMAIL_RECIPIENT must visibly identify a non-production inbox");
  return recipient;
}

export async function checkStagingDeployment(environment = process.env) {
  required(environment);
  requireQaPassword(environment);
  if (environment.STAGING_ENVIRONMENT_CONFIRMATION !== "hosted-nonproduction-staging") throw new Error("Hosted staging confirmation is invalid");
  requireSafeDatabase("staging", { ...environment, DATABASE_URL: "" });
  if (databaseFingerprint(environment.DATABASE_URL) !== databaseFingerprint(environment.STAGING_DATABASE_URL)) {
    throw new Error("Hosted staging DATABASE_URL must identify the verified staging database");
  }
  if (databaseFingerprint(environment.STAGING_DATABASE_URL) === String(environment.PRODUCTION_DATABASE_FINGERPRINT).toLowerCase()) {
    throw new Error("Staging database matches the production database fingerprint");
  }
  const app = parsedUrl(environment.APP_PUBLIC_URL, "APP_PUBLIC_URL", ["https:"]);
  const productionApp = parsedUrl(environment.STAGING_PRODUCTION_APP_URL, "STAGING_PRODUCTION_APP_URL", ["https:"]);
  if (app.origin === productionApp.origin) throw new Error("Hosted staging and production application URLs must differ");
  if (!/(staging|stage|qa|sandbox|preview|test)/i.test(app.hostname)) throw new Error("APP_PUBLIC_URL hostname must visibly identify staging");
  for (const name of ["ACCOUNT_RATE_LIMIT_SALT", "INVITE_RATE_LIMIT_SALT", "ACCOUNT_EMAIL_DISPATCH_SECRET", "OPERATIONAL_MONITORING_SECRET"]) {
    const value = String(environment[name]);
    if (value.length < 32 || placeholderPattern.test(value)) throw new Error(`${name} must be a non-placeholder secret of at least 32 characters`);
  }
  if (environment.ACCOUNT_RATE_LIMIT_SALT === environment.INVITE_RATE_LIMIT_SALT) throw new Error("Account and invite salts must differ");
  if (!['preview', 'smtp'].includes(environment.ACCOUNT_EMAIL_MODE)) throw new Error("Hosted staging email mode must be preview or smtp");
  if (environment.ACCOUNT_EMAIL_MODE === "smtp") {
    required(environment, ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM", "STAGING_EMAIL_RECIPIENT", "STAGING_EMAIL_CONFIRMATION"]);
    validateDedicatedStagingRecipient(environment.STAGING_EMAIL_RECIPIENT, environment.STAGING_EMAIL_CONFIRMATION);
    if (placeholderPattern.test(environment.SMTP_PASS)) throw new Error("SMTP_PASS must not be a placeholder");
  }
  const migrations = await loadProductionMigrationManifest();
  if (migrations.some((item) => item.filename === "012_demo_login_passwords.sql")) throw new Error("Demo-password migration is forbidden");
  if (migrations.at(-1)?.filename !== "028_platform_administration.sql") throw new Error("Production migration manifest must end at 028_platform_administration.sql");
  return { environment: "hosted-staging", app_host: app.hostname, email_mode: environment.ACCOUNT_EMAIL_MODE, migration_count: migrations.length, latest_migration: migrations.at(-1).filename };
}
