# Manual activity transactions

Manual authoring is a recoverable multi-file transaction over `book-project.json`, `authoring/manual-activities.json`, `internal/manual-activity-solutions.json`, and `decision-history/manual-activities/`.

Each write acquires the existing project-scoped lock, verifies the expected project revision, validates Student and Teacher contracts, and checks a stable client mutation ID. The service writes pre-mutation Student/Teacher snapshots, a pending journal, atomic replacement files, the incremented Book Project revision, and then a committed sanitized history entry. A repeated identical mutation is idempotent; reuse with different content is rejected.

If a process stops between writes, reconciliation compares project revision and artifact digests with the pending record. It either completes a committed state or restores the recorded snapshots. No partially mixed Student/Teacher state is accepted. Conflict responses preserve the browser draft and instruct the client to reload current evidence.

Create, update, clone, archive, and remove each increment the shared Book Project revision exactly once. Preview performs validation and reports intended writes without mutating any file.
