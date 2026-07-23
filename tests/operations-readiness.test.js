import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constantTimeSecretMatches } from "../netlify/functions/_operations-utils.js";
import { lifecycleRetentionConfiguration } from "../netlify/functions/_lifecycle-cleanup.js";
import { checkStagingDeployment, validateDedicatedStagingRecipient } from "../scripts/_staging-preflight.mjs";
import { handler as publicDispatcher } from "../netlify/functions/account-email-dispatch.js";
import { config as dispatchSchedule } from "../netlify/functions/scheduled-account-email-dispatch.js";
import { config as cleanupSchedule } from "../netlify/functions/scheduled-lifecycle-cleanup.js";
import { inviteRequestFingerprint } from "../netlify/functions/_class-utils.js";

function fingerprint(urlText) {
  const url = new URL(urlText);
  return createHash("sha256").update(`${url.hostname.toLowerCase()}:${url.port || "5432"}/${url.pathname.replace(/^\//, "").toLowerCase()}`).digest("hex");
}

test("operational secrets use constant-time hash comparison and retention values are bounded", () => {
  assert.equal(constantTimeSecretMatches("correct", "correct"), true);
  assert.equal(constantTimeSecretMatches("wrong", "correct"), false);
  assert.equal(constantTimeSecretMatches("", "correct"), false);
  const previous = process.env.ACCOUNT_OUTBOX_RETENTION_DAYS;
  process.env.ACCOUNT_OUTBOX_RETENTION_DAYS = "29";
  assert.throws(() => lifecycleRetentionConfiguration(), /ACCOUNT_OUTBOX_RETENTION_DAYS/);
  if (previous === undefined) delete process.env.ACCOUNT_OUTBOX_RETENTION_DAYS; else process.env.ACCOUNT_OUTBOX_RETENTION_DAYS = previous;
});

test("public dispatcher rejects unauthenticated calls and workers declare internal schedules", async () => {
  const response = await publicDispatcher({ httpMethod: "POST", headers: {} });
  assert.equal(response.statusCode, 401);
  assert.equal(dispatchSchedule.schedule, "*/15 * * * *");
  assert.equal(cleanupSchedule.schedule, "17 2 * * *");
  const previous = { salt: process.env.INVITE_RATE_LIMIT_SALT, test: process.env.TEST_DATABASE_CONFIRMATION, staging: process.env.STAGING_DATABASE_CONFIRMATION };
  delete process.env.INVITE_RATE_LIMIT_SALT; delete process.env.TEST_DATABASE_CONFIRMATION; delete process.env.STAGING_DATABASE_CONFIRMATION;
  assert.throws(() => inviteRequestFingerprint({ headers: {} }), /INVITE_RATE_LIMIT_SALT/);
  if (previous.salt === undefined) delete process.env.INVITE_RATE_LIMIT_SALT; else process.env.INVITE_RATE_LIMIT_SALT = previous.salt;
  if (previous.test === undefined) delete process.env.TEST_DATABASE_CONFIRMATION; else process.env.TEST_DATABASE_CONFIRMATION = previous.test;
  if (previous.staging === undefined) delete process.env.STAGING_DATABASE_CONFIRMATION; else process.env.STAGING_DATABASE_CONFIRMATION = previous.staging;
});

test("staging preflight rejects unsafe inboxes and accepts non-secret hosted metadata", async () => {
  assert.throws(() => validateDedicatedStagingRecipient("person@gmail.com", "dedicated-nonproduction-inbox"), /personal mailbox/);
  const db = "postgresql://qa:runtime-value@db.staging.test/eduforge_staging";
  const environment = {
    STAGING_DATABASE_URL: db,
    STAGING_DATABASE_CONFIRMATION: "isolated-staging-database",
    STAGING_ENVIRONMENT_CONFIRMATION: "hosted-nonproduction-staging",
    DATABASE_URL: db,
    APP_PUBLIC_URL: "https://eduforge-staging.example.test",
    STAGING_PRODUCTION_APP_URL: "https://app.example.test",
    PRODUCTION_DATABASE_FINGERPRINT: fingerprint("postgresql://prod:not-used@db.production.test/eduforge_production"),
    ACCOUNT_RATE_LIMIT_SALT: "a".repeat(40),
    INVITE_RATE_LIMIT_SALT: "b".repeat(40),
    ACCOUNT_EMAIL_DISPATCH_SECRET: "c".repeat(40),
    OPERATIONAL_MONITORING_SECRET: "d".repeat(40),
    ACCOUNT_EMAIL_MODE: "preview",
    EDUFORGE_STAGING_QA_PASSWORD: "Unique-QA-Password-2026",
  };
  const result = await checkStagingDeployment(environment);
  assert.equal(result.latest_migration, "022_ultimate_b2_students_book_assignment_modes.sql");
  await assert.rejects(checkStagingDeployment({ ...environment, PRODUCTION_DATABASE_FINGERPRINT: fingerprint(db) }), /matches the production/);
  await assert.rejects(checkStagingDeployment({ ...environment, EDUFORGE_STAGING_QA_PASSWORD: "StagingOnly!2026" }), /retired shared staging password/);
});
