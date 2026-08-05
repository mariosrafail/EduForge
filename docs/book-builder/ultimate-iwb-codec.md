# Ultimate IWB key discovery and codec

The Ultimate profile obtains its key only from static source evidence. The main SWF is decompressed as bytes (`FWS` directly, `CWS` with zlib, `ZWS` through the tracked read-only Python LZMA helper); neither the SWF nor ActionScript is executed. Every UUID-shaped ASCII candidate retains its original case and byte offset. A candidate is accepted only when it decodes deterministic samples from the home, book menu, unit, part, and object families. Zero or multiple accepted candidates is a blocking error.

The local `iwb-key-discovery.json` records the candidate count, accepted offset, one-way domain-separated fingerprint, sample-relative paths/hash, and rejection counts. The key itself exists only in process memory. It is absent from Book Project JSON, profile artifacts, inspect output, fixtures, repository source, and production bundles.

## Decode pipeline

For each `.iwb`, the codec:

1. accepts only trimmed canonical ASCII Base64;
2. decodes the wrapper;
3. applies repeating XOR with the explicit discovered UTF-8 key bytes;
4. performs fatal UTF-8 decoding;
5. rejects DTD/entity declarations and implausible roots such as HTML/script;
6. accepts a safe XML declaration, BOM, whitespace, and well-formed leading comments before the root;
7. classifies the document with strict XML validation.

Statuses are `strict_xml`, `malformed_xml_after_valid_decode`, `invalid_wrapper`, `invalid_utf8`, and `wrong_key_or_non_xml`. Publisher-malformed XML is not repaired. It receives a stable review item with a source hash and parser diagnostic. Unsafe or undecodable corpus entries block the import.

`iwb-index.json` contains family/status counts, byte sizes and hashes, root/tag/attribute summaries, schema fingerprints, exercise type names, and boolean answer/media/geometry indicators. It never contains decoded XML, question text, educational text, answers, accepted-answer strings, model answers, or scoring values. Answer-bearing evidence remains a count/flag and creates a future audience-policy review item; it is not projected to Student or Teacher content.
