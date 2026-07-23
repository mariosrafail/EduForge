# Android Offline Teacher Presentation MVP

The dedicated teacher build is a separate Vite application entry. It does not convert the existing `android-offline` student-style viewer into teacher mode.

## Build identities

| Build | Vite app mode | Activity mode | Entry |
| --- | --- | --- | --- |
| Web LMS | default | web role modes | `src/webEntry.jsx` |
| Existing Android offline | `android-offline` | `android-offline` | `src/apps/android-offline/offlineEntry.jsx` |
| Teacher classroom Android | `android-teacher-offline` | `teacher-presentation-offline` | `src/apps/android-teacher-offline/teacherOfflineEntry.jsx` |

The teacher Capacitor configuration declares `Hamilton House Interactive Classroom`, and the classroom UI/document title use that name. The MVP deliberately keeps the existing native application ID, `com.eduforge.offlinebooks`, because this repository has one Android module and adding Gradle product flavors would change the existing `assembleDebug` contract. The already-generated native label may remain the shared Android project label unless that project is regenerated. A separate installable application ID/flavor was not created, so the teacher and existing offline builds cannot be installed side-by-side.

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

Only the active page image is mounted. Page selectors are text-only. Activity lists contain metadata and buttons rather than mounted activity renderers. Media uses `preload="metadata"` and is paused, detached, and reloaded on unmount. All audio/video is paused when the app is backgrounded.

Navigation uses browser history so Android WebView Back closes an activity or media screen before returning to the book, and then returns from the book to the library. Fullscreen is requested through the browser API where available; the Capacitor shell already uses immersive status-bar behavior and forces landscape in the shared Android manifest.

## Build and sideload Android

Build the teacher web application, sync it with the teacher Capacitor name, and assemble the existing debug Android application:

```powershell
npm run android:teacher:build
```

The expected debug output is:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install with Android Studio or Android Debug Bridge:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Because the native module and application ID are shared, `android:teacher:sync` replaces the generated web assets in the Android project. Run `npm run build:android-offline` followed by `npm run android:sync` before assembling the existing student-style offline application again.

The pack is prebundled for this MVP. It is hundreds of megabytes rather than multi-gigabyte, but it still makes a large APK. This is a reproducible sideloading approach, not a production Google Play distribution or DRM design. Future large/multi-book packs should use the existing provider boundary with verified local storage rather than expanding the JavaScript payload or creating a multi-gigabyte monolithic APK.
