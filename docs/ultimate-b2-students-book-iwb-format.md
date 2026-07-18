# Ultimate B2 Students Book IWB forensic note

This pass was read-only. No publisher executable, SWF, AIR application, native
library, or decoded payload was executed. No publisher source file was written,
and complete decoded payloads are not committed.

## Deterministic format

Students Book `.iwb` files use this reproducible pipeline:

1. strict, canonical Base64 decoding;
2. byte-for-byte XOR with a repeating UTF-8 key;
3. UTF-8 XML validation.

The key is `EA3DC7D7-6954-471A-8399-E217B522F5F2`. It was recovered from a
static string table in `Contents/Resources/UltimateB2.swf`, alongside the
symbols `_encryptionKey`, `decryptBase64`, `applyXor`, `Crypto`, `Base64`,
`ByteArray`, `uncompress`, `inflate`, `readObject`, and `loadBytes`.

`UltimateB2.swf` is a ZWS version 34 file. Its LZMA-compressed body was expanded
in memory solely to extract static strings; the declared and recovered body
lengths matched. The SWF was never loaded or run.

The following descriptors were also inspected statically:

- `Contents/Resources/META-INF/AIR/application.xml`: AIR namespace 23.0,
  application version 2.3.0 Final, main content `UltimateB2.swf`;
- `Contents/Info.plist`: matching bundle and version metadata;
- non-executable support/configuration files and scripts. The only relevant
  launcher-adjacent script found was the unrelated on-screen-keyboard helper.

Known plaintext provided an independent correlation before the full key was
identified: the first decoded bytes of object and question parameter files XOR
against `<params>\r\n` and `<questions>\r\n` begin with the same key prefix.

## Safety probes and families

The scanner records byte length, first 64 and last 32 bytes, entropy, printable
ASCII percentage, hashed UTF-8/UTF-16 evidence, prefix/suffix clusters, sizes,
roles, names, activity types, and unit/object positions. It probes ZIP, gzip,
zlib, raw deflate, bzip2, XZ, XML, JSON, plist, UTF text, AMF indicators, Java
serialization, .NET BinaryFormatter indicators, protobuf-like framing, SQLite,
SWF, and common image/audio signatures without executing content.

The real corpus resolves to XML after Base64 and XOR. Strict XML is classified
`decoded-structured`; payloads that deterministically become XML but fail strict
validation are `decoded-partial`. Parser failures are retained with provenance
and are not repaired speculatively.

## Publication boundary

Decoded question, option, answer, and scoring counts are evidence summaries.
Only explicit answer elements or attributes count as answer evidence. Full text
is not copied into generated forensic reports, and automatic publication remains
disabled even for structurally complete question banks.

## Page mapping correction

Decoded `unit_params.iwb` navigation labels and visible printed page numbers
show that odd units contain 14 printed pages and even units contain 16. The
confirmed range is pages 5–154. The earlier formula incorrectly treated later
unit starts and odd-unit final practice pages as 16-page sequences. The generated
page audit records every changed unit/part mapping and the small remaining
inference: consecutive publisher part images preserve their order inside a
navigation-labelled two-page spread.
