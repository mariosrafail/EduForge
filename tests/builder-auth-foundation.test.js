import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

test("migration 031 creates a physically separate Builder developer trust domain", async () => {
  const [migration, manifest] = await Promise.all([read("database/031_builder_developer_auth.sql"), read("database/MIGRATIONS.md")]);
  for (const table of ["builder_users", "builder_sessions", "builder_login_attempts", "builder_audit_log"]) {
    assert.match(migration, new RegExp(`create table if not exists ${table}`));
  }
  const users = migration.match(/create table if not exists builder_users \(([\s\S]*?)\n\);/)?.[1] || "";
  assert.doesNotMatch(users, /school_id|app_users|platform_admins/);
  assert.match(users, /role text not null default 'developer'/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /revoked_at timestamptz/);
  assert.match(migration, /request_fingerprint/);
  assert.match(migration, /email_hash/);
  assert.match(migration, /outcome in \('pending', 'invalid_credentials', 'authenticated', 'rejected_account', 'rate_limited'\)/);
  assert.match(migration, /revoke_builder_sessions/);
  assert.match(manifest, /31\. `031_builder_developer_auth\.sql`/);
  assert.doesNotMatch(migration, /builder\.dev[1-5]@|plain(?:text)?[_ -]?password/i);
});

test("Builder audit schema and runtime reject sensitive metadata", async () => {
  const migration = await read("database/031_builder_developer_auth.sql");
  for (const key of ["password", "password_hash", "session_token", "token", "database_url", "answers", "teacher_solutions", "secret", "secrets"]) {
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(migration, /builder_audit_actor_idx/);
  assert.match(migration, /builder_audit_target_idx/);
});

test("Builder frontend gates the read-only host without browser token persistence or signup", async () => {
  const [gate, api, entry, hosted] = await Promise.all([
    read("src/apps/book-builder/BuilderAuthGate.jsx"),
    read("src/apps/book-builder/builderAuthApi.js"),
    read("src/apps/ultimate-b2-builder/activityBuilderEntry.jsx"),
    read("src/apps/ultimate-b2-builder/HostedUltimateB2BuilderApp.jsx"),
  ]);
  assert.match(entry, /<BuilderAuthGate><UltimateB2BuilderApp \/><\/BuilderAuthGate>/);
  assert.match(gate, /status: "checking"/);
  assert.match(gate, /payload\.authenticated/);
  assert.match(gate, /Logout/);
  assert.match(gate, /setState\(\{ status: "unauthenticated"/);
  assert.match(gate, /autoComplete="username"/);
  assert.match(gate, /autoComplete="current-password"/);
  assert.match(gate, /setPassword\(""\)/);
  assert.doesNotMatch(`${gate}\n${api}`, /localStorage|sessionStorage|signup|sign up|forgot-password/i);
  assert.match(api, /credentials: "include"/);
  assert.match(api, /response\.status === 401/);
  assert.match(hosted, /Read-only review/);
  assert.doesNotMatch(hosted, /__hhplms|fetch\s*\(|method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)/i);
});

test("Builder provisioning uses environment-only passwords and guarded staging identities", async () => {
  const [generic, staging, shared, pkg] = await Promise.all([
    read("scripts/create-builder-user.mjs"),
    read("scripts/seed-staging-builder-users.mjs"),
    read("scripts/_builder-user-provisioning.mjs"),
    read("package.json"),
  ]);
  assert.match(generic, /BUILDER_USER_PASSWORD/);
  assert.match(generic, /--confirm=create-builder-user/);
  assert.match(generic, /\^--password/);
  assert.match(shared, /already exists; pass --rotate/);
  assert.match(shared, /select revoke_builder_sessions\(\$1\)/);
  assert.match(shared, /builder_user_created/);
  assert.match(shared, /password_rotated/);
  assert.match(staging, /createSafePool\("staging"\)/);
  assert.match(staging, /new Set\(passwords\)\.size !== passwords\.length/);
  assert.match(staging, /--confirm=seed-staging-builder-users/);
  for (let index = 1; index <= 5; index += 1) {
    assert.match(staging, new RegExp(`builder\\.dev\\$\\{index \\+ 1\\}@hhplms\\.invalid|builder\\.dev${index}@hhplms\\.invalid`));
    assert.match(staging, new RegExp(`HHPLMS_STAGING_BUILDER_PASSWORD_\\$\\{index \\+ 1\\}|HHPLMS_STAGING_BUILDER_PASSWORD_${index}`));
  }
  assert.match(pkg, /"builder-user:create"/);
  assert.match(pkg, /"staging:seed:builder-users"/);
  assert.doesNotMatch(`${generic}\n${staging}`, /console\.log\([^\n]*(?:passwords?\[|BUILDER_USER_PASSWORD|HHPLMS_STAGING_BUILDER_PASSWORD)/i);
});

test("Builder provisioning CLIs reject password arguments and unsafe staging targets before connecting", () => {
  const cli = spawnSync(process.execPath, [
    "scripts/create-builder-user.mjs", "--confirm=create-builder-user", "--password=forbidden",
  ], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: "" } });
  assert.notEqual(cli.status, 0);
  assert.match(`${cli.stdout}${cli.stderr}`, /Passwords are never accepted as command arguments/);

  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  environment.STAGING_DATABASE_URL = "postgresql://user:not-printed@production.example/hhplms_staging";
  environment.STAGING_DATABASE_CONFIRMATION = "isolated-staging-database";
  for (let index = 1; index <= 5; index += 1) {
    environment[`HHPLMS_STAGING_BUILDER_PASSWORD_${index}`] = `Unique-Staging-Builder-${index}!Password`;
  }
  const staging = spawnSync(process.execPath, [
    "scripts/seed-staging-builder-users.mjs", "--confirm=seed-staging-builder-users",
  ], { cwd: process.cwd(), encoding: "utf8", env: environment });
  const output = `${staging.stdout}${staging.stderr}`;
  assert.notEqual(staging.status, 0);
  assert.match(output, /appears to identify a production database/);
  assert.doesNotMatch(output, /Unique-Staging-Builder/);
  assert.doesNotMatch(output, /not-printed/);
});

test("operational documentation describes the same staging database with separate identities", async () => {
  const documentation = await read("docs/builder-auth-operations.md");
  for (let index = 1; index <= 5; index += 1) assert.match(documentation, new RegExp(`builder\\.dev${index}@hhplms\\.invalid`));
  assert.match(documentation, /same isolated staging PostgreSQL database/);
  assert.match(documentation, /not `app_users`/);
  assert.match(documentation, /not Platform Admins/);
  assert.match(documentation, /DATABASE_URL/);
  assert.match(documentation, /BUILDER_AUTH_RATE_LIMIT_SALT/);
  assert.match(documentation, /remains read-only/);
  assert.doesNotMatch(documentation, /postgres(?:ql)?:\/\/[^^\s`]+/i);
});
