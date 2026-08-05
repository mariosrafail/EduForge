# Publisher Review Studio local API

API root: `/__hhplms/book-builder`

All responses are sanitized view models. Raw artifacts are never returned.

| Route | Projection |
| --- | --- |
| `GET /bootstrap` | Read-only flag, milestone, safe workspace label and ephemeral session token |
| `GET /projects` | Safe dashboard projects and sanitized corrupt-project diagnostics |
| `GET /projects/:id/overview` | Project, application, profile, counts, validation and latest diff summary |
| `GET /projects/:id/components` | Filtered/paginated structural component candidates |
| `GET /projects/:id/pages` | Filtered/paginated page metadata, one selected page and normalized hotspots |
| `GET /projects/:id/menu` | Menu, branding, static GAF, separate intro, atlas and materialized-preview summaries |
| `GET /projects/:id/activities` | Filtered/sorted/paginated Student-safe activities and one safe detail projection |
| `GET /projects/:id/reviews` | Summary, grouped reviews or structural clusters, and paginated safe items |
| `GET /projects/:id/diff` | Recorded revision counts, safe fact kinds and paginated IDs |
| `GET /projects/:id/preview/:previewId` | Verified approved raster bytes |

`HEAD` is also supported. `POST`, `PUT`, `PATCH` and `DELETE` return `405`.

## Allowlisted artifacts

The server may open only `book-project.json`, `structural-fingerprint.json`, `review-queue.json`, `rescan-diff.json` and these selected-profile artifacts: `structure-candidates.json`, `page-candidates.json`, `menu-model.json`, `branding-model.json`, `gaf-model.json`, `atlas-inventory.json`, `hotspot-candidates.json`, `media-candidates.json`, `student-activity-candidates.json`, `activity-clusters.json` and `activity-extraction-summary.json`.

The binding exception applies only to validated source-raster previews and is never a response artifact. Internal and answer-bearing artifacts are denied before filesystem access.

## Query limits

Page size defaults to 25 and cannot exceed 100. Numeric pagination and enum-like filters are validated. Search is capped and debounced by the client. Review groups expose at most 100 group summaries, three safe samples per summary, and a separately paginated selected group. Diff details contain IDs and safe kinds, not fact payloads.

Parsed artifact caches are isolated by project ID, project revision, file size and mtime. A changed revision or mtime invalidates the corresponding entry. Responses are capped at 2 MiB; artifacts and raster previews have independent bounded read limits.
