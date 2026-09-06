# Historical Unit Extras golden artifact

`historical-unit-extras-release.json` is synthetic test data, not a hosted release
or a copy of release 11. It was generated in an isolated detached checkout of
`af9afe5f1e854ec9f4bb2296f788cb3286bf91fa`, the parent of standalone MP3 commit
`356863afb055642226054dbd2e7acf0f99e0f31e`. The earlier video-only contract is also
present in `14edeb4f9983e73e64648a2e1fba62351f6b5b20`.

Generation used that checkout's `createPublicationV2FixtureSources()`, retaining
only the Single Choice native entry `ultimate-b2-sb-u1-p1-o97` and its hotspot:

- Filter the native index and native activity map to that entry; clear native
  artwork rows, which belong to the removed Image/Drag & Drop activities.
- Filter hotspots whose IDs start with `hotspot-native-` to that activity.
- Recompute the two changed **source fixture** checksums with the historical
  `builderDocumentSha256` before compilation.
- Call the historical `compileUltimateB2ComponentReleaseV2(sources)` and serialize
  its compiler/schema/compatibility, three documents and hashes, manifest, and
  aggregate hash into the SQL row-shaped artifact using `stableBuilderJson`.
- Verify it with the historical `verifyImmutableComponentRelease` and assert that
  historical `normalizePublishedUltimateB2UnitExtras` preserves its Unit Extras.

The resulting artifact contains two synthetic MP4 descriptors, one captioned
video, one uncaptioned video, one Page visibility entry and one assignable native
activity. No current published normalizer participated in generation. These
golden identities were frozen **before** changing production normalization:

| Identity | SHA-256 |
|---|---|
| Canonical artifact | `146a13dd0633c8ef1605b051d74a624a35ce562bccc58559450eab7287ba3032` |
| Compatibility | `117b016f2afb0a727c76246e056cb304618665422180e6fbfd650d3b5d2edee9` |
| Source snapshot | `036b6626e754d6f2f316690a3752ac4c2f208071819903c3b60ead2469221b7a` |
| Public projection | `8d8262f7a37ecf51cb0bd24564dabe0b82a98cf9604855e0fca57919eb37811f` |
| Teacher projection | `1ab6f1a7d006a7794d14b7032ff579cd6a765599624c0d3707db93cf070a6ef2` |
| Aggregate release | `97ca00d28444bf8f9c30eb5df49bc31c9ba5fdfedc04118339ff9079ea9a0f18` |

At baseline `5c7a9917`, verification produced exactly:

```json
{"compatibilityMatches":true,"sourceSnapshotMatches":true,"publicProjectionMatches":false,"teacherProjectionMatches":true,"releaseHashMatches":false}
```

`storedCompatibilityReleaseHashMatches` was also false. The only public canonical
differences were the added `unitExtras.units[0].categories.audios: []` and
`unitExtras.pages[0].extrasVisibility.audios: false`. The positive regression test
failed with `ReleaseIntegrityError` before the fix and passed afterward with the
same artifact and hashes.

Inspection of the MP3 commit shows no separate audio capability in the published
compatibility descriptor. Tests therefore cover absent, explicit-empty and
non-empty audio forms under the **same** recognized identity. Synthetic newer
forms are hashed directly before verification; their expected shape is never
manufactured by the published normalizer. Do not refresh the historical artifact
or golden hashes to accommodate future canonicalization changes.

An initial exploratory fixture retained all four historical native activities.
It additionally exposed unrelated Teacher Drag & Drop canonicalization from
`solution.mappings[].wordId` to `wordIds`. That artifact was not used as the Unit
Extras golden fixture. This separate drift is recorded, not repaired or bypassed
by this change; the final fixture isolates Unit Extras with Single Choice.

Fresh-checkout tests import the tracked artifact directly. They require neither
Git history nor historical checkouts, external services, credentials or ignored
publisher evidence.
