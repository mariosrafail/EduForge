# Book licensing and fictional multi-school QA

Migration `017_book_licensing.sql` evolves the existing `activation_codes` and `book_access` tables; it does not create a parallel entitlement model. Apply it after `016_operations_readiness.sql` through the ordered production manifest in `database/MIGRATIONS.md`.

## Model and lifecycle

`activation_code_batches` belongs to one school and one book package. Its `(school_id, request_key)` uniqueness makes generation requests idempotent. Each `activation_codes` row stores a SHA-256 hash of normalized input, a masked suffix, package/school/batch relationships, lifecycle timestamps, and creator/redeemer references. Plaintext is returned only in the successful initial generation response and its CSV; it is not retained in the database and cannot be recovered later.

The lifecycle is:

- `unused`: eligible for its matching school until expiry.
- `redeemed`: linked to exactly one student and a persistent `book_access` entitlement.
- `expired`: no longer redeemable after `expires_at`.
- `revoked`: administratively disabled with time and reason.

Redemption normalizes case and punctuation, hashes server-side, locks the candidate row, inserts the unique entitlement, and changes the code state in one PostgreSQL statement. Concurrent attempts therefore produce one winner. An authorized school admin may explicitly reset a redeemed code; this removes its linked entitlement and records an audit event.

`book_code_redemption_attempts` supplies a 15-minute per-user/client rate-limit record without plaintext codes. `book_license_audit_events` records generation, initial export, successful/failed redemption, denial, revocation, and reset events.

The scheduled lifecycle cleanup removes redemption-attempt rows after `BOOK_CODE_ATTEMPT_RETENTION_DAYS` (default 7, bounded to 1-3650). Audit events and actual licensing records are retained.

## API and role visibility

| Action | Admin | Teacher | Student |
| --- | --- | --- | --- |
| `GET book-licensing?action=overview` | Own school only | Denied | Denied |
| `GET book-licensing?action=batch&batchId=...` | Own school, masked codes | Denied | Denied |
| `POST ...?action=generate-batch` | Own school | Denied | Denied |
| `POST ...?action=revoke-unused` | Own school | Denied | Denied |
| `POST ...?action=reset-code` | Own school | Denied | Denied |
| `POST ...?action=redeem` | Denied | Denied | Signed-in student only |

School, actor, and student identity always come from the authenticated session. Requests containing identity fields such as `schoolId`, `studentId`, or `createdBy` are rejected. Foreign batch/code IDs return non-disclosing `404` responses. Invalid, expired, revoked, already-redeemed, and wrong-school guessed codes share the same public unavailable response; the already-owned-book case is a safe explicit conflict.

The admin Books & classes section shows database batches, lifecycle counts, masked redemptions, one-time CSV generation, unused-code revocation, and explicit reset. The student Books section redeems a code and reloads only packages available through the server-side entitlement query.

## Fictional three-school data

The optional seed creates Athens Language Academy, Piraeus English Centre, and Thessaloniki Learning Hub. Each receives one admin, two teachers, three classes, eight students, memberships, four lifecycle code examples, an entitlement, three assignments, submitted/missing work, scores, and feedback. Stable IDs and the `multi_school_seed_registry` make it repeatable.

Accounts use these patterns:

- admins: `admin.athens@multi-school.dev.invalid`, `admin.piraeus@multi-school.dev.invalid`, `admin.thessaloniki@multi-school.dev.invalid`
- teachers: `teacher1.<school>@multi-school.dev.invalid` and `teacher2.<school>@multi-school.dev.invalid`
- students: `student1.<school>@multi-school.dev.invalid` through `student8.<school>@multi-school.dev.invalid`

The development-only default password is `EduForge-Dev-Only-2026!`; set `MULTI_SCHOOL_DEMO_PASSWORD` to override it. The seed prints the complete account/class summary and fictional code inventory when run. These credentials and codes must never be reused in production.

Use only a separately provisioned staging/test database whose hostname or database name visibly identifies it as non-production:

```powershell
$env:STAGING_DATABASE_URL = "postgresql://USER:PASSWORD@HOST/isolated_staging_database"
$env:STAGING_DATABASE_CONFIRMATION = "isolated-staging-database"
$env:ALLOW_DEMO_SEED = "true"
$env:MULTI_SCHOOL_SEED_CONFIRMATION = "fictional-multi-school-development-data"
npm run staging:seed:multi-school
npm run staging:integrity
npm run staging:cleanup:multi-school
```

Both seed and cleanup reject `NODE_ENV=production`, require all explicit confirmations, reject a staging URL equal to `DATABASE_URL`, and inherit the repository's production-name checks. Cleanup validates the exact registered deterministic school roots, deletes their licensing batches first, then only those schools and cascading seeded records. It never truncates shared tables and is idempotent after successful cleanup.

## Verification

For an isolated local PostgreSQL database:

```powershell
$env:TEST_DATABASE_URL = "postgresql://USER:PASSWORD@localhost/eduforge_test"
$env:TEST_DATABASE_CONFIRMATION = "isolated-test-database"
npm run test:integration
npm run test:tenant-isolation
npm run test:integration:cleanup
```

The licensing integration suite covers random uniqueness, one-time and concurrent redemption, package-specific entitlement, duplicate prevention, lifecycle failures, role denial, masked listings, client identity injection, and cross-school batch/code access. Existing authorization integration tests cover user/class/teacher/student assignment, submission, grade, and feedback isolation. Hosted Playwright licensing and assignment flows additionally require the `E2E_SCHOOL_*`, package, class, activity, teacher, and student IDs named in `tests/e2e/book-licensing-hosted.spec.js`.

## Production considerations and current limits

- Configure a long server-only `ACCOUNT_RATE_LIMIT_SALT`, isolated PostgreSQL credentials, HTTPS, monitoring, WAF/rate rules, backups, and incident procedures before hosted staging or production.
- Treat the initial CSV as a secret: deliver it through an approved channel, restrict retention, and never place it in logs or source control.
- The application does not provide later plaintext recovery or general batch re-export by design.
- Rate limiting is PostgreSQL-backed; an edge/WAF limit should supplement it for hostile traffic.
- Hosted Netlify, Neon, SMTP, DNS, scheduler, browser-matrix, and WAF checks remain external operational sign-offs and must not be inferred from local tests.
