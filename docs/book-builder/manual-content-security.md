# Manual content security

Manual overrides are limited to Student-visible presentation strings for existing Student-safe nodes. Ordinary target resolution reads the Student activity candidate and content-redacted fact anchors; it does not open Teacher/internal solution artifacts.

The local browser cannot choose a workspace, enable edit mode, supply a dependency, change an owning activity or address a filesystem path. Read-only mode has no write capability. Edit mode still requires the explicit local-write startup confirmation, loopback host/origin checks, authenticated read and write capabilities, bounded JSON requests and the Milestone 4B1 revision/lock/journal boundary.

The server rejects unknown or cross-activity targets, target-kind mismatches, Teacher/internal targets, arbitrary object values, active markup, forbidden controls and absolute paths. The decision schema has no place for correct or accepted answers, model answers, answer records, drag/drop mappings, Teacher solutions, scoring, decoded XML or source keys.

API and browser projections are sanitized and bounded. History records whether a value was present and a bounded preview; it does not expose workspace or source paths. Synthetic tests use unique fictional Teacher/answer tokens and verify that they do not appear in Student-safe APIs, the DOM, screenshots or bundles.

Manual values remain local Book Project decisions in this milestone. They are not compiled into web, Student Android or Teacher Android production bundles, and no publication, package or APK path consumes them. Validation workspaces and local history are never committed.
