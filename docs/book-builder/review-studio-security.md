# Publisher Review Studio security boundary

The Review Studio is a local inspection tool, not a hosted application.

## Transport and session

- The dedicated launcher binds to `127.0.0.1` only.
- API middleware requires a loopback remote socket and an approved loopback `Host`.
- A supplied `Origin` must match the active loopback host exactly. No wildcard CORS header is emitted.
- A random ephemeral token is returned only by the same-origin bootstrap endpoint and retained in browser memory.
- Every project API and preview request requires `X-HHPLMS-Book-Builder-Session`.
- API responses use `private, no-store`, `nosniff`, a restrictive CSP and stack-free deterministic errors.
- Only `GET` and `HEAD` are accepted. Other methods return `405`.

## Filesystem containment

Project IDs use the existing safe-ID shape. Project directories must be direct, real, non-symlink children of the configured workspace `projects/` directory. Artifact names come from a code allowlist; there is no generic file, artifact, download or filename route.

The central deny rule excludes any `internal` segment and names containing `solution`, `answer-evidence`, `decoded`, `iwb-key` or `local-source-binding`. Ordinary project and activity requests do not open the local binding or internal Teacher files.

For a page preview only, the server reads `local-source-binding.json` internally, resolves an artifact-declared source-relative raster below the canonical source root, rejects symlinks and realpath escapes, checks extension/MIME, byte limit and SHA-256, and returns an opaque-ID response. The binding and source root are never serialized.

Materialized previews are raster files found only below the known `profiles/<profile>/review-assets/menu/` subtree. HTML, SVG, JS, SWF, IWB, XML, GAF, archives, audio and video are not served.

## Student and Teacher separation

Activity responses are projected only from `student-activity-candidates.json`. The projection allowlists prompts, options, independent drag/target labels, counts, bindings and safe digests. It excludes correct options, accepted responses, drag/drop mappings, model answers, reveal payloads and scoring.

The server never opens or serves:

- `profiles/*/internal/`
- `teacher-solution-candidates.json`
- `answer-evidence-index.json`
- decoded XML or IWB key material
- arbitrary project/source/repository files
- environment variables

Synthetic tests place a unique secret in an internal Teacher fixture and verify it is absent from API bodies, DOM, screenshots, logs and the client build.

## Read-only protection

The Studio server implementation imports no project writer and exposes no write method. Pre/post validation hashes source packages, Book Projects, review queues, Student artifacts, internal artifacts and materialized assets to prove no changes occurred.
