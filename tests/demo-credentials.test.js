import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { DEMO_ACCOUNT_PASSWORD } from "../scripts/_demo-credentials.mjs";
import {
  MULTI_SCHOOL_DEMO_PASSWORD,
  MULTI_SCHOOL_LEGACY_SEED_KEYS,
  MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD,
  MULTI_SCHOOL_SEED_KEY,
  MULTI_SCHOOL_SEED_KEYS,
} from "../scripts/_multi-school-seed-data.mjs";
import {
  QA_LEGACY_SEED_KEYS,
  QA_SEED_KEY,
  QA_SEED_KEYS,
  requireQaPassword,
} from "../scripts/_staging-qa-data.mjs";

test("fictional seeded identities share the canonical demo password", () => {
  assert.equal(DEMO_ACCOUNT_PASSWORD, "password123");
  assert.equal(MULTI_SCHOOL_DEMO_PASSWORD, DEMO_ACCOUNT_PASSWORD);
  assert.equal(MULTI_SCHOOL_PLATFORM_ADMIN_PASSWORD, DEMO_ACCOUNT_PASSWORD);
  assert.equal(requireQaPassword({ HHPLMS_STAGING_QA_PASSWORD: DEMO_ACCOUNT_PASSWORD }), DEMO_ACCOUNT_PASSWORD);
  assert.equal(requireQaPassword({ EDUFORGE_STAGING_QA_PASSWORD: DEMO_ACCOUNT_PASSWORD }), DEMO_ACCOUNT_PASSWORD);
  assert.throws(() => requireQaPassword({ HHPLMS_STAGING_QA_PASSWORD: "not-the-demo-password" }), /canonical password/);
  assert.throws(() => requireQaPassword({
    HHPLMS_STAGING_QA_PASSWORD: DEMO_ACCOUNT_PASSWORD,
    EDUFORGE_STAGING_QA_PASSWORD: "different",
  }), /conflicts/);
});

test("current seed registries retain narrow legacy-marker compatibility", () => {
  assert.deepEqual(MULTI_SCHOOL_SEED_KEYS, [MULTI_SCHOOL_SEED_KEY, ...MULTI_SCHOOL_LEGACY_SEED_KEYS]);
  assert.deepEqual(QA_SEED_KEYS, [QA_SEED_KEY, ...QA_LEGACY_SEED_KEYS]);
});

test("the optional local demo migration stores a bcrypt password123 hash", async () => {
  const migration = await readFile("database/012_demo_login_passwords.sql", "utf8");
  const hashes = [...migration.matchAll(/\$2[aby]\$12\$[./A-Za-z0-9]{53}/g)].map((match) => match[0]);
  assert.ok(hashes.length > 0, "migration must include a bcrypt cost-12 hash");
  for (const hash of new Set(hashes)) {
    assert.equal(await bcrypt.compare(DEMO_ACCOUNT_PASSWORD, hash), true);
    assert.equal(await bcrypt.compare("incorrect-password", hash), false);
  }
  assert.doesNotMatch(migration, /password_hash\s*=\s*'password123'|values\s*\([^)]*'password123'/i);
});
