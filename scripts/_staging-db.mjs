import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;

const confirmations = {
  staging: ["STAGING_DATABASE_URL", "STAGING_DATABASE_CONFIRMATION", "isolated-staging-database"],
  test: ["TEST_DATABASE_URL", "TEST_DATABASE_CONFIRMATION", "isolated-test-database"],
};

function databaseIdentity(url) {
  return `${url.hostname.toLowerCase()}:${url.port || "5432"}${url.pathname}`;
}

function parsePostgresUrl(value, variableName) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid PostgreSQL URL`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${variableName} must use postgres:// or postgresql://`);
  }
  if (!url.hostname || !url.pathname || url.pathname === "/") {
    throw new Error(`${variableName} must identify a host and database`);
  }
  return url;
}

export function requireSafeDatabase(kind = "staging") {
  const definition = confirmations[kind];
  if (!definition) throw new Error(`Unsupported database safety mode: ${kind}`);
  const [urlName, confirmationName, expectedConfirmation] = definition;
  const rawUrl = process.env[urlName];
  if (!rawUrl) throw new Error(`${urlName} is required`);
  if (process.env[confirmationName] !== expectedConfirmation) {
    throw new Error(`${confirmationName} must equal ${expectedConfirmation}`);
  }

  const url = parsePostgresUrl(rawUrl, urlName);
  const runtimeRaw = process.env.DATABASE_URL;
  if (runtimeRaw) {
    const runtimeUrl = parsePostgresUrl(runtimeRaw, "DATABASE_URL");
    if (databaseIdentity(runtimeUrl) === databaseIdentity(url)) {
      throw new Error(`${urlName} identifies the same database as DATABASE_URL`);
    }
  }

  const productionSignal = `${url.hostname}${url.pathname}`.toLowerCase();
  if (/(^|[._/-])(prod|production)([._/-]|$)/.test(productionSignal)) {
    throw new Error(`${urlName} appears to identify a production database`);
  }
  const isolationMarkers = kind === "staging" ? /(staging|stage|qa|sandbox|preview|test)/ : /(test|testing|ci|sandbox)/;
  if (!isolationMarkers.test(productionSignal)) {
    throw new Error(`${urlName} host or database name must visibly identify an isolated ${kind} target`);
  }

  return {
    connectionString: rawUrl,
    safeLabel: `${url.hostname}/${url.pathname.replace(/^\//, "")}`,
    kind,
  };
}

export function createSafePool(kind = "staging") {
  const target = requireSafeDatabase(kind);
  return { ...target, pool: new Pool({ connectionString: target.connectionString }) };
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function parseProductionMigrationManifest(markdown) {
  const files = [...markdown.matchAll(/^\d+\. `([^`]+\.sql)`$/gm)].map((match) => match[1]);
  if (!files.length) throw new Error("database/MIGRATIONS.md contains no ordered production migrations");
  if (files.includes("012_demo_login_passwords.sql")) throw new Error("Demo password migration must not be in the production manifest");
  if (!files.includes("013_authorization_phase2.sql")) throw new Error("013_authorization_phase2.sql must be present in the production manifest");
  const duplicates = files.filter((filename, index) => files.indexOf(filename) !== index);
  if (duplicates.length) throw new Error(`Production migration manifest contains duplicate filename: ${duplicates[0]}`);
  return files;
}

export async function loadProductionMigrationFiles(files, readMigration = (filename) => readFile(`database/${filename}`, "utf8")) {
  const migrations = [];
  for (const filename of files) {
    let sql;
    try {
      sql = await readMigration(filename);
    } catch (error) {
      if (error.code === "ENOENT") throw new Error(`Production migration listed in manifest does not exist: ${filename}`);
      throw error;
    }
    migrations.push({ filename, sql, checksum: sha256(sql) });
  }
  return migrations;
}

export async function loadProductionMigrationManifest() {
  const markdown = await readFile("database/MIGRATIONS.md", "utf8");
  return loadProductionMigrationFiles(parseProductionMigrationManifest(markdown));
}

export async function withAdvisoryLock(client, lockName, callback) {
  await client.query("select pg_advisory_lock(hashtext($1))", [lockName]);
  try {
    return await callback();
  } finally {
    await client.query("select pg_advisory_unlock(hashtext($1))", [lockName]);
  }
}

export function postgresTemplate(pool) {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`;
    return (await pool.query(text, values)).rows;
  };
}

export function parseHandlerResponse(response) {
  return {
    status: response.statusCode,
    headers: response.headers || {},
    body: JSON.parse(response.body || "{}"),
  };
}

export async function callHandler(handler, { method = "GET", query = {}, body = {}, cookie = "", ip = "127.0.0.50" } = {}) {
  const rawQuery = new URLSearchParams(query).toString();
  return parseHandlerResponse(await handler({
    httpMethod: method,
    headers: { host: "staging.local", cookie, "x-nf-client-connection-ip": ip },
    queryStringParameters: query,
    rawQuery,
    body: method === "GET" ? "" : JSON.stringify(body),
  }));
}
