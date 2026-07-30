# EduForge Platform Administration

## Security boundary

Platform Administration is the publisher/operator control plane. It is not the existing School Admin portal. School Admins remain ordinary `app_users` with role `admin` and can operate only inside their own school. Platform Admins live in the separate `platform_admins` table, have no `school_id`, and authenticate through `platform_admin_sessions`.

The dedicated URL is:

- local: `http://127.0.0.1:8888/platform-admin/`
- hosted: `https://<host>/platform-admin/`

The normal LMS deliberately contains no link to this URL. This reduces accidental discovery, but URL secrecy is not authorization: every control-plane API request validates the dedicated server-side session.

Public school self-signup is disabled. For the controlled pilot, an authenticated Platform Admin provisions each school and its first School Admin through the combined `provision-school` action. The tenant is active immediately, while the school-scoped administrator is created with role `admin`, status `invited`, and no password hash or ordinary session. The administrator establishes a password through the existing expiring invitation lifecycle; the Platform Admin never assigns or sees an initial password.

## Authentication and sessions

The control plane uses the `hh_platform_admin_session` HttpOnly cookie. It is `SameSite=Strict`, restricted to `/platform-admin`, secure outside loopback development, and expires after at most eight hours. Only a SHA-256 hash of the opaque random token is stored. Logout revokes the session. Password rotation and pausing a Platform Admin revoke all of that account's sessions.

The ordinary `hh_lms_session` cookie cannot authorize Platform Admin APIs. A Platform Admin cookie does not authenticate the ordinary LMS.

Login uses generic invalid-credential errors, bcrypt password verification, request/email rate limiting, Origin validation for mutations, and audited threshold events. Tokens and passwords are never stored in browser storage.

Missing, malformed, expired, revoked, or paused Platform Admin sessions return `401 Unauthorized`, regardless of whether an ordinary LMS cookie is also present. A `403 Forbidden` is reserved for an authenticated privileged request that fails a security check such as mutation Origin validation. On any control-plane `401`, the browser cancels parallel privileged requests, clears the Platform Admin identity and all loaded school/user/class/access/audit data, replaces the route with `/platform-admin/`, and shows the dedicated login with an expiry notice. A genuine `403` remains visible as an error and does not destroy the valid Platform Admin session.

Browser cookies are host-scoped. Use `http://127.0.0.1:8888/platform-admin/` as the canonical local URL and keep using that hostname throughout a session. Opening `localhost` after logging in on `127.0.0.1` (or the reverse) is a separate unauthenticated visit and requires its own login; EduForge does not weaken cookie scope with a cross-host `Domain` workaround.

The dedicated application uses the normal EduForge typography, card radius, border, shadow, input, and button conventions with white/off-white surfaces and the EduForge orange accent. It remains a separate bundle and does not import ordinary LMS routing or expose a normal-LMS navigation entry.

## Creating a production account

There is no browser registration and no production default account. Apply migration `028_platform_administration.sql`, then use the operator CLI with a password supplied only through the environment:

```powershell
$env:DATABASE_URL = "<dedicated PostgreSQL target>"
$env:PLATFORM_ADMIN_PASSWORD = "<strong password>"
$env:PLATFORM_ADMIN_ENVIRONMENT = "staging"
$env:PLATFORM_ADMIN_DATABASE_CONFIRMATION = "confirmed-platform-admin-database"
npm run platform-admin:create -- --confirm=create-platform-admin --email=operator@example.org --name="Platform Operator"
```

For a deliberate password rotation, add `--rotate`. The CLI never accepts the password as a command argument and never prints it. Remove the password environment variable after use.

Production must integrate real provider-backed MFA before general operator use. EduForge does not simulate MFA.

## Capabilities

The first-phase console provides:

- database-backed platform metrics;
- paginated school, user, class, package-access, and audit views;
- school creation and branding updates;
- atomic pilot-school provisioning with an initial School Admin invitation;
- reversible school pause/reactivation;
- ordinary School Admin, teacher, and student invitations;
- ordinary account status changes and session revocation;
- explicit grant/revoke of active Ultimate English B1, B1+, and B2 access;
- read-only recent Platform Admin audit history.

Every privileged mutation writes a safe audit event. The API does not expose an operation to update or delete audit records.

## School pause policy

Pausing a school preserves its users, classes, assignments, submissions, content access, and audit history. It revokes ordinary sessions and rejects new ordinary login while paused. It does not modify individual user status. Reactivation restores authentication for otherwise-active users.

## Explicit exclusions

The control plane does not implement impersonation, password viewing, visible password resets, school deletion, permanent user deletion, cross-school user moves, submission/score editing, answer-key access, activation-code plaintext access, support-agent roles, Android UI, or MFA simulation.

## Local demonstration

The explicitly confirmed multi-school demo creates one fictional Platform Admin:

- email: `platform.admin@multi-school.dev.invalid`
- development-only password: `EduForge-Platform-Dev-Only-2026!`

This account is created by the isolated demo seed only; it is not present in migration 028. Demo reset removes the dedicated local database, including Platform Admin sessions and audit records.

Local demos use deterministic seeded identities or the same Platform Admin provisioning workflow. The multi-school demo starts its existing isolated invitation-preview mode so the full password-establishment lifecycle can be exercised without production email.

## Staging acceptance

Before production:

1. use a dedicated staging database and operator account;
2. confirm missing/ordinary-only/invalid privileged sessions receive 401 while authenticated Origin failures receive 403;
3. verify school pause/session revocation and audit events;
4. inspect logs for secret-free failures;
5. verify direct and refreshed `/platform-admin/` routes;
6. confirm normal LMS and Android bundles contain no Platform Admin entry;
7. configure a strong `PLATFORM_ADMIN_RATE_LIMIT_SALT`;
8. integrate real MFA and an operator access-review process.
