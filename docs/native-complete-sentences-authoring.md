# Native Complete the Sentences authoring

The hosted Builder keeps semantic Complete the Sentences authoring and visual geometry authoring separate. Use **Bulk generate from text** on the Content tab to create sentence prompts, explicit `[[blank]]` positions, and private Teacher answers. The Visual tab's **Bulk import hotspots from text** convenience creates only public blank rectangles and bindings to existing semantic items.

## Bulk hotspot workflow

1. Create semantic sentences and private answers through the normal Content and Answer Key flows.
2. Open Visual, add the required panels, and upload every referenced panel background. Uploading establishes each panel's intrinsic source dimensions; placeholder dimensions without a background cannot be imported.
3. Paste one plain-text geometry document and choose **Import hotspots**.
4. Review and refine the selected result with the existing drag, resize, keyboard, numeric, binding, and lock controls.
5. Use the existing explicit **Save Draft** action. Importing does not save or make a network request.

The accepted grammar is fixed-order and case-sensitive:

```text
SOURCE <width>x<height>

PANEL <panelOrdinal>
ITEM <itemOrdinal> x=<x> y=<y> width=<width> height=<height>
```

For example:

```text
SOURCE 1024x582

PANEL 1
ITEM 1 x=665 y=234 width=140 height=27
ITEM 2 x=581 y=280 width=140 height=27
ITEM 3 x=429 y=324 width=139 height=27
ITEM 4 x=739 y=367 width=140 height=27

PANEL 2
ITEM 5 x=271 y=234 width=140 height=27
ITEM 6 x=109 y=280 width=140 height=27
ITEM 7 x=148 y=322 width=139 height=27
ITEM 8 x=523 y=367 width=140 height=27
```

`SOURCE` is the one global coordinate plane for every panel. Panel and item ordinals are 1-based and resolve against current Builder order when the import is applied. `ITEM 3` means current Sentence 3; it does not mean a publisher ID or printed exercise number. Example-only printed sentences that were not generated as semantic items do not consume an ordinal. Stable panel, item, and hotspot IDs—not ordinals—are persisted.

Input is limited to 65,536 characters. This allows over 2,000 characters per binding at the current 30-hotspot maximum while preventing unbounded pasted input. Blank lines, CRLF/CR/LF line endings, and ordinary surrounding spaces or tabs are accepted. Comments, extra directives, reordered or extra geometry fields, fractions, exponent notation, non-safe integers, duplicate panels or items, rectangles outside SOURCE, and trailing tokens are rejected with line-numbered diagnostics. A failure leaves the draft unchanged.

## Scaling, replacement, and readiness

Geometry is scaled to each uploaded background's intrinsic `sourceWidth` and `sourceHeight` by mapping rectangle edges:

```text
left   = floor(x * targetWidth / sourceWidth)
top    = floor(y * targetHeight / sourceHeight)
right  = ceil((x + width) * targetWidth / sourceWidth)
bottom = ceil((y + height) * targetHeight / sourceHeight)
```

The stored area is `{ x: left, y: top, width: right - left, height: bottom - top }`. Equal dimensions preserve geometry exactly, and the same uncropped image at another resolution keeps proportional placement. X and Y scale independently when aspect ratios differ; the Builder warns that cropped, translated, or reflowed artwork may require manual correction.

Listed panels that already contain blank hotspots require **Replace existing hotspots on listed panels**. Replacement never touches an unlisted panel. A matching item binding keeps its stable hotspot ID even when it moves between two listed panels; new bindings receive new `hot` IDs, and omitted bindings are removed only from listed panels. An item already mapped on an unlisted panel fails closed. Each semantic item may have at most one hotspot globally; overlapping rectangles are otherwise allowed.

Partial imports remain saveable drafts under the existing Complete the Sentences rules. Readiness continues to report `Item N needs exactly one blank hotspot.` until every item is mapped. Empty image-only panels remain valid, and activity-wide answer style and font settings are unchanged.

The pasted source remains only in local component state. It is not persisted, transmitted, stored in browser storage, or copied into public or Teacher documents. The importer never reads or changes answer text, accepted alternatives, or evaluation behavior.

This convenience is available only for native Complete the Sentences. It does not upload or parse XML, IWB, OCR, or images and does not change the generic decoded-IWB parser boundary documented in `book-builder/ultimate-activity-parsers.md`.
