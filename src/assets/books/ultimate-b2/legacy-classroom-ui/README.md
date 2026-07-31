# Ultimate B2 legacy classroom UI subset

This directory contains a deliberately small, curated visual/audio subset recovered from the client-supplied `Ultimate English B2.app`. The original application bundle is intentionally ignored and is not a build dependency.

The collection maps a high-resolution glacier classroom backdrop, an exercise hotspot, losslessly cropped navigation/control icons, and four clearly named UI sounds to the Android Teacher offline application. `asset-manifest.json` records source-relative provenance, hashes, dimensions or durations, intended use, and extraction details. Atlas crops preserve transparency and native resolution; already suitable PNG/MP3 sources were copied without transcoding. SHA-256 comparison found no equivalent selected asset in the existing EduForge Ultimate B2 tree.

No Flash runtime, SWF, executable, framework, application code, book page, textbook audio, or textbook video is included. Empty placeholder plates, redundant SD variants, whole atlases, unrelated book/application content, and assets with uncertain roles were rejected. Some artwork may remain embedded inside SWF files; it was not recovered because no established repository-local static extractor was available.

All imports are explicit in `src/apps/android-teacher-offline/legacyClassroomAssets.js`. This keeps the subset in the Teacher Vite entry tree and out of the Student application and deterministic content pack.
