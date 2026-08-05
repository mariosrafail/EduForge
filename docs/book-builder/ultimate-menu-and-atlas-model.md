# Ultimate menu, branding, GAF, and atlas model

Menu evidence comes from decoded metadata plus publisher files; filenames alone do not invent states. `book1_params.iwb` supplies the 13 main button declarations and authoritative texture triples. The atlas importer pairs metadata and PNGs, validates unique region names, integer non-negative rectangles and in-bounds coordinates, and emits one deterministic crop-plan record per valid region. Missing images, duplicate names, overflow, or ambiguous state references become review items rather than guessed crops.

`book-builder:materialize -- --scope menu` is an explicitly local review operation. It rechecks source hashes, uses the crop plan, writes atomically beneath the local project, and produces PNGs, metadata, and `menu-review.html`. It does not write the source bundle or repository, update runtime manifests, or imply approval. Repeating it over unchanged evidence produces the same aggregate hash.

## B2 branding sources

The exact Hamilton House wordmark displayed at the top left is the standalone HD PNG `Contents/Resources/assets/topbar/HD/topBar_URL.png` (272 × 40); the SD variant is `assets/topbar/SD/topBar_URL.png` (190 × 24). It is not `topBar_Logo.png`, which is separately catalogued as a placeholder.

The central on-menu `ULTIMATE / B2 / English` title is not `intro.flv`, a static image, an embedded SWF symbol, or a timeline in the main SWF. `assets/home/common/home_params.iwb` declares movie clip `logo` (`textures="logo_1"`, x 3, y -70, 24 fps, loop true, start frame 0). Its standalone dependency is `Contents/Resources/assets/home/common/logo_1.zip`, containing:

- `logo/logo.gaf` — GAF 5.8 timeline;
- `logo/logo_HD.png` — 2044 × 1954;
- `logo/logo_HD_2.png` — 632 × 1208;
- `logo/logo_SD.png` — 1022 × 977;
- `logo/logo_SD_2.png` — 316 × 604.

The GAF stage is 1024 × 768 at 24 fps. Its root timeline has bounds 432.075 × 295.600 at x 345.150/y 94.150, 334 frames, 334 frame records, 79 texture objects, and sequences `Break` (1–167) and `Logo1` (168–334). It can therefore be extracted exactly as the archive plus four texture dependencies; the five files are already in the recovered B2 catalog and the materializer reproduces them byte-for-byte.

The startup intro remains a separate video candidate at `Contents/Resources/assets/videos/intro.flv` (455,030 bytes). It is not a dependency of the on-menu title and is never used as its source.

Across B2/B1+/B1, all menu title animations use compatible standalone GAF timelines, while their texture dimensions/content may differ by title. The importer models them as evidence; it does not add a GAF web renderer or new runtime menu skins.
