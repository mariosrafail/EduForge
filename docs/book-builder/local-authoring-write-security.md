# Local authoring write security

Write capability is selected only at server startup. Read-only remains the default, accepts only GET/HEAD resources and returns `write_mode_disabled` for decision mutation routes. Edit startup requires `--edit`, the exact `--confirm=local-book-project-writes` phrase and a persistent safe workspace.

Every request retains the Milestone 4A loopback socket, loopback Host, same-Origin, session-token, no-store, nosniff and sanitized-response protections. Edit mode creates a second ephemeral write capability. A mutation needs both headers, JSON content type and a body no larger than 128 KiB. The write capability exists only in edit mode, is delivered only by its runtime bootstrap and is never compiled into the static client.

The API exposes only four POST operations below a safe project ID:

- `/projects/:projectId/decisions/preview`
- `/projects/:projectId/decisions/apply`
- `/projects/:projectId/decisions/remove`
- `/projects/:projectId/decisions/reapprove`

There is no file-write, JSON-patch, artifact-write, command or dependency-update endpoint. The browser submits only target ID, kind, allowlisted value, approval state, bounded note, expected revision and client mutation ID. Target capabilities, facts, hashes and reviews are resolved from current local evidence by the server.

Write mode rejects OS Temp, repository-contained, source-contained, missing, ambiguous and symlink workspaces. It never binds beyond `127.0.0.1`. Normal web, Student Android and Teacher Android bundles exclude the Publisher Studio client and every server/filesystem module.
