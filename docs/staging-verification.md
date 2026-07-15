# Staging verification

This procedure is only for a manually provisioned, isolated PostgreSQL staging database. Never point these commands at production, and never copy the normal `DATABASE_URL` into `STAGING_DATABASE_URL`. Take a provider snapshot or logical backup before the first migration. Restore that snapshot to roll back; the migration runner deliberately has no destructive rollback mode.

## Safe setup and automated verification

In a fresh PowerShell window, set the variables without saving credentials in the repository:

```powershell
$env:STAGING_DATABASE_URL = "postgresql://USER:PASSWORD@STAGING_HOST/STAGING_DATABASE?sslmode=require"
$env:STAGING_DATABASE_CONFIRMATION = "isolated-staging-database"
$env:EDUFORGE_STAGING_QA_PASSWORD = Read-Host "Temporary QA password"
```

Do not set `DATABASE_URL` to the staging value. If `DATABASE_URL` is already set to the same database, every staging command refuses to run. The host or database name must visibly contain `staging`, `stage`, `qa`, `sandbox`, `preview`, or `test`; names containing `prod` or `production` are rejected. Connection strings and passwords are never printed.

Run the complete non-destructive sequence:

```powershell
npm ci
npm run staging:verify
```

This runs `staging:migrate`, `staging:seed`, `staging:integrity`, and `staging:smoke` in order. The canonical migration list comes from `database/MIGRATIONS.md`; demo password migration `012` is excluded, checksums are recorded, and migration `013` is last. The QA seed is idempotent and leaves its data available for UI checks.

To run individual stages:

```powershell
npm run staging:migrate
npm run staging:seed
npm run staging:integrity
npm run staging:smoke
```

The integrity command must report zero rows in `tenant_integrity_issues`, zero relationship inconsistencies, and all required constraints, foreign keys, and indexes present. It reports problems but never rewrites ambiguous ownership.

## Accounts and URLs

The seed creates School A and School B, each with one admin, two teachers, two students, one paused student, two classes, book access, official and custom content, assignments, submissions, and a hotspot. Emails are deterministic:

- `qa.a.admin@eduforge.invalid`, `qa.a.teacher1@eduforge.invalid`, `qa.a.teacher2@eduforge.invalid`, `qa.a.student1@eduforge.invalid`, `qa.a.student2@eduforge.invalid`
- the same pattern with `qa.b.*`
- paused accounts: `qa.a.paused@eduforge.invalid` and `qa.b.paused@eduforge.invalid`

All accounts use the runtime value of `EDUFORGE_STAGING_QA_PASSWORD`. If it was omitted, the intentionally unsafe staging-only fallback is `StagingOnly!2026`; never use it outside isolated staging.

Start the UI and functions with the staging database supplied only to that process:

```powershell
$env:DATABASE_URL = $env:STAGING_DATABASE_URL
npm run dev:netlify
```

Open the URL printed by Netlify Dev (normally `http://localhost:8888`). Use the direct API base `http://localhost:8888/.netlify/functions`. Unset `DATABASE_URL` again after stopping the process.

## Manual UI and API checklist

Admin:

- Sign in as School A admin, confirm only School A users and metrics appear, create then pause/delete a temporary teacher and student.
- Try School B user UUIDs with direct `GET`, `PATCH`, and `DELETE /user?id=...`; expect non-disclosing `404` and unchanged rows.
- Try to pause or delete the final active admin; expect `409`.
- Inspect responses in DevTools and confirm there are no password hashes, session tokens, invite codes, or cross-school identifiers.

Teacher:

- Confirm teacher 1 sees only class 1 and cannot open teacher 2 or School B private class resources.
- Confirm official course/lesson editing is forbidden.
- Create/edit a custom activity or hotspot, then confirm teacher 2 and School B cannot modify it.
- Create an assignment for the owned class; confirm another class is rejected. Review an owned submission and confirm foreign assignment/submission IDs are rejected without state changes.

Student:

- Confirm the assigned QA book and assigned lesson appear; an unassigned same-school lesson and every School B lesson must remain unavailable.
- Submit assigned work and confirm it is stored under the signed-in student. Supplying another `student_id` must return `403` and create no row.
- Join with `QASCHA01` (or `QASCHB01` for School B). A slug or UUID must not work. Public invite lookup must not reveal UUID, slug, invite code, student count, or school ID.
- Confirm another student's submissions cannot be read or overwritten.

Tenant tampering and throttling:

- Repeat key requests after replacing school, user, class, assignment, submission, activity, lesson, and package IDs with School B values. Expect `403` or non-disclosing `404`; compare the database row before and after every mutation.
- Send 20 invalid, valid-shaped invite codes from one client IP; the next request must return `429` with `Retry-After`. After the 15-minute window, expired attempts must no longer count.
- Confirm success and failure payloads do not reveal whether another school exists.

Direct API example:

```powershell
curl.exe -i "http://localhost:8888/.netlify/functions/book-content?action=class-by-invite&inviteCode=QASCHA01"
```

Use the browser's authenticated request copy feature for protected API checks so its session cookie is included. Preserve redacted screenshots, response status/body, and before/after SQL counts as evidence; never preserve cookies or connection strings.

## Cleanup and confirmation

After manual verification:

```powershell
npm run staging:cleanup
npm run staging:integrity
```

Cleanup requires the same explicit staging confirmation, validates registry ownership, and deletes only the deterministic QA roots registered by the seed. It refuses an unknown or mismatched registry. The command confirms that no QA schools, accounts, or publisher root remain. Keep migration history; do not drop staging data manually.

## Sign-off

| Area | Test owner | Result | Blocker | Evidence | Date |
| --- | --- | --- | --- | --- | --- |
| Migrations and integrity |  |  |  |  |  |
| Authentication and admin |  |  |  |  |  |
| Teacher authorization |  |  |  |  |  |
| Student authorization |  |  |  |  |  |
| Cross-school tampering |  |  |  |  |  |
| Invites and throttling |  |  |  |  |  |
| Cleanup |  |  |  |  |  |
