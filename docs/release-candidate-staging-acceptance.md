# Hamilton House LMS Release Candidate staging acceptance

## Decision

**Local Release Candidate verified; hosted staging acceptance blocked by missing configuration.**

Commit `68c7974b5282697121d80458c4ccaa8429386ed3` is verified as a local Release Candidate candidate. It cannot yet be accepted as a full Release Candidate because no dedicated hosted staging URL, database, credentials, storage environment, or hosted licensing-test configuration was available.

No release-blocking application defect was found during local reconstruction, browser acceptance, security verification, or Full HD emulator testing. The blocker is environmental: a proven non-production hosted staging target must be supplied and the hosted acceptance/licensing phases must pass without skips.

## Candidate and repository state

| Item | Result |
|---|---|
| Starting `origin/dev` SHA | `68c7974b5282697121d80458c4ccaa8429386ed3` |
| Tested candidate SHA | `68c7974b5282697121d80458c4ccaa8429386ed3` |
| Branch | `dev` |
| Starting worktree | Clean |
| Existing stash | One pre-existing stash recorded and left unchanged |
| `main` | Not checked out, modified, merged, or pushed |
| Appearance | Frozen; no visual implementation change |
| Scope | Ultimate B2 Students Book Units 1–2 only |

The local `main` ref was not synchronized or moved. It was observed at `c50da55875f17da47bb020c4c0ae0c0139b8f672`; the fetched `origin/main` was `7825c5c2982b8246929e74c7ccb6fc65a1cde068`.

## Environment inventory and staging safety

The repository-authoritative preflight is `npm run staging:preflight`. It failed closed before any hosted mutation because the required staging configuration was absent.

| Category | Status | Safety conclusion |
|---|---|---|
| Dedicated staging URL | Missing | No hosted navigation or deployment allowed |
| Dedicated staging database URL/confirmation | Missing | No hosted migration, seed, integrity, or cleanup allowed |
| Complete production database fingerprint set and confirmation | Missing | Staging/production separation cannot be proven against every plausible production identity |
| Public/staging production URLs | Missing | Host separation cannot be proven |
| Staging salts/operation secrets | Missing | Hosted runtime cannot pass preflight |
| Staging QA password | Missing | QA seed cannot run |
| Hosted admin credentials | Missing | Hosted admin flow blocked |
| Hosted teacher/student credentials and IDs | Missing | Hosted teacher/student flow blocked |
| Hosted licensing variables | Missing | Both hosted licensing tests remain blocked |
| Staging storage provider/buckets | Missing | No storage target is authorized |
| Staging email mode/inbox confirmation | Missing | No hosted email operation is authorized |
| Generic local `.env` `DATABASE_URL` | Present but unclassified | Deliberately not treated as staging and never used for this acceptance |

Missing preflight variables:

`STAGING_DATABASE_URL`, `STAGING_DATABASE_CONFIRMATION`, `STAGING_ENVIRONMENT_CONFIRMATION`, `APP_PUBLIC_URL`, `STAGING_PRODUCTION_APP_URL`, `STAGING_PRODUCTION_DATABASE_FINGERPRINTS`, `STAGING_PRODUCTION_DATABASE_FINGERPRINTS_CONFIRMATION`, `ACCOUNT_RATE_LIMIT_SALT`, `INVITE_RATE_LIMIT_SALT`, `ACCOUNT_EMAIL_DISPATCH_SECRET`, `OPERATIONAL_MONITORING_SECRET`, `ACCOUNT_EMAIL_MODE`, and `HHPLMS_STAGING_QA_PASSWORD`.

Missing hosted browser/licensing variables:

`E2E_STAGING_URL`, `E2E_STAGING_CONFIRMATION`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_SCHOOL_A_ADMIN_EMAIL`, `E2E_SCHOOL_A_ADMIN_PASSWORD`, `E2E_SCHOOL_A_STUDENT1_EMAIL`, `E2E_SCHOOL_A_STUDENT2_EMAIL`, `E2E_SCHOOL_A_STUDENT_PASSWORD`, `E2E_SCHOOL_B_ADMIN_EMAIL`, `E2E_SCHOOL_B_ADMIN_PASSWORD`, `E2E_ULTIMATE_B2_PACKAGE_ID`, `E2E_SCHOOL_A_TEACHER_ID`, `E2E_SCHOOL_A_TEACHER_EMAIL`, `E2E_SCHOOL_A_TEACHER_PASSWORD`, `E2E_SCHOOL_A_CLASS_ID`, `E2E_ASSIGNABLE_ACTIVITY_ID`, `E2E_SCHOOL_A_STUDENT1_ID`, and `E2E_SCHOOL_A_STUDENT2_ID`.

No staging site was deployed or inspected. No hosted database hostname/name, storage environment, deployment identifier, or deployed SHA can be recorded because no safe target was supplied. This is safer than inferring that the generic local database or any production-adjacent resource is staging.

## Clean local reconstruction

A new database named `hhplms_rc_test` was created inside the loopback-only disposable PostgreSQL container on `127.0.0.1:55432`. It was separate from the earlier developer/demo database and was empty before reconstruction.

Results:

- `npm ci`: passed; 255 packages installed; zero reported vulnerabilities.
- 26 production migrations applied in `database/MIGRATIONS.md` order.
- Migration 025 assignment/submission safeguards applied.
- Migration 026 Unit 2 runtime/database parity applied.
- Historical duplicate `010` names remained resolved by the explicit manifest without renaming.
- Demo-only migration remained outside the production manifest.
- Guarded local pilot seed applied twice successfully.
- Reapplication created no duplicate demo identities or relationships.
- Three active users: one admin, one teacher, one student.
- One active class and one active membership.
- One Ultimate B2 student entitlement.
- Two deterministic representative assignments.
- Canonical assignable rows: Unit 1 = 37; Unit 2 = 40.
- Integration cleanup targeted only `127.0.0.1/hhplms_rc_test` and found zero leftover temporary schemas.

The clean reconstruction did not use the pre-existing developer database as evidence.

## Functional and browser acceptance

Local Netlify Functions health returned HTTP 200 with database status `ok` and build SHA `68c7974b5282697121d80458c4ccaa8429386ed3`.

The Chromium local pilot covered:

- admin sign-in, same-school users, class, and entitlement;
- cross-tenant guessed-user denial;
- teacher sign-in and authorized class;
- Ultimate B2 catalog and exact 37/40 counts;
- authorized, private/no-store teacher solution access;
- auto-scored and teacher-reviewed assignment creation;
- student visibility of both assignments;
- answer-free student payloads;
- client-provided score ignored and authoritative 100% stored;
- open response stored as Pending teacher review;
- student teacher-solution request denied;
- teacher automatic-result lookup;
- teacher review saved with score and feedback;
- final Reviewed state, score, and feedback visible to the student;
- no unexpected console errors or request loops.

`npm run test:e2e` in explicitly confirmed local mode: **4 passed, 2 skipped**. The skipped tests were exactly the two hosted-only licensing/isolation cases, because their hosted QA variables were missing. They are not marked passed.

## Hosted staging acceptance

| Phase | Result | Reason |
|---|---|---|
| Staging preflight | Blocked/fail-closed | Required variables missing |
| Staging deployment verification/deploy | Not run | No verified non-production site/provider target |
| Staging migrations 025/026 | Not run | No verified staging database |
| Staging QA seed | Not run | No staging database or QA password |
| Tenant-integrity check | Not run | No staging database |
| Hosted admin flow | Blocked | URL and credentials missing |
| Hosted teacher flow | Blocked | URL, credentials, class and IDs missing |
| Hosted student/scoring flow | Blocked | URL, credentials and IDs missing |
| Hosted teacher review | Blocked | URL, credentials and IDs missing |
| Hosted error-state/network checks | Blocked | No hosted target |
| Hosted licensing tests | Blocked; remained skipped locally | Dedicated licensing variables missing |
| Hosted logs/scheduler/email | Blocked | Deployment/provider/email configuration missing |

No staging mutation or cleanup was attempted after preflight failure.

## Counts and activity classifications

| Classification | Count |
|---|---:|
| Unit 1 enabled | 37 |
| Unit 2 enabled | 40 |
| Total enabled | 77 |
| Disabled/non-runnable | 12 |
| Auto-scored | 50 |
| Teacher-reviewed | 19 |
| Unscored practice | 7 |
| Reading/content | 1 |
| Activities with audio dependency | 12 |
| Activities with video dependency | 4 |
| Activities with page/activity image relationship | 77 |
| Activities with explicit teacher solutions | 50 |

`npm run audit:ultimate-b2:functional` reproduced these exact counts. The detailed evidence remains in `docs/lms-units-1-2-activity-audit.json`.

## Authorization, scoring, and security

- Full unit suite: 191 tests, 185 passed, 6 database tests skipped only in the no-DB invocation.
- Isolated PostgreSQL integration suite: 29 passed, 0 failed, 0 skipped.
- Server-authoritative scoring, strict payload validation, deadlines, idempotent assignments, duplicate-submission rejection, review ownership, and tenant isolation passed.
- Teacher solutions remained teacher/admin-only and private/no-store.
- Student runtime/API payload tests found no authoritative answer or publisher provenance fields.
- Web bundle safety: safe, zero findings.
- Student Android bundle safety: safe, zero findings.
- Offline teacher bundle: 87 files, zero external/bundle findings.
- APK manifest: no Internet permission.
- No production account, URL, database, bucket, email provider, or storage target was contacted.

The locally reproducible error-state coverage includes invalid/inactive sessions, wrong role/school, missing entitlement, unknown/disabled activity, invalid assignment IDs, malformed/missing/extra answers, past deadline, duplicate submission, unauthorized review, missing media/assets, and safe server errors. Hosted network interruption and hosted asset/provider failure remain blocked with staging.

## Android Release Candidate

APK:

- Path: `android/app/build/outputs/apk/debug/app-debug.apk`
- Size: 461,815,652 bytes / 440.42 MiB
- Application ID: `com.eduforge.offlinebooks`
- Version: `1.0` (`versionCode` 1)
- Minimum/target SDK: 24 / 36
- Internet permission: absent

Connected-target discovery used `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`, not PATH assumptions.

### Full HD emulator

| Item | Result |
|---|---|
| Serial | `emulator-5554` |
| Model | Pixel Tablet emulator |
| Android | 15 / API 35 |
| Resolution/density | 1920×1080 / 160 dpi |
| APK install | Passed |
| Application launch | Passed |
| Unit counts | 37 + 40 = 77 |
| Page switching | 30 switches; average 19 ms; maximum 370 ms |
| Mounted page images | Maximum 1 |
| Activity open/close | 20 cycles passed |
| Fit Page | Passed; 1271×884 inside 1788×900 stage |
| Fit Width | Passed; 1772×1232 |
| Zoom/pan | 1.25× and pan change passed |
| Hotspots | 3 rendered on the tested page |
| Audio/video | Unit 1/2 audio and video playback/seek passed |
| Legacy pilot highlight | Playback/seek passed |
| Background/resume | Media remained paused |
| Lock/unlock | Media remained paused |
| External requests | 0 |
| Console errors | 0 |
| Smallest visible control | 48 px |

The observed device profile was `extra-large-classroom`, 1920×1080 landscape, device-pixel-ratio 1, with exactly one mounted page image.

### Other hardware

- Physical Android device: **not tested**; no authorized physical device was listed.
- Real 65/75/86-inch classroom panel: **not tested**; remains a distinct final hardware acceptance item.

The emulator result must not be interpreted as physical-device or real-panel acceptance.

## Visual regression and performance

- Unit 1 Part 2 asset/hash tests: 7/7 passed.
- Visual regression passed at compact 804×360, Full HD 1920×1080, and 4K 3840×2160.
- Theme remained scoped to the five pilot activity IDs.
- Student, teacher-preview, and teacher-presentation modes passed for all five.
- Ten-viewport Android matrix passed with zero horizontal overflow, console errors, or forbidden requests.
- Offline browser smoke: cold startup 675 ms, book open 53 ms, activity open 140 ms.
- Emulator: book open 96 ms; page switching average 19 ms / maximum 370 ms.
- Only one intended activity renderer and one active page image were observed.

No visual baseline was updated and no design/CSS/product change was made.

## Findings and classification

### Environment/configuration blocker

Dedicated hosted staging configuration is absent. Consequently deployment verification, hosted data preparation, complete hosted browser flow, hosted licensing tests, hosted logs, email, and safe hosted cleanup cannot run. This blocks full Release Candidate acceptance.

### High-priority non-blockers

- None identified in the verified local/application scope.

### Normal follow-up

- Production-sized web chunks continue to emit the existing Vite size warning; builds succeed and no new performance regression was observed.
- The debug teacher APK is 440.42 MiB and is an acceptance artifact, not a signed release.

### Deferred product/hardware scope

- Physical Android device and real classroom panel acceptance.
- Units 3–10, other books, external content packs, USB import, DRM/licensing services, production email, release signing, remote updates, deployment, and release.

## Cleanup decision

- Hosted staging cleanup: not required and not run, because preflight blocked all hosted migration/seed/deployment activity and no QA records were created.
- Local integration cleanup: passed and confirmed the exact isolated target.
- The temporary local RC database `hhplms_rc_test` was removed after verification; a catalog check confirmed zero remaining databases with that exact name.
- The APK remains only in ignored Android build output and is not committed.

## Commands executed

Passed:

- `npm ci`
- `npm test`
- `npm run test:integration`
- `npm run test:integration:cleanup`
- `npm run build`
- `npm run verify:web-bundle-safety`
- `npm run audit:ultimate-b2:functional`
- `npm run test:e2e` locally, with the two hosted tests explicitly skipped
- `npm run build:android-offline`
- `npm run verify:android-student-bundle-safety`
- `npm run verify:android-teacher-pack`
- `npm run build:android-teacher-offline`
- `npm run test:android-teacher-offline:smoke`
- `npm run test:android-teacher-offline:viewports`
- `npm run test:ultimate-b2:legacy-pilot:assets`
- `npm run test:ultimate-b2:legacy-pilot:visual`
- `npm run test:ultimate-b2:legacy-pilot:modes`
- `npm run verify:android-teacher-media`
- `npm run android:teacher:build`
- `npm run test:android-teacher-device` full scenario
- `npm run test:android-teacher-device` Full HD viewport scenario

Blocked/fail-closed:

- `npm run staging:preflight`
- `npm run staging:migrate`
- `npm run staging:seed`
- `npm run staging:integrity`
- `npm run staging:smoke`
- `npm run staging:verify`
- hosted `npm run test:e2e:staging`
- `npm run staging:cleanup`

The commands after preflight were not invoked because no verified staging target existed.

## Final recommendation

Keep `68c7974b5282697121d80458c4ccaa8429386ed3` as the locally verified RC candidate. Provision a dedicated non-production staging site/database/storage/email configuration, supply all guarded runtime-only QA/E2E variables, rerun preflight, deploy or verify this exact SHA, execute migrations/seed/integrity, run the complete hosted Chromium and licensing flows without skips, inspect hosted logs, and then perform safe QA cleanup or explicitly preserve the QA dataset.

Until those steps pass, the correct status is:

**Local Release Candidate verified; hosted staging acceptance blocked by missing configuration.**
