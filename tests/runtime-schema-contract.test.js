import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runtimeSchemaContract } from "../netlify/functions/_runtime-schema-contract.js";
import {
  expectedRuntimeSchemaContractSource,
  runtimeSchemaContractData,
  runtimeSchemaContractUrl,
} from "../scripts/generate-runtime-schema-contract.mjs";
import {
  loadProductionMigrationManifest,
  migrationManifestSummary,
} from "../scripts/_migration-readiness.mjs";

test("generated runtime contract exactly matches the production manifest", async () => {
  const migrations = await loadProductionMigrationManifest();
  const summary = migrationManifestSummary(migrations);
  const expected = runtimeSchemaContractData(migrations);
  assert.deepEqual(runtimeSchemaContract, expected);
  assert.equal(runtimeSchemaContract.expectedMigrationCount, migrations.length);
  assert.equal(runtimeSchemaContract.latestMigration, migrations.at(-1).filename);
  assert.equal(runtimeSchemaContract.manifestFingerprint, summary.manifestFingerprint);
  assert.equal(new Set(runtimeSchemaContract.expectedMigrations.map(({ filename }) => filename)).size, migrations.length);
  assert.equal(runtimeSchemaContract.expectedMigrations.every(({ compatibleChecksums }) =>
    compatibleChecksums.length >= 1 && compatibleChecksums.every((checksum) => /^[a-f0-9]{64}$/.test(checksum))), true);

  const committed = (await readFile(runtimeSchemaContractUrl, "utf8")).replace(/\r\n/g, "\n");
  assert.equal(committed, await expectedRuntimeSchemaContractSource());
  assert.equal(committed.includes("create table"), false);
  assert.equal(committed.includes("postgresql://"), false);
  assert.equal(committed.includes("password"), true, "column metadata may name password_hash");
  assert.equal(/password["']?\s*:/.test(committed), false, "no password value is embedded");
});

test("contract drift is detectable without rewriting the committed file", async () => {
  const expected = await expectedRuntimeSchemaContractSource();
  assert.notEqual(expected.replace(runtimeSchemaContract.latestMigration, "999_stale.sql"), expected);
});
