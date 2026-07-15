# Account lifecycle v1

Migration `014_account_lifecycle.sql` adds single-use hashed invitation/reset tokens, invitation audit fields, security events, a safe email outbox, and hashed rate-limit attempts. Apply it after `013` according to `database/MIGRATIONS.md`.

## Environment

- `APP_PUBLIC_URL`: absolute public `http(s)` URL used to build invitation and reset links.
- `ACCOUNT_RATE_LIMIT_SALT`: private server-only random value used before request identifiers are stored.
- `ACCOUNT_EMAIL_MODE`: production should use an approved provider adapter. The current provider-neutral implementation records `provider_required` without sending. `capture` is restricted to explicitly confirmed isolated test/staging databases. `preview` also requires `STAGING_DATABASE_CONFIRMATION=isolated-staging-database` and may return a preview URL.

Never expose these values to Vite or commit them. Raw account tokens exist only while constructing a message; PostgreSQL stores only SHA-256 token hashes. Outbox template variables intentionally exclude tokens and action URLs.

## Endpoints

- `POST account-invite` — admin-only teacher/student invitation or resend; school and inviter come from the session.
- `POST account-token-check` — minimal validity result for invitation/reset links.
- `POST account-set-password` — consumes an initial-password token, activates the invitation, revokes older sessions/tokens, and creates a fresh session.
- `POST auth-forgot-password` — non-enumerating reset request with database-backed throttling.
- `POST auth-reset-password` — consumes a reset token and rotates sessions.
- `POST auth-change-password` — verifies the signed-in user's current password and rotates sessions.
- `POST auth-revoke-sessions` — self-service rotation or same-school admin revocation.

Passwords require 10 characters, cannot be whitespace or equal the normalized email, and documented demo passwords are rejected for lifecycle-created accounts. Bcrypt cost is 12.

## Operations and rollback

Run the full unit, integration, web build, Android-offline build, integrity, and staging smoke suites before deployment. Monitor `account_email_outbox` for `provider_required`/`failed`, token issuance and consumption security events, and rate-limit volume. Cleanup can revoke active links by setting `revoked_at=now()`; do not delete consumed audit history during ordinary operations.

Rollback application code first. The migration is additive, so leave tables/columns in place to preserve audit history. A destructive schema rollback must be separately reviewed and backed up.
