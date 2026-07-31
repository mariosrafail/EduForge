import pg from "pg";
import {
  assertMigrationHistoryReady,
  compareMigrationHistory,
  loadProductionMigrationManifest,
  migrationChecksumMatches,
  migrationManifestSummary,
} from "./_migration-readiness.mjs";
import { validateProductionEnvironment } from "./_production-preflight.mjs";

const { Pool } = pg;

export const DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION = "read-only-demo-entitlement-inventory";
export const MIGRATION_023_FILENAME = "023_demo_teacher_ultimate_b2_access.sql";
export const DEMO_ENTITLEMENT_CLASSIFICATIONS = Object.freeze({
  HISTORICAL_IDENTITIES_ABSENT: "historical-identities-absent",
  HISTORICAL_IDENTITIES_WITHOUT_ENTITLEMENTS: "historical-identities-present-without-matching-entitlements",
  MATCHING_ENTITLEMENTS_PRESENT: "matching-migration-023-entitlements-present",
  PARTIAL_OR_INCONSISTENT: "partial-or-internally-inconsistent",
});

const placeholderPattern = /(replace|placeholder|example\.invalid|changeme|change-me|your[_-]|dummy|secret123)/i;

function inventoryError(message) {
  const error = new Error(message);
  error.operatorSafe = true;
  return error;
}

function containsDatabasePlaceholder(value) {
  const url = new URL(value);
  return [url.username, url.password, url.hostname, url.pathname]
    .map((part) => decodeURIComponent(part || ""))
    .some((part) => placeholderPattern.test(part));
}

export function validateDemoEntitlementInventoryEnvironment(environment = process.env) {
  const confirmation = String(environment.PRODUCTION_DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION || "").trim();
  if (!confirmation) {
    throw inventoryError("Missing required production variable: PRODUCTION_DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION");
  }
  if (confirmation !== DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION) {
    throw inventoryError(
      `PRODUCTION_DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION must equal ${DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION}`,
    );
  }

  const target = validateProductionEnvironment(environment);
  if (containsDatabasePlaceholder(target.connectionString)) {
    throw inventoryError("DATABASE_URL must not contain placeholder identity or credential values");
  }
  return target;
}

function count(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw inventoryError("Production demo entitlement inventory returned invalid aggregate counts");
  }
  return parsed;
}

export function classifyDemoEntitlementInventory({
  historicalSchoolCount,
  historicalIdentityCount,
  matchingEntitlementCount,
}) {
  const schools = count(historicalSchoolCount);
  const identities = count(historicalIdentityCount);
  const entitlements = count(matchingEntitlementCount);

  if ((schools === 0 || schools === 1) && identities === 0 && entitlements === 0) {
    return DEMO_ENTITLEMENT_CLASSIFICATIONS.HISTORICAL_IDENTITIES_ABSENT;
  }
  if (schools === 1 && identities === 2 && entitlements === 0) {
    return DEMO_ENTITLEMENT_CLASSIFICATIONS.HISTORICAL_IDENTITIES_WITHOUT_ENTITLEMENTS;
  }
  if (schools === 1 && identities === 2 && entitlements === 2) {
    return DEMO_ENTITLEMENT_CLASSIFICATIONS.MATCHING_ENTITLEMENTS_PRESENT;
  }
  return DEMO_ENTITLEMENT_CLASSIFICATIONS.PARTIAL_OR_INCONSISTENT;
}

function assertMigration023(expected, history) {
  const manifestRows = expected.filter(({ filename }) => filename === MIGRATION_023_FILENAME);
  if (manifestRows.length !== 1) {
    throw inventoryError("Production manifest must contain exactly one migration 023 entry");
  }
  const historyRows = history.filter(({ filename }) => filename === MIGRATION_023_FILENAME);
  if (
    historyRows.length !== 1
    || !migrationChecksumMatches(manifestRows[0], historyRows[0].checksum_sha256)
  ) {
    throw inventoryError("Production migration history must contain exactly one compatible migration 023 entry");
  }
}

function assertExactHistoryOrder(expected, history) {
  const expectedNames = expected.map(({ filename }) => filename);
  const appliedNames = history.map(({ filename }) => filename);
  if (JSON.stringify(expectedNames) !== JSON.stringify(appliedNames)) {
    throw inventoryError("Production migration history order does not match the repository manifest");
  }
}

function migrationReadinessError(readiness) {
  try {
    assertMigrationHistoryReady(readiness);
  } catch (error) {
    throw inventoryError(error.message);
  }
}

export async function inventoryProductionDemoEntitlements({
  environment = process.env,
  createPool = (connectionString) => new Pool({ connectionString }),
  migrations,
} = {}) {
  const target = validateDemoEntitlementInventoryEnvironment(environment);
  let pool;
  let client;
  let began = false;

  try {
    const expected = migrations || await loadProductionMigrationManifest();
    const manifest = migrationManifestSummary(expected);
    const manifest023 = expected.filter(({ filename }) => filename === MIGRATION_023_FILENAME);
    if (manifest023.length !== 1) {
      throw inventoryError("Production manifest must contain exactly one migration 023 entry");
    }

    pool = createPool(target.connectionString);
    client = await pool.connect();
    await client.query("begin read only");
    began = true;
    await client.query("set local statement_timeout = '15s'");
    await client.query("set local lock_timeout = '2s'");
    await client.query("set local idle_in_transaction_session_timeout = '20s'");

    const historyExists = (await client.query(
      "select to_regclass(current_schema() || '.eduforge_migration_history') is not null as exists",
    )).rows[0]?.exists;
    if (!historyExists) throw inventoryError("Production migration history table is missing");

    const history = (await client.query(
      "select filename,checksum_sha256,applied_at from eduforge_migration_history order by applied_at,filename",
    )).rows;
    const readiness = compareMigrationHistory(expected, history);
    if (!readiness.ready) migrationReadinessError(readiness);
    assertExactHistoryOrder(expected, history);
    assertMigration023(expected, history);

    const aggregate = (await client.query(`
      with historical_schools as (
        select id
        from schools
        where name = $1
      ), historical_identities as (
        select app_user.id, app_user.role, app_user.status
        from app_users app_user
        join historical_schools school on school.id = app_user.school_id
        where
          (lower(app_user.email) = $2 and app_user.role = 'admin')
          or (lower(app_user.email) = $3 and app_user.role = 'teacher')
      ), matching_entitlements as (
        select access.id
        from historical_identities identity
        join book_access access on access.user_id = identity.id
        join book_packages package_record on package_record.id = access.book_package_id
        where identity.status = 'active'
          and package_record.slug = $4
          and package_record.status = 'active'
          and access.activation_code_id is null
          and access.role_scope = case identity.role
            when 'admin' then 'school_admin'
            when 'teacher' then 'teacher'
          end
      )
      select
        (select count(*)::int from historical_schools) as historical_school_count,
        (select count(*)::int from historical_identities) as historical_identity_count,
        (select count(*)::int from matching_entitlements) as matching_entitlement_count
    `, [
      "Hamilton House ELT Demo",
      "elena.admin@example.com",
      "maria.teacher@example.com",
      "ultimate-b2",
    ])).rows[0];

    const result = {
      migration023Verified: true,
      historicalSchoolCount: count(aggregate?.historical_school_count),
      historicalIdentityCount: count(aggregate?.historical_identity_count),
      matchingEntitlementCount: count(aggregate?.matching_entitlement_count),
      classification: "",
      databaseFingerprintPrefix: target.fingerprintPrefix,
      manifestFingerprint: manifest.manifestFingerprint,
    };
    result.classification = classifyDemoEntitlementInventory(result);
    return result;
  } catch (error) {
    if (error.operatorSafe) throw error;
    throw inventoryError("Production demo entitlement inventory could not be completed");
  } finally {
    if (began && client) await client.query("rollback").catch(() => {});
    if (client) {
      try {
        client.release();
      } catch {
        // The operation is already complete or failed; never expose pool internals.
      }
    }
    if (pool) await pool.end().catch(() => {});
  }
}
