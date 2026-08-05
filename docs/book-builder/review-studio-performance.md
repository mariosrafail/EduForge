# Publisher Review Studio performance

Real Ultimate projects can contain roughly 1,700 objects, 1,000–1,400 Student-safe activity candidates, more than 5,000 reviews and tens of thousands of detected facts. The Studio avoids transferring or rendering those collections as one payload.

## Server strategy

- Default page size: 25.
- Maximum page size: 100.
- Component, page, activity, review and diff lists are filtered and paginated before serialization.
- Activity list rows are compact projections; only one selected activity receives prompt/option/detail fields.
- Review summaries are grouped server-side. At most 100 group summaries and three samples per group are returned; selected items are paginated.
- Client JSON responses are limited to 2 MiB.
- Approved preview rasters are limited to 12 MiB.

Parsed JSON is cached by project, revision, file size and mtime. Cache keys never cross project boundaries. A file change invalidates its entry. Ordinary keystrokes do not reread full artifacts: text search uses React deferred input, requests are cancelled or ignored when stale, and the UI reports loading transitions.

No data-grid or global state dependency was added. Tables use native markup and bounded arrays. Page and materialized images load only for the active inspector/gallery. Blob URLs are revoked on cleanup.

Synthetic validation generates 152 activity candidates and 5,007 reviews from fictional data. Real-workspace validation exercises the much larger M3 artifacts without writing them and records practical response/load timings where available.
