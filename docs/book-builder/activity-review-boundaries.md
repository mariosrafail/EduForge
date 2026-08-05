# Activity review boundaries

Review items have stable IDs derived from category, source-relative locator, and reason code. They contain counts/status/digests rather than answers or unnecessary educational text. Existing Milestone 2 review IDs are unchanged and activity items merge deterministically into the top-level queue.

Review is required for ambiguous types or index bases, raster prompts/options/drag labels, unresolved publisher references, correct-value zero/multiple matches, ambiguous accepted-answer delimiters, unresolved image/object answers, Teacher reveal, unsupported runtimes, legacy game shells, malformed metadata, and unresolved structural bindings.

High-confidence non-exercise objects are excluded without generating low-value per-object noise. Missing feedback is documented as a corpus limitation rather than one review item per activity. Review never auto-approves a publication decision.

The `activities` materializer reads only the Student-safe artifact and the activity review subset. It creates local static HTML plus metadata without external scripts, network resources, answers, correctness markers, accepted responses, raw XML, or absolute paths. It copies no page, audio, or video assets. Repeated runs over unchanged evidence must have the same aggregate hash.
