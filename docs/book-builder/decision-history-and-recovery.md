# Decision history and recovery

Decision history is local workspace state, not part of the portable Book Project. Each project can contain a `decision-history` directory with pending journal records, committed entries and compact decision snapshots. These directories must never be copied into Git or publication/runtime bundles.

A write acquires an atomic per-project lock under the workspace-local Studio state. Lock metadata includes schema, project ID, process, session and acquisition time. Waiting is bounded. An active lock is never deleted blindly; only an expired lock whose recorded process is confirmed inactive can be moved aside and removed. Exact revision validation remains mandatory after acquisition.

The transaction order is:

1. reload and validate the current project;
2. validate expected revision and resolve current evidence;
3. atomically record the pending transaction;
4. atomically snapshot the previous decision array;
5. atomically replace `book-project.json` with its expected revision;
6. write a committed history entry and finalize the pending record;
7. release the lock.

Pending recovery compares both revision and stable decision digests. A pre-project-write interruption is rolled back by removing its pending intent. A completed project write is finalized into history. Any inconsistent or ambiguous combination returns `decision_recovery_ambiguous`, blocks further writes and leaves all read-only evidence views available. Recovery never silently discards an ambiguous record.

Client mutation IDs are stored with a request digest. Repeating an identical request returns its original result without another revision. Reusing the ID with different content fails closed. History UI exposes only revision, operation, decision/target identity, before/after state, time and mutation ID—not snapshots, hashes, answers, Teacher artifacts or absolute paths.
