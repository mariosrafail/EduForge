# Phase 1 book catalog

Hamilton House LMS Phase 1 exposes three active Hamilton House packages in this exact order:

1. Ultimate English B1 (`ultimate-b1`, level B1)
2. Ultimate English B1+ (`ultimate-b1-plus`, level B1+)
3. Ultimate B2 (`ultimate-b2`, level B2)

Every visible package exposes exactly two components:

| Package | Visible components |
|---|---|
| Ultimate English B1 | Students Book, Workbook |
| Ultimate English B1+ | Students Book, Workbook |
| Ultimate B2 | Ultimate B2 Students Book, Ultimate B2 Workbook |

The database contract is established by `database/027_phase_one_ultimate_book_catalog.sql`. B1 and B1+ each contain exactly two structural components, Students Book followed by Workbook. Their cover paths are null and they contain no units, lessons, activities, assignments, media, or fabricated publisher material. The UI therefore shows `Cover coming soon` and:

> Content will be added when the publisher files are available.

Ultimate B2 keeps all four original database components, recovered Unit 1–2 catalog, assignments, assets, and entitlement behavior. `ultimate-b2-grammar-book` and `ultimate-b2-test-book`, including their units, lessons, activities, source code, and assets, remain stored unchanged. They are temporarily excluded from normal web, API, demo, and Android catalogs by `PHASE_ONE_VISIBLE_COMPONENTS` in `src/config/bookCatalogVisibility.js`. Restoring them later is a centralized configuration change and does not require data reconstruction.

Normal package trees and guessed component routes expose only `ultimate-b2-students-book` and `ultimate-b2-workbook`. Hidden component links use the same unavailable response as unknown components. The recovered Students Book overlay is deliberately restricted to package `ultimate-b2` and component `ultimate-b2-students-book`; unknown packages and B1/B1+ can never inherit B2 fallback content.

## Archived catalog policy

English Journey 6 remains in the database and its repository assets/import support are retained, but its package status is `archived`. A centralized client visibility gate excludes it from web and Android catalogs. Server package lists, trees, direct package/component/activity lookups, user access lists, asset delivery, licensing selection, redemption, and school metrics require an active package. Direct archived-package requests use the same generic not-found response as an unknown package.

No migration deletes English Journey 6 packages, components, content, entitlements, activation records, imports, or files. Restoring it later requires a deliberate catalog decision and a new migration; changing only frontend data is insufficient.

## Acceptance checks

On a clean isolated database:

- apply the ordered production migrations through 027;
- confirm the active slug order is B1, B1+, B2 and English Journey 6 is archived;
- confirm B1/B1+ have component types `students_book`, `workbook`, null covers, and zero units;
- confirm the B2 database still has all four component rows and descendants while normal catalogs return only Students Book and Workbook;
- confirm guessed Grammar Book and Test Book routes return the generic unavailable state;
- confirm unknown and archived direct requests return 404 without revealing archival state;
- confirm licensing offers only active packages;
- run the local multi-school setup twice and verify deterministic entitlements;
- confirm B2 activity, assignment, solution, web-safety, and Android teacher-pack checks are unchanged.

The local walkthrough and account matrix are documented in [local-multi-school-demo.md](./local-multi-school-demo.md).
