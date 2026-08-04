# Ultimate B2 legacy classroom UI catalog

This directory is a curated, evidence-backed recovery from the client-supplied `Ultimate English B2.app`. The application bundle is ignored, immutable, and not a build or runtime dependency.

The catalog contains 285 unique assets: the original 11-asset Teacher runtime subset and 274 review-only additions. Seventeen byte-identical legacy names/regions resolve to canonical files through `assetAliases` instead of creating duplicate outputs. The additions cover every machine-described HD sprite in the loose navigation, audio-player, and top-bar atlases; the complete embedded HD teacher-toolbar atlas and its controls; embedded cursors, toggles, alerts, settings, activity controls, and 24 loading-frame identities; standalone interface/activity audio; spoken teacher-toolbar labels; and four safely extracted SWF `DefineSound` MP3 payloads. SD art was inventoried but was not duplicated where it only scales the same design.

The original flat paths remain unchanged because the Android Teacher application imports them explicitly through `src/apps/android-teacher-offline/legacyClassroomAssets.js`. New assets have no runtime imports and do not change current visual or sound behavior. In particular, teacher-only answer/reveal and presentation-tool art is not imported into the Student source tree or deterministic content pack.

`asset-manifest.json` is the canonical tracked catalog. Schema version 2 is backward-compatible with the original entries and adds optional source hashes, native dimensions, alpha information, functional roles, states, audience classification, evidence, confidence, and exact extraction details. Embedded assets cite the SWF character ID, SymbolClass name, tag index, companion atlas-metadata character ID, and crop rectangle. Atlas crops use native pixels with no scaling or filtering; standalone files are copied byte-for-byte; MP3 files are not normalized, trimmed, or transcoded.

Reproduce the static recovery with:

```text
node scripts/ultimate-b2/legacy-ui-catalog.mjs "Ultimate English B2.app"
node scripts/ultimate-b2/legacy-ui-catalog.mjs "Ultimate English B2.app" --write
```

The first command is a dry run. The second writes tracked assets plus ignored review material under `.codex/legacy-assets/ultimate-b2/`. The Python helper only decompresses and parses SWF tags; it never executes ActionScript and refuses to write inside the source bundle.

Review and provenance:

- `docs/legacy-assets/ultimate-b2/legacy-classroom-ui-inventory.md`
- `docs/legacy-assets/ultimate-b2/legacy-classroom-ui-inventory.json`
- `docs/legacy-assets/ultimate-b2/legacy-classroom-ui-gap-matrix.md`
- `docs/legacy-assets/ultimate-b2/opening-animation.md`
- `docs/legacy-assets/ultimate-b2/contact-sheets/`

The full `.app`, SWFs, native executables, frameworks, archives, source atlases, the intro FLV, temporary extraction data, and textbook narration/listening/video are deliberately not committed.
