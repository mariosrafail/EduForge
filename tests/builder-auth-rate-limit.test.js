import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  boundedBuilderRetryAfter,
  builderAccountLimit,
  builderLimiterDecision,
  builderLoginIdentifier,
  builderLoginIdentifiers,
  builderLoginWindowSeconds,
  builderPairLimit,
  builderPendingLeaseSeconds,
  builderRateLimitSalt,
  builderSourceLimit,
  canonicalizeBuilderSourceIp,
} from "../netlify-sites/ultimate-b2-builder/server/_builder-login-rate-limit.js";
import { platformAdminLoginIdentifier } from "../netlify/functions/_platform-admin-login-rate-limit.js";

const salt = "builder-auth-unit-rate-limit-salt-only";
const event = { headers: { "x-nf-client-connection-ip": "198.51.100.9" } };

test("Builder identifiers are canonical HMACs and domain-separated from Platform Administration", () => {
  assert.equal(canonicalizeBuilderSourceIp("198.51.100.9"), "198.51.100.9");
  assert.equal(canonicalizeBuilderSourceIp("invalid"), "unknown");
  const first = builderLoginIdentifiers(event, " Builder@Example.Test ", { BUILDER_AUTH_RATE_LIMIT_SALT: salt });
  const second = builderLoginIdentifiers(event, "builder@example.test", { BUILDER_AUTH_RATE_LIMIT_SALT: salt });
  assert.deepEqual(first, second);
  assert.match(first.requestFingerprint, /^[a-f0-9]{64}$/);
  assert.match(first.emailHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.requestFingerprint, first.emailHash);
  assert.notEqual(first.emailHash, platformAdminLoginIdentifier("email", "builder@example.test", salt));
  assert.notEqual(first.emailHash, builderLoginIdentifier("email", "builder@example.test", `${salt}-different`));
});

test("Builder-specific salt is required outside explicitly isolated test/local environments", () => {
  assert.throws(() => builderRateLimitSalt({}), /BUILDER_AUTH_RATE_LIMIT_SALT is required/);
  assert.throws(() => builderRateLimitSalt({ BUILDER_AUTH_RATE_LIMIT_SALT: "short" }), /at least 32/);
  assert.equal(builderRateLimitSalt({ TEST_DATABASE_CONFIRMATION: "isolated-test-database" }), "isolated-builder-auth-rate-limit-only");
  assert.equal(builderRateLimitSalt({ LOCAL_DATABASE_CONFIRMATION: "isolated-local-pilot" }), "isolated-builder-auth-rate-limit-only");
});

test("Builder rate-limit thresholds, pending lease, and Retry-After bounds match privileged policy", () => {
  assert.equal(builderLoginWindowSeconds, 900);
  assert.equal(builderPairLimit, 5);
  assert.equal(builderAccountLimit, 20);
  assert.equal(builderSourceLimit, 40);
  assert.equal(builderPendingLeaseSeconds, 30);
  assert.deepEqual(builderLimiterDecision({ pairFailures: 4, accountFailures: 19, sourceFailures: 39 }), {
    pairLimited: false, sourceLimited: false, accountLimited: false,
  });
  assert.deepEqual(builderLimiterDecision({ pairFailures: 5, accountFailures: 20, sourceFailures: 40 }), {
    pairLimited: true, sourceLimited: true, accountLimited: true,
  });
  assert.equal(boundedBuilderRetryAfter(0), 1);
  assert.equal(boundedBuilderRetryAfter(1.1), 2);
  assert.equal(boundedBuilderRetryAfter(901), 900);
});

test("Builder limiter persists reservations and outcomes through transaction-capable PostgreSQL", async () => {
  const source = await readFile("netlify-sites/ultimate-b2-builder/server/_builder-login-rate-limit.js", "utf8");
  assert.match(source, /authLoginTransaction|sql\.transaction/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /insert into builder_login_attempts/);
  assert.match(source, /outcome = 'pending'/);
  assert.match(source, /'rate_limited'/);
  assert.match(source, /builderPairPendingLimit/);
  assert.match(source, /builderSourcePendingLimit/);
  assert.match(source, /outcome = 'authenticated'/);
  assert.match(source, /last_success/);
  assert.doesNotMatch(source, /platform_admin_login_attempts|auth_login_attempts/);
});
