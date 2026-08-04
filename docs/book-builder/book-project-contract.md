# Book Project contract

Book Project schema `1.0` is an authoring and evidence envelope. It supports incomplete drafts and wraps, rather than replaces, the existing strict publication manifest.

The strict top-level fields are `schemaVersion`, `projectId`, `revision`, `lifecycleStatus`, `createdAt`, `updatedAt`, `sourceDescriptor`, `sourceSnapshot`, `selectedProfile`, `detectedFacts`, `approvedDecisions`, `publicationDraft`, and `validationSummary`. Unknown top-level fields, unsupported versions, unsafe IDs, invalid revisions, and absolute portable paths are rejected.

Implemented lifecycle states are:

- `draft`: an authoring envelope without a completed scan;
- `scanned`: known-profile scan with no source change requiring review;
- `review_required`: fallback detection or stale decisions require human review;
- `source_changed`: the source changed but no existing decision became stale.

No published, deployed, approved, or APK-ready state is claimed.

`publicationDraft` may be incomplete. `projectPublicationManifest()` projects only the six fields supported by `lib/book-assets/manifest.js`: `schemaVersion`, `publisher`, `book`, `edition`, `components`, and `assets`. Detection confidence, inventory, local bindings, and unapproved candidates are not projected. The unchanged strict validator is then run; an authoring-valid draft can correctly remain publication-invalid.

Portable serialization recursively orders object keys, normalizes fact/decision/profile arrays, uses UTF-8 JSON with two-space indentation, LF line endings, and a final newline. Exporting the same in-memory revision is byte-equivalent. Revision is a positive integer; each successful rescan increments it after an atomic expected-revision check.
