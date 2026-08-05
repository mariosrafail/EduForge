# Manual activity runtime-adapter boundary

Manual authoring artifacts are Publisher source material, not production LMS activity records. The existing DB-backed LMS builder and runners continue to read their current runtime schema and behavior; 4D1 introduces no database migration, Netlify write, production fetch, publication draft mutation, or package/APK content generation.

A future compiler may consume approved, non-stale Student activities and their authorized Teacher solutions, validate hierarchy and assets again, and emit the existing runtime forms where an exact adapter exists. That compiler must preserve audience separation and produce a reviewable publication draft before any package or deployment action.

Multiple choice, typed gap, open answer, and bounded media have conceptual runtime counterparts, but this document does not claim they are wired. True/false, scrollable panels, and image-backed overlays also require explicit adapter decisions. Unsupported matching/drag-drop and bespoke publisher interactions must not be silently coerced.

Until that separate milestone is implemented and validated, manual activities are visible only in the local Publisher Review Studio and its local project artifacts.
