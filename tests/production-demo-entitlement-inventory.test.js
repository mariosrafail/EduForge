import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_ENTITLEMENT_CLASSIFICATIONS,
  DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION,
  classifyDemoEntitlementInventory,
  inventoryProductionDemoEntitlements,
  validateDemoEntitlementInventoryEnvironment,
} from "../scripts/_production-demo-entitlement-inventory.mjs";
import { loadProductionMigrationManifest } from "../scripts/_migration-readiness.mjs";
import { productionDatabaseFingerprint } from "../scripts/_production-preflight.mjs";

function productionEnvironment(databaseUrl = "postgresql://runtime:private-value@db.provider.net/hhplms") {
  return {
    DATABASE_URL: databaseUrl,
    PRODUCTION_DATABASE_FINGERPRINT: productionDatabaseFingerprint(databaseUrl),
    PRODUCTION_ENVIRONMENT_CONFIRMATION: "hosted-production",
    PRODUCTION_DATABASE_CONFIRMATION: "read-only-production-preflight",
    PRODUCTION_DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION: DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION,
    PRODUCTION_APP_URL: "https://app.hhplms.example",
  };
}

async function inventoryHarness({
  aggregate = {
    historical_school_count: 1,
    historical_identity_count: 2,
    matching_entitlement_count: 2,
  },
  queryError,
} = {}) {
  const migrations = await loadProductionMigrationManifest();
  const history = migrations.map(({ filename, checksum }, index) => ({
    filename,
    checksum_sha256: checksum,
    applied_at: new Date(index * 1_000).toISOString(),
  }));
  const statements = [];
  let released = false;
  let ended = false;
  const client = {
    async query(sql) {
      statements.push(sql);
      if (queryError && String(sql).includes("historical_schools")) throw queryError;
      if (String(sql).includes("to_regclass")) return { rows: [{ exists: true }] };
      if (String(sql).includes("select filename,checksum_sha256")) return { rows: history };
      if (String(sql).includes("historical_schools")) return { rows: [aggregate] };
      return { rows: [] };
    },
    release() {
      released = true;
    },
  };
  const createPool = () => ({
    async connect() {
      return client;
    },
    async end() {
      ended = true;
    },
  });
  const run = () => inventoryProductionDemoEntitlements({
    environment: productionEnvironment(),
    migrations,
    createPool,
  });
  return {
    run,
    statements,
    state: () => ({ released, ended }),
  };
}

test("inventory requires its additional exact confirmation", () => {
  const missing = productionEnvironment();
  delete missing.PRODUCTION_DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION;
  assert.throws(
    () => validateDemoEntitlementInventoryEnvironment(missing),
    /Missing required production variable: PRODUCTION_DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION/,
  );
  assert.throws(
    () => validateDemoEntitlementInventoryEnvironment({
      ...productionEnvironment(),
      PRODUCTION_DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION: "yes",
    }),
    /must equal read-only-demo-entitlement-inventory/,
  );
});
test("inventory requires the existing production environment variables", () => {
  assert.throws(
    () => validateDemoEntitlementInventoryEnvironment({
      PRODUCTION_DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION: DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION,
    }),
    /Missing required production variables/,
  );
});

test("inventory rejects loopback and non-production-looking targets", () => {
  const loopback = "postgresql://runtime:private-value@127.0.0.1/hhplms";
  assert.throws(
    () => validateDemoEntitlementInventoryEnvironment(productionEnvironment(loopback)),
    /loopback/,
  );
  for (const unsafe of [
    "postgresql://runtime:private-value@staging.db.provider.net/hhplms",
    "postgresql://runtime:private-value@db.provider.net/hhplms_test",
    "postgresql://runtime:private-value@preview.db.provider.net/hhplms",
    "postgresql://runtime:private-value@qa.db.provider.net/hhplms",
  ]) {
    assert.throws(
      () => validateDemoEntitlementInventoryEnvironment(productionEnvironment(unsafe)),
      /non-production/,
    );
  }
});

test("inventory rejects fingerprint mismatch and placeholder values", () => {
  assert.throws(
    () => validateDemoEntitlementInventoryEnvironment({
      ...productionEnvironment(),
      PRODUCTION_DATABASE_FINGERPRINT: "0".repeat(64),
    }),
    /does not match/,
  );
  const placeholder = "postgresql://changeme:secret123@db.provider.net/hhplms";
  assert.throws(
    () => validateDemoEntitlementInventoryEnvironment(productionEnvironment(placeholder)),
    /placeholder/,
  );
});

test("inventory errors redact credentials and raw target values", async () => {
  const raw = "postgresql://runtime:private-value@db.provider.net/hhplms?sslmode=require";
  await assert.rejects(
    inventoryProductionDemoEntitlements({
      environment: productionEnvironment(raw),
      createPool() {
        throw new Error(`connection failed for ${raw}`);
      },
    }),
    (error) =>
      error.message === "Production demo entitlement inventory could not be completed"
      && !error.message.includes("private-value")
      && !error.message.includes("db.provider.net"),
  );
});

test("aggregate classification is stable and fails ambiguous states closed", () => {
  const classify = (historicalSchoolCount, historicalIdentityCount, matchingEntitlementCount) => (
    classifyDemoEntitlementInventory({
      historicalSchoolCount,
      historicalIdentityCount,
      matchingEntitlementCount,
    })
  );
  assert.equal(classify(0, 0, 0), DEMO_ENTITLEMENT_CLASSIFICATIONS.HISTORICAL_IDENTITIES_ABSENT);
  assert.equal(classify(1, 0, 0), DEMO_ENTITLEMENT_CLASSIFICATIONS.HISTORICAL_IDENTITIES_ABSENT);
  assert.equal(classify(1, 2, 0), DEMO_ENTITLEMENT_CLASSIFICATIONS.HISTORICAL_IDENTITIES_WITHOUT_ENTITLEMENTS);
  assert.equal(classify(1, 2, 2), DEMO_ENTITLEMENT_CLASSIFICATIONS.MATCHING_ENTITLEMENTS_PRESENT);
  assert.equal(classify(1, 1, 0), DEMO_ENTITLEMENT_CLASSIFICATIONS.PARTIAL_OR_INCONSISTENT);
  assert.equal(classify(2, 2, 2), DEMO_ENTITLEMENT_CLASSIFICATIONS.PARTIAL_OR_INCONSISTENT);
  assert.equal(classify(1, 2, 1), DEMO_ENTITLEMENT_CLASSIFICATIONS.PARTIAL_OR_INCONSISTENT);
});

test("successful inventory returns aggregate-only output and enforces transaction cleanup", async () => {
  const harness = await inventoryHarness();
  const result = await harness.run();
  assert.deepEqual(result, {
    migration023Verified: true,
    historicalSchoolCount: 1,
    historicalIdentityCount: 2,
    matchingEntitlementCount: 2,
    classification: DEMO_ENTITLEMENT_CLASSIFICATIONS.MATCHING_ENTITLEMENTS_PRESENT,
    databaseFingerprintPrefix: productionEnvironment().PRODUCTION_DATABASE_FINGERPRINT.slice(0, 12),
    manifestFingerprint: "5b4d5d784c4dab7043bd2b9b31eccbf4bbd8afaed2286110a60b8e0a27548633",
  });
  assert.equal(harness.statements[0], "begin read only");
  assert.ok(harness.statements.includes("set local statement_timeout = '15s'"));
  assert.ok(harness.statements.includes("set local lock_timeout = '2s'"));
  assert.ok(harness.statements.includes("set local idle_in_transaction_session_timeout = '20s'"));
  assert.equal(harness.statements.at(-1), "rollback");
  assert.deepEqual(harness.state(), { released: true, ended: true });

  const publicOutput = JSON.stringify(result);
  for (const forbidden of [
    "Hamilton House ELT Demo",
    "elena.admin@example.com",
    "maria.teacher@example.com",
    "ultimate-b2",
    "private-value",
    "db.provider.net",
  ]) {
    assert.equal(publicOutput.includes(forbidden), false);
  }
});

test("database query failures remain redacted and still roll back, release, and close", async () => {
  const harness = await inventoryHarness({
    queryError: new Error("raw row exposed private-value and elena.admin@example.com"),
  });
  await assert.rejects(
    harness.run(),
    (error) => error.message === "Production demo entitlement inventory could not be completed",
  );
  assert.equal(harness.statements.at(-1), "rollback");
  assert.deepEqual(harness.state(), { released: true, ended: true });
});
