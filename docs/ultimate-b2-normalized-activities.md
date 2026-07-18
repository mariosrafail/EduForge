# Ultimate B2 normalized Students Book activities

`npm run ultimate-b2:extract:activities` performs a read-only scan of the local
publisher package, decodes IWB XML in the Node-only extraction scripts, and
writes a deterministic normalized catalog. The decoder and XOR key are not
imported by frontend code.

The catalog contains all 433 definite Students Book exercise objects. It also
retains compact index entries for media-only and excluded non-exercise objects,
without committing raw decoded XML or absolute paths. Every activity remains
publication-disabled and editorial-review controlled.

Each normalized answer record preserves the publisher field path and value,
the normalized question/option relationship, per-family index semantics,
multiple-answer and ordering behavior, text-normalization policy, confidence,
and warnings. `@answer` choice indexes are detected per exercise family;
drag/drop `@answers` values are treated as publisher IDs rather than assumed
array indexes; question-bank `<correct>` values resolve by exact option value.

Only two Unit 2 activities currently meet the implementation gate:

- Reading Exercise 3 (`ultimate-b2-sb-u2-p2-o3`), with publisher drag IDs
  `6,3,5,1,7,2`;
- Reading Exercise 4 (`ultimate-b2-sb-u2-p2-o4`), with one-based publisher
  choice indexes `1,2,1,2,2,1,2,1`.

The remaining 48 definite Unit 2 objects stay in the catalog for manual review.
In particular, complete question banks tied to publisher-specific games remain
`unsupported-publisher-interaction`; they are not silently converted into a
different quiz experience.

Frontend code imports only the generated two-activity ready projection. Neutral
Correct/Incorrect/Try again/Review your answer messages are explicitly marked
as application-generated because publisher feedback was not found.

The generated Unit 2 flipbook relationship fixture provides page, spread,
activity, media, hotspot, presentation, and availability relationships, but no
full-book flipbook UI is implemented in this phase.
