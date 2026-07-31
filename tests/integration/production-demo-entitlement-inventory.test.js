import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import {
  DEMO_ENTITLEMENT_CLASSIFICATIONS,
  DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION,
  MIGRATION_023_FILENAME,
  inventoryProductionDemoEntitlements,
} from "../../scripts/_production-demo-entitlement-inventory.mjs";
import { productionDatabaseFingerprint } from "../../scripts/_production-preflight.mjs";
import { hashAccessCode, maskAccessCode } from "../../netlify/functions/_licensing-utils.js";
import { applyCanonicalProductionMigrations } from "./_migration-test-helpers.mjs";

const { Pool } = pg;
const databaseUrl = process.env.TEST_DATABASE_URL || "";
const enabled = Boolean(databaseUrl)
  && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database";

function scoped(base, schema) {
  const url = new URL(base);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function productionEnvironment() {
  const neutralUrl = "postgresql://readonly:not-logged@ep-neutral.provider.net/application";
  return {
    DATABASE_URL: neutralUrl,
    PRODUCTION_DATABASE_FINGERPRINT: productionDatabaseFingerprint(neutralUrl),
    PRODUCTION_ENVIRONMENT_CONFIRMATION: "hosted-production",
    PRODUCTION_DATABASE_CONFIRMATION: "read-only-production-preflight",
    PRODUCTION_DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION: DEMO_ENTITLEMENT_INVENTORY_CONFIRMATION,
    PRODUCTION_APP_URL: "https://app.eduforge.example",
  };
}

test("production demo entitlement inventory is exact, read-only, and history-gated", {
  skip: !enabled,
  timeout: 180_000,
}, async (t) => {
  const schema = `eduforge_test_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`create schema "${schema}"`);
  const scopedUrl = scoped(databaseUrl, schema);
  const setup = new Pool({ connectionString: scopedUrl });

  t.after(async () => {
    await setup.end();
    await admin.query(`drop schema if exists "${schema}" cascade`);
    await admin.end();
  });

  const migrations = await applyCanonicalProductionMigrations(setup);
  const migration023 = migrations.find(({ filename }) => filename === MIGRATION_023_FILENAME);
  assert.ok(migration023);
  const runInventory = () => inventoryProductionDemoEntitlements({
    environment: productionEnvironment(),
    migrations,
    createPool: () => new Pool({ connectionString: scopedUrl }),
  });

  await setup.query("create table inventory_probe(value text)");
  await setup.query("insert into inventory_probe(value) values('unchanged')");
  const countsBefore = {
    schools: Number((await setup.query("select count(*) count from schools")).rows[0].count),
    users: Number((await setup.query("select count(*) count from app_users")).rows[0].count),
    access: Number((await setup.query("select count(*) count from book_access")).rows[0].count),
    history: Number((await setup.query("select count(*) count from eduforge_migration_history")).rows[0].count),
    probe: Number((await setup.query("select count(*) count from inventory_probe")).rows[0].count),
  };

  const canonical = await runInventory();
  assert.equal(canonical.migration023Verified, true);
  assert.equal(canonical.historicalSchoolCount, 1);
  assert.equal(canonical.historicalIdentityCount, 2);
  assert.equal(canonical.matchingEntitlementCount, 2);
  assert.equal(canonical.classification, DEMO_ENTITLEMENT_CLASSIFICATIONS.MATCHING_ENTITLEMENTS_PRESENT);

  const countsAfter = {
    schools: Number((await setup.query("select count(*) count from schools")).rows[0].count),
    users: Number((await setup.query("select count(*) count from app_users")).rows[0].count),
    access: Number((await setup.query("select count(*) count from book_access")).rows[0].count),
    history: Number((await setup.query("select count(*) count from eduforge_migration_history")).rows[0].count),
    probe: Number((await setup.query("select count(*) count from inventory_probe")).rows[0].count),
  };
  assert.deepEqual(countsAfter, countsBefore);
  assert.equal((await setup.query("select value from inventory_probe")).rows[0].value, "unchanged");

  const readOnly = await setup.connect();
  try {
    await readOnly.query("begin read only");
    await assert.rejects(
      readOnly.query("insert into inventory_probe(value) values('forbidden')"),
      (error) => error.code === "25006",
    );
  } finally {
    await readOnly.query("rollback");
    readOnly.release();
  }

  await setup.query(`
    insert into schools(name) values('Unrelated inventory school');
    insert into app_users(school_id,full_name,email,role,status)
    select id,'Unrelated Admin','unrelated-admin@inventory.invalid','admin','active'
    from schools where name='Unrelated inventory school';
    insert into publishers(name,slug) values('Unrelated Publisher','unrelated-inventory-publisher');
    insert into book_packages(publisher_id,title,slug,level,status)
    select id,'Unrelated Package','unrelated-inventory-package','B2','active'
    from publishers where slug='unrelated-inventory-publisher';
  `);
  await setup.query(`
    delete from book_access access
    using app_users app_user, schools school, book_packages package_record
    where access.user_id=app_user.id
      and app_user.school_id=school.id
      and access.book_package_id=package_record.id
      and school.name='Hamilton House ELT Demo'
      and package_record.slug='ultimate-b2'
      and (
        (lower(app_user.email)='elena.admin@example.com' and app_user.role='admin' and access.role_scope='school_admin')
        or
        (lower(app_user.email)='maria.teacher@example.com' and app_user.role='teacher' and access.role_scope='teacher')
      )
  `);
  const adminActivationCode = `INVENTORY-ADMIN-${randomUUID()}`;
  const teacherActivationCode = `INVENTORY-TEACHER-${randomUUID()}`;
  const adminActivationHash = hashAccessCode(adminActivationCode);
  const teacherActivationHash = hashAccessCode(teacherActivationCode);
  await setup.query(`
    with fixture(code_hash,code_mask) as (
      values ($1,$2),($3,$4)
    )
    insert into activation_codes(
      code_hash,code_mask,book_package_id,school_id,
      max_uses,used_count,status,expires_at
    )
    select fixture.code_hash,fixture.code_mask,package_record.id,school.id,
      1,0,'unused',now()+interval '1 day'
    from fixture
    cross join book_packages package_record
    cross join schools school
    where package_record.slug='ultimate-b2'
      and school.name='Hamilton House ELT Demo'
  `, [
    adminActivationHash,
    maskAccessCode(adminActivationCode),
    teacherActivationHash,
    maskAccessCode(teacherActivationCode),
  ]);
  await setup.query(`
    insert into book_access(user_id,book_package_id,activation_code_id,role_scope)
    select app_user.id,package_record.id,activation.id,
      case app_user.role when 'admin' then 'school_admin' when 'teacher' then 'teacher' end
    from app_users app_user
    join schools school on school.id=app_user.school_id
    cross join book_packages package_record
    join activation_codes activation on activation.code_hash=case app_user.role
      when 'admin' then $1
      when 'teacher' then $2
    end
    where school.name='Hamilton House ELT Demo'
      and package_record.slug='ultimate-b2'
      and lower(app_user.email) in ('elena.admin@example.com','maria.teacher@example.com')
  `, [adminActivationHash, teacherActivationHash]);
  await setup.query(`
    insert into book_access(user_id,book_package_id,role_scope)
    select app_user.id,package_record.id,
      case app_user.role when 'admin' then 'teacher' when 'teacher' then 'school_admin' end
    from app_users app_user
    join schools school on school.id=app_user.school_id
    cross join book_packages package_record
    where school.name='Hamilton House ELT Demo'
      and package_record.slug='ultimate-b2'
      and lower(app_user.email) in ('elena.admin@example.com','maria.teacher@example.com')
  `);

  const withoutMatching = await runInventory();
  assert.equal(withoutMatching.historicalIdentityCount, 2);
  assert.equal(withoutMatching.matchingEntitlementCount, 0);
  assert.equal(
    withoutMatching.classification,
    DEMO_ENTITLEMENT_CLASSIFICATIONS.HISTORICAL_IDENTITIES_WITHOUT_ENTITLEMENTS,
  );

  await setup.query(`
    delete from app_users app_user
    using schools school
    where app_user.school_id=school.id
      and school.name='Hamilton House ELT Demo'
      and lower(app_user.email) in ('elena.admin@example.com','maria.teacher@example.com')
  `);
  const absent = await runInventory();
  assert.equal(absent.historicalSchoolCount, 1);
  assert.equal(absent.historicalIdentityCount, 0);
  assert.equal(absent.matchingEntitlementCount, 0);
  assert.equal(absent.classification, DEMO_ENTITLEMENT_CLASSIFICATIONS.HISTORICAL_IDENTITIES_ABSENT);

  const removed023 = (await setup.query(
    "delete from eduforge_migration_history where filename=$1 returning applied_at",
    [MIGRATION_023_FILENAME],
  )).rows[0];
  await assert.rejects(runInventory(), /missing: 023_demo_teacher_ultimate_b2_access\.sql/);
  await setup.query(
    "insert into eduforge_migration_history(filename,checksum_sha256,applied_at) values($1,$2,$3)",
    [MIGRATION_023_FILENAME, migration023.checksum, removed023.applied_at],
  );

  await setup.query(
    "update eduforge_migration_history set checksum_sha256=$2 where filename=$1",
    [MIGRATION_023_FILENAME, "0".repeat(64)],
  );
  await assert.rejects(runInventory(), /checksum mismatch: 023_demo_teacher_ultimate_b2_access\.sql/);
  await setup.query(
    "update eduforge_migration_history set checksum_sha256=$2 where filename=$1",
    [MIGRATION_023_FILENAME, migration023.checksum],
  );

  await setup.query(
    "insert into eduforge_migration_history(filename,checksum_sha256) values('999_unknown.sql',$1)",
    ["a".repeat(64)],
  );
  await assert.rejects(runInventory(), /unknown: 999_unknown\.sql/);
  await setup.query("delete from eduforge_migration_history where filename='999_unknown.sql'");
});
