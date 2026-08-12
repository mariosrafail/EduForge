import pg from "pg";

import { provisionBuilderUser } from "./_builder-user-provisioning.mjs";

const confirmation = "--confirm=create-builder-user";
if (!process.argv.includes(confirmation)) throw new Error(`Explicit confirmation is required: ${confirmation}`);
if (process.argv.some((value) => /^--password(?:=|$)/i.test(value))) {
  throw new Error("Passwords are never accepted as command arguments");
}

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

const rawDatabaseUrl = String(process.env.DATABASE_URL || "");
if (!rawDatabaseUrl) throw new Error("DATABASE_URL is required");
const databaseUrl = new URL(rawDatabaseUrl);
if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) throw new Error("DATABASE_URL must use PostgreSQL");
const loopback = ["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname);
if (loopback) {
  if (process.env.LOCAL_DATABASE_CONFIRMATION !== "isolated-local-pilot") {
    throw new Error("Loopback creation requires LOCAL_DATABASE_CONFIRMATION=isolated-local-pilot");
  }
} else {
  if (!["staging", "production"].includes(process.env.BUILDER_USER_ENVIRONMENT || "")) {
    throw new Error("BUILDER_USER_ENVIRONMENT must explicitly be staging or production");
  }
  if (process.env.BUILDER_USER_DATABASE_CONFIRMATION !== "confirmed-builder-database") {
    throw new Error("BUILDER_USER_DATABASE_CONFIRMATION is required for a hosted target");
  }
}

const pool = new pg.Pool({ connectionString: rawDatabaseUrl });
try {
  const result = await provisionBuilderUser(pool, {
    email: argument("email"),
    fullName: argument("name"),
    password: String(process.env.BUILDER_USER_PASSWORD || ""),
    rotate: process.argv.includes("--rotate"),
  });
  console.log(`${result.rotated ? "Rotated" : "Created"} Builder user ${result.email}; plaintext password was not printed.`);
} finally {
  await pool.end();
}
