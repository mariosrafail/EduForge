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

Start the Studio in explicit local edit mode with `npm run dev:book-builder:edit -- --confirm=local-book-project-writes`, then use the separate **Teacher APK Projects** section. Create a project with a display name and stable lowercase slug. The fixed Hamilton House logo and Android application ID are not project settings.

The authoring workspace has section navigation, a compact current-section editor, and a persistent shared-runtime preview. The header always shows the saved revision, Saved/Unsaved state, dynamic completion progress, Import Assets, Save, Export APK, and Run. Export and Run remain disabled until the complete draft has been saved.

## Bulk shell import

Use **Import Assets** to select either a folder or multiple files. The browser examines only the explicitly selected `File` objects and transient browser-provided relative names. It never sends a machine directory path to the server and no local path is persisted in `teacher-project.json`.

Import is suggestion-based:

1. Select up to 256 files. The local deterministic matcher normalizes filename tokens and classifies supported raster, GAF, MP3, and WAV candidates without uploading anything.
2. Review **Mapped**, **Needs review**, **Unmatched**, and **Missing** filters. High-confidence suggestions are preselected; ambiguous candidates are never selected silently. Every target can be changed or cleared.
3. Choose **Apply mappings**. Selected unique files are uploaded sequentially through the existing byte-validating import endpoint, SHA deduplication is retained, and successful asset IDs are assigned to the draft shell.
4. If one file fails, successful durable imports remain available and the failure is listed. Retrying is safe because identical bytes deduplicate. Shell assignments still require **Save**.

GAF SD/HD atlas candidates are ordered naturally (`title_SD.png`, `title_SD_2.png`, `title_SD_10.png`). The Shell & Animation section also provides explicit up/down controls before Save.

### Optional naming convention

The folders are helpful matching evidence, not a required layout:

```text
my-book/
  background/background.png
  animation/title.gaf
  animation/title_SD.png
  animation/title_SD_2.png
  animation/title_HD.png
  animation/title_HD_2.png
  chrome/settings.png
  chrome/minimize.png
  chrome/close.png
  units/unit-01-normal.png
  units/unit-01-active.png
  units/unit-10-normal.png
  units/unit-10-active.png
  editions/students-book-normal.png
  editions/students-book-active.png
  editions/workbook-normal.png
  editions/workbook-active.png
  editions/grammar-book-normal.png
  editions/grammar-book-active.png
  editions/extras-normal.png
  editions/extras-active.png
  toolbar/pencil.png
  toolbar/pencil-active.png
  audio/button.mp3
  audio/unit-01.wav
```

Recognized state tokens include `normal`, `default`, `base`, `enabled`, `up`, `active`, `hover`, `pressed`, `selected`, and `down`. Unit numbers require an explicit `unit`/`u` token. Edition abbreviations `sb`, `wb`, and `gb` match only as complete tokens. Toolbar matching uses the IDs present in the actual project shell and a small documented synonym set such as `pointer`→mouse, `open`→load, and `custom-page`→annotations.

## Sounds, assets, duplication, and QA

**Sounds & Assets** shows each asset's current draft usage count. A reusable sound can be assigned to all Units, Editions, Toolbar controls, or Window controls, with an **Only empty assignments** option. Testing a sound plays its local project blob and does not mutate the project.

Only assets with zero current draft references expose **Remove unused**. The server remains authoritative and refuses removal if the saved project still references the asset; save a replacement mapping first, then remove the orphan. Cleanup never touches exports or build staging.

Teacher Project cards provide **Duplicate**. Duplication asks for a new name and slug, copies verified asset bytes and shell assignments into a self-contained revision-1 project, and never copies `exports`, APKs, build reports, `.build`, jobs, or device state.

The QA list reports Normal, Active, and Sound state for Chrome, Units, Editions, and the actual Toolbar array. Selecting a control highlights its real `data-teacher-control-id` inside the shared-runtime preview; sound testing remains local and window actions are simulated. Preview can be expanded and retains 16:9, 16:10, and ultrawide modes. Incomplete projects use safe runtime placeholders, while APK Export remains completeness-gated.

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
