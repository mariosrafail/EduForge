# Runtime database role and schema readiness

## Safety boundary

Production migrations are the only authority for creating or changing the EduForge schema. Normal Netlify Function requests do not apply migrations, create extensions, alter tables, normalize schema data, or repair missing objects.

Before ordinary authentication data is read or mutated, the runtime performs a bounded read-only readiness check. A schema that is missing canonical migration history, an expected migration/checksum, or a required authentication table/column receives:

```json
{
  "error": "Service temporarily unavailable",
  "code": "SCHEMA_NOT_READY"
}
```

The response is HTTP 503 with `Cache-Control: no-store`, `Retry-After: 60`, and `X-Content-Type-Options: nosniff`. Public responses do not disclose migration, schema, database, credential, token, cookie, or user details. Successful readiness results may be cached in-process for at most 60 seconds; failures are not cached.

## Generated runtime contract

`database/MIGRATIONS.md` remains authoritative. `scripts/generate-runtime-schema-contract.mjs` derives the committed `netlify/functions/_runtime-schema-contract.js` using normalized migration checksums. Runtime functions read only this small metadata module; they do not read the manifest, SQL files, or filesystem.

When adding a migration:

1. Add the migration to `database/MIGRATIONS.md`.
2. Run `npm run generate:runtime-schema-contract`.
3. Commit the migration, manifest, and regenerated contract together.
4. Run `npm run verify:migration-manifest`.

Verification fails rather than rewriting a stale or manually modified contract.

## Deployment exactness versus runtime compatibility

The PR-008 deployment preflight requires an exact repository/database migration match and rejects unknown history rows. Runtime readiness is deliberately a minimum-compatible contract: every migration required by the running code must exist with a compatible checksum, but a later, forward-compatible migration row is allowed. This permits a safe code-only rollback after an expand migration.

Destructive contraction must remain in a later release after older code is no longer eligible for rollback.

## Permission categories

Use separate credentials for:

- Migration owner/operator: owns schema objects and applies approved forward migrations.
- Application runtime: receives database `CONNECT`, schema `USAGE`, required table `SELECT/INSERT/UPDATE/DELETE`, sequence usage, application-function execution, and read access to `eduforge_migration_history`.
- Optional production preflight: read-only access sufficient for PR-008 history, catalog, critical-object, and tenant-integrity checks.

The application runtime should not own the database, schema, or tables and should not receive database/schema `CREATE`, superuser, role creation, database creation, bypass-RLS, extension creation, or general schema mutation privileges.

Netlify's runtime `DATABASE_URL` should use the application runtime role, not the migration owner. The actual production credential and grant rollout remains external **Needs verification**.

## Canonical history and isolated local transition

Runtime readiness requires `eduforge_migration_history` with canonical filenames and normalized checksums. The dedicated multi-school demo now applies `database/MIGRATIONS.md` in manifest order and records that history atomically.

A legacy `local_multi_school_migrations` history may be adopted only by the explicitly confirmed, loopback-only, exactly named demo database when its complete filename sequence and critical schema probes match the current manifest. Ambiguous, partial, unknown, or corrupt state fails and requires resetting that dedicated demo database. This transition never applies to staging, production, arbitrary local databases, or generic `DATABASE_URL` targets.

PR-007 repository remediation is complete after this change. Production runtime-role configuration remains **Needs verification**. PR-014 remains unresolved pending deployed migration-history and environment inventory.
