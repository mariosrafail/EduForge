# Ultimate English B2 Import Notes

## Repeatable Students Book scan

Run the complete read-only forensic scan with:

```text
npm run ultimate-b2:scan:students-book
```

The command defaults to the ignored local `Ultimate English B2.app` directory at the repository root and accepts `--source-root <path>` for another local copy. It rejects symlinks that escape the source root, never executes publisher binaries, parses XML/JSON strictly, hashes the full package, and writes deterministic relative-path metadata to `books/ultimate-b2/generated/`.

The generated inventory covers the Students Book boundary (`assets/books/book1/unit`, its unit videos, and media referenced by readable Students Book XML). Sibling `work`, `grammar`, `test`, `companion`, and related roots are identified and excluded. The structure file contains all 110 page/spread images covering 158 physical pages (5-162), page order, activity-object relationships, media dependencies, and empty hotspot arrays ready for later controlled mapping.

The scan does not call encoded IWB objects fully recoverable. Their base64 wrapper is decoded only far enough to identify the payload signature; the proprietary payload remains unresolved. The selected Unit 2 audit is recorded in `books/ultimate-b2/ultimate-b2.students-book-unit-2.extraction.json`. Existing Reading Exercises 3 and 4 remain implemented but require publisher answer-key review before their answers can be described as verified.

Source package:

```text
Ultimate English B2.app/
```

The package is a macOS Adobe AIR app bundle. The useful local publisher assets are under:

```text
Ultimate English B2.app/Contents/Resources/assets/books/book1/
```

## Relevant Structure

- `unit/{unit}/part*/` contains Student's Book unit objects.
- `unit/{unit}/parts/HD/parts_part_*.png` contains full page/part images.
- `unit/{unit}/part*/obj*/` contains per-object images, audio, XML metadata, and encoded `.iwb` files.
- `companion/`, `work/`, `test/`, `video/`, `worksheets/`, `practiceWork/`, and `progress/` contain other book components or companion resources.
- `assets/audioPlayer`, `assets/topbar`, `assets/naviBar`, and `assets/games` contain AIR player UI and game assets.
- `META-INF/AIR/application.xml`, `Info.plist`, and AIR framework files are native package/runtime metadata and are not used by the React app.

## Unit 2 Student's Book

Inspected source root:

```text
Ultimate English B2.app/Contents/Resources/assets/books/book1/unit/2
```

Discovered file mix:

- `103` `.iwb` files
- `164` `.png` files
- `28` `.mp3` files
- `16` readable `.xml` files
- `2` `.jpg` files

Readable XML metadata found:

- `part2/video.xml`
- `part2/obj1/video.xml`
- `part2/obj6/video.xml`
- `part2/obj7/video.xml`
- `part3/obj9/video.xml`
- `part3/obj10/video.xml`
- `part4/video.xml`
- `part4/obj1/video.xml`
- `part4/obj10/video.xml`
- `part4/obj11/video.xml`
- `part5/obj3/obj_params1.xml`
- `part5/obj5/video.xml`
- `part5/obj6/video.xml`
- `part6/obj6/video.xml`
- `part6/obj7/video.xml`
- `part7/obj6/circle_atlas.xml`

The `.iwb` files appear encoded/binary in this package, so the current import does not infer answer keys from them. Where readable XML does not expose question/answer data, the Android/offline app shows an imported placeholder instead of crashing.

The production-oriented online proof is intentionally narrower: only the usable Students Book Unit 2 page/media subset is represented by `books/ultimate-b2/ultimate-b2.students-book-unit-2.manifest.json`. See `docs/book-asset-pipeline.md`. This does not promote Android placeholders to finished activities and does not import the Workbook, Grammar Book, or Test Book as complete books.

## Android Mapping

The editable Unit 2 Student's Book mapping lives in:

```text
src/apps/android-offline/data/ultimateB2Unit2StudentsBook.js
```

That file overlays only the Android/offline Ultimate B2 package. The shared LMS package data remains unchanged.

Existing implemented activities are preserved and not duplicated:

- `video-intro`
- `reading-ex3`
- `reading-ex4`

Additional imported Unit 2 items are shown in the Android/offline Contents/Exercises list as placeholders until their React interactions are implemented.
