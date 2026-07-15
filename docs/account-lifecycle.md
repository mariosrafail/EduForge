# Account lifecycle production closure

Migrations `014_account_lifecycle.sql` and `015_account_lifecycle_hardening.sql` provide invitation acceptance, password recovery/change, session revocation, hashed single-use tokens, security events, rate limiting, SMTP delivery, and an auditable outbox. Apply both in the order in `database/MIGRATIONS.md`; never edit an already-applied migration.

## Server-only environment

- `APP_PUBLIC_URL`: absolute public `http(s)` origin used for action links.
- `ACCOUNT_RATE_LIMIT_SALT`: private random value required outside explicitly isolated test/staging environments.
- `ACCOUNT_EMAIL_MODE`: `capture`, `preview`, or `smtp`.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`: required by `smtp` mode.
- `ACCOUNT_EMAIL_DISPATCH_SECRET`: private authorization value for the outbox dispatcher.

Never expose these through Vite, logs, responses, screenshots, or source control. Production must use `ACCOUNT_EMAIL_MODE=smtp`; `capture` is restricted to confirmed isolated tests, while `preview` additionally requires `STAGING_DATABASE_CONFIRMATION=isolated-staging-database`. Production responses never include preview links.

## Security behavior

Invitation links expire after 3 days and reset links after 30 minutes. PostgreSQL stores only SHA-256 hashes; raw tokens exist in request memory only while the invitation/reset message is sent. Passwords require 10–128 characters, cannot be whitespace, equal the normalized email, reuse the current password, or match documented demo passwords. Lifecycle hashing uses bcrypt cost 12.

Password setup, reset, and authenticated change atomically revoke old sessions and create one fresh session. Pause, role change, deletion, and admin force-revocation invalidate existing sessions. An admin may force-revoke only active same-school teachers/students and never another admin. Self-revocation rotates the caller's session.

Forgot-password responses are deliberately equivalent for known, unknown, paused, and delivery-failure cases. Token errors are generic for invalid, malformed, expired, revoked, used, or wrong-purpose values. Rate-limit rows store salted fingerprints and normalized email hashes, never raw IP addresses. Production should also enable Netlify/edge/WAF throttling.

## Email and outbox strategy

Token-bearing invitation/reset email uses option A: the database operation commits first, then SMTP is attempted synchronously while the raw token exists only in memory. The outbox is an audit record and does not retry token messages because it never stores a plaintext or recoverable token. Delivery failure leaves the account/token valid; admins receive only `delivery_status: failed` and can resend. Forgot-password remains non-enumerating and a later request replaces the token safely.

Password-change confirmation contains no token and is durable-retry eligible. `account-email-dispatch` claims queued/retryable rows with `FOR UPDATE SKIP LOCKED`, uses a claim UUID, and applies bounded exponential delays up to five attempts before `exhausted`. Provider errors are reduced to non-sensitive internal codes. Successful rows retain only the SMTP message reference.

Run `select * from cleanup_account_lifecycle_history();` from a controlled maintenance job to remove rate-limit rows older than 7 days and terminal/expired token rows older than 30 days. Recent audit history is preserved.

## Email failure behavior

- Invitation: user/token remain valid, outbox becomes `failed`, a delivery-failure security event is recorded, and resend creates exactly one replacement active token.
- Forgot/reset: public response never reveals account or SMTP state; internal outbox/event records the failure.
- Password change: password/session rotation remains successful; confirmation becomes `retryable` and the dispatcher handles it.

## Manual verification

1. As an admin, invite one teacher and one student, inspect delivery state, resend an invited account, then confirm no admin role or school selector is offered.
2. Open the invitation preview in isolated staging, confirm the token disappears from the URL, reject mismatched/weak passwords, then accept with a valid password.
3. Request reset for known, unknown, and paused addresses and confirm equivalent public messaging. Complete a valid reset and confirm the old session fails.
4. From Account security, change the password, sign out other sessions, and verify the current rotated session remains active.
5. Pause and role-change disposable accounts and verify their old cookies immediately fail. Confirm cross-school and admin-to-admin revocation are rejected.

## Production deployment checklist

- Back up the database; apply `015`; run integrity checks and verify lifecycle indexes.
- Configure `APP_PUBLIC_URL`, private rate-limit/dispatcher secrets, and tested SMTP credentials.
- Send to a dedicated non-production inbox first; inspect both HTML and plain text.
- Configure a scheduled POST to `account-email-dispatch` with the private dispatcher header.
- Monitor `failed`, `retryable`, `exhausted`, stale claims, security-event volume, and SMTP rejection rates.
- Enable edge/WAF request limits and schedule lifecycle-history cleanup.

Rollback application code first and leave additive tables/columns in place to preserve audit history. For schema rollback, restore a reviewed pre-migration backup; do not destructively reverse migration `015` in place.
