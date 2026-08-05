# Ultimate activity parsers

All parsers consume strict decoded IWB documents through the existing in-memory profile pipeline. No decoded XML is persisted or exposed as a generic API.

Question banks parse `questions_params.iwb` questions, CDATA/plain prompts, ordered answer options, and the publisher correct value. Exact matching resolves one Teacher-only option ID. Zero or multiple exact matches stay unresolved and enter review. Unicode and punctuation are preserved; only whitespace is normalized; unsafe markup is rejected.

Sentence multiple choice parses `sentence@answer`, choices, structured text, and geometry. Index base is proven for each parsed compatible document/family as zero-based, one-based, ambiguous, or invalid. Only a proven base yields a Teacher-only correct option ID. Missing prompts or option text are retained as raster gaps; OCR and visual answer inference are forbidden.

Drag/drop parses publisher drag/drop IDs, labels, and geometry. `drop@answers` is resolved inside the activity. Pipe-separated publisher IDs are the only proven multi-target delimiter. Mapping and raw publisher values remain Teacher-only; missing IDs and raster labels enter review. `dndCat` remains unsupported-runtime even when its structure is readable.

Write parsing records response IDs, geometry, and a structured prompt only when the source text is safe content rather than a path-like publisher reference. Exact non-empty accepted values stay Teacher-only. Punctuation is never split generically; alternatives are split only when a caller supplies a proven family delimiter. Empty values are non-authoritative, ambiguous delimiters enter review, and path-like values are omitted and marked unresolved.

`object@answer` values remain unresolved Teacher/internal evidence. `sa` remains Teacher-reveal review. Video is media-only; print/display is non-scored; circle, karaoke, categorized DnD, cryptex, legacy shells, and unknown interactions require review or a future runtime.

The existing B2 normalizer remains an unchanged regression oracle. Its curated prompts, runtime IDs, editorial decisions, implementation modes, and page overrides are not imported into this generic profile.
