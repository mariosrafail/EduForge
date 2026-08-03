# Android Offline Teacher Presentation MVP

The dedicated teacher build is a separate Vite application entry. It does not convert the existing `android-offline` student-style viewer into teacher mode.

## Build identities

| Build | Vite app mode | Activity mode | Entry |
| --- | --- | --- | --- |
| Web LMS | default | web role modes | `src/webEntry.jsx` |
| Existing Android offline | `android-offline` | `android-offline` | `src/apps/android-offline/offlineEntry.jsx` |
| Teacher classroom Android | `android-teacher-offline` | `teacher-presentation-offline` | `src/apps/android-teacher-offline/teacherOfflineEntry.jsx` |

The environment-aware `capacitor.config.ts` and the native teacher build both declare `Hamilton House LMS` when `CAPACITOR_BUILD_MODE=teacher`. The MVP deliberately keeps the existing native application ID, `com.eduforge.offlinebooks`, because this repository has one Android module. The Gradle `teacherPresentation` property changes only the generated native label; the ordinary `assembleDebug` label remains `Hamilton House LMS`. A separate installable application ID/flavor was not created, so the teacher and existing offline builds cannot be installed side-by-side.

## Build and verify

Install the pinned dependencies:

```powershell
npm ci
```

Generate and validate the versioned teacher pack:

```powershell
node scripts/android-teacher/build-pack.mjs
npm run verify:android-teacher-pack
```

Build the packaged browser application:

```powershell
npm run build:android-teacher-offline
```

The build command regenerates the pack, builds with the teacher-only entry and solution provider, and scans `dist` for Netlify routes, student-submission routes, telemetry hosts, external font hosts, developer paths, and publisher source paths.

The exact publisher media bytes needed by Units 1 and 2 live under `src/assets/books/ultimate-b2/teacher-offline-media`. Teacher build mappings use those checkout-local files and never depend on the ignored publisher application directory. Originals are not transcoded or modified.

For desktop/WebView-style testing:

```powershell
npm run dev:android-teacher-offline
```

The application opens a one-book classroom library and validates the bundled pack before making it available.

## Content-pack schema

The generated pack is under:

```text
android-content-packs/ultimate-b2-students-book/
  manifest.json
  catalog.json
  activities.json
  teacher-solutions.json
  assets-manifest.json
```

`manifest.json` records schema and content versions, package/component identity, Units 1 and 2, 37 + 40 enabled activities, 12 excluded disabled activities, 22 page images, grouped asset counts, content sizes, file checksums, semantic JSON checksums, an asset-set checksum, and deterministic generator metadata.

The asset manifest contains logical keys, classifications, sizes, and SHA-256 hashes. It contains no source filesystem paths. Vite resolves those logical keys to local hashed assets in the packaged application.

`teacher-solutions.json` is generated from the same editorial matrices used by the protected web endpoint. It is imported only by `generatedPackProvider.js`, which is selected only for the `android-teacher-offline` build. Web and existing Android builds resolve the same virtual boundary to `noOfflineSolutions.js`.

The provider boundary is represented by:

- `BundledTeacherContentPackProvider`, used by this MVP.
- `LocalFilesystemTeacherContentPackProvider`, an intentionally unavailable boundary for a future verified USB/download import workflow.

The book and activity UI consume the provider result and do not depend on how a future provider obtains the pack.

## Offline and temporary-state behavior

Classroom activity answers and reveal/check state remain in React memory. They are cleared when the activity is changed or closed and are never sent to a submission/scoring API. The only persisted state is the last safe unit, page, and Pages/Exercises tab.

The teacher entry installs a defensive request guard for `fetch`, `XMLHttpRequest`, and `sendBeacon`. Local packaged/same-origin assets remain allowed; Netlify/API paths and external origins are rejected with a local diagnostic. The teacher bundle contains no web solution endpoint, student submission endpoint, analytics endpoint, or external font host.

The Android offline shell does not request `android.permission.INTERNET`. This native denial is the final defense against an accidental external URL in either offline Android build. The JavaScript guard also blocks `WebSocket` and `EventSource`; bundle verification remains required because markup-driven asset requests cannot all be intercepted safely in JavaScript.

Only the active page image is mounted. Page selectors are text-only. Activity lists contain metadata and buttons rather than mounted activity renderers. Media uses `preload="metadata"` and is paused, detached, and reloaded on unmount. All audio/video is paused when the app is backgrounded.

Navigation uses browser history so Android WebView Back closes an activity or media screen before returning to the book. Page, unit, and tab changes replace the current book entry instead of creating Back loops. The Capacitor App Back listener returns from book to library and exits intentionally only from the library. Browser Fullscreen is closed before navigating. Fullscreen is requested through the browser API where available; the Capacitor shell uses native immersive mode, transient swipe-revealed system bars, display-cutout safe insets, and forced landscape.

Audio and video pause on document backgrounding and in native `Activity.onPause()`. Media elements use metadata-only preload and are paused, detached, and reloaded during unmount. Codec/load failures show a classroom-safe message and allow only an explicit manual retry.

## Build and sideload Android

Build the teacher web application, sync it with the teacher Capacitor name, and assemble the existing debug Android application:

```powershell
npm run android:teacher:build
```

The same command works in PowerShell, Command Prompt, macOS, and Linux. A clean checkout must first run `npm ci` and have Android SDK Platform 36 plus Build Tools 36 installed. `scripts/android/run-gradle.mjs` selects `gradlew.bat` or `gradlew`, refreshes the ignored `local.properties` from a valid SDK, and fails with a clear setup message when no SDK is available.

The expected debug output is:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

The build finishes by running `npm run verify:android-teacher-apk`, which verifies and prints:

- APK path and byte/MiB size
- application ID and resolved native label
- version code and version name
- minimum and target SDK
- absence of the Android Internet permission

Codec and content-size inventory is available separately:

```powershell
npm run verify:android-teacher-media
```

Install with Android Studio or Android Debug Bridge:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Because the native module and application ID are shared, `android:teacher:sync` replaces the generated web assets in the Android project. Run `npm run build:android-offline` followed by `npm run android:sync` before assembling the existing student-style offline application again.

The pack is prebundled for this MVP. Its declared content size is 448,994,237 bytes: 11,344,048 page bytes, 57,918,146 audio bytes, 377,990,389 video bytes, 1,262,547 cover bytes, and 479,107 metadata/solution bytes. It still makes a large APK.

This is explicitly a QA/pilot sideloading build for Ultimate B2 Students Book Units 1 and 2, not the final multi-book distribution architecture, Google Play design, content signing design, activation system, or DRM design. Future multi-book or multi-gigabyte content must use verified external content packs rather than expanding the monolithic APK.

## Verification boundaries

Desktop smoke testing provides request logging, local answer behavior, touch-sized viewport checks, bounded rendering checks, and timings. APK assembly proves packaging and native metadata. Installation, codec playback, native Back/gesture behavior, lock/unlock, reboot, constrained-memory behavior, process memory, and long-session duration must be reported only from an emulator or physical device that was actually available. Do not infer those results from a successful desktop smoke test.

## 2026-07-26 QA evidence

The hardening run started from clean `dev` commit
`24b001f00a4d54ab5dbb91a6a41390bcf71663f6`, equal to `origin/dev` after fetch.
The final debug APK inspection reported:

- path `android/app/build/outputs/apk/debug/app-debug.apk`
- 460,773,237 bytes (439.43 MiB)
- application ID `com.eduforge.offlinebooks`
- label `Hamilton House LMS`
- version code/name `1` / `1.0`
- minimum/target SDK `24` / `36`
- no Android Internet permission

An API 35 x86_64 emulator was configured for 2 GiB RAM at 1080 x 1920 with
airplane mode enabled and Wi-Fi disabled. The Android guest reported about
2.5 GiB of memory, so this is useful constrained-emulator evidence but not a
conclusive physical 2 GiB-device result. A fresh install of the inspected APK
passed 30 alternating page switches, 20 activity open/close cycles, playback
and seeking for audio and H.264/AAC video in both units, a 52 px minimum
visible control size, Home/resume and lock/unlock media pausing, one mounted
page image, zero external requests, and zero console errors. The final run
averaged 76 ms per page switch with a 2,064 ms maximum and opened the book in
198 ms; cold process launch after install was 4,738 ms.

The media inventory verified 11 MP3 files at 44.1 kHz/192 kbps and seven
1024 x 576 MP4 files using H.264 (`avc1`) with AAC (`mp4a`). Manual Android
Back checks returned activity to book, book to library, and intentionally
exited from the library. Force-stop/reopen and an emulator reboot in airplane
mode also reopened the application successfully.

No physical Android device and no uninterrupted 30-minute classroom session
were available during this run. Automated stress covered at least 90 page
switches, 60 activity cycles, repeated media playback, lifecycle transitions,
and reboot, but it must not be presented as a completed 30-minute soak test.
