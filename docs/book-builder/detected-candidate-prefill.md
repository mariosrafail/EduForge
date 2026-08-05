# Detected-candidate prefill

“Create manual draft from detected candidate” is a non-destructive starting point. It copies only resolved hierarchy ownership, proposed activity type, bounded visible text, Student options/response-field shape, page/hotspot association, and precise dependency fact IDs/evidence hashes.

All manual activity, question, option, statement, response-field, block, and overlay IDs are newly generated. The draft records field origins for traceability but never imports detected correct values, Teacher evidence, answer mappings, raw XML, or absolute source paths.

Subsequent source changes do not overwrite Publisher edits. Removed or changed dependency hashes and asset digests mark the manual activity stale with explicit reasons. A stale draft remains inspectable; a stale activity cannot be approved and cannot resolve its linked review item until the Publisher reviews it.
