# Ultimate page and hotspot candidates

Page candidates are derived from component/unit/part paths and paired HD/SD `parts_part_<n>.png` files. Relative structure and image dimensions/hashes are safe facts. Four special images per validated title remain explicit special-page review items. Printed page numbers are not inferred from array position, filenames, or OCR; each uncertain mapping remains a stable `page_number` review item.

Component directories, units, parts, and objects are candidates, not publication entities. A proposed semantic role may be attached with confidence and evidence, but no component is auto-approved. The current real-source results are:

| Source | Components | Component-unit groups | Parts / spreads | Objects | HD / SD / special |
|---|---:|---:|---:|---:|---:|
| B2 | 19 | 106 | 394 | 1,584 | 390 / 390 / 4 |
| B1+ | 18 | 96 | 355 | 1,461 | 351 / 351 / 4 |
| B1 held out | 20 | 111 | 371 | 1,696 | 367 / 367 / 4 |

Hotspot candidates use authored `button` and `quad` structure only. A part is an exact-cardinality candidate when its button count equals its object count. Otherwise it receives a mismatch review item; the importer does not force positional matching, discard surplus entries, or manufacture missing objects. Geometry is normalized only when the source supplies a valid page basis and finite rectangle coordinates.

| Source | Part metadata | Buttons | Quads | Exact | Mismatch | Normalized candidates |
|---|---:|---:|---:|---:|---:|---:|
| B2 | 394 | 1,756 | 1,670 | 328 | 66 | 1,220 |
| B1+ | 355 | 1,602 | 1,487 | 304 | 51 | 1,190 |
| B1 held out | 371 | 1,786 | 1,696 | 300 | 71 | 1,531 |

These are authoring candidates only. Activity semantics, question/answer conversion, scoring, interaction rendering, OCR, and publication projection remain outside Milestone 2.
