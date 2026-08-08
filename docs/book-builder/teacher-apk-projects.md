# Teacher APK Projects

A Teacher APK Project is the versioned authoring source for a reusable, shell-only Hamilton House Teacher application. It lives beside, but never inside, scanned Book Projects in the local Publisher Review Studio workspace:

```text
<workspace>/teacher-projects/<project-id>/
  teacher-project.json
  assets/
    backgrounds/
    animation/
    controls/
    units/
    editions/
    toolbar/
    audio/
  exports/
    <project-id>-r####-debug.apk
    <project-id>-r####-build.json
  .build/                  # disposable deterministic staging
```

Start the Studio in explicit local edit mode with `npm run dev:book-builder:edit`, then use the separate **Teacher APK Projects** section. Create a project with a display name and stable lowercase slug. The fixed Hamilton House logo and Android application ID are not project settings.

## Required shell inventory

The schema currently requires a background; a title GAF plus all SD/HD atlas rasters declared by that GAF; Settings, Minimize, and Close images; normal/active images for 10 units, 4 editions, and the 18 primary toolbar controls; and a click-sound assignment for every interactive control. MP3 and WAV files are imported once into the project audio library and may be reused by any control. The toolbar is an array and the schema accepts additional entries later, while the milestone UI starts with the recovered 18-control primary set.

Imports are validated from their bytes, hashed, deduplicated, stored by opaque asset ID, and referenced with portable `assets/...` paths. Save writes a complete new project revision atomically. Export and Run operate only on the last saved complete revision; unsaved drafts must be saved first.

## Preview, Export, and Run

The live 16:9, 16:10, and ultrawide previews materialize the same generic runtime contract and render the same shared shell components as the APK. Preview never invokes Android tooling.

**Export APK** validates and stages only referenced project assets, runs the isolated `android-teacher-project` Vite entry, verifies the web bundle, syncs Capacitor, assembles a debug APK, verifies its manifest and packaged web bytes, and archives it under `exports/` with a sanitized build report. The global Android build lock prevents concurrent projects from sharing Gradle output. Export does not rewrite tracked Ultimate B2 project data.

**Run** discovers ADB from `ANDROID_ADB_PATH`, Android SDK environment variables, `android/local.properties`, or PATH. It lists targets with `adb devices -l`; one ready target is selected automatically, while multiple targets require a choice. Run revalidates the serial, executes fixed-argument `adb install -r`, and launches `com.eduforge.offlinebooks/.MainActivity`.

All Teacher debug APKs retain the current `com.eduforge.offlinebooks` compatibility ID. Installing a different project therefore replaces the currently installed Teacher debug app on that device.

## Milestone boundary

This milestone produces a deterministic debug, shell-only APK: logo, title animation, units, editions, toolbar, window controls, and sounds. It intentionally contains no textbook pages, hotspots, activities, Teacher solutions, release signing, AAB, deployment, or remote distribution. The generic runtime import boundary must remain independent of title-specific B2 content packs. A later milestone can add a separately versioned content/page/activity contract without weakening that boundary.

Passing repository, bundle, APK, and emulator checks demonstrates implementation and deterministic-build correctness. It does not establish production-scale authoring operations, signed-release readiness, fleet deployment, or long-duration publisher workflow resilience.
