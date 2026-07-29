# EduForge Production Readiness Audit

## Audit metadata

- Date: 2026-07-29
- Starting SHA: `75f246e6eaf65b40d8a5317ea472576ee127cdfc`
- Final audited SHA: `75f246e6eaf65b40d8a5317ea472576ee127cdfc`
- Branch: `dev`
- Repository state at start: local `HEAD` equaled `origin/dev`; the worktree was clean; `main` was not checked out; the pre-existing stash was left untouched.
- Audit scope: the Phase 1 web LMS, School Admin, Platform Administration, Netlify Functions, PostgreSQL migrations, local multi-school demo, CI/deployment configuration, web bundles, Android Student, Android Teacher, and the 16 areas specified in the audit brief.
- Method: all tracked files were inventoried with `git ls-files`; targeted `git grep`/`rg`, import tracing, request-path tracing, migration review, limited Git-history searches, production builds, bundle scanners, unit/integration/E2E tests, and Android validation were used. Findings were not inferred from keyword counts alone.
- Environment: Windows, Node `v22.12.0`, npm `10.9.0`, Git `2.45.0.windows.1`, Chromium through Playwright, and a dedicated loopback PostgreSQL database created by the repository's multi-school demo tooling. No staging or production system was accessed.
- Commands executed: `npm ci`; `npm run audit:source-structure`; `npm test`; `npm run test:integration`; `npm run build`; `npm run verify:web-bundle-safety`; `npm run audit:ultimate-b2:functional`; `npm audit --audit-level=high`; two runs of `npm run demo:multi-school:setup`; `npm run demo:multi-school:verify`; `npm run demo:multi-school:start`; `npm run test:e2e`; `npm run build:android-offline`; `npm run verify:android-student-bundle-safety`; `npm run build:android-teacher-offline`; `npm run test:android-teacher-offline:smoke`; `npm run test:android-teacher-offline:viewports`; and `npm run verify:android-teacher-media`.
- Unit result: 234 tests, 227 passed, 0 failed, 7 skipped because the generic unit invocation intentionally lacked the isolated integration database opt-in.
- Integration result: the required unconfigured invocation ran 7 files and skipped all 7 because `TEST_DATABASE_URL` and `TEST_DATABASE_CONFIRMATION=isolated-test-database` were absent. The same integration suite was then rerun against the dedicated loopback database with the explicit safety confirmation: 30 tests passed, 0 failed, 0 skipped.
- E2E result: the final clean run passed all 8 Chromium tests in 3.2 minutes. Two earlier attempts failed only because port 8888 was not ready and then because Netlify CLI terminated with a Windows `EPERM` file-watch error while Android build output was being generated concurrently. Generated output was removed, the server was started and confirmed ready, no build ran concurrently, and the unchanged suite passed.
- Environment limitations: external Netlify deployment settings, repository branch-protection rules, production environment variables, production monitoring/alert destinations, backup restoration, and real-device Android behavior were not available for inspection. Items dependent on those controls are marked `Needs verification`.
- Generated artifacts: ignored `dist/` and `test-results/` output was removed after inspection. No generated artifact is part of this report.

## Executive summary

EduForge is **Not ready** for a controlled publisher/customer delivery in its current configuration.

- P0 issues: **0**
- P1 issues: **6**
- P2 issues: **8**
- P3 issues: **2**
- Intentional demo/deferred items: **8**
- False positives reviewed: **9**
- Recommended delivery decision: **Not ready**

The strongest result is that the tested authorization architecture is materially sound: no authentication bypass, cross-school data exposure, student answer-key exposure, committed production credential, destructive unauthenticated operation, or public Platform Admin API was confirmed. All explicitly configured database integration tests passed, student bundle scanners reported zero findings, Platform Admin session separation and invalid-Origin handling passed E2E, and both Android variants passed their required verification.

The delivery decision is nevertheless `Not ready` because reachable production flows have six high-priority problems. Ordinary login has no brute-force throttle; the privileged login throttle can be abused to lock a known administrator email; the public signup flow permits unrestricted creation of an active school administrator and tenant; initial signup bypasses the repository's stronger password policy; authenticated portals show fixed customer-looking operational metrics; and several School Admin controls claim saved/exported results without persistence. These are bounded remediation items rather than reasons for a broad rewrite.

## Confirmed protections

- Ordinary sessions use opaque random tokens stored as database hashes. Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` outside loopback; logout deletes the stored session and clears the cookie.
- Every authenticated request reloads the user and school state, so disabled users and revoked sessions stop working without relying on cached React state.
- Password reset and invitation values are high-entropy, hashed at rest, expiring, single-use tokens. Password reset revokes existing sessions and related tokens.
- Passwords are hashed with bcrypt. No plaintext production password storage or comparison was found.
- Platform Administration has a distinct cookie name, `Path=/platform-admin`, `SameSite=Strict`, an eight-hour session, separate tables and endpoints, server-side role checks, and origin validation.
- Ordinary-user cookies do not authorize Platform Admin APIs. E2E verified ordinary/privileged session separation, session revocation recovery, database-style invalidation recovery, and host-cookie isolation.
- Invalid Platform Admin origins return 403 without destroying a valid privileged session; the behavior passed E2E.
- School, class, assignment, submission, licensing, book, media, and Platform Admin operations were traced through server-side authorization helpers and tenant predicates. User-supplied school/teacher/student identifiers do not override the authenticated identity.
- Integration tests passed school-admin school scoping, teacher ownership, student self-access, package entitlement, cross-school denial, one-time licensing, session lifecycle, scheduled operations, and Platform Admin controls.
- Student API serialization removes answer keys and source provenance. Scoring is server-authoritative for database activities.
- Teacher solution responses require an authenticated, entitled teacher/admin and use private/no-store/nosniff response headers. Student access was denied in integration coverage.
- Web bundle safety scanned 7 built files with zero findings. Android Student bundle safety scanned 3 files with zero findings. Android Teacher's solution data is intentionally isolated to the teacher build.
- CSV export cells neutralize leading `=`, `+`, `-`, and `@` spreadsheet formulas and correctly quote CSV content.
- Actual `.env` variants are ignored. No plausible production secret, private key, AWS access key, bearer token, SMTP password, or privileged browser variable was confirmed in tracked files or the reviewed history candidates.
- Server-only secrets are not named with `VITE_`. The reviewed `VITE_` variables select client build modes, book prefetching, or a development-only legacy proof route.
- Local/demo data is placed in a dedicated confirmed database. The demo-password migration is excluded from the documented production migration sequence.
- The production build does not emit source maps, and existing CI runs web/Android bundle-safety checks.
- Primary navigation, authentication forms, responsive shells, keyboard paths, session recovery, and required desktop/tablet overflow checks passed the E2E suite. Android Teacher passed ten viewport profiles from 800x360 to 3840x2160 with no horizontal overflow or console errors.

## Findings

### PR-001 — Ordinary sign-in has no brute-force throttling

- Severity: P1 — High-priority pre-delivery issue
- Confidence: High
- Area: Authentication and session security
- Affected users: All ordinary School Admin, Teacher, and Student accounts
- Evidence: `netlify/functions/auth-signin.js`, `validatePayload` and `handler`, lines 4-72. The reachable public handler loads an account and calls `bcrypt.compare`, but performs no rate-limit lookup, attempt recording, delay, account cooldown, or edge challenge. Account-lifecycle and class-invite endpoints demonstrate that database-backed rate-limit helpers already exist elsewhere.
- Current behavior: An unauthenticated client can submit password guesses to the ordinary sign-in endpoint without an application-enforced request or account limit.
- Realistic impact: Credential stuffing and password guessing can continue until constrained by an unverified external control. bcrypt raises attacker cost but is not a request throttle and also consumes application compute.
- Recommended remediation: Add a distributed, privacy-preserving throttle that combines source fingerprint and account identifier, records both failed and successful outcomes, returns a bounded `Retry-After`, keeps login errors generic, and avoids permanent account lockout. Confirm the external edge/WAF policy as defense in depth.
- Suggested atomic commit: Add ordinary-auth login attempt storage/helper usage and focused handler tests in one authentication-boundary commit.
- Required verification: Unit tests for threshold/window/recovery, integration tests for independent source and account dimensions, successful-login reset behavior, generic errors, disabled users, and a regression E2E sign-in.
- Delivery blocker: Yes

### PR-002 — Platform Admin rate limiting permits email-wide denial of service

- Severity: P1 — High-priority pre-delivery issue
- Confidence: High
- Area: Platform Administration authentication
- Affected users: Platform administrators
- Evidence: `netlify/functions/platform-admin-auth.js`, `login`, lines 22-68. The pre-check counts recent failures where `request_fingerprint = current` **or** `email_hash = submitted`, and blocks at five. Failed attempts for a known email therefore aggregate across unrelated request fingerprints.
- Current behavior: An attacker who knows a privileged email can maintain the 15-minute lockout by sending five or more wrong passwords, even when requests come from a different address than the legitimate administrator.
- Realistic impact: The control plane can be made unavailable to a targeted administrator without possessing credentials. The generic response protects account enumeration but does not prevent a known-address lockout.
- Recommended remediation: Separate per-source abuse control from account risk signals. Use a much higher/progressive account-wide threshold, challenge or notification before account-wide denial, preserve constant generic responses, and ensure a legitimate successful authentication can recover safely. Do not simply remove privileged rate limiting.
- Suggested atomic commit: Replace the Platform Admin attempt decision with a tested two-dimensional limiter in one privileged-auth commit.
- Required verification: Handler/integration tests using multiple fingerprints against one email, one fingerprint against multiple emails, recovery after the window, correct `Retry-After`, generic invalid-credential behavior, and the existing Platform Admin E2E suite.
- Delivery blocker: Yes

### PR-003 — Public signup provisions an active tenant administrator without an enrollment gate

- Severity: P1 — High-priority pre-delivery issue
- Confidence: High
- Area: Authentication, tenant provisioning, and delivery configuration
- Affected users: Publisher operations and all hosted-service operators
- Evidence: `src/components/lms/AuthView.jsx`, `submitSchoolSignup` and the Create account form, lines 126-134 and 226-249; `src/services/authApi.js`, `createSchoolAccount`, lines 47-54; `netlify/functions/auth-signup.js`, `handler`, lines 19-72. The public UI calls a public endpoint which creates a school and an active `admin` user. There is no invite, allow-list, tenant quota, configuration flag, approval state, or request rate limit.
- Current behavior: Any internet visitor can create a new school tenant, active School Admin, and session.
- Realistic impact: For a controlled publisher/customer delivery this permits unapproved tenant proliferation, resource consumption, support burden, and use of production-looking administration features. It did not produce cross-tenant access in testing.
- Recommended remediation: Make provisioning an explicit product decision. For the controlled pilot, default to invitation/Platform-Admin provisioning or a server-only enrollment flag with quotas and rate limiting. A disabled UI alone is insufficient; the endpoint must enforce the gate.
- Suggested atomic commit: Gate school signup server-side and align the auth screen/configuration in one tenant-provisioning commit.
- Required verification: Endpoint tests for default denial, authorized enrollment, replay/rate limits, atomic rollback, duplicate email behavior, and an E2E test for the selected customer onboarding path.
- Delivery blocker: Yes

### PR-004 — Initial signup bypasses the established password policy

- Severity: P1 — High-priority pre-delivery issue
- Confidence: High
- Area: Authentication and password policy
- Affected users: Newly created School Admin and Student accounts
- Evidence: `netlify/functions/auth-signup.js`, `validatePayload`, lines 5-15, and `netlify/functions/auth-student-signup.js`, `validatePayload`, lines 5-18, accept any password of at least 8 characters. `netlify/functions/_account-lifecycle-utils.js`, `validatePassword`, lines 28-40, enforces 10-128 characters, rejects whitespace-only/email-derived values, and rejects known demo passwords; reset, invitation, and change-password handlers use that centralized policy. `src/components/lms/AuthView.jsx` also advertises “Minimum 8 characters.”
- Current behavior: Initial accounts can be created with passwords the same account would be forbidden to set through lifecycle endpoints.
- Realistic impact: New account credentials can start below the intended production standard, including known demo-style values, and policy behavior depends on which endpoint is used.
- Recommended remediation: Route all initial signup validation through the centralized password validator and align visible guidance. Preserve an explicit, isolated demo-only override only in confirmed local seed tooling, not the public endpoint.
- Suggested atomic commit: Centralize both signup handlers and their UI copy on the existing password policy.
- Required verification: Unit and handler tests for minimum/maximum length, demo values, email-derived values, Unicode/whitespace cases, valid passphrases, and unchanged bcrypt/session behavior.
- Delivery blocker: Yes

### PR-005 — Authenticated Teacher and Student portals present fixed metrics as live data

- Severity: P1 — High-priority pre-delivery issue
- Confidence: High
- Area: Hardcoded metrics and misleading UI claims
- Affected users: Teachers and students in every tenant
- Evidence: `src/components/lms/teacher/teacherPortalConfig.js`, `teacherSections`, lines 5-40, fixes “4 active components,” “3 B2 classes,” “55 demo students,” and “4 active assignments”; `src/components/lms/teacher/sections/TeacherDashboardSection.jsx`, lines 27-54, renders them. `src/components/lms/student/studentPortalData.js`, lines 1-20, fixes “4 active components,” “3 pending,” and “78% average”; `src/components/lms/student/portal/StudentPortalSections.jsx`, lines 13-24 and 28-56, also identifies every student as “Ultimate B2 A / Hamilton House demo.” `src/services/bookContentApi.js`, `mapDatabaseActivity`, lines 71-104, adds “11/16 submitted” or “Assigned to 2 classes” to database activities.
- Current behavior: Database-backed authenticated screens are mixed with constant operational values that are not scoped to the current school, class, assignment, or user and are not consistently marked as preview data.
- Realistic impact: Publisher/customer users can make decisions from invented class, assignment, progress, and submission information and may conclude that tenant isolation or data import is wrong.
- Recommended remediation: Replace each metric with a defined scoped API value or remove it. Where a true preview is retained, label the complete card/section visibly and keep it outside operational dashboards.
- Suggested atomic commit: Replace Teacher dashboard constants and Student dashboard/profile constants as two small frontend/API commits, followed by a separate activity-progress contract commit.
- Required verification: Empty/new-tenant fixtures, multi-school differing-count tests, scoped API integration tests, loading/error/empty UI tests, and E2E assertions that seeded schools show their own values.
- Delivery blocker: Yes

### PR-006 — School Admin preview controls claim persistence or export that never occurs

- Severity: P1 — High-priority pre-delivery issue
- Confidence: High
- Area: Demo/fallback behavior and API failure handling
- Affected users: School administrators
- Evidence: `src/components/lms/admin/AdminView.jsx`, lines 220-231, maps CSV Import to `setUserCreated(true)` and publisher export to `setExported(true)` without a file, parser, request, or download. `src/components/lms/admin/sections/AdminUsersSection.jsx`, lines 31-56, reports “Invitation account saved to database” after that import. `src/components/lms/admin/sections/AdminOperationsSections.jsx`, lines 36-53, reports an adoption export “prepared” without creating one. `src/components/lms/admin/sections/AdminSchoolSetupSection.jsx`, lines 17-58, edits React-only branding state without persistence.
- Current behavior: Production-looking controls transition to success states even though no database write or export is performed. The user guide calls some areas previews, but the immediate success messages do not.
- Realistic impact: Administrators can believe users were imported, records were saved, exports were generated, or branding was persisted, then discover data loss or missing output later.
- Recommended remediation: Before the pilot, either implement each workflow with success only after confirmed persistence/download, or disable the control and label the whole section as a non-saving preview. Error and retry states must be explicit.
- Suggested atomic commit: One School Admin workflow per commit: CSV import; publisher export; branding persistence/preview labeling.
- Required verification: Negative and success component tests, request failure tests, refresh persistence checks, CSV validation/formula safety, download content tests, and School Admin E2E coverage.
- Delivery blocker: Yes

### PR-007 — Authentication handlers execute schema DDL during normal requests

- Severity: P2 — Medium-priority production hardening
- Confidence: High
- Area: Database and migration readiness
- Affected users: All authenticated users and operators
- Evidence: `netlify/functions/_auth-utils.js`, `ensureAuthSchema`, lines 98-164, creates/alters authentication tables and indexes. It is called from `auth-signin`, `auth-signup`, `auth-student-signup`, `auth-me`, `auth-signout`, and `users`, including `netlify/functions/auth-signin.js:32`.
- Current behavior: Routine auth traffic performs idempotent schema checks/DDL and therefore requires the runtime database role to retain schema-change privileges.
- Realistic impact: A missing migration can be silently masked; cold requests take additional database work; concurrent deployment traffic can contend on DDL; and least-privilege production credentials cannot be adopted cleanly.
- Recommended remediation: Move schema ownership fully to the migration/preflight process, add an explicit schema-version readiness check, and reduce the runtime role to data permissions. Retain a clear 503 health response when migrations are missing.
- Suggested atomic commit: Remove runtime auth DDL only after adding a migration-version preflight and tests.
- Required verification: Fresh database migration test, stale-schema startup/preflight failure, runtime-role permission test with DDL denied, auth integration suite, and rollback/recovery rehearsal.
- Delivery blocker: No

### PR-008 — Production deployment and migration gates cannot be established from the repository

- Severity: P2 — Medium-priority production hardening
- Confidence: Medium — Needs verification
- Area: Build, CI, deployment, and migrations
- Affected users: All production users
- Evidence: `.github/workflows/ci.yml` provides substantial checks on `dev`, `main`, and pull requests, including a real PostgreSQL integration job. `netlify.toml`, lines 1-17, uses `npm run build` as the deployment build command and does not invoke migration history/checksum validation or staging preflight. Repository evidence cannot show Netlify production-branch rules, required GitHub checks, deploy locks, or an external migrate-before-traffic procedure.
- Current behavior: CI is strong, but the repository-level deployment command can build successfully without proving that production migrations were applied. Whether external settings prevent that deployment is unknown.
- Realistic impact: If external gates are absent, code requiring a new schema can receive traffic before the schema is ready. This is an operational release risk, not evidence that a current production database is stale.
- Recommended remediation: Document and enforce a single deployment runbook: immutable artifact, migration checksum/history verification, integrity query, migrate-before-traffic or compatible expand/contract order, health check, and rollback decision. Export evidence of Netlify and GitHub required-check settings.
- Suggested atomic commit: Add a read-only production deployment preflight/runbook and wire it into the actual deploy gate in one operations commit.
- Required verification: Inspect external branch/deploy settings; perform an isolated stale-schema failure test; rehearse migration, health verification, and rollback/restore in staging.
- Delivery blocker: Yes, until external controls are verified or the repository gate is added

### PR-009 — Hosted responses lack a general security-header baseline

- Severity: P2 — Medium-priority production hardening
- Confidence: High
- Area: Deployment configuration and browser security
- Affected users: Web LMS and Platform Administration users
- Evidence: `netlify.toml` defines build/dev settings and rewrites but no site-wide headers. Searches found no general `Content-Security-Policy`, `frame-ancestors`/`X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy`. Sensitive teacher responses do set targeted private/no-store/nosniff headers.
- Current behavior: Browser protections depend on defaults and application behavior rather than an explicit hosted baseline.
- Realistic impact: A future injection or unsafe external embedding would have fewer containment layers; referrer and browser-feature disclosure are not centrally constrained.
- Recommended remediation: Add and test an incremental CSP, clickjacking protection, strict referrer policy, permissions policy, `X-Content-Type-Options`, and an HSTS decision at the hosting layer. Inventory required asset/media/object-storage origins before enforcing CSP.
- Suggested atomic commit: Add Netlify security headers plus a header regression test; introduce CSP report-only first if required by current assets.
- Required verification: Production-build smoke under CSP, Platform Admin and LMS E2E, media/book assets, email/account links, object-storage downloads, frame test, and deployed-header inspection.
- Delivery blocker: No

### PR-010 — Most frontend API requests have no bounded timeout or cancellation contract

- Severity: P2 — Medium-priority production hardening
- Confidence: High
- Area: API contracts and reliability
- Affected users: All web roles on degraded networks
- Evidence: unbounded `fetch` wrappers include `src/services/authApi.js`, `courseApi.js`, `assignmentsApi.js`, `usersApi.js`, `classApi.js`, `licensingApi.js`, `bookContentApi.js`, `bookActivitiesApi.js`, `bookMediaAssetsApi.js`, and `bookPageHotspotsApi.js`. `bookAssetsApi.js` demonstrates a signal-aware path, but it is not the shared contract.
- Current behavior: Many page loads and mutations wait for browser/network termination and cannot consistently cancel stale requests on navigation.
- Realistic impact: Loading states can appear stuck, late responses can update obsolete screens, and users may retry a mutation whose outcome is unknown. Existing assignment idempotency limits some duplicate risk but is not universal.
- Recommended remediation: Introduce a small shared request helper with caller-provided `AbortSignal`, a documented timeout, normalized transport/JSON errors, and no automatic retry for non-idempotent mutations.
- Suggested atomic commit: Add the helper and migrate one API domain per atomic commit, beginning with authentication and School Admin mutations.
- Required verification: Timeout, abort, malformed JSON, 401/403, unmount/navigation, slow-success, and unknown-mutation-outcome tests.
- Delivery blocker: No

### PR-011 — Error handling leaks development guidance and logs raw server exceptions

- Severity: P2 — Medium-priority production hardening
- Confidence: High
- Area: Logging and information exposure
- Affected users: Public API callers and production operators
- Evidence: `netlify/functions/_auth-utils.js`, `databaseNotConfiguredResponse`, lines 72-84, returns guidance naming local `.env` setup and `npm run dev:netlify`. `serverError`, lines 249-252, and catch blocks such as `netlify/functions/auth-signin.js:71`, `auth-signup.js:69`, and `auth-student-signup.js:73` send the raw exception object to `console.error`.
- Current behavior: A database-configuration failure exposes internal development/run-command detail in a public 503. Server logs can contain driver messages, SQL object names, filesystem details, or stack traces without structured redaction.
- Realistic impact: Public infrastructure detail is modest but unnecessary; raw logs can increase sensitive operational exposure and make alerting/noise control harder.
- Recommended remediation: Return a stable public error code/message and correlation ID. Log a structured allow-list of fields server-side, retain full diagnostic detail only in an access-controlled sink, and explicitly redact tokens, cookies, SQL parameters, user answers, and personal data.
- Suggested atomic commit: Centralize safe public/server error handling and migrate auth handlers in one logging-hardening commit.
- Required verification: Snapshot public 500/503 bodies, redaction tests with synthetic secret/token/database errors, correlation-ID propagation, and operational alert ingestion.
- Delivery blocker: No

### PR-012 — Five direct dependencies use `latest` ranges

- Severity: P2 — Medium-priority production hardening
- Confidence: High
- Area: Dependencies and supply-chain posture
- Affected users: Build/release operators and indirectly all users
- Evidence: `package.json`, lines 82-89, specifies `latest` for `@vitejs/plugin-react`, `framer-motion`, `lucide-react`, `react`, and `react-dom`. `package-lock.json` currently pins the installed graph, and `npm ci` reproduced it successfully.
- Current behavior: Lockfile-respecting builds are deterministic, but lock regeneration, dependency tooling that reads manifests without the lock, and future fresh resolution can cross major versions without an intentional review.
- Realistic impact: An otherwise routine lock refresh can introduce framework, renderer, animation, icon, or build-plugin incompatibility and obscure the reviewed dependency baseline.
- Recommended remediation: Replace `latest` with reviewed exact or controlled semver ranges, document the update cadence, and keep lockfile updates isolated with CI/bundle review.
- Suggested atomic commit: Pin the five direct dependencies to the currently tested major/minor policy without upgrading them.
- Required verification: `npm ci`, unit/integration/E2E, production build, web safety scan, both Android builds/scanners, and lockfile diff review.
- Delivery blocker: No

### PR-013 — Initial web and offline JavaScript bundles exceed the build warning threshold

- Severity: P2 — Medium-priority production hardening
- Confidence: High
- Area: Build performance and reliability
- Affected users: Web and Android users, especially slower devices/networks
- Evidence: `npm run build` succeeded but produced an LMS JavaScript chunk of approximately 934.38 kB minified (170.01 kB gzip) and an AppChrome chunk of approximately 327.66 kB. Android Student produced a roughly 1,074.89 kB minified entry and Android Teacher roughly 1,024.52 kB; Vite emitted the >500 kB warning. Large media is expected in offline packs and is not counted as a web-code defect.
- Current behavior: Major portal and activity code is delivered in large entry chunks. No measured hosted performance budget is enforced.
- Realistic impact: Parse/execute and update costs can be noticeable on school hardware; the effect on real delivery networks is not quantified. Size alone is not treated as a release blocker.
- Recommended remediation: Measure cold-load and interaction performance on representative devices, then split role portals and heavy activity families at stable route boundaries. Add a realistic budget for JavaScript, not offline course media.
- Suggested atomic commit: Add measurements/budgets first; perform one route-family code split per subsequent commit.
- Required verification: Repeatable Lighthouse/WebPageTest or equivalent lab metrics, low-end device trace, E2E navigation, offline cold-start measurements, and bundle-safety scans.
- Delivery blocker: No

### PR-014 — A demo-specific entitlement grant is included in the production migration manifest

- Severity: P2 — Medium-priority production hardening
- Confidence: High
- Area: Demo/production boundary and migrations
- Affected users: Operators of databases containing the historical exact demo identities
- Evidence: `database/MIGRATIONS.md` includes `023_demo_teacher_ultimate_b2_access.sql` as migration 23 of 28. That migration grants `ultimate-b2` access to exact active admin/teacher emails in the exact “Hamilton House ELT Demo” school if those rows exist. The separate demo-password migration `012_demo_login_passwords.sql` is correctly excluded.
- Current behavior: The production sequence conditionally applies a narrowly scoped data entitlement for historical demo identities. It is a no-op on databases without the exact data.
- Realistic impact: A production database retaining those demo identities receives book access as a side effect of schema rollout. This does not bypass role or tenant checks, but it mixes pilot data policy into the immutable production migration stream.
- Recommended remediation: Do not rewrite an already-applied migration. Document its checksum and effect, inventory whether the exact identities exist in any target environment, and add a forward migration or operational cleanup if those accounts must not remain entitled.
- Suggested atomic commit: Add a forward-only demo-entitlement inventory/cleanup migration and runbook after confirming deployed history.
- Required verification: Migration-history checksum validation, exact-identity inventory with values kept out of logs, no-op test without demo data, scoped cleanup test with demo data, and entitlement integration tests.
- Delivery blocker: No

### PR-015 — High-confidence legacy frontend modules remain outside active build paths

- Severity: P3 — Low-priority technical debt
- Confidence: High
- Area: Dead code and unused modules
- Affected users: Maintainers
- Evidence: Import tracing across all web and Android entries found no active import for `src/components/lms/TeacherView.jsx`, `src/components/lms/AssignedActivity.jsx`, `src/components/lms/SubmissionReview.jsx`, the legacy LMS activity-builder cluster, or `src/services/adminMetricsApi.js`. Their referenced demo datasets/API labels form a self-contained older path. Android-only, Netlify entry, test helper, dynamic activity, and compatibility files were excluded from this classification.
- Current behavior: Obsolete production-looking implementations remain searchable beside the active role-specific portals.
- Realistic impact: Maintainers can patch or audit the wrong path and keyword audits overstate shipped demo behavior. No runtime defect was confirmed.
- Recommended remediation: Confirm there is no intended external import contract, then remove the cluster and associated exclusively referenced styles/data in a dedicated cleanup.
- Suggested atomic commit: Remove only the traced legacy module cluster and prove all entry builds remain unchanged.
- Required verification: Import graph, source-structure audit, unit tests, all build modes, web/Android bundle scanners, and bundle manifest comparison.
- Delivery blocker: No

### PR-016 — Stale identity TODOs contradict current server-side authorization

- Severity: P3 — Low-priority technical debt
- Confidence: High
- Area: TODO/FIXME and stale comments
- Affected users: Maintainers and auditors
- Evidence: comments in `src/components/lms/teacher/sections/TeacherClassesSection.jsx` and `src/components/lms/books/BookPageViewer.jsx` describe wiring authenticated teacher/editor identifiers as unfinished. Full request tracing showed that current Netlify handlers derive or validate teacher/student identity against the session and reject mismatches; the comments do not describe the security boundary accurately.
- Current behavior: The UI/API call shape still carries optional identifiers in places, while stale comments imply that authentication depends on future frontend wiring.
- Realistic impact: Reviewers can misdiagnose a server-protected path as a frontend-only boundary or reintroduce trust in client identifiers during maintenance.
- Recommended remediation: Replace the comments with the current invariant: identifiers are selection hints only and the server derives/validates authorization from the session. Remove redundant parameters separately only if contract analysis supports it.
- Suggested atomic commit: Correct up to three closely related identity comments; do not mix with API refactoring.
- Required verification: Existing authorization integration tests and a search confirming no comment claims client identity is authoritative.
- Delivery blocker: No

## Intentional demo and deferred functionality

1. School Admin Overview uses fixed rollout cards but explicitly states that they are a “demo preview”; live Users and Books/classes panels are identified separately. This is intentional preview behavior, unlike PR-006's false persistence claims.
2. School Admin Integrations is clearly presented as a later/preview area and highlights a demo connection. It must remain visibly non-operational in customer demonstrations.
3. The public full-demo flow explicitly says all data is mocked, provides role jumps, and ultimately lands on real access gates. It is a sales/demo surface, not an authorization bypass; decide whether its route belongs on the pilot hostname.
4. The multi-school local seed, fictional `.invalid` domains, local passwords/codes, and console output are isolated development fixtures guarded by explicit local database confirmations.
5. `FEATURE_FLAGS.ENABLE_BOOK_HOTSPOT_EDITOR` defaults to `false`. Backend/database support exists, but complete permission/editor/persistence coverage is not sufficient to enable it for Phase 1.
6. `FEATURE_FLAGS.ENABLE_BOOK_ACTIVITY_BUILDER` defaults to `false`. Hidden UI and partial backend code do not make it customer-ready; enabling it now is not recommended.
7. The legacy Flash proof route requires `import.meta.env.DEV`, an explicit client flag, and loopback-only server behavior. It is correctly isolated recovery/proof tooling.
8. B1/B1+ catalog placeholders and “coming soon” components, plus Teacher Android's intentionally bundled offline solutions, are deferred/role-specific product content. Teacher solution presence is safe only while Student and Teacher build pipelines remain separately verified.

## False positives reviewed

1. Optional `schoolId`, `teacherId`, and `studentId` values in client/service calls do not override authenticated identity; server helpers derive or validate scope and integration tests deny cross-tenant/self mismatches.
2. No authentication token, password, reset token, invitation token, or privileged session value is stored in `localStorage` or `sessionStorage`; reviewed storage contains route intent, audio preference, local demo activity state, and non-secret UI metadata.
3. Fictional `.invalid` emails, demo passwords, activation codes, and loopback PostgreSQL URLs are local/test fixtures, not leaked production credentials.
4. Teacher answer data in the Teacher Android source/pack is intentional. It is excluded from Student builds, and both student scanners reported zero findings.
5. `VITE_` variables do not contain server credentials. They select client modes/prefetch and a development-only legacy proof.
6. The public `/platform-admin/` HTML route is not a public administrative API. Privileged data/actions require the separate server session and origin checks.
7. The seven skipped integration files in the generic `npm test` run were not counted as passes; they were rerun with the explicit isolated-database opt-in and passed all 30 tests.
8. SQL statements without an obvious inline `school_id` predicate were traced through authorization/access-row helpers or session-derived IDs before classification. No exploitable cross-school path was confirmed.
9. No `dangerouslySetInnerHTML` use, private-key header, plausible AWS access key, bearer credential, committed live environment file, or student-accessible source map was found.

## Dependency and build posture

- `npm ci`: passed; 255 packages were installed and 256 audited.
- `npm audit --audit-level=high`: 0 vulnerabilities at high, moderate, or low severity in the resolved graph.
- Manifest posture: five direct dependencies use `latest` (PR-012); the committed lockfile currently pins and reproduces the tested graph.
- Source structure: passed. The script reported informational warnings/category counts only: 8 catalog, 2 configuration, 395 handwritten, 19 recovered, and 50 test files.
- Unit tests: 227 passed, 0 failed, 7 database-dependent tests skipped in the generic invocation.
- Database integration: the unconfigured required run skipped 7/7 files as designed; the explicitly confirmed isolated loopback rerun passed 30/30 tests with none skipped.
- Local demo: setup succeeded twice, demonstrating idempotent application of 28 production migrations; verification passed with three schools and the expected multi-school users/classes/assignments/submissions/licensing/review states.
- Web build: passed with no source maps. The large-chunk warning is tracked as PR-013.
- Web bundle safety: passed, 7 files scanned, zero findings.
- Ultimate B2 functional audit: passed: 37 enabled Unit 1 activities, 40 enabled Unit 2 activities, 77 enabled total, 12 disabled, 50 auto-scored, 19 teacher-reviewed, 7 unscored, 50 explicit teacher solutions, and expected media counts.
- E2E: final clean run passed 8/8, including role shells, workflows, tenant isolation, Platform Admin separation/revocation/origin handling, and required viewports.
- Android Student: build passed; safety scan checked 3 files with zero findings.
- Android Teacher: content pack/build verification passed with 77 enabled and 12 disabled activities, 22 pages, 41 assets, and 448,994,237 content bytes. Bundle verification scanned 87 files/458,572,963 bytes with zero findings.
- Android Teacher smoke: passed at 1280x720 with 0 solution network requests, forbidden requests, or console errors; cold start 823 ms, book open 84 ms, activity open 146 ms in the test environment.
- Android Teacher viewports: all 10 profiles from 800x360 through 3840x2160 passed with zero horizontal overflow, forbidden requests, or console errors.
- Android media: passed; 11 MP3 audio and 7 MP4 AVC/AAC video assets were reported as a broadly supported Android combination.
- CI: the workflow covers unit, web build/audit/safety, Android checks, visual checks, npm audit, APK work, and an isolated PostgreSQL integration job. Required-check enforcement and Netlify deployment settings remain external evidence gaps under PR-008.

## Prioritized remediation plan

1. **Ordinary login abuse protection**
   - Included findings: PR-001
   - Risk: High authentication abuse/availability risk
   - Estimated scope: Small backend domain plus migration/tests
   - Expected files: ordinary auth helper/handler, one forward migration, focused unit/integration tests
   - Test plan: limiter dimensions/window/recovery, generic errors, successful sign-in, disabled account, E2E login
   - Dependency: confirm edge/WAF behavior, but do not rely on it

2. **Platform Admin limiter correction**
   - Included findings: PR-002
   - Risk: High privileged-control-plane availability risk
   - Estimated scope: Small privileged-auth backend change
   - Expected files: Platform Admin auth handler/helper and focused tests
   - Test plan: multi-source/single-account and single-source/multi-account cases, recovery, existing Platform Admin E2E
   - Dependency: batch 1 may supply a shared limiter design, but privileged thresholds stay separate

3. **Controlled tenant enrollment**
   - Included findings: PR-003, PR-004
   - Risk: High onboarding/authentication risk
   - Estimated scope: One backend onboarding domain plus small auth UI alignment
   - Expected files: signup handlers, centralized password helper usage, auth client/view, tests, optional configuration documentation
   - Test plan: default gate, authorized creation, quotas/rate limits, policy matrix, rollback, customer onboarding E2E
   - Dependency: publisher decision on invitation-only versus explicitly enabled self-service

4. **Truthful authenticated dashboards**
   - Included findings: PR-005
   - Risk: High customer trust/data correctness risk
   - Estimated scope: Two frontend workflow commits and possibly scoped read models
   - Expected files: Teacher dashboard/config, Student portal/data, activity mapping/API, focused tests
   - Test plan: empty and differing multi-school fixtures, scoped counts, error states, E2E values
   - Dependency: agree which Phase 1 metrics are required; remove the rest

5. **Truthful School Admin workflows**
   - Included findings: PR-006
   - Risk: High false-success/data-loss expectation
   - Estimated scope: One workflow per commit
   - Expected files: School Admin import/export/branding components and their selected API endpoints/tests
   - Test plan: confirmed persistence/download, failure/retry, refresh, CSV safety, E2E
   - Dependency: product decision to implement or clearly disable each preview

6. **Deployment evidence and schema ownership**
   - Included findings: PR-007, PR-008, PR-014
   - Risk: Medium operational/schema risk
   - Estimated scope: Several atomic operations commits; do not combine migration cleanup with runtime auth changes
   - Expected files: preflight/runbook, workflow/deploy configuration, forward migration if needed, auth schema helper, tests
   - Test plan: stale/fresh schema, checksum/history, least-privilege runtime role, demo entitlement inventory, staging recovery rehearsal
   - Dependency: obtain Netlify/GitHub settings and deployed migration history first

7. **Browser and API hardening**
   - Included findings: PR-009, PR-010, PR-011
   - Risk: Medium defense-in-depth/reliability/diagnostic exposure
   - Estimated scope: Three independent commits, then API domains migrated incrementally
   - Expected files: `netlify.toml`, header tests, request helper/services, safe error helper/functions
   - Test plan: CSP/media/E2E, timeout/abort/JSON errors, public-body snapshots, structured log redaction
   - Dependency: hosted origin inventory and monitoring sink expectations

8. **Reproducibility and performance budgets**
   - Included findings: PR-012, PR-013
   - Risk: Medium build and client-performance risk
   - Estimated scope: One dependency-policy commit and separate measurement/code-split commits
   - Expected files: package manifest/lock for pinning; budget configuration; route/activity imports
   - Test plan: complete current matrix plus lab/device performance and bundle comparison
   - Dependency: establish target school device/network profile

9. **Legacy cleanup**
   - Included findings: PR-015, PR-016
   - Risk: Low maintenance risk
   - Estimated scope: One dead-cluster removal and one comment-only cleanup
   - Expected files: traced unused modules/exclusive references; up to three comments
   - Test plan: import graph, source audit, all build modes and scanners, authorization integration
   - Dependency: complete P1 work first; confirm no external compatibility consumer

## Delivery checklist

Before publisher demonstration:

- [ ] Hide/disable or unmistakably label every PR-005/PR-006 fake metric and non-persisting action.
- [ ] Decide whether the explicitly mocked full-demo route is appropriate on the demonstration hostname.
- [ ] Use only isolated demonstration identities and confirm no production data is present.
- [ ] Re-run unit, configured integration, web build/safety, and E2E.

Before staging:

- [ ] Complete PR-001 through PR-004.
- [ ] Complete or explicitly disable the PR-005/PR-006 workflows.
- [ ] Obtain and record Netlify/GitHub required-check and deploy-gate evidence.
- [ ] Run migration checksum/history, tenant-integrity, and stale-schema preflight against isolated staging.
- [ ] Inventory the exact historical demo identities affected by migration 023 without logging personal data.
- [ ] Configure and test safe structured error monitoring.

Before production pilot:

- [ ] Close all P1 findings and PR-008's evidence gap.
- [ ] Apply migrations through the documented gate before compatible traffic; verify operational health afterward.
- [ ] Confirm secrets, mail, object storage, monitoring, backup, and restore procedures in the real environment.
- [ ] Confirm response headers and TLS/HSTS policy on the deployed hostname.
- [ ] Run role-based customer acceptance with separate schools, including revocation and recovery.
- [ ] Rebuild and rescan the exact immutable web/Android artifacts selected for delivery.
- [ ] Obtain publisher sign-off on the eight documented demo/deferred items.

Before general production release:

- [ ] Complete PR-007 and PR-009 through PR-014 or accept each residual risk in writing with an owner/date.
- [ ] Establish performance budgets on representative school devices and networks.
- [ ] Exercise backup restoration, migration recovery, session cleanup, and incident response.
- [ ] Validate privacy retention/access controls for exports, audit metadata, submissions, and teacher feedback.
- [ ] Remove high-confidence legacy paths after compatibility confirmation.
- [ ] Require all CI/integration/bundle checks on protected production branches and prohibit skipped critical database tests.

## Final audit conclusion

The exact classification is **Not ready**.

EduForge may advance to a controlled publisher/customer delivery only after PR-001 through PR-006 are remediated and verified, and after PR-008 is resolved by evidence of an enforced migrate/check/deploy gate or by adding that gate. No P0 flaw was confirmed: the tested tenant boundaries, server authorization, session separation, solution protection, CSV neutralization, and bundle safety are credible foundations.

The recommended first remediation batch is **PR-001 only: ordinary login abuse protection**. It is a single security boundary, is independently testable, and reduces an exposed authentication risk without coupling it to onboarding, UI, or deployment work. PR-002 should follow as a separate privileged-auth commit because its correct thresholds and recovery behavior differ.
