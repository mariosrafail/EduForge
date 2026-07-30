import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const databaseDirectory = fileURLToPath(new URL("../database/", import.meta.url));
const manifestPath = path.join(databaseDirectory, "MIGRATIONS.md");

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeMigrationNewlines(value) {
  return String(value).replace(/\r\n?/g, "\n");
}

export function migrationChecksums(sql) {
  const source = String(sql);
  const normalized = normalizeMigrationNewlines(source);
  const checksum = sha256(normalized);
  return {
    checksum,
    compatibleChecksums: [...new Set([
      checksum,
      sha256(source),
      sha256(normalized.replaceAll("\n", "\r\n")),
    ])],
  };
}

export function migrationChecksumMatches(migration, appliedChecksum) {
  return (migration.compatibleChecksums || [migration.checksum]).includes(String(appliedChecksum || "").toLowerCase());
}

function validateManifestFilename(filename) {
  if (!filename.endsWith(".sql")) throw new Error(`Production migration manifest entry must end in .sql: ${filename}`);
  if (
    filename !== path.basename(filename)
    || filename.includes("/")
    || filename.includes("\\")
    || filename.includes("..")
  ) {
    throw new Error(`Production migration filename must remain inside database/: ${filename}`);
  }
  if (!/^\d{3}_[a-z0-9][a-z0-9_-]*\.sql$/.test(filename)) {
    throw new Error(`Production migration filename is invalid: ${filename}`);
  }
}

export function parseProductionMigrationManifest(markdown) {
  const source = String(markdown);
  const orderedLines = source.split(/\r?\n/).filter((line) => /^\d+\.\s/.test(line));
  const entries = [...source.matchAll(/^(\d+)\. `([^`]+)`$/gm)]
    .map((match) => ({ position: Number(match[1]), filename: match[2] }));
  if (orderedLines.length !== entries.length) throw new Error("Production migration manifest contains a malformed ordered entry");
  if (!entries.length) throw new Error("database/MIGRATIONS.md contains no ordered production migrations");

  entries.forEach(({ position, filename }, index) => {
    if (position !== index + 1) throw new Error("Production migration manifest numbering must be sequential");
    validateManifestFilename(filename);
  });

  const files = entries.map(({ filename }) => filename);
  if (files.includes("012_demo_login_passwords.sql")) {
    throw new Error("Demo password migration must not be in the production manifest");
  }
  if (!files.includes("013_authorization_phase2.sql")) {
    throw new Error("013_authorization_phase2.sql must be present in the production manifest");
  }
  const duplicates = files.filter((filename, index) => files.indexOf(filename) !== index);
  if (duplicates.length) throw new Error(`Production migration manifest contains duplicate filename: ${duplicates[0]}`);

  let previousNumber = -1;
  for (const filename of files) {
    const migrationNumber = Number(filename.slice(0, 3));
    if (migrationNumber < previousNumber) {
      throw new Error(`Production migrations are out of documented order at ${filename}`);
    }
    previousNumber = migrationNumber;
  }
  return files;
}

export async function loadProductionMigrationFiles(
  files,
  readMigration = (filename) => readFile(path.join(databaseDirectory, filename), "utf8"),
) {
  const migrations = [];
  for (const filename of files) {
    validateManifestFilename(filename);
    let sql;
    try {
      sql = await readMigration(filename);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`Production migration listed in manifest does not exist: ${filename}`);
      }
      throw error;
    }
    migrations.push({ filename, sql, ...migrationChecksums(sql) });
  }
  return migrations;
}

export function migrationManifestFingerprint(migrations) {
  const identity = migrations
    .map(({ filename, checksum }) => `${filename}\0${checksum}`)
    .join("\n");
  return sha256(identity);
}

export function migrationManifestSummary(migrations) {
  if (!migrations.length) throw new Error("Production migration manifest is empty");
  return {
    migrationCount: migrations.length,
    latestMigration: migrations.at(-1).filename,
    manifestFingerprint: migrationManifestFingerprint(migrations),
    requiresTenantIntegrityView: migrations.some(({ filename }) => filename === "013_authorization_phase2.sql"),
  };
}

export async function loadProductionMigrationManifest({
  readManifest = () => readFile(manifestPath, "utf8"),
  readMigration,
} = {}) {
  const files = parseProductionMigrationManifest(await readManifest());
  return loadProductionMigrationFiles(files, readMigration);
}

export function compareMigrationHistory(expectedMigrations, appliedRows) {
  const expectedByName = new Map(expectedMigrations.map((migration, index) => [
    migration.filename,
    { ...migration, index },
  ]));
  const rowsByName = new Map();
  const duplicates = [];
  const unknown = [];

  for (const row of appliedRows || []) {
    const filename = String(row.filename || "");
    if (rowsByName.has(filename)) duplicates.push(filename);
    else rowsByName.set(filename, row);
    if (!expectedByName.has(filename) && !unknown.includes(filename)) unknown.push(filename);
  }

  const missing = expectedMigrations
    .filter(({ filename }) => !rowsByName.has(filename))
    .map(({ filename }) => filename);
  const knownAppliedIndexes = [...rowsByName.keys()]
    .map((filename) => expectedByName.get(filename)?.index)
    .filter(Number.isInteger);
  const lastAppliedIndex = knownAppliedIndexes.length ? Math.max(...knownAppliedIndexes) : -1;
  const pending = missing.filter((filename) => expectedByName.get(filename).index > lastAppliedIndex);
  const checksumMismatches = expectedMigrations
    .filter((migration) => {
      const applied = rowsByName.get(migration.filename);
      return applied && !migrationChecksumMatches(migration, applied.checksum_sha256);
    })
    .map(({ filename }) => filename);
  const summary = migrationManifestSummary(expectedMigrations);
  const appliedCount = (appliedRows || []).length;
  const countMismatch = appliedCount !== expectedMigrations.length;

  return {
    ready: Boolean(appliedCount)
      && !missing.length
      && !unknown.length
      && !duplicates.length
      && !checksumMismatches.length
      && !countMismatch,
    expectedCount: expectedMigrations.length,
    appliedCount,
    latestMigration: summary.latestMigration,
    manifestFingerprint: summary.manifestFingerprint,
    missing,
    pending,
    unknown,
    duplicates,
    checksumMismatches,
    emptyHistory: appliedCount === 0,
    countMismatch,
  };
}

export function assertMigrationHistoryReady(result) {
  if (result.ready) return result;
  const names = (values) => values
    .map((value) => /^[a-zA-Z0-9._-]{1,128}$/.test(value) ? value : "<invalid-filename>")
    .join(", ");
  const diagnostics = [];
  if (result.emptyHistory) diagnostics.push("migration history is empty");
  if (result.missing.length) diagnostics.push(`missing: ${names(result.missing)}`);
  if (result.pending.length) diagnostics.push(`pending: ${names(result.pending)}`);
  if (result.checksumMismatches.length) diagnostics.push(`checksum mismatch: ${names(result.checksumMismatches)}`);
  if (result.unknown.length) diagnostics.push(`unknown: ${names(result.unknown)}`);
  if (result.duplicates.length) diagnostics.push(`duplicate history: ${names(result.duplicates)}`);
  if (result.countMismatch) diagnostics.push(`count mismatch: expected ${result.expectedCount}, applied ${result.appliedCount}`);
  throw new Error(`Production migration history is not ready (${diagnostics.join("; ")})`);
}
