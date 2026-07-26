# Android Teacher Classroom display targets

This document records the display research and adaptive-layout decisions for
the bundled Android Teacher Classroom. It defines QA targets, not a
manufacturer allowlist. The application never detects a manufacturer, model,
physical diagonal, or user-agent string.

## Authoritative Android guidance

Android's current
[window-size-class guidance](https://developer.android.com/develop/adaptive-apps/guides/use-window-size-classes)
classifies the available application window, not the physical device:

| Class | Available CSS/dp width or height |
| --- | --- |
| compact width | `< 600` |
| medium width | `600-839` |
| expanded width | `840-1199` |
| large width | `1200-1599` |
| extra-large width | `>= 1600` |
| compact height | `< 480` |
| medium height | `480-899` |
| expanded height | `>= 900` |

Width and height are independent and dynamic. A landscape phone can have
medium width but compact height. Split screen, desktop windowing, browser
chrome, system bars, cutouts, display density, and connected-display settings
can change the class while the same device is running.

Android's
[adaptive-layout design guidance](https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout)
recommends selecting the width-driven structure and then adapting it for
height by reflowing, revealing, or changing presentation. The
[large-screen quality guidance](https://developer.android.com/guide/topics/large-screens)
calls for layouts that fill the available space and support touch, keyboard,
mouse, trackpad, and stylus input. The
[large-screen input guidance](https://developer.android.com/develop/ui/views/touch-and-input/input-compatibility-on-large-screens)
requires testing the actual alternate input devices an application supports.

The Teacher Classroom therefore uses current CSS/visual viewport width and
height. Physical resolution alone is not a breakpoint: a 3840 x 2160 panel can
expose a much smaller CSS viewport after Android density scaling, while a
connected computer can expose the full pixel dimensions.

## Current classroom-panel evidence

Official current or recent manufacturer specifications show a consistent
primary classroom target:

| Manufacturer evidence | Diagonals | Native display | Touch / platform evidence |
| --- | --- | --- | --- |
| [BenQ Board RP04 specification](https://www.benq.com/content/dam/newb2b/en-ap/campaign/brochure-download/pdf-file/benq-board-rp04-spec-sheet-20240710-corp.pdf) | 65, 75, 86 in | 3840 x 2160, 16:9, landscape | up to 50 touch points; Android 13 |
| [ViewSonic ViewBoard IFP6553](https://www.viewsonic.com/education/products/viewboard/ViewBoard%20IFP6553) | 65 in in this sheet; the family has larger models | 3840 x 2160, 16:9, landscape | 40 Windows / 20 Android touch points; Android 14; stylus |
| [Promethean ActivPanel 9 Premium](https://cdn.prometheanworld.com/docs/spec-sheets/ActivPanel-9-Premium/ActivPanel_9_Premium_2022_SS_0524v1.8_EN-INTL.pdf) | 65, 75, 86 in | 4K, 16:9 | 20 continuous touch points; pen/touch differentiation; palm rejection; Android-based ActivPanel OS |
| [SMART education display comparison](https://www.smarttech.com/education/products/compare-all-products) | commonly 65, 75, 86 in, with some 55 in models | 3840 x 2160, 16:9, 60 Hz | up to 50 OS-dependent touch points; pens, touch, gestures and palm erase; Android 13/14 depending series |

These panels are normally landscape, wall- or stand-mounted, anti-glare touch
surfaces. Multiple contacts, battery-free pens or styluses, palm handling, and
edge gestures are normal product features. The UI must retain generous
effective hit areas, avoid hover dependencies, keep controls away from
cutouts and gesture regions, and prevent page panning from interfering with
activity interaction.

Full HD 1920 x 1080 remains an important connected-computer/projector and QA
target even though current integrated panels are commonly 4K. The primary
review set is 1920 x 1080, 2560 x 1440, and 3840 x 2160.

Large panels are touched from arm's length but read by students several metres
away. That mixed-distance need is a design consideration, not a claim of one
universal viewing-distance standard. Page/activity content and feedback need
classroom-readable capped typography; teacher controls must not grow
proportionally with panel pixels.

## EduForge viewport profiles

`src/apps/android-teacher-offline/viewportProfiles.js` is the single runtime
classifier. CSS is selected with `html[data-teacher-viewport]`.

| Profile | Current condition | Structural intent |
| --- | --- | --- |
| compact landscape | available height `< 480` | one compact book row, page drawer, icon-first fit/action controls, compact presentation chrome |
| medium landscape | width `< 840` or height `< 700` | tablet/small-laptop labels selectively collapse; narrower page rail |
| expanded classroom | width `840-1199` with height `>= 700` | flexible page stage and readable labelled controls |
| large classroom | width `1200-1599` with height `>= 700` | wider activity canvas, capped controls and classroom typography |
| extra-large classroom | width `>= 1600` with height `>= 900` | Full HD/1440p/4K-class canvas, capped chrome, renderer content up to 3200 px |

The classifier reads `visualViewport` when available and falls back to
`innerWidth`/`innerHeight`. Resize, visual-viewport resize, and orientation
changes are animation-frame coalesced. React state changes only when effective
metrics or the profile change.

## Safe areas and development diagnostics

The shell applies `env(safe-area-inset-*)` at outer edges and keeps primary
navigation within those bounds. Diagnostics are development-only, local, and
transmit nothing. Enable them in a development build with either:

```text
?teacherDiagnostics=1
```

or in the WebView/browser console:

```js
localStorage.setItem("teacher-offline-viewport-diagnostics", "1");
location.reload();
```

The overlay reports inner and visual viewport dimensions, device-pixel ratio,
orientation, profile, measured safe-area padding, page-stage dimensions, fit
mode, zoom, and rendered page dimensions. Remove the local-storage key to
disable it.

## Wireless ADB and WebView inspection

```powershell
adb devices
adb -s <device-id> shell wm size
adb -s <device-id> shell wm density
adb -s <device-id> shell am start -n com.eduforge.offlinebooks/.MainActivity
```

For wireless debugging, pair/connect from Android's Wireless debugging screen.
Use every command with `adb -s <device-id>` so a second emulator or phone
cannot be selected accidentally. On the host, open
`chrome://inspect/#devices`, enable device discovery, and inspect the
`https://localhost` WebView. Record the diagnostics values rather than
deriving CSS size from `wm size`.

For the automated WebView smoke test, forward the launched app's
`webview_devtools_remote_<pid>` socket to local port 9222, then set
`ANDROID_ADB` and `ANDROID_ADB_SERIAL` before running
`npm run test:android-teacher-device`. The serial is mandatory when more than
one emulator or device is attached.

## Manual device record

| Field | Observation |
| --- | --- |
| Device model | |
| Android version / WebView version | |
| Physical diagonal (if authoritative) | |
| Native resolution | |
| `adb shell wm size` | |
| `adb shell wm density` | |
| Inner / visual CSS viewport | |
| Device pixel ratio | |
| Selected profile | |
| Default/manual page fit mode | |
| Page, activity, and answer screenshots | |
| Touch findings | |
| Stylus findings / not available | |
| Fit Page / Fit Width / zoom / pan | |
| Hotspot alignment | |
| Audio / video | |
| Back hierarchy | |
| Fullscreen / transient bars | |
| Cutout / safe-area findings | |
| Background, lock, and resume | |

## 2026-07-26 connected-phone evidence

The paired physical phone was a realme RMX3151 running Android 13 (API 33).
Android reported 1080 x 2412 at 480 dpi. In forced landscape the inspected
WebView reported:

| Metric | Observed value |
| --- | --- |
| inner / visual viewport | 804 x 360 CSS px |
| device-pixel ratio | 3 |
| selected profile | `compact-landscape` |
| default fit | `fit-width` |
| measured page stage | 804 x 256 CSS px |
| Fit Page rendered spread | 345 x 240 CSS px, fully within stage |
| Fit Width rendered spread | 788 x 548 CSS px, vertically pannable |
| zoom probe | 1.25x |
| positioned hotspots / mounted page images | 3 / 1 |

The installed APK completed 30 alternating page switches (17 ms average,
175 ms maximum), 20 activity open/close cycles, packaged audio/video playback
and seeking in both units, 48 px minimum visible targets, and Home/resume plus
lock/unlock media-pause checks. It reported zero external requests and zero
console errors. A physical screenshot confirmed the compact one-row shell,
collapsible rail/actions, and readable Fit Width page.

The final APK (after improving pan initiation over hotspots) was rebuilt and
installed successfully. The browser matrix verified drag-to-pan and hotspot
suppression after that refinement. The phone's secure keyguard then required
manual user authentication, so a final post-install human touch-pan repeat was
not claimed. No stylus was available, and no stylus-specific physical test was
performed.
