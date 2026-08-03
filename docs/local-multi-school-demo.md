# Local multi-school demo

The normal LMS is available at `http://127.0.0.1:8888/`.

The separate operator control plane is available at `http://127.0.0.1:8888/platform-admin/`. It is intentionally absent from normal LMS navigation.

Fictional local Platform Admin:

- email: `platform.admin@multi-school.dev.invalid`
- development-only password: `password123`

These credentials are created only by the explicitly confirmed local demo setup and must never be used for production or real users. The database stores a bcrypt hash, never this plaintext value.

> **Demo/development only:** never apply deterministic demo-password migrations to production and never reuse `password123` for a real account.

## Five-minute Platform Admin walkthrough

1. Run `npm run demo:multi-school:setup` and `npm run demo:multi-school:start`.
2. Open `/platform-admin/` and sign in with the fictional Platform Admin.
3. Review the real overview counts and open **Schools**.
4. Open Athens Language Academy, then Piraeus English Centre, and compare their independently scoped users/classes.
5. Create a fictional temporary school and invite a School Admin.
6. Pause the temporary school and confirm ordinary login is denied.
7. Reactivate it and confirm login policy is restored.
8. Revoke the ordinary account's sessions.
9. Open **Audit log** and confirm the corresponding safe events.

The browser deliberately exposes no school or user deletion. Use only fictional records in this local environment.

`npm run demo:multi-school:reset` drops only the dedicated `hhplms_multi_school_demo` database and its marker. This removes the fictional Platform Admin, its sessions and audit records together with the registered demo schools, while retaining the local PostgreSQL container.

This environment is a development-only, fictional Hamilton House LMS walkthrough for the Phase 1 Ultimate English catalog. It runs the real Netlify Functions and PostgreSQL-backed role flows at `http://127.0.0.1:8888`; it never connects to staging or production.

## Prerequisites and one-command lifecycle

Install Node.js 22+, npm, Docker Desktop, and the Playwright Chromium browser (`npx playwright install chromium`) once.

```powershell
npm ci
npm run demo:multi-school:setup
npm run demo:multi-school:start
```

Open `http://127.0.0.1:8888/platform-admin/` for Platform Administration, or `http://127.0.0.1:8888/` for the normal LMS. Stop the server with `Ctrl+C`. The other lifecycle commands are:

```powershell
npm run demo:multi-school:verify
npm run test:e2e
npm run demo:multi-school:reset
```

`setup` creates/starts the dedicated `hhplms-multi-school-postgres` container on `127.0.0.1:55433`, creates only `hhplms_multi_school_demo`, applies production migrations without the generic demo-password migration, and loads the deterministic multi-school seed. It is safe to run repeatedly. `reset` drops only that exact database and keeps the container and any unrelated local databases.

The commands reject production mode, non-loopback hosts, a missing internal confirmation, any database name other than `hhplms_multi_school_demo`, and generic/hosted/staging database variables. They do not read `.env` or require copying hosted credentials.

Use `127.0.0.1` consistently. Cookies are host-scoped, so a login made at `127.0.0.1` is not available at `localhost`, and vice versa; opening the other hostname correctly shows a fresh login page. If port `8888` is already occupied, first try the existing `http://127.0.0.1:8888`. Terminate that listener only if it is stale, then start the demo again.

## Demo accounts

Every account uses the development-only password `password123`. All addresses use the reserved `.dev.invalid` domain and cannot receive mail.

| Walkthrough | Email | Expected state |
|---|---|---|
| Athens admin | `admin.athens@multi-school.dev.invalid` | 11 school users, three classes, licensing lifecycle |
| Athens teacher 1 | `teacher1.athens@multi-school.dev.invalid` | four scenario assignments and review queue |
| Strong student | `student1.athens@multi-school.dev.invalid` | B1, B1+, and B2 access; 96% auto score and pending teacher review |
| Weak student | `student2.athens@multi-school.dev.invalid` | 42% auto score and reviewed work with feedback |
| Missing student | `student3.athens@multi-school.dev.invalid` | assigned work with no submission |
| Redeemed student | `student4.athens@multi-school.dev.invalid` | Ultimate B2 entitlement from a redeemed code |
| No-access student | `student8.athens@multi-school.dev.invalid` | expired-code profile and no book entitlement |
| Piraeus isolation | `admin.piraeus@multi-school.dev.invalid` | sees only Piraeus users and data |

The same pattern exists for `piraeus` and `thessaloniki`; each school has `admin.<school>`, `teacher1.<school>`, `teacher2.<school>`, and `student1` through `student8` at `multi-school.dev.invalid`.

The seeded codes for each school are fictional examples named `DEV-<SCHOOL>-B2-<STATUS>-2026`, with one `unused`, `redeemed`, `expired`, and `revoked` record. Never reuse these credentials or codes outside local development.

Every fictional administrator and both teachers in each school have explicit access to Ultimate English B1, Ultimate English B1+, and Ultimate B2. Athens `student1` has the same three-package catalog for the learner walkthrough. Other entitled students retain their existing B2-only state, and every `student8` remains intentionally unentitled. B1 and B1+ are selectable in licensing, but no B1 assignments or invented publisher content are seeded.

Each Phase 1 package visibly contains exactly two components: Students Book and Workbook. Ultimate B2 Grammar Book and Test Book remain preserved in the local database but are intentionally absent from admin, teacher, student, and Android catalogs. English Journey 6 remains archived and absent.

## 10–15 minute walkthrough

1. Sign in as the Athens admin. Open Users, Classes, and Licensing. Confirm the school boundary, three lifecycle counts, and the unused/redeemed/expired/revoked examples.
2. Sign out and use Athens teacher 1. Open Assignments and inspect:
   - `Auto-scored benchmark — high, low, missing`
   - `Teacher review — pending and reviewed`
   - `Expired deadline — late and blocked`
   - `Future assignment — not started`
3. Open the benchmark results. Compare Alex at 96%, Niki at 42%, Chris with no submission, and the class aggregate.
4. Open the teacher-review results. Review Alex with a score and feedback; confirm Niki already has a completed review.
5. Browse each package and confirm exactly two component cards: Students Book and Workbook. In Ultimate B2, open both visible components and confirm Grammar Book and Test Book are absent. The Students Book pilot keeps 77 enabled Unit 1–2 activities and 12 unsupported editorial records disabled; Teacher Presentation and teacher-only solutions remain available.
6. Sign in as Alex to inspect grades and teacher feedback. Student payloads do not contain accepted/correct answer keys.
7. Sign in as Kostas (`student8`) and confirm Ultimate B2 is unavailable because the account has no entitlement.
8. Sign in as the Piraeus admin or teacher and confirm Athens records are not visible.

The browser can keep unsent form input locally while a page stays open, but the pilot schema has no durable draft-submission state. The demo therefore labels future work as “not started” rather than inventing a backend draft.

## Automated verification

`npm run demo:multi-school:verify` checks stable counts, per-school ownership, the exact Phase 1 catalog and entitlements, all four preserved B2 database components and their hidden-component descendants, archived English Journey 6 state, high/low/missing work, pending/reviewed feedback, late/future/expired deadlines, licensing states, 77/12 B2 pilot catalog counts, tenant-integrity views, and seeded answer-key safety.

With `demo:multi-school:start` running, `npm run test:e2e` automatically detects the local runtime marker and runs only `tests/e2e/local-multi-school.spec.js`. It exercises real authentication and functions for admin, teacher, student, two-component Phase 1 trees and cards, hidden B2 API/route denial, visible B2 navigation, Teacher Presentation, review mutation/final state, missing entitlement, cross-school denial, student solution denial, disabled catalog visibility, console errors, and failed-request loops. The reviewed seed row is restored after each test.

## Troubleshooting

- Port `55433` busy: stop the unrelated process. The setup refuses to silently bind elsewhere.
- Port `8888` busy: first try the existing `http://127.0.0.1:8888`; if that listener is stale, terminate it and rerun `demo:multi-school:start`.
- Docker unavailable: start Docker Desktop, then rerun setup.
- Stale or partial data: run `demo:multi-school:reset`, then setup again.
- Browser test cannot connect: keep `demo:multi-school:start` running in a separate terminal.
- Login fails after overriding seed credentials manually: reset and setup; the documented command intentionally restores the development-only default.

No screenshots are required for the normal walkthrough. Capture them only when reporting a visual regression, and ensure they contain fictional `.dev.invalid` accounts only.
