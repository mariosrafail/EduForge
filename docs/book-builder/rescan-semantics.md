# Detected facts, decisions, and rescan semantics

Detected facts and approved decisions are separate stores.

A detected fact has a stable ID derived from its fact kind and normalized source-relative semantic locator. Its content/evidence SHA-256 is separate, so a changed file at the same location is `changed`, not unrelated `removed` plus `added`. Foundation fact types cover application and SWF identity, canonical root, profile evidence, and candidate component, Unit, part, object, atlas, media, and metadata families. No converted pages, hotspots, activities, scoring, or answers are emitted.

An approved decision contains its own stable ID, selected semantic value, dependency fact IDs, the dependency evidence hashes seen at approval, approval state, stale state/reasons, and editor metadata. Decisions are never stored inside facts.

Rescan compares stable IDs and returns deterministically ordered `unchanged`, `added`, `changed`, and `removed` sets. A decision remains untouched when all dependencies and evidence hashes match. A changed or removed dependency adds an exact stale reason; the decision is preserved and never silently reapproved, including if evidence later reverts to an older hash. Added facts never override a decision. Reapplying an unchanged scan is idempotent.

`rescan-diff.json` contains only revision numbers, fact IDs in each changed class, and stale decision IDs. An unchanged rescan therefore reports zero added, changed, removed, and stale decisions.
