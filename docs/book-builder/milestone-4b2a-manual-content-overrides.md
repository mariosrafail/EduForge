# Milestone 4B2A: manual Student-safe content overrides

Milestone 4B2A lets a local editor supply presentation text for a Student-safe activity node that already exists. Supported fields are activity title, activity instructions, question prompt, option text, draggable label, target label and response-field prompt.

The generated candidate and review artifacts remain immutable. A human value is stored as a durable decision in `book-project.json`; the effective read model overlays only an approved, non-stale value. The Book Project and decision schema versions remain `1.0`, and all Milestone 4B1 locking, revision, idempotency, journal, recovery, history, conflict and stale-decision behavior is reused.

## Existing structure only

Every write resolves an exact stable activity or nested-node ID against the current Student-safe candidate artifact. The editor cannot create, remove, reorder or change the response kind of a question, option, draggable, target or response field. A raster-only activity without such a node stays unresolved.

Read-only mode shows effective content and its detected/manual origin but has no mutation controls. Explicit local edit mode adds a separate content drawer with detected, proposed and effective values, a non-writing preview, approval state, bounded note, revision confirmation, removal and stale reapproval. Activity classification and generic review disposition remain separate workflows.

## Evidence and review behavior

Content decisions depend on field-level, content-redacted facts. An exact field change or node removal can stale its decision without staling overrides for unrelated fields. Missing-content reviews are resolved from the effective projection: a single-field gap resolves when that field is complete, while grouped option, draggable or target gaps resolve only when every required existing node is complete. Draft, rejected, stale and removed overrides do not silently complete a field.

## Validation boundary

Tests cover all seven fields, strict text validation, exact target resolution, precise stale invalidation, idempotency, conflict handling, persistence, read-only projection, review reopening and Teacher-token exclusion. Human validation uses a persistent copy of a Book Project and never writes to publisher source or the original project.

The 2026-08-05 B1+ validation used persistent workspace label `20260805-161733`. The final implementation's first upgrade rescan recorded 35,599 added facts, 3,566 changed facts and 80 removed facts; its immediate unchanged rescan recorded zero added, changed or removed facts. Real publisher data exposed reused nested publisher IDs, so the parser now keeps the first legacy identity and assigns deterministic occurrence identities to later collisions. Content-redacted geometry and source-reference digests keep the real Book Project below the unchanged 64 MiB Studio artifact ceiling.

The validation copy progressed from revision 15 to 29 across upgrade rescans, seven applicable content decisions, a successful conflicting write, an unchanged rescan and one deliberate removal. Title, instructions, a missing question prompt, both missing options, one existing draggable label and one existing response-field prompt were exercised. No target lacked structured text, so no target-label decision was invented. Restart persistence and read-only effective display passed; the unchanged rescan left all seven content decisions non-stale. Removing the prompt returned it to missing and reopened its exact generated review. A clean reference scan confirmed the Student candidate, activity review, activity evidence, cluster and generated review-queue artifacts were byte-identical to the post-authoring copy.

This milestone does not add answers, scoring, arbitrary structure, OCR, publication, runtime generation, package/APK generation, bulk cluster actions, automatic propagation or reusable rules. Bulk structural-cluster authoring belongs to Milestone 4B2B.
