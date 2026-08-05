# Hierarchy compatibility

The hierarchy is additive. Existing Book Projects without `component-hierarchy.json` derive the same sanitized model from their existing structure, page, hotspot, activity, review, and menu artifacts. No Book Project schema migration is required.

Current single-root `book1` candidate IDs remain byte-for-byte compatible:

- component decision targets retain their source-locator digest;
- page decision targets retain the legacy component/number/part digest;
- activity candidate and nested content IDs are unchanged;
- hotspot IDs, review IDs, decision IDs, and history entries are unchanged.

For a future non-`book1` root, page identity includes the source root to prevent collisions. Dependencies for page decisions bind to exact source-relative variant evidence instead of an ambiguous component/number/part tuple.

Approved non-stale component-role decisions project effective names and grouping kinds without rewriting detected artifacts. Stale role decisions remain visible but do not override current evidence. Existing page, hotspot, activity classification, audience, review-disposition, and manual content decisions continue to resolve through their durable targets.

The first scan with 4C1 can add hierarchy artifacts and hierarchy detected facts. An unchanged subsequent rescan is deterministic and produces no additional diff. Only a decision whose actual dependency evidence changes may become stale; unrelated decisions are not invalidated.
