# Ultimate English B2 Import Notes

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
