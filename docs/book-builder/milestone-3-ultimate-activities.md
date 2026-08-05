# Milestone 3: Ultimate activity discovery

Milestone 3 adds evidence-backed structural activity discovery to `ultimate-air-v2`. It does not change Builder UI, runtime catalogs, publication manifests, migrations, Student/Teacher applications, scoring, or Android packs.

## Real-source evidence

| Evidence | Ultimate B2 | Ultimate B1+ | Held-out Ultimate B1 |
| --- | ---: | ---: | ---: |
| Object directories | 1,584 | 1,461 | 1,696 |
| Structural/schema clusters | 391 | 247 | 331 |
| Student-safe candidates | 1,333 | 1,187 | 1,374 |
| Local Teacher candidates | 1,067 | 1,009 | 1,196 |
| Question-bank files | 60 | 60 | 60 |
| Questions | 1,500 | 1,500 | 1,740 |
| Structured question options | 6,000 | 6,000 | 6,960 |
| Sentence answer occurrences | 3,610 | 2,779 | 2,967 |
| Drop mappings | 1,622 | 1,266 | 1,609 |
| Pipe multi-target mappings | 46 | 31 | 36 |
| Text answer occurrences | 3,685 | 2,775 | 2,678 |
| Object answer occurrences | 214 | 242 | 195 |

The earlier audit reported 224 B2 and 178 B1+ clusters. The implemented totals are higher because Milestone 3 deliberately includes exact decoded schema fingerprints and content-availability signals in the structural basis; the audit prototype clustered only filename, extension, type, and broad evidence-topic sets. This is a deterministic, title-independent refinement rather than title branching.

The audit's B2 value of 6,012 `<answer>` nodes is reproducible across the full IWB corpus. Exactly 6,000 are ordered children of the 1,500 question-bank questions; the remaining 12 occur outside `questions_params.iwb` and are not falsely projected as question options. B1+ has 6,000 in both measures.

Publisher exercise occurrences are reproduced from source. B2 includes `mc` 711, `write` 666, `dnd` 257, `sa` 144, `video` 176, `circle` 34, `karaokeScroll` 18, `dndCat` 6, `cryptex` 2, `print` 30, and 60 legacy game shells. B1+ includes 562/59/207/442/164/31/10/7/0/10 and 60 respectively.

Held-out B1 uses the same code path and profile. Its path-like publisher fields are conservatively omitted from content/solution projections and marked unresolved; no title-specific logic was added. Journey remains `journey-air-v1` and creates no Ultimate activity artifacts.

## Local artifacts and determinism

The profile writes signatures, clusters, Student candidates, safe evidence, extraction summary/report, activity review items, and local-only internal solution/evidence files. Facts contain only IDs, counts, types, statuses, relative locators, and digests. The publication draft stays unchanged.

Two unchanged materializations produced identical per-title hashes. Two unchanged rescans per Ultimate source produced zero added, changed, removed, or stale-decision entries. Source packages were only read, publisher applications/SWFs were never executed, and no OCR or AI inference was used.

The next milestone is local human review UI with durable approvals/manual overrides and source-diff review for components, pages, activities, audience policy, and unresolved content.
