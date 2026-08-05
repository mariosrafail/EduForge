# Milestone 4D1 — Manual Activity Authoring Core

Milestone 4D1 adds local Publisher authoring for eight bounded activity types: multiple choice, true/false, typed gap fill, open answer, audio, video, scrollable panel, and image-backed activity. A Publisher can create, preview, update, clone, archive, or remove a draft and can prefill a draft from Student-safe detected evidence.

The feature is available only in the local Book Builder Studio. Edit mode requires the existing explicit local-write confirmation. Read-only mode shows approved Student activities and their effective values but exposes no mutation controls or Teacher solution API.

The implementation keeps the existing Book Project schema at 1.0. Student authoring data is stored in `authoring/manual-activities.json`; answer-bearing material is stored separately in `internal/manual-activity-solutions.json`. Mutations use one project revision, lock, idempotency key, journal, atomic writes, sanitized history, and recoverable snapshots across both artifacts.

Activities bind to the existing component and Unit/group hierarchy. Assets can only come from indexed page rasters or a bounded server-side catalog of verified detected media. Browser requests use opaque IDs; arbitrary paths and uploads are not accepted.

This milestone does not compile manual activities into LMS runtime data, publish a book, generate a package, migrate a database, or write through Netlify. Matching, drag/drop, free-form HTML/script, bulk rules, and general asset upload remain unsupported.

The next boundary is a separate compiler/runtime-adapter milestone after human Publisher validation.
