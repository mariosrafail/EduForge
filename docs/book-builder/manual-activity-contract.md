# Manual activity contract

The Student-safe contract is implemented in `lib/book-builder/manual-activity-contract.js` and uses schema version 1.0. Every activity has a UUID-backed stable ID, status (`draft`, `approved`, or `archived`), source mode, hierarchy binding, type, title/instructions, type-specific content, presentation settings, asset references, dependency hashes, stale state, and timestamps.

Supported types are `multiple_choice`, `true_false`, `typed_gap_fill`, `open_answer`, `media_audio`, `media_video`, `scrollable_panel`, and `image_backed`. Drafts may be incomplete and return explicit validation errors as warnings. Approval requires complete content, valid parent-scoped hierarchy, available non-stale assets, and a complete Teacher solution for scored types.

The parser rejects unknown fields, unsafe IDs, invalid geometry, unsafe markup, absolute paths, unapproved MIME types, duplicate IDs, orphan references, and answer-shaped keys. Student serialization is deterministic and sorted. It cannot contain correct choices, accepted answers, model answers, raw XML, IWB keys, source execution data, Teacher solutions, or arbitrary HTML/script.

Matching, drag/drop, bespoke publisher games, arbitrary embedded documents, executable SWF/AIR/GAF/ActionScript, and unbounded custom schemas are outside 4D1.
