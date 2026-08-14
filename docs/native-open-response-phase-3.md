# Native Open Response authoring (Phase 3)

Phase 3 adds draft-only native Open Response authoring. It does not change Publication v1, the LMS/runtime catalog, Hotspots, Android content, or legacy XML/IWB Open Response documents.

## Documents and identity

The Phase 2 `schemaVersion: "1.0"` envelope and single `part-1` remain unchanged. Public interaction data is `{ kind, surface, artwork, questions }`. Questions use opaque `q-<32 lowercase hex>` IDs generated from browser UUIDv4 values; reorder is array order and never changes identity. A question contains `prompt`, logical `promptArea`, approved `promptStyle`, and one stable `<questionId>-response` region with logical area, accessibility label, deterministic line positions, padding, line width, and bounded answer-font controls.

Root `assets[]` contains only `{ assetId, checksumSha256, role: "activity_artwork", slot }`. Artwork contains `{ id, assetSlot, area, order, altText, decorative, fit }` and maps one-to-one to a root slot. It contains no object key, bucket, signed URL, raw bytes, repository path, remote URL, or storage credential.

Teacher data remains a separate native Teacher document. Its solution is `{ kind: "open-response", modelAnswers: [{ questionId, text }] }`. Normalization requires its IDs and order to exactly match the public question topology. Zero questions, blank prompts, no artwork, and blank answers are structurally valid drafts. The readiness helper separately checks prompts, answers, artwork accessibility, and deterministic Auto Fit overflow.

## Atomic paired save

`037_builder_native_open_response_authoring.sql` adds an idempotency ledger and `save_builder_native_activity_pair`. The function takes both expected revisions, locks the activity scope, checks replay identity and both revisions, updates both canonical `builder_component_documents`, appends both immutable histories, records answer-free audit metadata, and commits as one PostgreSQL transaction. Independent native document PUT is disabled; authenticated Builder reads remain available.

## Managed raster assets

The native asset route supports authenticated, same-origin prepare/finalize for PNG, JPEG, and WebP. Prepare validates a safe basename, declared type/extension, byte descriptor, activity scope, slot, actor, idempotency ID, and short expiry, then issues a signed private staging PUT. Finalize checks the actual object size, downloads it, verifies complete format structure, decodes it with Sharp under byte/pixel limits, derives MIME, dimensions, and SHA-256 server-side, and copies the validated bytes to a private content-addressed key.

The completion transaction creates/reuses the package-local `builder-draft` edition and inserts a `book_assets` row with the exact component, `activity_artwork` role, `private` storage, `draft` publication status, `internal` access, checksum, dimensions, activity ID, and asset slot. Pair save re-queries those rows and rejects forged checksum, wrong role/status/profile/access, cross-package, cross-component, cross-activity, or wrong-slot references. Preview is an authenticated short-lived signed GET and is never persisted.

Failed staging objects are deleted on a best-effort basis. Removing artwork retains its finalized draft `book_assets` row. Automated orphan retention/garbage collection is intentionally deferred until a repository-wide storage lifecycle policy exists; content-addressed final objects are not deleted speculatively after an uncertain database completion.

## Deterministic presentation

The public `NativeOpenResponseSurface` consumes only public data and logical coordinates. The Teacher wrapper layers private answer reveal behavior on it. Auto Fit normalizes whitespace, uses explicit source-controlled conservative Arial width classes, performs word-aware wrapping with deterministic long-token splitting, and searches integer font sizes from authored maximum to minimum. It returns explicit lines, font size, fit status, reason, and authored baselines. Renderers place those returned lines on the same stored line positions used by the response-line background; browser DOM/canvas measurement is not an input.

## Operational rollout boundary

Migration 037 has repository coverage only and must not be applied casually. A later staging rollout must back up/verify the staging database, apply the canonical migration sequence through 037, configure private object storage, exercise authenticated real-object prepare/finalize/preview, verify audit and ownership rows, and then run the full staging smoke/integrity suite. Publication v2/runtime integration remains a later phase.
