# Activity candidate contract

Milestone 3 adds local authoring candidates; it does not add publication activities. `lib/book-assets/manifest.js` remains the only canonical publication model and Book Project schema `1.0` remains the portable evidence envelope.

An activity identity is a hash of its stable source-relative component, Unit/group, part, and object locator. Content changes therefore retain the authoring ID while changing the content evidence hash. Question, option, drag, target, and response-field IDs derive from that activity ID plus their publisher identity or stable local source position.

Nested IDs are allocated in one activity-scoped identity space across every parser fragment. The first non-colliding occurrence keeps its legacy parent-and-publisher identity. A later collision is disambiguated with the normalized source-relative document locator, structural element position, and occurrence in that stable context. Publisher IDs compare case-insensitively; missing publisher IDs use the same structural context. This keeps unrelated activities and fields from renumbering existing targets while allowing the final strict validator to reject any unresolved global collision.

Each object signature records filenames, extension counts, IWB metadata families and schema fingerprints, publisher exercise types, structural content flags, source hashes, and candidate page/hotspot/media links. It excludes decoded XML, educational text, answer values, keys, and binary bytes. Clusters use the structural basis and never the title or application name.

The candidate mapping keeps these concepts separate:

| Publisher type | Candidate type | Runtime status | Publication candidate |
| --- | --- | --- | --- |
| `mc` | `multiple-choice` | candidate only | `multiple_choice`, unapproved |
| `write` | `typed-short-answer` | candidate only | none |
| `dnd` | `drag-and-drop-matching` | candidate only | `matching`, unapproved |
| `video` | `media-only-interaction` | media only | none |
| `sa` | `teacher-reveal` | Teacher-only review | none |
| `print` / `display` | `display-content` | non-scored content | none |
| `circle`, `karaokeScroll`, `dndCat`, `cryptex` | explicit source-specific candidate | new runtime required | none |
| legacy game shell types | `legacy-game-question-bank` | new runtime required | none |

No mapping is approval. Dispositions are `structured-activity-candidate`, `structured-activity-with-raster-gaps`, `media-only`, `teacher-reveal-only`, `display-or-print-content`, `unsupported-publisher-interaction`, `non-exercise`, and `malformed-or-unresolved`.
