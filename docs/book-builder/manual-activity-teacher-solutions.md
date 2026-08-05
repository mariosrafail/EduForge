# Manual activity Teacher solutions

Teacher solutions have their own strict contract in `lib/book-builder/manual-activity-solutions.js` and are stored only in `internal/manual-activity-solutions.json`. The artifact is classified `teacher-only-internal` and `local-only`; Student activity IDs link the two files without copying answers into Student data.

Multiple-choice and image-backed choice solutions reference Student option IDs. True/false solutions reference statement IDs. Typed gaps and image-backed text fields store bounded accepted values and a normalization policy. Open-answer activities may carry a bounded rubric. Media and scrollable activities have no answer payload.

Approval requires complete, non-orphaned solutions for scored fields. Cloning remaps Student node IDs and their Teacher references together. Removing an activity removes its solution. Sanitized history records type, hierarchy, status, revisions, and digests but never answer values.

Ordinary read-only Studio routes do not open this artifact. Its API requires edit mode, same-origin loopback access, the read session token, the separate write capability, and a narrow activity ID. Student preview is constructed without reading Teacher files.
