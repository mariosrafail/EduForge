# Book asset storage and import pipeline

## Implemented boundary

Application code, migration `018_book_assets.sql`, the versioned manifest schema, importer, tests, and minimal fixtures stay in Git. Book binary bytes are uploaded to an S3-compatible service. PostgreSQL owns editions, relationships, logical asset identities, object references, checksums, publication state, and access policy; it never stores binary or base64 data.

The first controlled manifest is `books/ultimate-b2/ultimate-b2.students-book-unit-2.manifest.json`. It covers only the currently usable Ultimate B2 Students Book Unit 2 pages, reading video, reading audio/text image, and Students Book cover. Workbook listening, Grammar Book, Test Book, other Ultimate B2 units, imported AIR placeholders, and the other source packages are not part of this import.

All tracked and publisher-source files remain in place during this first migration. No Git history was rewritten.

## Server-only configuration

Use the variables documented in `.env.example`. For Cloudflare R2, set `BOOK_ASSET_STORAGE_PROVIDER=s3`, use `https://ACCOUNT_ID.r2.cloudflarestorage.com` as the endpoint, `auto` as the region, and separate non-production public, private, and archive buckets. Configure a custom public domain in `BOOK_ASSET_PUBLIC_BASE_URL` for explicitly public/preview objects.

Credentials must exist only in hosted server runtime, controlled CI, or the CLI environment. Never create `VITE_` versions. The private and archive buckets must have public access disabled. A minimal public-bucket CORS policy should allow only `GET`/`HEAD` from the exact hosted LMS origins. Ordinary LMS/browser asset delivery must not upload to private storage.

Authenticated hosted publisher authoring is the explicit upload exception. The server creates short-lived, exact-object presigned private `PUT` URLs and signs `Content-Type`; the browser receives no storage credential. Its private bucket therefore needs exact-origin CORS for only the request method and header actually sent. Cloudflare DEV permits `https://builder.hhplms.workers.dev`, `PUT`, and `Content-Type` on `hhplms-book-private-dev`; the Builder exact-SHA deployment reconciles and verifies that policy before deploying the Worker. This exception does not make the bucket public or authorize general browser uploads.

Signed URLs are constrained to 30–900 seconds. Page images and protected illustrations use the configured default (120 seconds when unset), downloadable files use at least 600 seconds, and audio/video use 900 seconds. These values are selected by the server from the stored asset role; the browser cannot request an arbitrary TTL. The client retains `expiresAt`, refreshes protected URLs 30 seconds before expiry, cancels stale requests, and never refreshes public URLs. Media keeps the active source during a routine refresh and activates the fresh URL only if an expired range request fails, restoring time, play/pause state, rate, volume, and mute state where supported.

The current asset is selected by explicit publication state, never by creation time. Each package has at most one `published` edition, each edition has at most one `published` import/version, and each package has at most one published row for a logical key. Logical keys must be prefixed by their globally unique package slug. Publishing or rolling back archives the previously current rows in the same transaction, and protected entitlement is evaluated against the package of the resolved current asset.

## Object keys

Object keys are generated from normalized publisher, package, edition, version, component, unit, page/activity, role, filename, and checksum segments. An example is:

```text
publishers/hamilton-house/books/ultimate-b2/editions/current/versions/1.0.0/components/ultimate-b2-students-book/units/unit-2/pages/20/page-20-21.a84f52c90000.webp
```

Published objects are never overwritten. A checksum change under the same logical key/edition/version is rejected; the manifest version must change.

## CLI

```powershell
npm run books:validate -- --manifest books/ultimate-b2/ultimate-b2.students-book-unit-2.manifest.json
npm run books:inventory
npm run books:import:dry-run -- --manifest books/ultimate-b2/ultimate-b2.students-book-unit-2.manifest.json
npm run books:import -- --manifest books/ultimate-b2/ultimate-b2.students-book-unit-2.manifest.json --environment staging --confirm-staging --concurrency 4
npm run books:verify
npm run books:cleanup-failed -- --import-id IMPORT_UUID --confirm-staging
```

Actual writes are limited to an explicitly confirmed staging environment. Production import is intentionally unsupported. Validation rejects unknown fields/relationships, duplicate IDs/logical keys, unsupported MIME types, missing files, traversal and symlink escapes, invalid references, unsafe HTML/URL schemes, and automatically scored activities without answer data.

The importer calculates SHA-256, MIME, byte size, image dimensions, and—when `ffprobe` is available—audio/video duration. Page images retain the original in the archive profile and produce high-quality WebP production and thumbnail variants. Upload concurrency is bounded. Import runs are idempotent by manifest checksum and logical asset checksum. Metadata publication occurs in one transaction only after every upload succeeds. Failed runs record failures and delete uploaded public/private objects; archive sources are retained for manual review. Cleanup requires an explicit failed import ID.

`books:verify` reads every published object back and verifies its byte length and SHA-256. Running it can transfer large media and requires non-production storage/database credentials.

## Online and offline resolution

The web LMS has no production fallback for the controlled Students Book Unit 2 assets. It requests the current page and up to one adjacent page on each side (configurable to 0–2 with `VITE_BOOK_PAGE_PREFETCH_COUNT`), cancels obsolete access requests, retries transient failures, and displays loading/failure/retry states. Metadata is cached separately from short-lived URLs. Unit 2 activity video/audio/text use the same protected resolver and use `preload="metadata"`.

Local web fallbacks exist only in Vite development. The Android build selects separate Vite aliases that compile the packaged local assets and never call signed-URL APIs. This preserves true offline behavior.

## Video scope and future delivery

This phase supports existing MP3/M4A-compatible audio and MP4 H.264-compatible video as ordinary S3 objects. S3/R2 GET delivery supports byte ranges. No transcoding farm or HLS workflow is included. If video volume, adaptive bitrate needs, or geographic delivery grows, add a separate asynchronous rendition/HLS service while retaining PostgreSQL logical identities and source checksums.

## Staging gate

No R2 upload or download verification has been performed without authenticated non-production credentials and an isolated migrated staging database. Hosted LMS sign-off also remains blocked by unavailable authenticated Netlify staging access/runtime configuration. Do not treat local validation as hosted staging success.
