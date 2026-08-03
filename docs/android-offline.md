# Android Offline Book App

Hamilton House LMS has a dedicated Android offline app mode inside the existing React/Vite codebase. It is not a separate React project and it does not run the web LMS shell.

## App Modes

- Normal LMS: default mode, used by `npm run dev` and `npm run build`.
- Android offline: enabled with `VITE_APP_MODE=android-offline`, used by `npm run build:android-offline`.
- Android teacher presentation offline: enabled with `VITE_APP_MODE=android-teacher-offline`, used by `npm run build:android-teacher-offline`.

The app split lives under:

```text
src/apps/lms/
src/apps/android-offline/
```

Android offline mode renders `AndroidOfflineApp` only. It starts at a fullscreen interactive book list and opens local book components/pages from there.

The dedicated teacher classroom build is documented in [android-teacher-offline.md](./android-teacher-offline.md). It has a separate entry, teacher-only content pack, offline solution provider, and `teacher-presentation-offline` capabilities. It does not change this existing viewer into teacher mode.

The Android activity is locked to landscape in `android/app/src/main/AndroidManifest.xml` for classroom tablet use.

## Run Normal Web LMS

```powershell
npm run dev
```

```powershell
npm run build
```

These commands keep the normal LMS behavior unchanged.

## Run Android Offline Mode Locally

```powershell
npm run dev:android-offline
```

To limit the library to one book while testing, set:

```text
VITE_APP_MODE=android-offline
VITE_OFFLINE_BOOK_SLUG=english-journey-6
```

## Build Android Offline Mode

```powershell
npm run build:android-offline
```

This builds the offline book-list app into `dist` using local bundled assets only.

The offline build aliases optional server-backed book services to `src/apps/android-offline/androidOfflineServiceStubs.js`, so the Android bundle does not include Netlify Function URLs for the optional page hotspot/activity editor.

## Sync Capacitor

After building the offline bundle:

```powershell
npm run android:sync
```

This runs:

```powershell
npx cap sync android
```

## Open Android Studio

```powershell
npm run android:open
```

Then run the app on a USB Android device or emulator from Android Studio.

## USB Device Test Flow

1. Enable Developer Options and USB debugging on the Android device.
2. Connect the device by USB.
3. Run:

```powershell
npm run build:android-offline
npm run android:sync
npm run android:open
```

4. In Android Studio, choose the device and press Run.

## Add Another Offline Book

Add the new local package to `src/apps/android-offline/androidBooks.js`.

Requirements for each offline book:

- Use static/local package data.
- Resolve all image/audio/video assets through local bundled imports.
- Do not use remote URLs.
- Add the book to the exported `androidBooks` array.
- Keep missing or unmapped resources as placeholders instead of throwing.
- Add `slug`, `packageTitle`, optional `level`, `description`, and `components` in the same package shape used by the existing book viewer.

## Included

- English Journey 6 as the first offline book.
- Ultimate B2 as a second local interactive demo package.
- Ultimate B2 Student's Book Unit 2 Android-only imported activity mapping from `Ultimate English B2.app`; see `docs/ultimate-b2-import.md`.
- Book list with title, level, description, components, and open action.
- Component cards for available local data, such as Students Book, Workbook, Grammar Book, Test Book, and Video Bank.
- Unit/page navigation where page data exists.
- Reused interactive book/page/activity viewer components where they can run from local package data.
- Local-only storage for last selected book, last selected component/page, answers/results, and completed activity/page markers.

## Excluded From Android Offline Mode

- Login, accounts, roles, admin, teacher, and student dashboards.
- Classes, invite links, school activation, assignments, and grading workflows.
- Netlify Functions and `/.netlify/functions/...` calls.
- Neon/Postgres or other database-backed services.
- Server sync and online LMS navigation.
- Remote images, CDN fonts, online audio, and online video.
- Optional LMS page hotspot editing and custom server-backed activity authoring.
