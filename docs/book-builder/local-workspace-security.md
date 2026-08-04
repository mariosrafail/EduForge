# Local workspace and source safety

On Windows the default workspace is resolved from `LOCALAPPDATA` as `HamiltonHouseLMS/BookBuilder`; no username is hardcoded. Other platforms use `XDG_DATA_HOME` or the operating-system home data location. `--workspace` may override the root, but repository-contained and source-contained workspaces are rejected.

Each project uses a safe ID under `projects/<project-id>/` and contains:

- `book-project.json` — portable authoring envelope;
- `local-source-binding.json` — local-only absolute selected/canonical paths and timestamps;
- `source-inventory.json` and `structural-fingerprint.json` — local scan evidence;
- `detected-facts.json`, `scan-report.md`, and (after rescan) `rescan-diff.json`.

The portable Book Project and report contain source labels and source-relative paths only. Local bindings are excluded from portable export. Writes use a same-directory temporary file plus rename, clean temporary files after failure, reject traversal and symlink path segments, and enforce expected revision when replacing a Book Project. Corrupted JSON fails closed.

The application resolver uses `lstat`/`realpath`, bounded directory depth/count, skips symlinks, validates descriptor-selected SWFs inside `Contents/Resources`, rejects XML declarations/entities, and blocks multiple valid app roots instead of guessing. The inventory is bounded by file count, hash size, concurrency, and cancellation. It never executes `.exe`, native applications, AIR, SWF, ActionScript, Ruffle, Flash Player, or media, and never writes into a source root.
