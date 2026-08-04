# Ultimate B2 legacy classroom UI inventory

## Result

Read-only static inspection expanded the curated catalog from 11 to 285 unique assets without changing runtime imports. The 274 additions comprise 234 native-resolution atlas crops, 24 copied standalone audio/image files, and 16 byte-exact embedded PNG/MP3 payloads. Of the additions, 147 are teacher-only and 127 are shared legacy interface material. Seventeen byte-identical legacy regions are retained as `assetAliases` pointing to one canonical file per hash. The complete per-asset source path, hash, native dimensions or duration, alpha status, symbol, state, audience, confidence, and extraction rectangle are in `asset-manifest.json` and `legacy-classroom-ui-inventory.json`.

No asset is classified as Student-only. “Shared” means the original function is suitable in either product; it does not authorize adding the asset to the Student bundle. All new files remain review-only.

## Existing recovery verification

| Existing asset | Result | Evidence |
| --- | --- | --- |
| `classroom-glacier-background` | verified exact | Tracked bytes equal `Contents/Resources/assets/books/wideMenus/mainMenu_HD.png`. |
| `activity-hotspot` | verified exact | Tracked bytes equal `Contents/Resources/assets/books/book1/exButtons/exButton.png`. |
| back, check, home, next, previous | verified pixel-equivalent | Fresh crops from `naviBar/HD/naviBar.png` using the XML coordinates decode to identical RGBA pixels. Existing PNG compression was preserved. |
| button, correct, incorrect, page-turn audio | verified exact | Tracked MP3 bytes equal the named publisher sources; frame counts reproduce the recorded durations. |

There were no provenance mismatches, missing sources, or unresolved baseline entries. The five atlas outputs were intentionally not regenerated because their decoded pixels are already exact.

Runtime use was confirmed in `TeacherOfflineLibrary`, `TeacherOfflineBook`, `TeacherOfflinePages`, `TeacherOfflinePresentation`, `TeacherOfflineActivityList`, `TeacherOfflineMedia`, and `legacyClassroomSound`. Source-tree and bundle-safety tests confirm the catalog is absent from Student imports.

## Recovered control families

| Family | Source evidence | Recovery |
| --- | --- | ---: |
| Book/navigation | loose `naviBar/HD/naviBar.png` + XML | All 64 atlas regions, represented by 54 canonical files plus 10 exact aliases, including active/disabled/pressed navigation, book-mode, settings, video, vocabulary, check, show-all, show-next, and show-text states; five active states retain their original flat tracked paths. |
| Audio player | loose `audioPlayer/HD/AudioPlayer.png` + XML | 18 regions: play, pause, stop, karaoke and tapescript active/disabled/pressed states, seek/volume handles, minimize, move, restore, and panel background. |
| Top bar | loose `topbar/HD/topBar_buttons.png` + XML | Exit and minimize. |
| Teacher toolbar buttons | `UltimateB2.swf` characters 29/28 | 40 64×64 normal/active controls: clear, custom page, eraser, hide, keyboard, marker, mouse, notes, open, pencil, print, redo, save, score, show, text, timer, undo, URL, and zoom. |
| Teacher toolbar support | `UltimateB2.swf` characters 26/20 | All 64 regions represented by 61 canonical files plus three exact aliases, covering annotations, colours, stroke weights, text formatting, timer, score, save/load, URL, zoom/pan, close/delete, hide/restore, and backgrounds. |
| Dialog/status | embedded alert, settings and loading atlases | Alert buttons/panels, five settings regions, close/exit assets, and all 24 loading identities represented by 20 canonical frame files plus four exact aliases. |
| Activity/media extras | embedded XML atlases and named PNG symbols | Correct/disabled/enabled/wrong check states; show-answer active/pressed; activity-audio active/pressed; karaoke controls; score plates; toggle tracks/thumb; internal previous/next states. |
| Pointer tools | embedded cursor atlas | Eraser, hide, marker, pencil, show, text, URL, zoom and zoom-pan cursors. |

The original uses `active` as the ordinary enabled appearance and `pressed` as the down state; it does not provide a separately named hover state for the principal atlases. No hover art was invented. The HD teacher button set is 64×64; the loose navigation/media set is 60×60. SD equivalents were inspected and omitted because their 42×42/45×45 art repeats the HD designs. Exact SD coordinates remain available in the source XML inventory.

Some requested concepts do not exist as separately named legacy controls. There is no evidenced standalone fullscreen, fit-page, single/spread, mute, subtitles, help, warning, lock, cancel, or confirm icon in the recovered primary atlases. Related functionality may be native, text-based, part of the video skin SWFs, or absent. Those gaps are not filled with guessed artwork.

## Interface and activity audio

The tracked UI catalog contains 31 unique audio payloads:

- Four verified baseline cues: button (0.183 s), correct (1.332 s), incorrect (0.549 s), and page turn (1.202 s).
- Five additional shared cues: alternate page turn (1.200 s), drip (0.496 s), pencil (0.993 s), pop (0.288 s), and writing (2.769 s).
- Eighteen teacher-toolbar spoken labels: Annotations, Clear Screen, Eraser, Hide, Keyboard, Load, Marker, Mouse, Pencil, Redo, Save, Score, Show, Text, Timer, URL, Undo, and Zoom (0.810–1.567 s).
- Four embedded teacher cues: timer ring (2.273 s), timer minute (3.762 s), timer second (0.183 s), and save-already-exists (1.959 s).

All are MPEG Layer III. Manifest entries record sample rates, channels, frame counts, hashes, and exact provenance. `exit.mp3` and `select.mp3` were rejected as separate outputs because each is byte-identical to `button.mp3`. The alias evidence is retained in the JSON inventory. The six `assets/bravo/sounds/bravo*.mp3` clips were not added: their named role is celebratory/game content rather than a deterministic interface trigger. Alphabet, word-list, activity narration, textbook listening, and video soundtracks remain educational content and were not copied.

The ignored review player is `.codex/legacy-assets/ultimate-b2/audio-review/index.html`; it has explicit controls and no autoplay.

## Reproducibility and review artifacts

- Focused local forensic inventory: `.codex/legacy-assets/ultimate-b2/source-inventory/focused-source-inventory.json`
- Extracted embedded candidates and symbol map: `.codex/legacy-assets/ultimate-b2/extracted-candidates/swf-embedded/`
- Local audio review: `.codex/legacy-assets/ultimate-b2/audio-review/index.html`
- Local intro copy/metadata: `.codex/legacy-assets/ultimate-b2/intro-review/`
- Duplicate report: `.codex/legacy-assets/ultimate-b2/duplicate-reports/ui-audio-duplicates.json`
- Tracked visual review: `docs/legacy-assets/ultimate-b2/contact-sheets/`

Contact sheets label every tracked control with its stable ID, native dimensions, state, audience, and source region/symbol. They are review derivatives; the individual catalog files and their hashes are canonical.
