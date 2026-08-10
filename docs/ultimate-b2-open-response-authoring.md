# Ultimate B2 Open Response publisher authoring

The Ultimate B2 Activity Builder uses one activity-ID-driven Open Response editor and importer for explicitly registered compatible activities. The current registrations are `ultimate-b2-sb-u1-p1-o1` and `ultimate-b2-sb-u2-p1-o1`. Adding a future activity requires proving that its publisher structure matches this profile and registering its stable activity ID; it does not require another React editor or importer.

## Source bundle

Select or drop one bundle containing:

- `obj_params.xml`
- `ebook_obj_params.xml`
- every PNG, JPEG, or WebP raster referenced by the parameter documents

Decoded XML is accepted directly. Raw `.iwb` is rejected unless a safe server-side decode context is added under the established publisher-key policy. Decode keys must never enter browser code, authoring JSON, source provenance, or production/offline bundles. The current UI therefore asks for decoded XML when no such context is available.

The importer reads image declarations, viewport, prompts, response geometry, writing-line evidence, reveal presentation, and explicit publisher model responses. Image and question counts come from the XML rather than fixed Page 5 assumptions. Extra supplied images are reported but not rendered. Missing, duplicate, ambiguous, malformed, oversized, out-of-canvas, or structurally conflicting input fails closed.

The process is deterministic and contains no AI, OCR, image classification, semantic guessing, content rewriting, inferred answers, or malformed-XML repair. Unsupported or incomplete evidence requires author review.

## Persistence and privacy

Validated public authoring is stored under `src/data/ultimate-b2/authoring/`. Managed artwork is stored by digest under `src/assets/books/ultimate-b2/authoring/open-response/<activity-id>/`. Runtime resolution uses the checked-in authoring registry and an allowlisted Vite asset glob; local preview can serve a newly imported managed raster through the loopback-only authoring endpoint before the next build.

Publisher model responses are stored only in `netlify/functions/_ultimate-b2-open-response-model-answers.json`. They are excluded from public authoring and import reports and are exposed only through the existing Teacher solution path. Web and Android bundle-safety checks remain authoritative.

Public authoring, private Teacher authoring, and managed rasters are fully validated in memory and staged before transactional replacement. A failed import does not replace the existing valid activity.

## Accessibility review

Raster meaning is not inferred. Newly imported generic artwork starts with an empty alternative-text field and `review-required` status. An author must provide deterministic alt text from structured evidence or mark genuinely decorative artwork appropriately. Prompt wording and response regions remain manually correctable after import, while source evidence remains the baseline.

Raw XML, IWB files, decode keys, `legacy-source/`, and `tmp/` are local forensic inputs and must not be committed or bundled.
