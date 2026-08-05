# Milestone 4C1.1: activity identity stabilization

Milestone 4C1.1 stabilizes nested activity identities across parser fragments and current cross-title validation projects. It does not create activities, edit answers, publish content, generate packages, or change Book Project schema `1.0`.

## Proven collision source

The strict Student validator exposed response-field collisions during final candidate aggregation. Parser-local allocation was already deterministic and unique within one document, but the allocator state ended at the parser-call boundary. When one activity contained parallel `ebook_obj_params.iwb` and `obj_params.iwb` fragments, repeated publisher IDs and repeated structural fallbacks produced the same parent-scoped hash in both calls.

The safe collision map contained only stable IDs, field kinds, source-relative activity locators, parser fragment names, publisher IDs where present, and structural positions. It contained no XML, answer values, Teacher values, keys, or absolute paths. The B2 corpus showed 2,713 colliding response-field IDs across 147 activities; every collision occurred across the two parser fragments, not within a parser call.

## Identity allocation

Each activity now owns one shared nested-ID allocator across question-bank, sentence-choice, drag/drop, and write parsers. Allocation follows these rules:

1. Derive the legacy ID from the nested kind, parent ID, and publisher ID or structural fallback.
2. Preserve that ID for the first non-colliding occurrence.
3. For a later collision, derive a new ID from the same parent-scoped identity plus normalized source-relative document, structural element position, and stable context occurrence.
4. Compare publisher identities case-insensitively.
5. Keep allocator scope local to the parent activity so inserting unrelated activities or fields cannot renumber existing targets.
6. Validate global uniqueness across the final Student artifact without suppressing or dropping any field.

Answer and Teacher-solution values are excluded from every identity input. Source documents remain read-only and decoded XML remains in memory.

## Compatibility and validation

Fictional regression fixtures cover duplicate publisher IDs within one call and across fragments, case variants, missing IDs, repeated parser invocation, unrelated insertion, parent scoping, deterministic extraction, global uniqueness, Student/Teacher separation, legacy first-occurrence preservation, durable target attachment, and strict rejection of an intentionally invalid artifact.

Fresh external projects for B2, B1 Plus, and held-out B1 complete full activity extraction. Each immediate unchanged rescan reports zero added, changed, and removed facts; Student and hierarchy artifacts are deterministic; Students Book, Workbook, and Grammar Book retain Units 1–10; and Tests retain Groups 1–17 where supported by source structure. Existing B1 Plus activity and manual-content targets remain attached. Any pre-existing review-decision staleness is preserved rather than silently reapproved.

The Publisher Studio mode chip now displays `Local editing` or `Read-only review`. The bootstrap capability identifier remains diagnostic, and read-only/edit authorization continues to depend only on the explicit write capability rather than display text.

The CI workflow uses the current Node 24 action majors for checkout, Node setup, Java setup, and Android setup. Android command-line tools remain pinned to the previous workflow default so the action-runtime deprecation fix does not silently change the Android toolchain.

The next task is Manual Activity Authoring Core.
