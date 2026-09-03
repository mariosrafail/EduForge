# Hamilton House LMS / Ultimate B2 Units 1–2 functional acceptance

## Acceptance decision

The functional pilot is accepted for an isolated publisher demonstration. The supported story is one school with a school admin, teacher, student, teacher-owned class, Ultimate B2 entitlement, Units 1–2, assignments, authoritative scoring, teacher review, feedback, results, secure Teacher Presentation, and fully offline Android teacher presentation.

The visual design is frozen. This work did not expand or redesign the LMS or the legacy appearance. The five-activity Unit 1 Part 2 legacy-faithful pilot remains preserved as the regression target for future appearance work.

Starting `dev` SHA: `abb55b872840de4583563c76fd63b2e4cff7f4e7`.

## Supported boundary

Included: one school; admin, teacher, and student accounts; classes and membership; Ultimate B2 Students Book entitlement; Units 1 and 2; 22 book pages and hotspots; 77 enabled activities; assignments; submissions; automatic scores; pending teacher review; reviewed score and feedback; result lists; existing CSV export; web Teacher Presentation; and offline Android Teacher Classroom.

Intentionally outside this pilot: Units 3–10, Workbook, Grammar Book, Test Book, payments, subscriptions, parent accounts, chat, conferencing, gamification, external SSO, unrelated authoring work, external `.hhpack` installation, USB import, production DRM/licensing services, remote Android updates, deployment, and release.

## Demo accounts and deterministic data

The demo-only migration creates the existing local-convention accounts `elena.admin@example.com`, `maria.teacher@example.com`, and `anna.student@example.com` with the documented local password, one `ultimate-b2-pilot` class, active student membership, Ultimate B2 access, and representative automatic and teacher-reviewed assignments. `npm run pilot:demo:seed` requires `PILOT_DATABASE_CONFIRMATION=isolated-local-pilot`, accepts loopback PostgreSQL only, tracks migration checksums, refuses an unsafe/nonempty untracked database, and is repeatable.

Production migrations exclude demo passwords. No production email, credential, database, deployment, or external mutation is used by this flow.

## Acceptance matrix

| Role | Route / endpoint | Entitlement | Class relationship | Status | Automated | Manual | Blocking issue | Non-blocking issue | Resolution / evidence |
|---|---|---|---|---|---|---|---|---|---|
| Public | `#auth-*`, `auth-signin` | None | None | verified complete | Pass | Admin/teacher/student login performed | None | Local demo passwords are not production credentials | `tests/e2e/local-pilot.spec.js`; auth tests |
| Admin | `#admin-*`, `users`, `book-content` | Same-school package scope | Same school | verified complete | Pass | Users, teacher, student, class, and license observed | None | Full hosted licensing E2E needs hosted QA variables | authorization integration and local E2E |
| Admin | guessed/cross-school IDs | Same-school only | Same school | verified complete | Pass | Missing foreign user returned 404 | None | None | `tests/integration/authorization-flows.test.js` |
| Teacher | dashboard/classes/students | Active Ultimate B2 access | Own/authorized class | verified complete | Pass | Teacher login and owned class performed | None | None | package-access and authorization tests |
| Teacher | Students Book Units 1–2 | Active Ultimate B2 access | Own/authorized class where applicable | verified complete | Pass | Catalog loaded; 37 + 40 confirmed | None | None | activity catalog tests; local E2E |
| Teacher | book pages/hotspots | Active Ultimate B2 access | Authorized teacher | verified complete | Pass | Local page flow exercised by regression scripts | None | Physical panel validation remains | shared page-model and Android tests |
| Teacher | preview | Active Ultimate B2 access | Authorized teacher | verified complete | Pass | Representative preview exercised | None | None | mode/renderer tests |
| Teacher/admin | Teacher Presentation and solution GET | Same-school entitlement | Authorized teacher/admin | verified complete | Pass | Solution requested; `no-store` confirmed | None | Hardware fullscreen remains | teacher-presentation tests; local E2E |
| Student | Teacher Presentation solution GET | Student access is insufficient | N/A | verified complete (denied) | Pass | 403 confirmed | None | None | local E2E; solution authorization tests |
| Teacher | assignment POST | Ultimate B2 activity access | Own/authorized class | verified complete | Pass | Automatic and review assignments created | None | One final submission policy | assignment integration and local E2E |
| Teacher | repeated assignment POST | Same as creation | Same as creation | verified complete | Pass | API idempotency exercised | None | Deterministic identical payload maps to existing row | migration 025; integration tests |
| Teacher | invalid/disabled/unknown assignment | Entitlement cannot override availability | Authorized class still required | verified complete (rejected) | Pass | API security exercised | None | None | catalog and authorization tests |
| Student | assignment list/activity | Active assigned package | Active membership in target class | verified complete | Pass | Both assignments visible | None | In-progress answers are supported client-side, not server drafts | local E2E |
| Student | submit automatic work | Assigned enabled activity | Active target-class membership | verified complete | Pass | Correct submission returned 100% | None | Resubmission is denied after the final submission | integration and local E2E |
| Student | submit teacher-reviewed work | Assigned enabled activity | Active target-class membership | verified complete | Pass | Pending state observed | None | None | integration and local E2E |
| Student | malformed/repeated/late submission | Valid assignment still required | Active membership | verified complete (rejected) | Pass | API paths covered | None | No teacher deadline override in pilot | validation/integration tests |
| Teacher/admin | review submission | Same-school access | Assignment owner, or school admin | verified complete | Pass | Score 84 and feedback saved | None | Re-review may update score/feedback by the same authorized reviewer | integration and local E2E |
| Student | grades/results | Own entitlement and identity | Own submission only | verified complete | Pass | Reviewed score and feedback observed | None | None | local E2E |
| All roles | empty/error/forbidden/not-found states | Context-specific | Context-specific | verified complete | Pass | 401/403/404 paths observed | None | Some optional missing-media states are automated rather than manually forced | auth, asset, renderer, and E2E tests |
| Android teacher | offline application | Bundled teacher pack | No server relationship at runtime | verified complete | Pass | Browser smoke and viewport matrix performed | Real panel/device not connected | 440.42 MiB debug APK is a pilot artifact, not a release | Android scripts and APK verifier |

Machine-readable equivalent (the detailed 77-row activity matrix is in the JSON audit referenced below):

```json
{
  "schemaVersion": "1.0",
  "decision": "accepted-isolated-functional-pilot",
  "statuses": {
    "admin": "verified complete",
    "teacher": "verified complete",
    "student": "verified complete",
    "assignmentLifecycle": "verified complete",
    "teacherPresentation": "verified complete",
    "androidOfflineTeacher": "verified complete",
    "productionDeployment": "intentionally unsupported",
    "realClassroomPanel": "blocked by external hardware"
  },
  "requiredRelationships": {
    "tenant": "same school",
    "teacher": "assignment owner or same-school admin",
    "student": "active class membership and own identity",
    "content": "active Ultimate B2 entitlement"
  },
  "evidence": [
    "tests/integration/authorization-flows.test.js",
    "tests/integration/pilot-demo-seed.test.js",
    "tests/e2e/local-pilot.spec.js",
    "docs/lms-units-1-2-activity-audit.json"
  ]
}
```

## Assignment and result policy

Creation validates UUIDs, activity availability/mode, class ownership, school identity, title/notes lengths, ISO deadline, and target. A supplied safe request key or a deterministic payload hash becomes a unique idempotency key, so a repeated request returns one assignment.

Student answers must be an object containing only known stable question IDs (question numbers are canonicalized), scalar values, all required answers, and bounded content. The API rejects client score/count values. Automatic answers are normalized and scored only against server-held evidence. One final submission per assignment/student is allowed; a repeated final submission returns `409`. A submission after `due_at` is rejected by the API. This pilot has no resubmission or deadline-override workflow.

Teacher-reviewed work stores the response as `awaiting_review` with no fabricated score. An authorized teacher or school admin must supply a score from 0–100 to complete the first review and may add up to 4,000 characters of feedback. The stored state becomes `reviewed`; a later authorized review updates score/feedback. Unscored practice stores truthful completion with a null grade. Reading/content is content-only and not assignable.

Consistent user-facing states are: Assigned, Late, Pending teacher review, Reviewed, Completed, and Automatically graded. Pending review is never labeled completed.

## Activity audit and renderer findings

The reproducible machine-readable audit is [`lms-units-1-2-activity-audit.json`](./lms-units-1-2-activity-audit.json), generated by `npm run audit:ultimate-b2:functional`. It contains one row for every enabled activity with stable ID, unit/part/page/spread, section, title/instructions, question/option counts, type, media/images, availability, modes, evidence, all four renderer paths, answer availability, reset/check behavior, and submission behavior.

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
| Activities with audio dependencies | 12 |
| Activities with video dependencies | 4 |
| Activities related to page/activity images | 77 |
| Activities with explicit teacher solutions | 50 |

The used normalized renderer patterns are typed short answer (including open response and gap fill), multiple choice, and drag-and-drop matching. Multi-select, inline choice, ordering, and true/false are not distinct active renderer types in this Units 1–2 catalog; unsupported publisher interactions remain among the 12 disabled records. Audio/video/reading are capabilities/content associated with these normalized rows rather than separate graded renderer types.

All active rows use stable activity/question/option identity. Shared tests verify isolated state, reset/retry clearing, correct mode-specific Check behavior, serialization, no stale answers, graceful unsupported/missing-media states, media lifecycle, and non-submitting teacher preview, Teacher Presentation, and Android offline modes. No activity classification or publisher answer was invented or silently changed.

## Pages, hotspots, and presentation

The pack verifier confirms 22 ordered page assets. Shared page-model tests verify page identity, printed page/spread relationships, protected web/local Android resolution, and Unit 2 hotspot relationships. Android smoke/viewports verify one bounded page stage, Fit Page/Fit Width, zoom/pan controls, hotspot scaling, navigation, and no horizontal overflow from 800×360 through 3840×2160. Unavailable targets remain non-runnable/truthful.

Teacher Presentation requires authenticated same-school teacher/admin entitlement; students, cross-school users, unknown IDs, and disabled IDs are denied. Solution responses are private/no-store. Previous/Next traverses exactly 77 enabled rows and skips 12 disabled rows. Check, Reset, Show Answer/All, Hide Answers, open-response/missing-solution messaging, deep links, refresh/back, and temporary classroom state are tested. Presentation does not create submissions or grades.

## Authorization, API, and bundle safety

Server tests cover inactive users, expired/revoked sessions, role boundaries, same-school scoping, unrelated teacher classes, guessed UUIDs, authenticated identity injection, entitlement, protected assets, assignment membership, and review ownership. Direct function calls cannot bypass UI restrictions. Errors are safe JSON responses without SQL, stack, filesystem, source-publisher path, secret, or teacher-answer disclosure.

Student activity payloads recursively remove authoritative answer and provenance fields. Web and student Android scans found zero answer/provenance findings. The teacher solution endpoint is authorized and no-store. Only the offline teacher bundle intentionally contains the verified local teacher solution dataset. The APK has no Internet permission and offline browser smoke observed zero external or forbidden requests.

## Database and migration findings

`database/MIGRATIONS.md` is the ordered production manifest. Historical duplicate numeric prefixes are preserved because filenames are deployed identities; deterministic full-filename manifest order is the safe resolution. Demo migration `012_demo_login_passwords.sql` is explicitly outside production and is applied only by the guarded pilot seeder.

Migration 025 adds assignment idempotency and a unique final-submission slot without rewriting historical null-slot submissions. Migration 026 aligns a clean Unit 2 database with the canonical 40-row runtime catalog, preserving the authoritative reading questions while adding the missing content/practice rows. An empty isolated PostgreSQL database applies all 26 production migrations; tracked reruns are deterministic; the demo seed is repeatable. Integration cleanup is constrained to the explicitly confirmed isolated test database.

## Android and frozen legacy regression

The teacher pack is valid with 37 Unit 1, 40 Unit 2, 77 enabled, 12 disabled, 22 pages, and 41 assets. Media verification found 11 bundled audio resources and 7 videos using Android-compatible codecs. The offline bundle contains 87 files / 458,573,116 bytes and no external-network finding. The debug APK retains `com.eduforge.offlinebooks`, targets SDK 36, has no Internet permission, and was verified after a successful Gradle build.

The Unit 1 Part 2 pilot remains scoped only to:

- `ultimate-b2-sb-u1-p2-o1`
- `ultimate-b2-sb-u1-p2-o2`
- `ultimate-b2-sb-u1-p2-o3`
- `ultimate-b2-sb-u1-p2-o4`
- `ultimate-b2-sb-u1-p2-o5`

All asset hashes, original graphics/audio/video relationships, protected student mode, teacher modes, offline mapping, compact/Full HD/4K visuals, and CSS scoping passed. Existing design tokens, manifests, graphics, audio, visual tests, and viewport tests were not expanded or redesigned.

## Verification record

Passed:

- `npm ci` — 255 packages, zero reported vulnerabilities
- `npm test` — 191 tests: 185 passed, 6 database tests skipped by the no-DB invocation
- `npm run test:integration` with isolated PostgreSQL — 29 passed, 0 skipped
- `npm run build`
- `npm run verify:web-bundle-safety` — safe, zero findings
- `npm run build:android-offline`
- `npm run verify:android-student-bundle-safety` — safe, zero findings
- `npm run verify:android-teacher-pack`
- `npm run build:android-teacher-offline`
- `npm run test:android-teacher-offline:smoke`
- `npm run test:android-teacher-offline:viewports` — 10 viewports passed
- `npm run test:ultimate-b2:legacy-pilot:assets`
- `npm run test:ultimate-b2:legacy-pilot:visual`
- `npm run test:ultimate-b2:legacy-pilot:modes`
- `npm run verify:android-teacher-media`
- `npm run android:teacher:build` and APK verification
- `npm run test:e2e` in confirmed local mode — 4 passed; 2 hosted-only licensing cases skipped for missing hosted QA variables
- `npm run audit:ultimate-b2:functional`

Manual checks actually performed through the local Netlify Functions environment: admin, teacher, and student sign-in; same-school users/class/license; Units 1 and 2 and exact counts; assignment creation; student visibility/submission; server-authoritative score; pending review; teacher score/feedback; final student result; student solution denial; cross-tenant missing-resource denial; and console/request-loop observation. Page/renderer/legacy/Android interaction checks were browser-automated, not individually hand-clicked across all 77 activities.

## Limitations and production-readiness blockers

- Real classroom-panel/device testing remains the final external hardware acceptance step; no connected Android device/emulator was used because `adb` was not installed or available on `PATH`.
- Hosted licensing E2E requires the dedicated hosted non-production QA variables and was skipped locally. No production or staging system was contacted.
- Production email/DRM/licensing activation, release signing, deployment, monitoring configuration, external packs, and remote updates remain outside this pilot.
- Local Netlify CLI’s framework-port probe timed out on this Windows checkout; verification used its supported static-server mode with the same local Functions and database. This is a local tooling limitation, not a runtime API failure.
- The 440.42 MiB debug APK is suitable for pilot verification, not a signed production release.
- Client-side in-progress answers are supported; server-side draft synchronization is not part of this boundary.

There are no remaining blockers for the isolated functional publisher demo. Units 3–10 and all other books/content packs remain deferred. No merge, PR, release, or deployment is part of this acceptance.
