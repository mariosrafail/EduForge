# Ultimate B2 Unit 1 Part 2 legacy visual/audio audit

## Scope and safety

This audit covers Ultimate B2, Students Book, Unit 1, Part 2, printed spread 6–7, and the five pilot activities `ultimate-b2-sb-u1-p2-o1` through `ultimate-b2-sb-u1-p2-o5`.

The read-only publisher root was `Ultimate English B2.app/`. Static inspection covered:

- `Contents/Resources/assets/books/book1/unit/1/part2/`
- `Contents/Resources/assets/books/book1/unit/1/parts/HD/parts_part_2.png`
- `Contents/Resources/assets/books/book1/unit/1/parts/SD/parts_part_2.png`
- `Contents/Resources/assets/videos/book1/unit/1/part2/`
- the statically referenced global `Contents/Resources/assets/audioPlayer/{HD,SD}/` sprites and atlas XML

No native executable, AIR runtime, publisher SWF, or publisher script was launched. The application and its SWFs were not loaded into a browser or emulator. All `.iwb` files were decoded as data with the repository's deterministic strict Base64, repeating-XOR, UTF-8, and XML-validation tooling. All fourteen Part 2 `.iwb` files decoded to strict XML.

The source snapshot and duplicate scan covered 50 Part 2/spread files. Duplicate detection considered 9,859 publisher-package files and hashed the 440 size-matched candidates. Only eight audited files had byte-identical duplicates elsewhere.

## Reference material reviewed

The following untracked artifacts were generated under `test-results/ultimate-b2-legacy-pilot/` and reviewed:

- `part-2-image-contact-sheet.png`: all 19 Part 2 and spread images on a checker/background inspection plate with dimensions.
- `publisher-source-snapshot.json`: size, SHA-256, image metadata, and source timestamp for all 50 files.
- `publisher-source-duplicates.json`: package-wide byte-duplicate evidence.
- `decoded-iwb-evidence.json`: strict decoded XML and parsed data; no publisher code.
- `media-metadata.json`: ffprobe metadata for ten MP3 files and one MP4.
- `obj2-audio-waveform.png`: representative full-reading waveform.
- `obj1-video-frame-sheet.png`: six representative frames from the static MP4.
- `current-versus-original-comparison.png`: publisher source versus new Full HD and 4K activity compositions.
- `pilot-viewport-contact-sheet.png`: compact, Full HD, and 4K initial states for all five objects.
- `visual/`: initial, media, partial-answer, feedback, teacher-reveal, and truthful open-response screenshots.
- `visual/visual-report.json`: machine-readable viewport and interaction results.

## Recovered visual system

The activity stage declared by the source is 1024×582. That is a proportional design reference, not a fixed browser canvas.

### Design tokens

| Token | Evidence-backed use |
| --- | --- |
| Paper | White/off-white activity surface with very light printed texture; no generic dark LMS card |
| Aqua | Reading-section strip, video capsule, borders, score-box family; approximately `#00a9b5` with darker aqua text |
| Magenta | “Streaming now!” identity and active media accents; approximately `#d71672` |
| Purple/pink | Global audio sprite uses lavender/purple idle states and bright pink active/over states |
| Lime | Printed exercise-number blocks and compatible correct-answer emphasis; approximately `#dbea16` |
| Ink | Near-black question and instruction copy |
| Publisher answer | Source answer text uses decimal `14942339` (`#e3ff03`) over the original runtime; the pilot uses a readable darker lime-compatible treatment |
| Fonts | Source names Fira Sans, Fira Sans SemiBold, ITC Flora Std Medium, Roboto Regular, VAG Rounded, and Myriad Pro. The browser stack prefers Fira Sans/Trebuchet/Arial without bundling unlicensed font binaries |
| Corners | Printed panels are mostly square or 2–8px rounded; purple media controls use fully rounded capsules/circles |
| Borders | 1px neutral printed-panel rules, 2–4px aqua media framing, lime left-number rails |
| Shadow | Restrained 2–7px printed cutout and control shadows; no large floating dashboard-card shadow |

### Composition and states

- Activity title treatment: white publisher top bar, aqua section block, magenta “Streaming now!” label.
- Instructions: exact publisher raster strips with lime numbered square, black Fira Sans text, and evidenced media icon.
- Question numbering: lime square number; original questions use black text on white paper.
- Write fields: ruled/underlined response areas. Source teacher answers use ITC Flora styling.
- Multiple choice: A–D labels in compact printed rows. The pilot retains accessible radios and the source hierarchy.
- Media: the inspected global `AudioPlayer.png` atlas contains purple idle, pink over/active, play, pause, stop, seek, and volume states. The pilot translates that palette to accessible current audio controls rather than slicing the legacy atlas.
- Show text: Object 2 explicitly declares `notification type="showText"` and uses `showText.png`; Object 3 and 4 also supply reading-text plates.
- Hover/pressed: the atlas provides distinct idle/pink-over variants and `scaleWhenDown` evidence in source comments. The pilot uses brighter hover and a 0.97 pressed scale.
- Disabled: grey/lavender atlas variants are recoverable; the pilot greys and lowers opacity on disabled controls.
- Correct/incorrect: no Part 2-specific correct/incorrect icon or animation was found. The source has an aqua score box for Object 4, but no unambiguous per-field feedback plate. The pilot preserves truthful application feedback with lime-compatible correct and magenta-compatible retry borders.
- Motion: the Object 5 navigator declares CubeLeft/CubeRight, but reproducing a Flash cube transition was neither necessary nor appropriate for the responsive pilot. Highlight regions use reduced-motion-aware emphasis.
- Interface sounds: global “bravo” and toolbar sounds exist, but no exact Part 2 trigger relationship was established. They were not copied or used.
- Video player: legacy skins are SWFs. They were neither executed nor copied. The original H.264/AAC content video is used through the current safe player.

## Highlight and audio evidence

Object 2 `highlight_params.iwb` provides three buttons and twelve explicit rectangles:

- highlight audio 1 → rectangle IDs 10–12;
- highlight audio 2 → rectangle IDs 1–7;
- highlight audio 3 → rectangle IDs 8–9.

Object 3 `highlight_params.iwb` provides six buttons and twenty-three explicit rectangles:

- highlight audio 1 → rectangle IDs 1–2;
- highlight audio 2 → IDs 3–5;
- highlight audio 3 → IDs 6–8;
- highlight audio 4 → IDs 9–10;
- highlight audio 5 → IDs 11–18;
- highlight audio 6 → IDs 19–23.

The pilot reproduces these exact discrete file-to-region relationships and does not invent per-word timing. Starting a segment opens the original reading plate and highlights its recovered rectangles. Only one media element can play at a time; media pauses on exit, backgrounding, or unmount.

Object 2 `obj_params.iwb` also contains line-level full-audio time ranges for a dynamically rendered karaoke text layer. The pilot preserves the full 280.318-second audio and the original static reading plate but does not claim exact full-track karaoke parity: recreating the complete dynamic text/scroller layer is outside this one-part visual pilot. The exact discrete highlight behavior is implemented instead.

## Visual inventory

All listed PNGs contain an alpha channel, but inspection found no pixels with alpha below 255; their visible white/background edges are baked into the source image. No raster is stretched beyond native dimensions in the visual test matrix.

| Source-relative path | Type | Bytes | SHA-256 | Dimensions | Aspect | Alpha channel / transparency | Role and relationship | Duplicate elsewhere | Pilot decision |
| --- | ---: | ---: | --- | ---: | ---: | --- | --- | --- | --- |
| `part2/obj1/image_2.png` | PNG | 12047 | `c11207c98fb5c605c8f7a2c62901e0f994ef1ce994215ab543a6f7cfb2541778` | 554×33 | 16.787879 | yes / no | Instruction panel · Object 1 | no | copied byte-for-byte |
| `part2/obj1/page_1.jpg` | JPG | 826505 | `a06633594a85f300ece431e7545694f989defcfacb3df1581fdad8a09da3a76b` | 1200×1742 | 0.688863 | no / no | Video worksheet · Object 1 | no | copied byte-for-byte |
| `part2/obj2/image_1.png` | PNG | 627866 | `259bff39553dc11bfcb9e90689d0a3395b38b9c68d50ca3addd7f6904e27d7c4` | 1020×1801 | 0.566352 | yes / no | Background plate · Object 2 | no | copied byte-for-byte |
| `part2/obj2/image_2.png` | PNG | 7244 | `dc0e7c289166d00ad096b2ecdcb4e0b2f4813a758b5b87f0669151c2f2eb26fc` | 566×34 | 16.647059 | yes / no | Instruction panel · Object 2 | no | copied byte-for-byte |
| `part2/obj2/showText.png` | PNG | 1535541 | `423d59b897963a772b9492321e5a10458b2c593db9295e04b17914ddbf0dc08c` | 1000×1219 | 0.820345 | yes / no | Reading-text graphic · Object 2 | no | copied byte-for-byte |
| `part2/obj3/image_1.png` | PNG | 105659 | `6bc69a5c7bc62aaccc6c3f3b16072fefe3cb543cc7e661a9c1ce5b634a22dc07` | 917×415 | 2.209639 | yes / no | Questions 1–4 panel · Object 3 | no | copied byte-for-byte |
| `part2/obj3/image_2.png` | PNG | 17551 | `065bb11feca35c5055122d5ab0e74c9a85db7271bb31aebaa78116321752bc8e` | 949×64 | 14.828125 | yes / no | Instruction panel · Object 3 | no | copied byte-for-byte |
| `part2/obj3/image_3.png` | PNG | 298476 | `3abd8126c1b75011b4b1f86f87934ad165d331959c4f358489e736064ca036be` | 956×532 | 1.796992 | yes / no | Questions 5–6/Work it out panel · Object 3 | no | copied byte-for-byte |
| `part2/obj3/showText.png` | PNG | 1475024 | `c7721cbb080f39c0178c215e66c47abdc61a4167441c242e3fa8f7746914ab4a` | 1000×1219 | 0.820345 | yes / no | Reading-text graphic · Object 3 | no | copied byte-for-byte |
| `part2/obj4/image_2.png` | PNG | 11234 | `b44b28059951ce821ceb0588fef367138910b7ac48e01fdc388de32b4a7164ea` | 873×34 | 25.676471 | yes / no | Instruction panel · Object 4 | no | copied byte-for-byte |
| `part2/obj4/showText.png` | PNG | 1690095 | `b988b55e3356aa41d88093606f6f495008dcc2987ff5cb5f63fdcc30d1a87732` | 1000×1219 | 0.820345 | yes / no | Reading-text graphic · Object 4 | no | copied byte-for-byte |
| `part2/obj5/image_1.png` | PNG | 26072 | `54eb94bf8b117920e3da784ddf77126abc873bc5967da8d12334c7b0557be373` | 250×105 | 2.380952 | yes / no | Debate Club decorative badge · Object 5 | yes; Unit 9 counterpart | copied byte-for-byte |
| `part2/obj5/image_2.png` | PNG | 12391 | `034bc5948ec05143e8298bb58a5697e8317da92bbd21ca5cc84d3b2140e8d8d8` | 646×60 | 10.766667 | yes / no | Instruction panel · Object 5 | no | copied byte-for-byte |
| `part2/obj5/image_3.png` | PNG | 31135 | `3beb3146e169bd5fb0541318212406ff24434734ad679fdc4a7bc3e6b1b9aba2` | 336×123 | 2.731707 | yes / no | Home argument bubble · Object 5 | no | copied byte-for-byte |
| `part2/obj5/image_4.png` | PNG | 21471 | `e4155f309f4262da5607617bc5d6ed37972eab132d4bac81b502b364bd38ffc2` | 268×99 | 2.707071 | yes / no | Cinema argument bubble · Object 5 | no | copied byte-for-byte |
| `part2/obj5/image_5.png` | PNG | 82184 | `d711ceb3fd6d15cb144993ba8bd5cd8faf3c53b365f58a5524025d49c6b458b7` | 250×166 | 1.506024 | yes / no | Home-viewing illustration · Object 5 | no | copied byte-for-byte |
| `part2/obj5/image_6.png` | PNG | 74912 | `15c359a68627689c7d64b210c0774a96e403dff1eb99246df87f30d76cd97e3c` | 259×172 | 1.505814 | yes / no | Cinema-viewing illustration · Object 5 | no | copied byte-for-byte |
| `parts/HD/parts_part_2.png` | PNG | 1042365 | `3ee66fb746eca87043a247a35dd83ea23f6d14167594d540d5ef60d4603618dd` | 1142×794 | 1.438287 | yes / no | Printed spread 6–7 | no | reused tracked byte-identical page |
| `parts/SD/parts_part_2.png` | PNG | 632028 | `173b6b194601713353682135c31de200c66df964fad0a8bc5070d308f228a036` | 799×556 | 1.437050 | yes / no | Printed spread 6–7 SD fallback | no | audit only; HD remains canonical |

## Audio/video inventory

| Source-relative path | Type | Bytes | SHA-256 | Technical metadata | Role | Duplicate | Pilot decision |
| --- | ---: | ---: | --- | --- | --- | --- | --- |
| `part2/obj2/audio.mp3` | MP3 | 6727622 | `3426d3b935092cc05bb85ea5c38d516f17d7dd23904ec67c78ca1e651e2b46b3` | 280.318s; MP3; 44.1kHz; stereo; ~192kbps | Full reading audio · Object 2 | no | reused byte-identical tracked media |
| `part2/obj2/highlight_1.mp3` | MP3 | 145866 | `9b7a1a3828c9544bbbd8f9c80f8385ceda718723fff0b722ac4d46e8bd9bd8f5` | 9.091s; MP3; 44.1kHz; stereo; ~128kbps | Segment · Object 2 | no | copied byte-for-byte |
| `part2/obj2/highlight_2.mp3` | MP3 | 432586 | `3ded535c5c4b1743cd51e631dd1f054bfce0cc1104cba6fd1500242a2a4df32d` | 27.011s; MP3; 44.1kHz; stereo; ~128kbps | Segment · Object 2 | no | copied byte-for-byte |
| `part2/obj2/highlight_3.mp3` | MP3 | 99473 | `ed16129c64cf543a247c4ee772f727f26412496b062ee28131a0406a261f638b` | 6.191s; MP3; 44.1kHz; stereo; ~129kbps | Segment · Object 2 | no | copied byte-for-byte |
| `part2/obj3/highlight_1.mp3` | MP3 | 94039 | `0aee3c30b44bcbe2689e726ffd1bdbc166a66a64599a67f02e54032b740ce05f` | 5.851s; MP3; 44.1kHz; stereo; ~129kbps | Question 1 segment · Object 3 | no | copied byte-for-byte |
| `part2/obj3/highlight_2.mp3` | MP3 | 92786 | `0d3247e0c1acada2d3fe55dbb46b81df13cab0204106219362af77d78de2996d` | 5.773s; MP3; 44.1kHz; stereo; ~129kbps | Question 2 segment · Object 3 | no | copied byte-for-byte |
| `part2/obj3/highlight_3.mp3` | MP3 | 140015 | `dd80adb04ce7156a86656635543948d6a08473a37ad6fbd3f4098f3eedacd7f5` | 8.725s; MP3; 44.1kHz; stereo; ~128kbps | Question 3 segment · Object 3 | no | copied byte-for-byte |
| `part2/obj3/highlight_4.mp3` | MP3 | 74813 | `ce71aaf5cc370301045dc51014377ed75639acc59a1613990b0a22d5f5947b3b` | 4.650s; MP3; 44.1kHz; stereo; ~129kbps | Question 4 segment · Object 3 | no | copied byte-for-byte |
| `part2/obj3/highlight_5.mp3` | MP3 | 458082 | `b8c20e2031273edfea7995244c7dcc28a31b4e1e3a4a00bb883d298fb83fa74f` | 28.604s; MP3; 44.1kHz; stereo; ~128kbps | Question 5 segment · Object 3 | no | copied byte-for-byte |
| `part2/obj3/highlight_6.mp3` | MP3 | 290480 | `3831336fae6c2b412a0c8d98d1fb8119f307ec82755543493eea594bd6505073` | 18.129s; MP3; 44.1kHz; stereo; ~128kbps | Question 6 segment · Object 3 | no | copied byte-for-byte |
| `videos/book1/unit/1/part2/obj1.mp4` | MP4 | 61715797 | `7817dc0361571c6c5e6f3837b9368835ea7de3fe7df24f4e0d58fd3d37932574` | 230.997s; H.264 1024×576; AAC 44.1kHz stereo; ~2137kbps total | Content video · Object 1 | no | reused byte-identical tracked media |
| `videos/book1/unit/1/part2/obj1.srt` | SRT | 4032 | `65431348feb713bf6e8430d3e5f7fccffe528ec5ceacaa76459d13d79b83e586` | UTF-8 subtitle sidecar | Video subtitles · Object 1 | no | audited; existing runtime video behavior retained |

No transcoding was required.

## Metadata/evidence inventory

| Source-relative path | Type | Bytes | SHA-256 | Role | Duplicate elsewhere | Decision and evidence |
| --- | ---: | ---: | --- | --- | --- | --- |
| `part2/obj1/ebook_obj_params.iwb` | IWB | 6740 | `31b7cb664ac8bfbe67cc5fa52b65644f4b19b03788bd68ef27e13066caba89f0` | E-book composition · Object 1 | no | audit only; strict decoded XML |
| `part2/obj1/obj_params.iwb` | IWB | 7192 | `2f0526c86a4256bf70becbf5c24a026718e88ff4d657c2e03c5e2be8f47c0733` | Activity composition · Object 1 | no | audit only; 1024×582 coordinates, prompts, worksheet relationship |
| `part2/obj1/video.xml` | XML | 614 | `4219a5a6b13c9c17f5ca20144242aa4b694977c769c06e7dba17bb0933ddda91` | Video relationship · Object 1 | no | statically parsed |
| `part2/obj2/ebook_obj_params.iwb` | IWB | 40688 | `7c98badcb63c7d0a5ec87b824fd4a290c60300c051b9fb8e383e5b325103a217` | E-book composition · Object 2 | no | audit only; strict decoded XML |
| `part2/obj2/highlight_params.iwb` | IWB | 3860 | `3b8e27e9ad9fdc6a2234e0cc69dd09f7fcb4927ca2b47e63d9708369e00bec61` | Highlight-region metadata · Object 2 | no | exact 3-audio/12-region mapping implemented |
| `part2/obj2/obj_params.iwb` | IWB | 40956 | `4194b3db0d9057041b69a19e33697c30b075a5485aa8922874c032d34be21568` | Activity/karaoke composition · Object 2 | no | prompts, show-text/audio relationship, scroller, line timings |
| `part2/obj3/highlight_params.iwb` | IWB | 6768 | `990b19fec2289f6aaccc82a1b6e0da85ec517a30313a60f9858caf2d86e98df6` | Highlight-region metadata · Object 3 | no | exact 6-audio/23-region mapping implemented |
| `part2/obj3/obj_params.iwb` | IWB | 5764 | `04369a700863b204bfebef73a33e8e2961ab90b73d1b832f03f853228462ccd4` | Multiple-choice composition · Object 3 | no | strict decoded XML; existing authoritative answers unchanged |
| `part2/obj4/obj_params.iwb` | IWB | 10176 | `eff1d381a1eab943703845a72dea1913ae5f526ec283fea9c0349aac60a3fc90` | Typed-answer composition · Object 4 | no | strict decoded XML; existing authoritative answers unchanged |
| `part2/obj5/ebook_obj_params.iwb` | IWB | 13140 | `0528b46bf82dfddeec7835964f23ead2b3e6085bfccabd8af1194e7c42a8ba12` | E-book composition · Object 5 | no | audit only; strict decoded XML |
| `part2/obj5/obj_params.iwb` | IWB | 20480 | `2a2be60f99bb5efbc9291eed7f5895b31af39c38c164b97edf88f52d93c44da4` | Two-page debate composition · Object 5 | no | images, prompts, sample-argument pages; remains open response |
| `part2/obj6/obj_params.iwb` | IWB | 1456 | `54cfe1a918fc6bf58076145422c00b24dbbe1e3444d7dd2555681b74bc5708f7` | Extra-video stub · Object 6 | yes; 5 copies | outside five-object pilot; not copied |
| `part2/obj6/video.xml` | XML | 611 | `ed1033501957e4d09fc4e717de55a22ec592f9e02096979e454c07edcf294610` | Extra-video relationship · Object 6 | yes; 5 copies | outside pilot; not copied |
| `part2/obj7/obj_params.iwb` | IWB | 1456 | `3c27f52845dbf748957f74c36be9e00358e08bcff0400545c4688f70223035a9` | Extra-video stub · Object 7 | yes; 5 copies | outside pilot; not copied |
| `part2/obj7/video.xml` | XML | 611 | `dba3b4a4e4baf98a6620b267feed6bc01571aabadd88b197abf36ad6d893758e` | Extra-video relationship · Object 7 | yes; 5 copies | outside pilot; not copied |
| `part2/obj8/obj_params.iwb` | IWB | 1456 | `a29bfb4cffeb288089ff4c838d525b915c0d27e78a7161086b3d35deb3f4afca` | Extra-video stub · Object 8 | yes; 5 copies | outside pilot; not copied |
| `part2/obj8/video.xml` | XML | 611 | `2315bfb73a82975ce73d50c1fa0c1ca9f318b13f81de21774ddc8cdf86eb82c7` | Extra-video relationship · Object 8 | yes; 5 copies | outside pilot; not copied |
| `part2/part_params.iwb` | IWB | 4836 | `87d66cd22a0125acbdaaf35ccab0543d357c65970742362269b355102fb3045f` | Part navigation | no | audit only; strict decoded XML |
| `part2/video.xml` | XML | 615 | `b8ac25a5b11663528f61388f907f2d9a089b7bebb752e8d1a91d804265efae90` | Part video relationship | yes; 2 copies | audit only |

## Referenced global audio-player evidence

The Object 2 `audioPlayer` notification establishes the role of the following global assets. They were visually inspected but not copied because current semantic controls are required for responsive, keyboard, touch, lifecycle, and seek behavior.

| Path | Type | Bytes | SHA-256 | Dimensions/role | Decision |
| --- | ---: | ---: | --- | --- | --- |
| `Contents/Resources/assets/audioPlayer/HD/AudioPlayer.png` | PNG atlas | 99468 | `0750c458b1e65e8f48a906d6ddee22a011f74182648f240e4b3e90607b9c1568` | 509×228; play/pause/stop/seek/volume state graphics | palette/state reference only |
| `Contents/Resources/assets/audioPlayer/HD/AudioPlayer.xml` | XML | 2094 | `39a911ae52cd664e5ecb4c66eea526e31b17c7c94c993a3340e7e9be4a8a8f9f` | HD atlas rectangles/state names | statically parsed |
| `Contents/Resources/assets/audioPlayer/SD/AudioPlayer.png` | PNG atlas | 58884 | `13e7f3d610d658d8ded692c021056a956445e3425a66795d5fbe1be251de04b0` | 222×262; SD state graphics | palette/state reference only |
| `Contents/Resources/assets/audioPlayer/SD/AudioPlayer.xml` | XML | 2085 | `425fddd9e4fad96b86f822daa1620f26904e8c81450040ac9512c2545f9e050c` | SD atlas rectangles/state names | statically parsed |

The video-player skin files are SWFs. Their existence was recorded, but they were not executed, extracted, copied, or used.

## Pilot asset decision

Twenty-six files were copied byte-for-byte into `src/assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/`: seventeen activity images and nine highlight MP3 segments.

Three canonical files were reused rather than duplicated:

- `unit/1/parts/HD/parts_part_2.png`
- `src/assets/books/ultimate-b2/teacher-offline-media/unit-1-reading-text.mp3`
- `src/assets/books/ultimate-b2/teacher-offline-media/unit-1-reading-intro.mp4`

Their hashes match the publisher source exactly. The centralized machine-readable provenance is `src/data/ultimate-b2/unit1Part2LegacyPilotAssetManifest.json`.

## Confidently recovered behavior

- Object 1 video, two teacher-reviewed fields, original instruction strip, and video worksheet relationship.
- Object 2 full audio, three teacher-reviewed fields, original background/instruction/reading plates, Show/Hide text, and exact discrete highlight audio-to-region mapping.
- Object 3 six multiple-choice questions, original question panels, original reading plate, exact six highlight mappings, and existing protected teacher answers.
- Object 4 eight typed answers, original instruction/reading plate, accepted-answer normalization, server-authoritative web scoring, and local presentation checking.
- Object 5 open-response debate composition, original badge, argument bubbles, photos, and two-sided visual framing.
- 1024×582 proportional stage, aqua/magenta/lime visual identity, purple/pink media-control states, and source typography hierarchy.

## Not claimed as exact legacy parity

- Full-track Object 2 per-line karaoke rendering and auto-scroll are not reproduced; the complete audio and exact discrete highlight files are provided truthfully.
- Part 2-specific correct/incorrect icons, animations, or sounds were not recoverable. Compatible truthful feedback is used.
- Legacy SWF video skin and Flash cube page transitions are intentionally not reproduced.
- Exact publisher font binaries were not found as clearly reusable Part 2 assets and were not copied.
- No interface sound is used because no exact Part 2 trigger relationship was established.
