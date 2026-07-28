# Phase 1 book catalog

EduForge Phase 1 exposes three active Hamilton House packages in this exact order:

1. Ultimate English B1 (`ultimate-b1`, level B1)
2. Ultimate English B1+ (`ultimate-b1-plus`, level B1+)
3. Ultimate B2 (`ultimate-b2`, level B2)

The database contract is established by `database/027_phase_one_ultimate_book_catalog.sql`. B1 and B1+ each contain exactly two structural components, Students Book followed by Workbook. Their cover paths are null and they contain no units, lessons, activities, assignments, media, or fabricated publisher material. The UI therefore shows `Cover coming soon` and:

> Content will be added when the publisher files are available.

Ultimate B2 keeps its existing components, recovered Unit 1–2 catalog, assignments, assets, and entitlement behavior. The recovered Students Book overlay is deliberately restricted to package `ultimate-b2` and component `ultimate-b2-students-book`; unknown packages and B1/B1+ can never inherit B2 fallback content.

## Archived catalog policy

English Journey 6 remains in the database and its repository assets/import support are retained, but its package status is `archived`. A centralized client visibility gate excludes it from web and Android catalogs. Server package lists, trees, direct package/component/activity lookups, user access lists, asset delivery, licensing selection, redemption, and school metrics require an active package. Direct archived-package requests use the same generic not-found response as an unknown package.

No migration deletes English Journey 6 packages, components, content, entitlements, activation records, imports, or files. Restoring it later requires a deliberate catalog decision and a new migration; changing only frontend data is insufficient.

## Acceptance checks

On a clean isolated database:

- apply the ordered production migrations through 027;
- confirm the active slug order is B1, B1+, B2 and English Journey 6 is archived;
- confirm B1/B1+ have component types `students_book`, `workbook`, null covers, and zero units;
- confirm unknown and archived direct requests return 404 without revealing archival state;
- confirm licensing offers only active packages;
- run the local multi-school setup twice and verify deterministic entitlements;
- confirm B2 activity, assignment, solution, web-safety, and Android teacher-pack checks are unchanged.

The local walkthrough and account matrix are documented in [local-multi-school-demo.md](./local-multi-school-demo.md).
