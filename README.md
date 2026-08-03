# Hamilton House LMS

Hamilton House LMS is the Hamilton House Publishers platform for schools, teachers, and students.

## Brand Assets

Brand assets imported by React live in `src/assets/branding/`.
Favicon and app icon files live in `public/`.

## Run Frontend Only

```bash
npm install
npm run dev
```

Open:

```bash
http://localhost:8000
```

When running only Vite, Netlify Functions are not available. Authentication and protected LMS data require the Netlify local environment on port `8888`.

## Database Setup

Create a Neon/PostgreSQL database and apply the production migrations in the exact order documented in [`database/MIGRATIONS.md`](database/MIGRATIONS.md). The two historical `010` files keep their existing names because they may already be deployed; the manifest defines their canonical order. Migration `013_authorization_phase2.sql` is required, and any later migrations follow it in manifest order.

`012_demo_login_passwords.sql` is demo-only and must not be included in a production migration run.

The migration creates:

- `schools`
- `app_users`
- `classes`
- `class_students`
- `activities`
- `assignments`
- `activity_submissions`
- `courses`
- `lessons`
- `lesson_activities`
- `lesson_submissions`
- `book_page_hotspots`
- `book_activities`
- `book_media_assets`

It also seeds a demo school:

- `Hamilton House ELT Demo`
- primary color `#f97316`
- secondary color `#0b1f3a`

If the database has no users, the Admin screen shows `Create your first user`. The migration includes a small optional seed set for the Hamilton House demo school.

`database/002_basic_auth.sql` adds demo/MVP authentication support:

- `password_hash`
- `last_login_at`
- `auth_provider`
- `auth_sessions`

Passwords are hashed in Netlify Functions. Plain text passwords are never stored. Migration `014_account_lifecycle.sql` adds invitation acceptance, password reset/change, session revocation, hashed single-use tokens, rate limits, security events, and a provider-neutral email outbox. See [`docs/account-lifecycle.md`](docs/account-lifecycle.md) for configuration and operations.

Migration `015_account_lifecycle_hardening.sql` adds production SMTP/outbox dispatch metadata, bounded retry support, history-preserving security-event foreign keys, cleanup retention, and lifecycle query indexes. Production account email requires the server-only SMTP variables documented in the lifecycle guide; automated tests never contact external SMTP.

Migration `016_operations_readiness.sql` adds aggregate operational run history for the scheduled email dispatcher, lifecycle cleanup, staging smoke checks, and tenant integrity verification. Hosted staging must pass `npm run staging:preflight`; deployment, monitoring, backup, and incident procedures are documented in [`docs/pilot-operations.md`](docs/pilot-operations.md).

Migration `017_book_licensing.sql` adds hashed one-time student book codes, school-scoped batches, persistent entitlements, rate-limited atomic redemption, and licensing audit events. Admin/student operation, fictional three-school QA data, cleanup safety, role visibility, and test commands are documented in [`docs/book-licensing.md`](docs/book-licensing.md).

`database/003_activities_assignments.sql` adds the demo/MVP activity authoring flow for interactive book-based practice:

- teacher-created interactive activities
- class or student assignments
- auto-scored submissions and revision guidance

The current UI uses a frontend mock service in `src/services/activitiesApi.js`, structured so these tables can be connected to Netlify Functions in a later phase.

`database/004_course_content.sql` adds demo/MVP persistence for editable Hamilton House course content:

- editable course/book metadata
- editable lesson metadata
- editable lesson activities stored as JSONB
- persisted student lesson submissions

It seeds:

- course: `English Skills B1`
- book code: `B1-DEMO-2026`
- lesson: `Welcome 2 - Vocabulary 4`
- activities: gap fill, line matching, and multiple choice

This is demo/MVP persistence for course content, not a full production CMS yet.

`database/009_book_page_hotspots.sql` adds generic page hotspot and custom book activity persistence:

- editable rectangular book page hotspots
- custom book activities created from hotspots
- media asset URL records for video/audio fallback

`database/010_assignment_live_flow.sql` adds safe incremental columns and indexes for the live assignment MVP:

- assignment title, teacher notes, worksheet links, and attached file metadata
- teacher feedback and review metadata on submissions
- lookup indexes for teacher, class, student, activity, due date, and submissions

Run migrations manually in Neon/Postgres. The app does not run production database migrations automatically. After migration `013`, query `tenant_integrity_issues`; every non-zero result requires explicit data reconciliation before tenant constraints can be considered complete.

## Required Environment Variable

Set this only in Netlify or your local Netlify dev environment:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Do not add `DATABASE_URL` to frontend code. React components call Netlify Functions under `/.netlify/functions/...`.

The database helper also accepts `NETLIFY_DATABASE_URL`, `POSTGRES_URL`, or `NEON_DATABASE_URL` as fallback names, but `DATABASE_URL` is the documented local variable.

## Local Netlify Functions

Install the Netlify CLI if needed:

```bash
npm install
npm install -g netlify-cli
```

Create a local `.env` file for Netlify dev only:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Run:

```bash
npm run dev:netlify
```

Open:

```bash
http://localhost:8888
```

Test the users function:

```bash
curl http://localhost:8888/.netlify/functions/users
```

Test the course content function:

```bash
curl http://localhost:8888/.netlify/functions/course
```

Test book hotspot/activity functions:

```bash
curl "http://localhost:8888/.netlify/functions/book-content?action=book-activities&packageSlug=english-journey-6&componentSlug=students-book"
```

If `DATABASE_URL` is missing, Netlify Functions return a JSON `503` response explaining that the database is not configured. Write actions such as saving page hotspots or creating book activities do not fake success.

Test editable course persistence:

1. Run `database/004_course_content.sql` in the Neon SQL Editor.
2. Run `netlify dev`.
3. Open `http://localhost:8888/#teacher-course-editor`.
4. Edit the course, lesson, or an activity.
5. Click `Save changes`.
6. Open `http://localhost:8888/#student-course`.
7. Confirm the student course shows the updated content.

Public school self-signup is permanently disabled. The compatibility endpoint returns `403` without connecting to PostgreSQL:

```bash
curl -X POST http://localhost:8888/.netlify/functions/auth-signup \
  -H "Content-Type: application/json"
```

Create pilot schools through Platform Administration, which creates an active tenant and an invited School Admin without assigning an initial password. Local demos use their deterministic seeded identities or this same Platform Admin provisioning flow.

Test signin:

```bash
curl -X POST http://localhost:8888/.netlify/functions/auth-signin \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"sofia@example.com\",\"password\":\"password123\"}"
```

## Netlify Deploy

1. Add `DATABASE_URL` in Netlify Site settings > Environment variables.
2. Deploy the site.
3. Test:

```bash
https://your-site.netlify.app/.netlify/functions/users
```

## Admin User API

Endpoints:

- `GET /.netlify/functions/users`
- `GET /.netlify/functions/users?school_id=SCHOOL_ID`
- `POST /.netlify/functions/users`
- `PATCH /.netlify/functions/user?id=USER_ID`
- `DELETE /.netlify/functions/user?id=USER_ID`

Create user payload:

```json
{
  "full_name": "Sofia Laskari",
  "email": "sofia@example.com",
  "role": "teacher",
  "level": "B1 Junior",
  "status": "active"
}
```

Allowed roles:

- `admin`
- `teacher`
- `student`

Allowed statuses:

- `active`
- `invited`
- `paused`

## Security Notes

- `DATABASE_URL` is read only inside Netlify Functions.
- The frontend never imports database code.
- Authentication uses bcrypt password hashes, opaque httpOnly `SameSite=Lax` session cookies, hashed server-side session tokens, expiration checks, and active-account checks.
- Shared request authentication and role gates live in `_auth-utils.js`; reusable resource ownership and student lesson-access policy lives in `_resource-access.js`.
- Admin, teacher, and student APIs enforce role-based authorization and school tenant predicates. Admin user management is restricted to the authenticated admin's school.
- Student lesson reads/submissions require explicit book access, active membership in a class assigned that package, a direct lesson/activity assignment, or an assignment through an active class membership. A matching `school_id` alone is not access.
- Student identity is derived from the authenticated session for submissions and class joins. Client-provided `student_id` cannot select another account.
- Public class discovery accepts only an active invite code and returns safe display fields without the class UUID, slug, invite code, or enrollment counts. Invite attempts have a database-backed rolling-window throttle; production should also configure edge/WAF rate limiting.
- Official course, lesson, and activity records are master content. School admins may edit their school's official content. Teachers may read official content and mutate only custom records they own in their school. Students are read-only except for their own submissions.
- Mutation queries include tenant and ownership predicates as defense in depth, in addition to pre-mutation authorization checks.
- Queries use Neon parameterized template queries.

### Demo credentials

Migration `012_demo_login_passwords.sql` optionally enables the three documented local/demo accounts with password `password123`. Never apply this migration to production, and never reuse demo passwords for real users.

### Authorization tests

`npm test` runs unit/policy tests and skips PostgreSQL integration tests when no isolated test database is configured. Handler-level integration tests cover user CRUD, invite signup/joining, lesson submissions, assignments/results/review, custom hotspots/activities, UUID tampering, role escalation, and database state.

To run them, provision a disposable PostgreSQL database that is not the production database, then set:

```bash
TEST_DATABASE_URL=postgresql://TEST_USER:TEST_PASSWORD@TEST_HOST/TEST_DATABASE?sslmode=require
TEST_DATABASE_CONFIRMATION=isolated-test-database
npm run test:integration
```

The suite creates and drops a unique schema. It refuses to run unless the explicit confirmation value is present and rejects a test URL equal to `DATABASE_URL`. CI keeps this in a separate job and runs it only when the `TEST_DATABASE_URL` repository secret is configured.

### Production requirements and remaining risks

- Configure `DATABASE_URL` and a private `INVITE_RATE_LIMIT_SALT` only in Netlify/server environment variables; never expose either through Vite variables.
- Apply migrations in the manifest order, review `tenant_integrity_issues`, and take a backup before reconciling legacy rows.
- Add platform/edge rate limiting, centralized security logging/alerting, session revocation tooling, password reset/email verification, CSRF review for future cross-site deployments, and regular dependency/security scanning.
- OAuth, MFA, SSO/SAML, automated account recovery, and enterprise audit retention are not implemented.
- Publisher-global content versus school-cloned master content needs a product decision before supporting cross-school publisher editing workflows.
