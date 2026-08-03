import test from "node:test";
import assert from "node:assert/strict";
import {
  productionDatabaseFingerprint,
  productionDatabaseIdentity,
  validateProductionEnvironment,
} from "../scripts/_production-preflight.mjs";

function productionEnvironment(databaseUrl = "postgresql://runtime:private-value@db.provider.net/hhplms") {
  return {
    DATABASE_URL: databaseUrl,
    PRODUCTION_DATABASE_FINGERPRINT: productionDatabaseFingerprint(databaseUrl),
    PRODUCTION_ENVIRONMENT_CONFIRMATION: "hosted-production",
    PRODUCTION_DATABASE_CONFIRMATION: "read-only-production-preflight",
    PRODUCTION_APP_URL: "https://app.hhplms.example",
  };
}

test("production environment requires exact confirmations and safe URLs", () => {
  assert.throws(() => validateProductionEnvironment({}), /Missing required production variables/);
  assert.throws(
    () => validateProductionEnvironment({ ...productionEnvironment(), PRODUCTION_ENVIRONMENT_CONFIRMATION: "yes" }),
    /must equal hosted-production/,
  );
  assert.throws(
    () => validateProductionEnvironment({ ...productionEnvironment(), PRODUCTION_DATABASE_CONFIRMATION: "yes" }),
    /must equal read-only-production-preflight/,
  );
  assert.throws(
    () => validateProductionEnvironment({ ...productionEnvironment(), DATABASE_URL: "not-a-url" }),
    /valid URL/,
  );
  const loopback = "postgresql://user:password@127.0.0.1/hhplms";
  assert.throws(
    () => validateProductionEnvironment({
      ...productionEnvironment(loopback),
      PRODUCTION_DATABASE_FINGERPRINT: productionDatabaseFingerprint(loopback),
    }),
    /loopback/,
  );
  for (const unsafe of [
    "postgresql://user:password@staging.db.provider.net/hhplms",
    "postgresql://user:password@db.provider.net/hhplms_test",
  ]) {
    assert.throws(() => validateProductionEnvironment(productionEnvironment(unsafe)), /non-production/);
  }
  assert.throws(
    () => validateProductionEnvironment({ ...productionEnvironment(), PRODUCTION_APP_URL: "http://app.hhplms.example" }),
    /unsupported protocol/,
  );
  assert.throws(
    () => validateProductionEnvironment({ ...productionEnvironment(), PRODUCTION_APP_URL: "https://example.invalid" }),
    /hosted production application/,
  );
});

test("neutral hosted database identity passes and excludes credentials", () => {
  const first = "postgresql://first:one@ep-neutral-123.provider.net/appdb?sslmode=require";
  const second = "postgresql://second:two@ep-neutral-123.provider.net/appdb?sslmode=verify-full";
  assert.equal(productionDatabaseIdentity(first), "ep-neutral-123.provider.net:5432/appdb");
  assert.equal(productionDatabaseFingerprint(first), productionDatabaseFingerprint(second));
  const result = validateProductionEnvironment(productionEnvironment(first));
  assert.equal(result.connectionString, first);
  assert.equal(result.fingerprintPrefix.length, 12);
});

test("fingerprint mismatch and errors never expose database credentials", () => {
  const environment = {
    ...productionEnvironment(),
    PRODUCTION_DATABASE_FINGERPRINT: "0".repeat(64),
  };
  assert.throws(
    () => validateProductionEnvironment(environment),
    (error) => /does not match/.test(error.message) && !error.message.includes("private-value"),
  );
});
