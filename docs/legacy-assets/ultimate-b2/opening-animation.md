# Ultimate B2 opening animation

## Identification

The exact opening is a standalone FLV video, not a SWF timeline animation and not the separate GAF title now rendered by `TeacherOfflineLibrary`.

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

The untouched FLV and metadata are available locally at `.codex/legacy-assets/ultimate-b2/intro-review/`. The ignored source `.app` remains untouched.

## Compatibility and faithful modernization

Direct reuse is not recommended. Modern Chromium/WebView video elements do not provide a dependable FLV/Sorenson playback path, and the bootstrap SWF depends on AIR lifecycle, direct rendering, external files, and application-specific classes. Ruffle is therefore not the preferred intro implementation; the intro is not a self-contained SWF animation. No Ruffle intro run was performed.

The Teacher launcher now uses a deterministic conversion of the archived FLV. It retains the 1024×768 framing, 25 fps cadence, 5.840-second duration, stereo 44.1 kHz audio, and synchronized audiovisual timeline. An HTML tween recreation was rejected because the source is already a rendered video.

| Derived resource | SHA-256 | Size | Runtime format |
| --- | --- | ---: | --- |
| `src/assets/books/ultimate-b2/teacher-offline-media/ultimate-b2-startup-intro.mp4` | `07c988a41eb5347c3f9e910f9fb0cc15b0b4de85056e1c08fcb3a71016f0948f` | 136,517 bytes | MP4, H.264/AVC (`avc1`), yuv420p, AAC stereo |

The conversion is implemented by `scripts/ultimate-b2/recover-startup-intro.mjs`. It refuses any source whose SHA-256 differs from `8aacc2a90f2f19e529b39e09debad3af9c5c495e35a21ccf4a7c40898435655f`, never writes into the source bundle, strips source metadata, uses a single encoding thread, and emits a fast-start MP4. Reproduce it with FFmpeg on `PATH`, or set `FFMPEG_PATH` explicitly:

```text
FFMPEG_PATH=/absolute/path/to/ffmpeg npm run ultimate-b2:recover:startup-intro
```

FFmpeg `8.1.2-full_build-www.gyan.dev` produced the recorded derivative. Two consecutive conversions were byte-identical at the output hash above.

A full 146-frame source-versus-derivative comparison reported aggregate SSIM `0.999743` (`Y 0.999710`, `U 0.999801`, `V 0.999816`), and the representative 2.5-second frame was visually checked. The derived file preserves all 146 frames.

## Runtime behavior

`TeacherOfflineApp` mounts `TeacherStartupIntro` only once per mounted application session, after the offline content pack has validated and before the launcher is revealed. A natural `ended` event or the visible **Skip intro** control dismisses it. Returning from a unit or page stays within the same mounted app and does not replay it; a true app restart or browser reload creates a fresh session and replays it.

The video is bundled locally and does not require network access. A media load error immediately falls through to the launcher. If autoplay is blocked, a visible **Play intro** control replaces the waiting state while **Skip intro** remains available. When either the Teacher motion setting is off or `prefers-reduced-motion: reduce` is active, the intro is skipped before its media is requested.

This startup video remains separate from the on-menu `ULTIMATE / B2 / English` GAF timeline documented in `menu-branding.md`.
