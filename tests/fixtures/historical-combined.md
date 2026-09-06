# Combined historical publication fixture

These two JSON files are independent **synthetic** development artifacts, not an
export of hosted release 11. Both were frozen before the production fix:

- `historical-combined-release.json`: immutable SQL-row-shaped release.
- `historical-combined-sources.json`: synthetic historical compiler inputs, used
  separately to exercise current explicit authoring with current code.

They were generated in a detached checkout of
`14edeb4f9983e73e64648a2e1fba62351f6b5b20`, using that checkout's canonical
`compileUltimateB2ComponentReleaseV2`, `verifyImmutableComponentRelease`,
`stableBuilderJson` and `builderDocumentSha256`. No current published normalizer
participated in generating expected historical data. Historical verification and
full source/public/Teacher canonical equality passed before the artifacts were
written. Final tests import tracked JSON; they need no Git history or publisher
source files.

Generation started with historical `createPublicationV2FixtureSources`, selecting
the four requested kinds from the outset: Open Response, visual Single Choice,
Listening and Image. The template's Drag & Drop entry was replaced with Listening
before compilation or canonical comparison; no problematic kind was removed to
hide a diff. All page hotspot lists were replaced by four synthetic links. The
required legacy seed IDs/question IDs remain canonical, but their instruction and
prompt text was replaced through the historical validated draft boundary with
synthetic text. No publisher/private payload or student data was imported.

The combined release contains:

- Video-only Unit Extras, two MP4 descriptors, a caption, and Page video
  visibility; no `categories.audios` or `extrasVisibility.audios`.
- Single Choice `ultimate-b2-sb-u1-p1-o97`: image-hotspot panel, two questions/six
  options, readable image, two audio/text hotspots with synthetic MP3 references,
  `1000 x 284.18` focus areas, explicit highlight areas/colors, no `focusLayout`.
  This synthetic ID is not the incident's reported `...o12` activity.
- Open Response: two panels with historical prompt/response question bindings,
  full question/response-region geometry and a synthetic Teacher model answer.
- Listening: question artwork, response geometry, two panels, transcript image,
  MP3, two timed cues and a snippet hotspot.
- Image: two image layers, `contentText`, and a captioned MP4 companion.
- Ten consistent asset descriptors. No `activePageIds` or page-lifecycle source.

The historical compiler naturally produced the recognized compatibility below;
it matches the reported incident's **contract identity**, not its content hash.
No hash was manipulated to resemble a real release.

| Frozen identity | SHA-256 |
|---|---|
| Canonical artifact | `dfbcea16a1f5ae9d9f3998518253f4fe43482b665c6ead95026c1853b23beec1` |
| Compatibility | `6edc258bc2baf610290d4ae03a88c60c63e18006f31f67e1b02cb6ddc4ab7ffe` |
| Source | `d36b8af0c33816e70904cd01051c6e63833396d2c3c3fd1af495c6748afef3bc` |
| Public | `b35d816f8866a2a03fa2cb8d38e6ef490901046c8a7ed36824afe4a27cfaf18b` |
| Teacher | `75a073c5f77633889df19d2d1a92005da01aa4b3c967cd2db271113869ed2617` |
| Aggregate | `b9a47d6996f7962d53dfedd68bac41ef863faf6a8bbd778e18c45a6fed02355c` |

At baseline `ed0044c31d5076d8d8d5deae6e3558336bf61476`, the real verifier returned
compatibility/source/Teacher matches **true**, public/aggregate matches **false**,
and `storedCompatibilityReleaseHashMatches=false`. The positive test failed.
The complete recursive canonical comparison found exactly these paths:

```text
$.publicProjection.nativeActivities.ultimate-b2-sb-u1-p1-o97.document.audioTextHotspots.hotspots[0].focusLayout
$.publicProjection.nativeActivities.ultimate-b2-sb-u1-p1-o97.document.audioTextHotspots.hotspots[1].focusLayout
$.aggregate.publicProjection.nativeActivities.ultimate-b2-sb-u1-p1-o97.document.audioTextHotspots.hotspots[0].focusLayout
$.aggregate.publicProjection.nativeActivities.ultimate-b2-sb-u1-p1-o97.document.audioTextHotspots.hotspots[1].focusLayout
```

Every difference was `<absent>` -> `"fixed-aspect"`. The aggregate paths are the
same two public changes in the aggregate hash input. Source, Teacher and sorted
asset manifest had **zero** differences. After the fix all five comparisons are
equal and all stored hashes verify with the identical artifact. No additional
canonicalization drift was found in this combined contract.

Commit `95d1fbcf4a032e8534cb044bd1b0075727d66f71` introduced unconditional
`focusLayout: nativeAudioTextFocusLayout(entry)` emission. Current normalization
now preserves own-property presence; the runtime helper still infers missing
layout. Explicit values, including choices opposite to geometric inference,
remain strict and preserved under the same compatibility identity.

The earlier `historical-unit-extras-release.json` artifact from `af9afe5f...` and
all its golden identities remain unchanged. The separately reported Teacher Drag
& Drop drift is outside this fixture/task and is not evidence for this incident.
Never refresh either golden artifact to accommodate a changed normalizer.
