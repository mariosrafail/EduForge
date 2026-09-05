# Mark the Words

`mark-the-words` is a native activity with exactly one `part-1`. Passages and optional visual panels all use this one interaction. There is no composite activity or click-to-reveal-letters behavior.

## Authoring

Create **Mark the Words** in Activity Builder. Add a passage, enter its text, and explicitly rebuild its word occurrences. In **Answer Key**, select the correct occurrences. A repeated word is a separate button at each position. Reordering passages preserves their IDs and answers. Editing passage text requires confirmation to rebuild: the passage ID stays, every word ID is new, and only that passage's answers and hotspots are cleared. Removing a passage removes its answer record and hotspots.

Bulk generation accepts consecutive numbered passages beginning with `1.` or `1)`, followed by whitespace and text. Continuation lines stay within the passage. Blank separator lines at the end of a passage are discarded; internal spacing and line breaks are retained. Mark multiple correct sections with asterisks:

```text
1. I *watch* films while my watch *charges*.
2. They *have been working* all morning.
```

Every complete lexical word inside a marked section becomes correct. Markers cannot split a word, be unmatched, or contain only whitespace/punctuation. Use `\*` for a literal asterisk and `\\` for a backslash. Other backslash escapes are rejected; `/` is ordinary punctuation. Numbering errors, invalid text and limits produce passage/line errors before either draft changes. Append is the default. Replacing existing content requires the explicit replacement option and confirmation; common media and panel backgrounds remain, but the replaced passages' answers and mappings are removed. Raw marked source is local editor state and is never part of either persisted document.

## Text and image presentation

Text rendering preserves the canonical source, including tabs, spaces and line breaks. It uses stored UTF-16 ranges, never whitespace joining or locale-dependent runtime tokenization. Author-time segmentation recognizes Unicode letters and numbers with combining marks; internal straight/curly apostrophes and ASCII/U+2010/U+2011 hyphens join a word. Emoji and other punctuation remain unselectable gaps. CRLF and CR become LF. Unicode normalization is not applied. Invalid controls, lone surrogates and angle brackets are rejected.

Bounds are 20 passages, 200 words per passage, 800 words per activity, 8,000 UTF-16 code units per passage, 24,000 total passage code units, and 32,000 raw bulk-source code units. The response fits the existing 100,000-byte ceiling; the paired draft uses the existing 1 MiB request ceiling.

**Visual** selects real text or publisher images and underline (default) or highlight. The activity has one font, size, color and line spacing. Managed TTF upload/reuse uses the existing component font library.

Image presentation supports up to eight panels, with intrinsic image dimensions up to 16,384 pixels per axis. Upload each background and draw every word, including distractors, in passage order. The editor identifies the next unmapped occurrence. A passage must stay on one panel. Click areas cannot overlap; marking areas must be inside their corresponding click areas. Select a hotspot and use the shared drag/resize frame, arrow keys or numeric controls. Switch **Geometry to edit** to position the underline beneath the printed word independently of a larger click area. Moving an unchanged-size click area translates its marking area; resizing keeps the marking geometry until explicitly adjusted. Background replacement requires confirmation and clears that panel's mappings for remapping. Text, answers and other panels remain.

Readable Text, Video with SRT and optional worksheet, and Supplemental MP3 reuse the common editors, upload APIs, players, media arbitration and asset validation. Enabled incomplete media blocks saving even after changing tabs. Changing runtime media views preserves word selections.

## Runtime and boundaries

Students toggle occurrences using mouse, touch, Enter or Space. Underlines and highlights do not change text layout. Scrolling cancels touch selection. Panel navigation preserves selections. Initial/controlled responses are restricted to known IDs; activity/release changes reset local session state. Saved read-only attempts disable mutation. Practice stays local and has no grading submission.

Teacher surfaces validate the matching authorized Teacher document and fail closed if it is unavailable or mismatched. Clicking a passage word reveals/hides that passage's correct set. Shared Show Next, Show All, Reload and panel controls manage separate reveal state. Student entry points do not receive or fetch Teacher documents.

Public documents contain all occurrence IDs/ranges and all neutral geometry. Correct sets exist only in Teacher `answers: [{ itemId, correctWordIds }]`. Strict shapes and normalized nested-key checks reject correctness fields, marked source, score overrides and existing secret/token fields on public/client boundaries.

The external submission stays `native-response.v1` with `items: [{ id, value: [wordId] }]`. Empty arrays are allowed. The server rejects duplicate/unknown/cross-passage IDs and extra fields, canonicalizes authored order, and grades each passage by exact set equality. Omitting a correct occurrence or selecting a distractor scores that passage zero. Release, target, scoring and duplicate-submission handling remain server authoritative. Teacher review shows selected and expected words with authored occurrence positions against the saved, pinned attempt.

## Publication, offline and validation

Students Book publication adds a derived `mark-words-expanded` compatibility variant. Historical descriptors and identities remain accepted unchanged. Managed Workbook/Grammar Book publication derives compatibility from the actual supported kind set. Both compilers preserve private Teacher projections and resolve managed artwork/font/common-media requirements. Existing generic JSON persistence and assignment envelopes require no SQL migration.

Web LMS and authenticated hosted Builder/Viewer consume the new kind. The current Android Student and Teacher products alias published-release loading to `noPublishedComponentReleaseProvider`, and offline Teacher draft loading to `noHostedNativeDraftProvider`. Their generated legacy packs have no native-release distribution mechanism. This feature does not invent one: Android build/bundle checks establish package compatibility and answer separation, not offline distribution of newly published activities. Hosted Viewer uses the authorized providers and Teacher runner.

Focused contracts cover identity, segmentation, grammar, boundaries, geometry, limits, assets, scoring and both publication compilers. Canonical PostgreSQL suites exercise paired saves/replays/conflicts and release-pinned assignment submission/review. Standard CI browser harnesses include Students Book and Workbook authoring, real hosted Viewer reveal/reset, image geometry and media, LMS practice/touch/submission/read-only review. The existing full CI, APK, migration, bundle and safe Cloudflare build gates remain required.
