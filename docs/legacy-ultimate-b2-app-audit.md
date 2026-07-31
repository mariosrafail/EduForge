# Legacy Ultimate English B2 application audit

## Scope and method

- Source bundle: `Ultimate English B2.app`
- Inspection date: 2026-08-01
- Candidate repository SHA: `699f1eea44974ae5ce5ba53b55b67db8d3eefe3b`
- Method: recursive read-only enumeration; leading-byte signature detection; SHA-256 hashing; PNG/JPEG/GIF metadata through the repository's installed Sharp package; XML atlas coordinate review; visual inspection of loose images and contact sheets. No bundle executable, script, SWF, AIR component, or embedded code was run.
- Scope boundary: only aggregate/non-sensitive findings are recorded here. Raw inventories and contact sheets remained ignored under `.codex/legacy-ultimate-b2-audit/`.

The bundle contained **9,859 files** totalling **3,984,394,463 bytes**.

| Detected category | Files | Bytes |
| --- | ---: | ---: |
| Video (`ftyp` MP4/MOV signature) | 46 | 2,466,176,804 |
| Image (PNG/JPEG/GIF signatures) | 4,351 | 805,772,928 |
| Audio (MP3/WAV signatures) | 2,526 | 603,455,379 |
| Executable/runtime (Mach-O or PE signatures) | 14 | 65,033,432 |
| Data/config/text | 2,898 | 21,193,244 |
| SWF (`FWS`/`CWS`/`ZWS`) | 5 | 18,091,097 |
| Archive (ZIP signature) | 10 | 3,143,221 |
| Other/unknown binary | 9 | 1,528,358 |

SHA-256 comparison found **987 duplicate groups** containing **2,618 files**. Keeping one representative per group leaves **1,631 redundant duplicate files** (266,342,191 redundant bytes). None of the curated outputs duplicates an existing file under `src/assets/books/ultimate-b2/`.

## Major source groups inspected

- `Contents/Resources/` — 9,740 files / 3,941,274,333 bytes; publisher assets plus the captive AIR runtime.
- `Contents/Frameworks/` — 114 files / 39,405,403 bytes; runtime frameworks, excluded.
- `Contents/MacOS/`, `Contents/_CodeSignature/`, `Contents/CodeResources`, `Contents/Info.plist`, and `Contents/PkgInfo` — launch/runtime/signing metadata, excluded.
- `Contents/Resources/assets/home/`, `topbar/`, `naviBar/`, `toolbar/`, `audioPlayer/`, `videoPlayer/`, and `books/wideMenus/` — shell, menu, navigation, and media-control evidence.
- `Contents/Resources/assets/books/book1/` — book menus, pages/objects, activity controls, content media, and configuration.
- `Contents/Resources/assets/books/sounds/` — clearly named book-interface cues.

## Findings

The likely runtime set includes the native launchers in `Contents/MacOS/` and `Contents/Resources/`, captive Adobe AIR libraries/frameworks, Windows PE helpers, and five SWF containers. All **14 executable/runtime files**, all **5 SWFs**, all **10 archives**, and all **9 unrelated/unknown binary files** were excluded. Native frameworks, signatures, manifests unrelated to selected assets, caches, scripts, and player runtimes were also rejected.

Loose visual evidence is strong. The home/menu family uses a high-resolution blue glacier photograph, glossy ice-blue/cyan panels, lime active accents, and purple-to-magenta circular navigation buttons with white keylines and dark drop shadows. Book-unit plates use condensed, high-contrast display lettering; normal reading text remains better served by live system text. Toolbar and navigation atlases explicitly name active, disabled, and pressed states for back/home/previous/next/check/reload/show-all/video controls. The legacy audio player repeats the purple/magenta circular-control language. Correct feedback is associated with lime green; incorrect feedback with magenta/pink. Density is compact, but controls are visually prominent for classroom use.

The audio group contains clearly named `button.mp3`, `pageTurn.mp3`, `correct.mp3`, and `wrong.mp3` cues. These four short, non-verbal MP3 files were selected. Content narration/music, alphabet sounds, game duplicates, and ambiguous effects were rejected. Existing EduForge textbook audio and video remain authoritative, so no legacy content media was copied. No font file was detected; typography is therefore reproduced with a condensed system-font stack rather than a new bundled font.

## Curated selection

The tracked subset contains **11 assets / 2,815,404 bytes** under `src/assets/books/ultimate-b2/legacy-classroom-ui/`:

- 1 background (2,695,761 bytes)
- 1 activity control (2,131 bytes)
- 5 losslessly cropped icons (36,257 bytes)
- 4 UI sounds (81,255 bytes)

The glacier menu background and activity marker were copied byte-for-byte. Five 60×60 active-state icons were statically cropped from the loose `naviBar/HD/naviBar.png` atlas using its accompanying XML coordinates and the already-installed Sharp package; no code or runtime container was involved. There were **0 reused-existing manifest entries**, because none of these selected UI files matched an existing EduForge Ultimate B2 asset by SHA-256. Whole atlases, blank transparent placeholder plates, SD duplicates, book pages, content media, and unused decoration were rejected.

## SWF and inspection limitations

Some visual/audio material may exist only inside the five SWF containers. No trusted repository-provided static SWF extractor was available, so **nothing was extracted from SWF** and no claim is made about embedded-only artwork. Audio duration was derived from MP3 frame metadata; video duration was not required because no video was selected. File-signature classification is intentionally conservative, and the bundle was not launched, so exact screen sequencing was inferred from loose assets, atlas labels, configuration filenames, and visual families rather than runtime capture.
