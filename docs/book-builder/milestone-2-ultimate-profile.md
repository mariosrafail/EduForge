# Publisher Book Builder Milestone 2

Milestone 2 adds the reusable, Node-only `ultimate-air-v2` importer behind the Milestone 1 Book Project contracts. It statically inspects the main SWF, discovers the source's IWB key from evidence, indexes safe structural summaries, proposes component/page/menu/hotspot/media facts, and writes a local review queue. It does not execute SWF or ActionScript, modify the selected application, publish a book, or enter a browser/Android runtime graph.

The parser is selected by the structural profile registry. Titles, application IDs, and known publisher keys are not dispatch inputs. B2, B1+, and the held-out B1 use the same modules under `lib/book-builder/profiles/ultimate-air-v2/`. Journey remains on `journey-air-v1` and receives no Ultimate artifacts.

## Commands and local artifacts

```text
npm run book-builder:scan -- --source "<source>" [--workspace "<workspace>"] [--project-id "<id>"]
npm run book-builder:rescan -- --project "<project-directory>"
npm run book-builder:inspect -- --project "<project-directory>"
npm run book-builder:materialize -- --project "<project-directory>" --scope menu
npm run test:book-builder:ultimate
```

Profile evidence is written under `profiles/ultimate-air-v2/` in the local Book Builder workspace. The source binding and review materializations stay local. Portable Book Project data contains stable facts, hashes, counts, relative locators, confidence, and review state; it excludes the source path, key, decoded XML, educational text, answer values, and publisher asset bytes.

## Real-source validation

| Source | Canonical files / bytes | IWB strict / malformed | Atlases / regions | Page images / spreads | Hotspots exact / review | Menu / GAF | Review items |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ultimate B2 | 9,859 / 3,984,394,463 | 2,469 / 4 | 61 / 1,052 | 784 / 394 | 328 / 66 | 13 / 334 frames, 79 objects | 489 |
| Ultimate B1+ | 9,347 / 3,851,645,817 | 2,065 / 7 | 81 / 1,194 | 706 / 355 | 304 / 51 | 13 / 334 frames, 79 objects | 437 |
| Ultimate B1 held out | 10,007 / 3,605,527,618 | 2,360 / 6 | 62 / 1,015 | 738 / 371 | 300 / 71 | 13 / 334 frames, 79 objects | 474 |

B2 plus B1+ reproduce the expected 4,545 total IWB, 4,534 strict XML, 11 malformed-after-valid-decode reviews, 142 atlas families, 2,246 regions, 1,490 page images, 749 spreads, 632 exact hotspot cardinalities, and 117 mismatches. Their safe schema summaries contain 256 distinct cross-title schema fingerprints.

The held-out B1 found two generic format variations: its XOR key is lowercase in the SWF and some valid XML begins with a BOM and publisher comment. The importer preserves the candidate's byte-exact case and safely accepts XML prolog comments; no B1 branch was added. All three Ultimate projects produced identical hashes on two menu materializations and zero added/changed/removed/stale facts on two immediate rescans. B2's 26 generated HD menu-state crops plus six branding/GAF resources match the existing recovered catalog byte-for-byte. Before/after source counts, byte totals, timestamps, and representative descriptor, SWF, IWB, menu, and page hashes were unchanged.

## Boundaries and next milestone

Component roles, printed page numbers, special pages, hotspot mismatches, answer-bearing documents, malformed publisher XML, and uncertain media ownership remain reviewable. No decision is silently approved.

This milestone does not import activities or answers, implement scoring, change `builder.html`, complete a visual Builder, alter the publication manifest, write databases/storage, convert media, render GAF at runtime, deploy, or generate APKs. A later milestone may add an explicit decision UI and approved projection into publication data without weakening these boundaries.
