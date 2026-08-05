# Book Builder review queue

`review-queue.json` is a deterministic local authoring artifact. Each item has a stable content-derived ID, category, relative locator, reason code, explanation, suggested decision kind, and bounded evidence. Ordering and summaries are stable across rescans. Review state does not equal approval, and a rescan never silently turns a candidate into a publication decision.

Milestone 2 emits review items for:

- publisher-malformed XML after a proven valid decode;
- unresolved component roles;
- uncertain printed page numbers and special pages;
- part button/object cardinality mismatches;
- ambiguous media ownership;
- answer-bearing structural evidence that must remain behind a future audience policy.

The queue excludes source absolute paths, decoded XML, question text, answer values, educational content, publisher binary bytes, and the discovered key. A malformed IWB retains only its relative source locator, source hash, and diagnostic. Answer-bearing records retain only flags/counts.

Review items may later be resolved through explicit decisions whose dependency fact IDs and evidence hashes are recorded. When evidence changes or disappears, only dependent decisions become stale. Added unrelated facts do not override previous decisions. Milestone 2 intentionally supplies no visual decision editor and makes no publication projection.

Current real-source totals are 489 for B2, 437 for B1+, and 474 for held-out B1. None are blocking parser failures; they mark boundaries where human authoring judgment is still required. Unsafe XML, an undecodable corpus, ambiguous keys, invalid source/workspace paths, or ambiguous atlas metadata fail before a queue can legitimize the data.
