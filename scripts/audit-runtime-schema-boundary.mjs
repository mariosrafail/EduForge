import { readFile } from "node:fs/promises";
import path from "node:path";

const runtimeDirectory = path.resolve("netlify/functions");
const runtimeFiles = [
  "_auth-utils.js",
  "_runtime-schema-readiness.js",
  "auth-signin.js",
  "auth-me.js",
  "auth-signout.js",
  "auth-student-signup.js",
  "auth-signup.js",
  "auth-change-password.js",
  "auth-forgot-password.js",
  "auth-reset-password.js",
  "auth-revoke-sessions.js",
  "account-invite.js",
  "account-set-password.js",
  "account-token-check.js",
  "users.js",
];

const forbidden = [
  { name: "runtime schema repair helper", pattern: /\bensureAuthSchema\b/ },
  { name: "migration runner import", pattern: /from\s+["'][^"']*(?:run-staging-migrations|_migration-readiness|\.\.\/database\/)/i },
  { name: "filesystem import", pattern: /from\s+["']node:fs(?:\/promises)?["']/i },
  { name: "CREATE EXTENSION", pattern: /\bcreate\s+extension\b/i },
  { name: "ALTER TABLE", pattern: /\balter\s+table\b/i },
  { name: "CREATE TABLE", pattern: /\bcreate\s+table\b/i },
  { name: "CREATE INDEX", pattern: /\bcreate\s+(?:unique\s+)?index\b/i },
  { name: "DROP statement", pattern: /\bdrop\s+(?:table|index|extension|schema)\b/i },
];

const findings = [];
for (const filename of runtimeFiles) {
  const source = await readFile(path.join(runtimeDirectory, filename), "utf8");
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) findings.push(`${filename}: ${rule.name}`);
  }
}

if (findings.length) {
  console.error("Runtime schema boundary audit failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Runtime schema boundary verified: ${runtimeFiles.length} authentication files contain no schema DDL or migration imports.`);
}
