# Student and Teacher activity separation

The Student-safe artifact has audience `student-safe-authoring`. It may contain sourced prompt, option, and label text; neutral IDs; geometry; media/hotspot/page references; source-relative provenance; and one-way evidence digests. A recursive validator rejects solution/correctness fields, accepted responses, answer mappings, scoring fields, reveal payloads, decoded XML, keys, unsafe markup, and absolute paths.

Teacher solution candidates have audience `teacher-only-internal` and classification `local-only`. They are written atomically only under the local Book Project profile's `internal/` directory. They may contain exact publisher correct values, resolved correct option IDs, accepted typed values, and drag/drop mappings. They cannot contain decoded XML, keys, or absolute paths.

Teacher solution candidates are excluded from Book Project JSON, detected facts, review queues, scan reports, CLI summaries, activity review HTML, publication drafts, web bundles, and Android application/content bundles. The current Teacher application does not consume them.

Tests use a unique fictional solution token. The token is present only in synthetic input, the local Teacher artifact, and test assertions; it is absent from every Student-safe and portable output. Existing web and Android bundle guards remain unchanged.
