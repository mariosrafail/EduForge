# Homework Phase 1 architecture

## Baseline audit

The `de6390d60497969c13379bf332c5d8b9c559be2b` DEV baseline stores each
assignable target and recipient in `activity_assignments`. Legacy activities
use `activity_id`; published-native activities pin an immutable
`book_component_releases` row plus `native_activity_id`. Student work,
automatic scoring, manual review, feedback, results, CSV export, and the safe
Delete-versus-Close lifecycle all use the assignment row as their execution
boundary. Class assignments intentionally resolve the current active
`class_students` membership when listing work and results.

The reusable architecture is mature and must remain the execution engine. The
proven gap is that one create request contains only one target, so there is no
persistent, server-authoritative identity or ordering for a multi-activity
Homework. Creating several assignments in React would not provide atomicity,
idempotent membership, grouping, or trustworthy aggregate progress.

## Additive Phase 1 design

Phase 1 adds a school-scoped `homeworks` header and ordered `homework_items`.
Every item stores one canonical assignment target identity using the same
legacy or immutable published-native representation already enforced by
`activity_assignments`. Each item crossed with each selected class produces an
underlying assignment linked by `homework_id` and `homework_item_id`. Historical
standalone assignments retain null links and are not reinterpreted.

The Homework header owns title, instructions, resource links, due date,
teacher, status, and a request idempotency key plus canonical request hash.
Server code validates the authenticated teacher/admin, school, every class,
every entitled assignable target, duplicates, and client answer-key material
before one PostgreSQL data-modifying statement inserts the header, ordered
items, and underlying assignments. A unique scoped request key makes retries
return the original Homework; a changed payload using the same key conflicts.
The single statement is atomic, so any item or assignment failure rolls back
the entire logical creation.

Teacher and student APIs are additive. Existing assignment APIs and routes stay
available for each underlying execution unit. Teacher Homework responses expose
per-item/per-class result links and aggregate progress. Student Homework
responses expose only public target summaries and accessible underlying
assignment IDs; opening an item uses the existing assignment workspace and
submission runtime, so no renderer or grading path is duplicated.

## Aggregate progress semantics

Expected work is the set of distinct `(homework_item, active student)` pairs
across the Homework's currently assigned classes for which the student has an
active package entitlement for that item. This preserves dynamic active
membership, does not count inaccessible work, and avoids double-counting a
student who belongs to more than one selected class. A pair is submitted when
that student has a submission for any underlying assignment of the item.
`awaitingReview`, `reviewed`, and `autoScored` use the latest authoritative
submission status for that pair; `missing = expected - submitted`. Percent
complete is reported only when the expected count is non-zero.

## Boundaries and risks

All reads remain school-scoped and owner/role checked. Class and package access
are server-authoritative. Published-native targets remain pinned to verified
immutable releases. Student Homework payloads do not include activity documents
or Teacher projections, and existing answer-stripping remains in the assignment
workspace path. No production data migration is performed.

The append-only migration must be added to `database/MIGRATIONS.md`, and the
runtime schema contract must be regenerated with the canonical generator.
Relevant risks are stale migration fingerprints, source-structure thresholds,
route/API source assertions, and existing assignment UI regression tests.

Phase 1 deliberately leaves Homework-level destructive lifecycle actions out:
the existing transaction-safe per-assignment Delete-versus-Close operations
remain available for standalone assignments. The server rejects those
operations for a single Homework-managed assignment so a caller cannot create
a partially deleted or partially closed group. Rich scheduling, individual
recipients, post-publication editing, exemptions, re-sits, notifications, and
reporting redesign are later milestones.
