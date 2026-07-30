import test from "node:test";
import assert from "node:assert/strict";
import {
  assertMigrationHistoryReady,
  compareMigrationHistory,
  loadProductionMigrationFiles,
  loadProductionMigrationManifest,
  migrationChecksums,
  migrationManifestFingerprint,
  migrationManifestSummary,
  parseProductionMigrationManifest,
} from "../scripts/_migration-readiness.mjs";

const manifest = (...files) => files.map((filename, index) => `${index + 1}. \`${filename}\``).join("\n");
const minimumFiles = ["010_first.sql", "010_second.sql", "013_authorization_phase2.sql"];

test("current production manifest is dynamic, stable, and newline compatible", async () => {
  const migrations = await loadProductionMigrationManifest();
  const summary = migrationManifestSummary(migrations);
  assert.equal(summary.migrationCount, migrations.length);
  assert.equal(summary.latestMigration, migrations.at(-1).filename);
  assert.match(summary.manifestFingerprint, /^[a-f0-9]{64}$/);
  assert.equal(migrationManifestFingerprint(migrations), summary.manifestFingerprint);

  const lf = migrationChecksums("select 1;\nselect 2;\n");
  const crlf = migrationChecksums("select 1;\r\nselect 2;\r\n");
  assert.equal(lf.checksum, crlf.checksum);
  assert.ok(lf.compatibleChecksums.includes(crlf.compatibleChecksums.at(-1)));
});

test("manifest parser rejects unsafe, missing, duplicate, demo, non-SQL, and reordered entries", async () => {
  assert.deepEqual(parseProductionMigrationManifest(manifest(...minimumFiles)), minimumFiles);
  assert.throws(() => parseProductionMigrationManifest(""), /contains no ordered/);
  assert.throws(
    () => parseProductionMigrationManifest(manifest("013_authorization_phase2.sql", "013_authorization_phase2.sql")),
    /duplicate filename/,
  );
  assert.throws(
    () => parseProductionMigrationManifest(manifest("012_demo_login_passwords.sql", "013_authorization_phase2.sql")),
    /Demo password/,
  );
  assert.throws(
    () => parseProductionMigrationManifest(manifest("../013_authorization_phase2.sql")),
    /inside database/,
  );
  assert.throws(
    () => parseProductionMigrationManifest(manifest("013_authorization_phase2.txt")),
    /end in .sql/,
  );
  assert.throws(
    () => parseProductionMigrationManifest(manifest("014_later.sql", "013_authorization_phase2.sql")),
    /out of documented order/,
  );
  assert.throws(
    () => parseProductionMigrationManifest("2. `013_authorization_phase2.sql`"),
    /numbering must be sequential/,
  );
  assert.throws(
    () => parseProductionMigrationManifest("1. 013_authorization_phase2.sql"),
    /malformed ordered entry/,
  );
  await assert.rejects(
    loadProductionMigrationFiles(["013_authorization_phase2.sql"], async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    }),
    /listed in manifest does not exist/,
  );
});

test("manifest fingerprint changes with order, filename, content, additions, and removals", async () => {
  const base = await loadProductionMigrationFiles(minimumFiles, async (filename) => `select '${filename}';\n`);
  const swapped = [base[1], base[0], base[2]];
  const renamed = base.map((item, index) => index ? item : { ...item, filename: "010_renamed.sql" });
  const changed = base.map((item, index) => index ? item : { ...item, ...migrationChecksums(`${item.sql}select 2;\n`) });
  const added = [...base, { filename: "014_added.sql", ...migrationChecksums("select 3;\n") }];
  assert.notEqual(migrationManifestFingerprint(base), migrationManifestFingerprint(swapped));
  assert.notEqual(migrationManifestFingerprint(base), migrationManifestFingerprint(renamed));
  assert.notEqual(migrationManifestFingerprint(base), migrationManifestFingerprint(changed));
  assert.notEqual(migrationManifestFingerprint(base), migrationManifestFingerprint(added));
  assert.notEqual(migrationManifestFingerprint(base), migrationManifestFingerprint(base.slice(0, -1)));
});

test("migration-history comparison fails closed with concise filename diagnostics", async () => {
  const expected = await loadProductionMigrationFiles(minimumFiles, async (filename) => `select '${filename}';`);
  const exact = expected.map(({ filename, checksum }) => ({ filename, checksum_sha256: checksum }));
  assert.equal(compareMigrationHistory(expected, exact).ready, true);

  const empty = compareMigrationHistory(expected, []);
  assert.equal(empty.emptyHistory, true);
  assert.equal(empty.ready, false);

  const pending = compareMigrationHistory(expected, exact.slice(0, -1));
  assert.deepEqual(pending.pending, ["013_authorization_phase2.sql"]);
  assert.equal(pending.countMismatch, true);

  const missingMiddle = compareMigrationHistory(expected, [exact[0], exact[2]]);
  assert.deepEqual(missingMiddle.missing, ["010_second.sql"]);
  assert.deepEqual(missingMiddle.pending, []);

  const corrupted = exact.map((row, index) => index ? row : { ...row, checksum_sha256: "0".repeat(64) });
  assert.deepEqual(compareMigrationHistory(expected, corrupted).checksumMismatches, ["010_first.sql"]);

  const unknown = [...exact, { filename: "999_unknown.sql", checksum_sha256: "a".repeat(64) }];
  assert.deepEqual(compareMigrationHistory(expected, unknown).unknown, ["999_unknown.sql"]);

  const duplicate = [...exact, exact[0]];
  assert.deepEqual(compareMigrationHistory(expected, duplicate).duplicates, ["010_first.sql"]);

  assert.throws(
    () => assertMigrationHistoryReady(compareMigrationHistory(expected, corrupted)),
    (error) => error.message.includes("010_first.sql") && !error.message.includes("select '"),
  );

  const unsafeUnknown = [
    ...exact,
    {
      filename: "999_unknown.sql\noperator-secret",
      checksum_sha256: "f".repeat(64),
    },
  ];
  assert.throws(
    () => assertMigrationHistoryReady(compareMigrationHistory(expected, unsafeUnknown)),
    (error) =>
      error.message.includes("<invalid-filename>") &&
      !error.message.includes("operator-secret"),
  );
});
