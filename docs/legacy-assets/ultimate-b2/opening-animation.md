# Ultimate B2 opening animation

## Identification

The exact opening is a standalone FLV video, not a SWF timeline animation or the static cover currently shown by `TeacherOfflineLibrary`.

| Resource | SHA-256 | Evidence |
| --- | --- | --- |
| `Contents/Info.plist` | `80f1e82a7adec3957ba53417736ca81253c012126ab2b3f69f234856e126d95f` | Names native executable `Ultimate English B2`. |
| `Contents/MacOS/Ultimate English B2` | `7206fe0944deee29cf906cb6343bdb46f5922eb26e34ea6575558e40ee52b9d6` | Static strings identify the captive Adobe AIR framework and application ID. It was not executed. |
| `Contents/Resources/META-INF/AIR/application.xml` | `5fa135d2e2878366cae14164125eca5e0fdf921d78662f26a3d462571d164e58` | AIR 23 descriptor selects `UltimateB2.swf` as initial content. |
| `Contents/Resources/UltimateB2.swf` | `c2c0c78bb6aa09934698a2784ab0133a032cdccacb69852a46ecf74e59df3850` | ZWS v34, 18,003,009 bytes compressed / 37,244,122 bytes declared uncompressed, 24 fps, one root frame labelled `UltimateB2`. Static ABC strings reference `assets/books/intro.xml`. |
| `Contents/Resources/assets/books/intro.xml` | `06b2bb2e7ff72ec6261369976b6c3e78360b3561b8785753457bbe61c4538e2e` | Declares the relative video `../assets/videos/intro.flv`, 1024×768 viewport, autoplay, `isIntro=true`, no skin, no exit button, no auto-rewind. |
| `Contents/Resources/assets/videos/intro.flv` | `8aacc2a90f2f19e529b39e09debad3af9c5c495e35a21ccf4a7c40898435655f` | Exact opening media. |

## Startup chain

`Info.plist` → native AIR launcher → `META-INF/AIR/application.xml` → `UltimateB2.swf` → `assets/books/intro.xml` → `assets/videos/intro.flv` → video-complete handler → home/main-menu container.

The final transition is a static-code inference, not a runtime capture. The main SWF contains `__onVideoComplete`, `OnVideoComplete`, `addOnVideoCompleteListener`, `loadBook`, `assets/books/wideMenus`, `mainMenu`, and `HomeContainer` identifiers in the same application code. It also contains general video-click handlers, but static evidence does not prove that clicking this intro skips it. Because `addExitButton=false`, the descriptor provides no visible skip control. No skip behavior is claimed.

## Media properties

- Type: mixed bootstrap plus standalone video; the visual animation and synchronized sound are contained in the FLV.
- Size: 455,030 bytes.
- Display: 1024×768 (4:3).
- Duration: 5.840 seconds; maximum observed FLV timestamp 5.804 seconds.
- Frame rate: 25 fps; 146 video tags, consistent with 146 displayed frames including the initial frame.
- Video codec: FLV codec ID 2 (Sorenson Spark/H.263 family), metadata data rate 16,000.
- Audio codec: FLV sound-format ID 10 (AAC), stereo/container flags present, 44.1 kHz, 16-bit metadata, 128 kbps metadata rate.
- Synchronization: muxed audio/video timestamps in the same FLV; there is no separate intro sound file.
- Timeline labels: the FLV has no Flash timeline labels. The bootstrap SWF root frame is labelled `UltimateB2`.
- Dependencies: the FLV itself plus the XML descriptor and the AIR/ActionScript video-player/completion logic. The XML explicitly disables a skin, captions, background shape, and exit button.

No stills are committed. The available repository tools can parse the container safely but do not include a trusted Sorenson decoder that can export authoritative frames without transcoding. The untouched FLV and metadata are available locally at `.codex/legacy-assets/ultimate-b2/intro-review/`.

## Compatibility and faithful modernization

Direct reuse is not recommended. Modern Chromium/WebView video elements do not provide a dependable FLV/Sorenson playback path, and the bootstrap SWF depends on AIR lifecycle, direct rendering, external files, and application-specific classes. Ruffle is therefore not the preferred intro implementation; the intro is not a self-contained SWF animation. No Ruffle intro run was performed.

For a later integration task, prefer an approved, deterministic video conversion from the archived FLV to an Android WebView/browser-supported codec while retaining 1024×768 framing, 25 fps cadence, 5.840-second duration, and synchronized audio. Record both source and derived hashes and visually compare representative frames before approval. An HTML tween recreation would be less faithful because the source is already a rendered video.

The archival FLV adds exactly 455,030 bytes. A future compatible derivative's size must be measured rather than estimated. Reusing the full AIR/Ruffle bootstrap would add substantially more code and compatibility risk than the existing native `<video>` path, while the LMS already ships media playback components. No animation was integrated in this task.
