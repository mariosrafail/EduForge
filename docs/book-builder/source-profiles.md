# Source profiles and structural fingerprint

Profile detection is structural and never selects from a title string. All known adapters sit behind the shared read-only Hamilton AIR scanner:

```text
hamilton-air-base
|-- ultimate-air-v2
|-- journey-air-v1
`-- generic-air-fallback
```

The base evidence is a valid AIR descriptor and descriptor-selected SWF, a Hamilton/Calledutainment application ID, and an `assets/books` hierarchy. The explicit known-profile confidence threshold is `0.70`; hard evidence must also be present. Missing or conflicting evidence selects the conservative fallback.

`ultimate-air-v2` requires IWB metadata, the recurring `home_params`, `book1_params`, `unit_params`, `part_params`, and `obj_params` families, HD/SD layout, and book/Unit/part/object structure. Book-menu common data and the home GAF archive increase confidence. `journey-air-v1` requires the absence of IWB, global MultipleChoice/DragAndDrop/Matching/ShowAnswer template directories, single-resolution part images, and flat atlas metadata. A title-only match does not contribute evidence.

The fingerprint includes portable descriptor fields and hashes, the main SWF hash/header, extension and metadata-family counts, normalized path patterns, and feature flags. Numeric book/Unit/part/object segments and Windows path case/separators are normalized. Descriptor, main SWF, and small structured metadata are SHA-256 hashed with streaming file reads. Other files record size and `deferred` hash state; the result is explicitly labelled `structural-partial`, never a full cryptographic source checksum.

Frameworks, code signatures, native executables, application runtime files, and language resources are separated from publisher resources. Wrapper setup/AutoPlay files are not inventoried after a nested canonical app is selected.
