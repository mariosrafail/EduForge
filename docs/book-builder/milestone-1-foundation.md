# Publisher Book Builder Milestone 1

Milestone 1 adds a Node-only, read-only foundation for inspecting a selected legacy Adobe AIR book source. It resolves the canonical application inside a direct `.app` or installer wrapper, parses its AIR descriptor, creates a bounded portable inventory and deterministic structural fingerprint, selects an evidence-based source profile, and stores the result as a versioned Book Project.

The subsystem lives in `lib/book-builder/`; its non-interactive developer CLI is `scripts/book-builder/cli.mjs`. It has no React, Vite, Netlify, database, storage-service, or Android dependency. Production browser and Android entry graphs do not import it.

## Commands

```text
npm run test:book-builder
npm run book-builder:scan -- --source "<source-folder>" [--workspace "<workspace>"] [--project-id "<id>"]
npm run book-builder:rescan -- --project "<project-directory>"
npm run book-builder:inspect -- --project "<project-directory>"
```

Commands return non-zero status for blocking errors such as a missing source, invalid `.app`, multiple valid application roots, unsafe paths, corrupted state, or revision conflicts. `scan` reports its output directory, selected profile/confidence, and inventory totals. `rescan` reports added, changed, removed, and stale counts. `inspect` prints a portable summary and only the presence/type/timestamp of the local binding, never its absolute paths.

## Explicit non-goals

Milestone 1 itself does not add or change a visual Builder, `builder.html`, the Ultimate B2 hotspot Builder, extraction, IWB decoding, activity or answer conversion, page/menu import, OCR, media conversion, publication, content packages, database persistence, deployment, or APK generation. It inventories structural evidence only. Milestone 2 now implements the Ultimate profile's safe IWB/graphics/pages/menu evidence import behind these contracts; see `milestone-2-ultimate-profile.md`.

## Existing-system boundary

`lib/book-assets/manifest.js` remains the canonical strict publication model. `scripts/books` remains the staging-gated importer for already-authored manifests. The current Ultimate B2 Builder remains a title-specific local authoring tool. Student and Teacher web/Android package boundaries are unchanged.

## Local read-only validation

The implementation was validated against the four locally supplied sources. Counts came from the scanner and an independent filesystem enumeration; they matched exactly.

| Selected source | Canonical app relative to selection | Files | Bytes | Profile | Confidence |
|---|---|---:|---:|---|---:|
| Ultimate English B2 direct app | `.` | 9,859 | 3,984,394,463 | `ultimate-air-v2` | 1.000 |
| Ultimate English B1 Plus wrapper | `Ultimate English B1+.app` | 9,347 | 3,851,645,817 | `ultimate-air-v2` | 1.000 |
| English Journey 6 direct app | `.` | 2,944 | 1,220,618,500 | `journey-air-v1` | 1.000 |
| Ultimate English B1 held-out wrapper | `Ultimate English B1.app` | 10,007 | 3,605,527,618 | `ultimate-air-v2` | 1.000 |

The held-out B1 result used the same registry and matched all seven Ultimate structural evidence rules; there is no B1 title/application-ID branch. Each immediate unchanged rescan reported zero added, changed, removed, and stale records. Independent before/after file counts, byte totals, application-descriptor hashes, and main-SWF hashes were identical. Outputs remained in the operating-system local Book Builder workspace, outside the repository and source roots.
