# Ultimate B2 main-menu branding

This report distinguishes the two branding elements visible with the unit menu from the separate startup video. All findings come from static file inspection, byte-exact archive extraction, decrypted configuration inspection, and decompiled ActionScript review. No executable in the `.app` was run.

## Top-left Hamilton House logo

The exact visible asset is `Contents/Resources/assets/topbar/HD/topBar_URL.png`, a standalone 272×40 transparent PNG with SHA-256 `c6d3ac6d567024ca894e2c0fe185845031d9202a767ba85e2c77d82328dfa0a8`. It is tracked byte-for-byte as `branding/hamilton-house-logo.png`.

The filename `topBar_Logo.png` is misleading: both its HD and SD files are fully transparent placeholders. Static `TopBar` code instead creates the publisher button from the `topBar_URL` texture and links that button to `hamiltonhousepublishers.com`. The decrypted home-state entry in `assets/params/topBar_texts_params.iwb` sets `logoVisible="false"` and `urlVisible="true"`. Together with pixel inspection, this proves that `topBar_URL.png` is the displayed Hamilton House mark.

The lower-resolution counterpart is `Contents/Resources/assets/topbar/SD/topBar_URL.png` (190×24, SHA-256 `2bc1399f6662cb501d9b61a050c14e423be9ea6f785e4c43c293ccecb64e7a67`). The HD source is the recommended tracked/runtime asset.

## Central on-menu ULTIMATE / B2 / English animation

The exact source is the standalone archive `Contents/Resources/assets/home/common/logo_1.zip`, SHA-256 `3a2dbdb21ef14d0e00eb110cbd7357388c405a33ca2ec80a31c359ddc12c5bb6`. It is not a static cover, not a symbol or timeline inside `UltimateB2.swf`, and not the startup `intro.flv`.

The decrypted `Contents/Resources/assets/home/common/home_params.iwb` provides the decisive runtime declaration:

```xml
<movieClip x="3" y="-70" name="logo" scale="1" textures="logo_1"
  loop="true" play="false" startFrame="0" fps="24" hdScaleFactor="2"/>
```

`HomeContainer` loads `assets/home/common`, converts this `MovieClipParams` entry to a GAF animation, adds it to the home display list, and starts it. The archive consists of a binary GAF config and four texture atlases:

| Entry | Dimensions / role | SHA-256 |
| --- | --- | --- |
| `logo/logo.gaf` | GAF 5.8 config, 5,937 bytes | `c109489ad684237e288d8fd04c379b6ed02e7ffcdf7c5cc7463803ddc21b842c` |
| `logo/logo_SD.png` | 1022×977, atlas 1 at CSF 1 | `411c21324c6d7559f22672ab5acc328d40054172529c36a7f5d646539978efe4` |
| `logo/logo_HD.png` | 2044×1954, atlas 1 at CSF 2 | `e73f53bd2bf7c001af88cbf23a40ac10308e91ff334a41517376c767ab305d54` |
| `logo/logo_SD_2.png` | 316×604, atlas 2 at CSF 1 | `f0bb83e3fcdaccee777a446baf38f5debb90c459a7e9ebd0e85bc30ee5ba42fb` |
| `logo/logo_HD_2.png` | 632×1208, atlas 2 at CSF 2 | `9760097afc6bab6cb1e69098fc81e201b0e07e85e5f0bf7ab6618cebbb0c69b9` |

Static parsing with the official GAF tag model identifies a 1024×768 stage at 24 fps and one linked timeline named `rootTimeline`. Its authored bounds are x=345.15, y=94.15, width=432.075, height=295.6. It contains 334 frames and 79 texture objects, divided into named sequences `Break` (frames 1–167) and `Logo1` (frames 168–334). Thus the menu title is an animated, layered raster composite described by a standalone GAF timeline. All five archive entries are exactly extractable and are now tracked under `branding/menu-title-animation/`.

The Android Teacher launcher renders that tracked GAF timeline directly on a canvas with its two SD atlases. This keeps the runtime teacher-only and avoids substituting a cover or reconstructed text treatment; the graphics animation setting and reduced-motion preference pause it on an authored frame.

Run `node scripts/ultimate-b2/recover-menu-branding.mjs "Ultimate English B2.app"` for a read-only verification report, or add `--write` to reproduce the tracked extraction. The script parses ZIP and GAF metadata only and refuses writes inside the source `.app`.

## Separate startup intro

The startup animation remains `Contents/Resources/assets/videos/intro.flv` (SHA-256 `8aacc2a90f2f19e529b39e09debad3af9c5c495e35a21ccf4a7c40898435655f`): 1024×768, 5.840 seconds, 25 fps, Sorenson Spark/H.263 video with muxed stereo AAC audio at 44.1 kHz. Its startup chain is AIR launcher → `UltimateB2.swf` → `assets/books/intro.xml` → `assets/videos/intro.flv` → completion handler → home/main menu. It is documented separately in `opening-animation.md` and is not a dependency of the on-menu title animation.

The intro remains prepared for later deterministic conversion and integration. It is not integrated in this phase because direct FLV playback is unreliable in Chromium/WebView, while the menu title already has a compact, separable GAF source that can be rendered independently.
