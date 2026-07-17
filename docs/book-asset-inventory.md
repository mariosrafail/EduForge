# Book asset and repository inventory

Inventory captured on 2026-07-17 before deletion or migration.

## Tracked working tree

- 784 tracked files, 293,340,637 bytes (279.75 MiB).
- `src/assets/books/`: 243 files, 147.60 MiB.
- `unit/`: 110 files, 53.10 MiB.
- `selides/`: 12 files, 6.09 MiB.
- Tracked book-scope extensions: 356 PNG (133.77 MiB), 1 MP4 (54.83 MiB), 2 MP3 (11.10 MiB), and 6 JPEG (7.09 MiB).
- No tracked book PDFs or source archives were found. JSON/data is stored as application source rather than binary book assets.
- Git object packs total 196.10 MiB. The tracked working-tree binaries total 279.75 MiB.

Largest tracked files include the 54.83 MiB Ultimate B2 reading video, 5.57 MiB listening MP3, 5.53 MiB reading MP3, 2.89 MiB reading-text JPEG, and 1.20 MiB Students Book cover. `dist-sidebar-check/` contains tracked copies of the same video, both MP3 files, and Ultimate B2 covers.

SHA-256 comparison found 20 duplicate groups / 40 files and 75.67 MiB of redundant bytes in the inspected tracked asset/build-output scope. The 12 `selides/` page images duplicate Ultimate B2 `unit/2/parts/HD/parts_part_*.png`; the large media and covers duplicate tracked `dist-sidebar-check/assets/` output. These files are retained until remote staging and offline rollback gates pass.

## Local publisher sources (Git-ignored)

- `Ultimate English B2.app/`: 9,859 files, 3,799.81 MiB. Major types: 46 MP4 (2,351.93 MiB), 4,321 PNG (743.57 MiB), 2,494 MP3 (574.99 MiB), 30 JPEG (24.87 MiB), 2,473 IWB (15.56 MiB), 10 ZIP (3.00 MiB), and 320 XML.
- `English Journey 6.app/`: 2,945 files, 1,164.08 MiB. Major types: 2,241 PNG (558.30 MiB), 11 FLV (260.34 MiB), 50 MP3 (134.09 MiB), 10 MP4 (75.05 MiB), font/runtime assets, 176 XML, and 46 JSON.
- No PDF files were found in these two inspected source packages.

Native AIR/runtime files, DLLs, dylibs, SWFs, executable files, fonts, and package metadata are source/archive material, not web delivery assets. Encoded IWB data is not treated as finished interaction data.

## Usage classification

- Controlled remote proof: Ultimate B2 Students Book Unit 2 page images, Students Book cover, reading video, reading audio, and reading text image.
- Fully interactive: existing Reading Exercises 3 and 4. Their structured answer/feedback sources remain in the current application/database model.
- Media-only: reading video and reading text/audio screens.
- Page image: Unit 2 spreads/pages 19–34.
- Preview: Students Book cover.
- Imported but interaction pending: AIR resources listed by the Android importer without implemented React interactions.
- Offline-only: Android mappings and publisher-package resources required by `src/apps/android-offline/`.
- Unused/duplicate: tracked `dist-sidebar-check` binary copies and the duplicate `selides/`/`unit/2` page bytes; no deletion is authorized yet.

Workbook listening audio, Grammar Book image/cover, Test Book cover, Ultimate B2 units outside the controlled Unit 2 subset, and all English Journey assets remain local/unmigrated in this task. Android requires its Vite-selected local page/media/cover modules plus its existing English Journey and AIR-derived mappings.

## Later cleanup (separate approval required)

After a non-production remote upload/read-back succeeds, authenticated hosted Ultimate B2 Unit 2 works from storage, the Android offline build/device flow passes, and rollback object references/checksums are recorded:

1. Remove obsolete tracked build output and duplicate online-only sources in an ordinary cleanup commit, while preserving Android-required packaged sources in an explicit offline location.
2. Measure clone/pack size again and prepare an exact path/object allowlist.
3. In a maintenance window and only with explicit approval, mirror the repository, tag/backup every ref, and use `git filter-repo` (preferred) to remove the approved historical binary paths.
4. Validate rewritten refs, repository integrity, release tags, and fresh clones; coordinate force-push and contributor recloning.
5. Keep the backup and object-storage rollback manifest until the rewritten history is accepted.

History rewriting is deliberately not part of this task.
