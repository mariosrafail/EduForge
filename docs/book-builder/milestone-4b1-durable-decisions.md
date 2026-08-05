# Milestone 4B1: durable single-item decisions

Milestone 4B1 adds the first write-capable mode to the Publisher Review Studio. The existing command remains read-only:

```powershell
npm run dev:book-builder -- --workspace "<workspace>" --port 4177
```

Local authoring is a separate startup choice and requires an explicit confirmation:

```powershell
npm run dev:book-builder:edit -- --workspace "<persistent-workspace>" --port 4177 --confirm=local-book-project-writes
```

Both modes bind only to loopback. The browser cannot enable edit mode or select another workspace. Edit mode refuses repository-contained, source-contained, symbolic-link, missing, ambiguous and operating-system Temp workspaces. Synthetic tests can opt into temporary workspaces only through direct test configuration.

## Evidence and decisions

Generated facts, page/activity/hotspot candidates, review queues, profile artifacts and Teacher/internal artifacts remain immutable evidence. Human choices are stored only in `book-project.json` under `approvedDecisions`. The Book Project schema remains `1.0`.

Supported single-item decisions cover component role, printed page number, canonical page variant, activity type, activity disposition, activity audience policy, hotspot candidate disposition and individual review disposition. The local server resolves the current target, dependencies, evidence hashes and related review IDs. Browser requests cannot supply any of those derived fields.

The Studio provides non-writing preview before confirmation, exact expected-revision checks, mutation idempotency, a per-project filesystem lock, transaction journal, local history and explicit stale-decision reapproval. Generated `review-queue.json` is never rewritten; effective review state is computed from approved, non-stale decisions.

## UI scope

Read-only mode shows no mutation controls. Edit mode displays an unmistakable local-editing banner and current revision. Components, pages/hotspots, activities and Review Queue provide one-target-at-a-time decision drawers. Decisions & History shows sanitized current records and local history summaries. Drafts survive conflict presentation in the browser, navigation warns about unsaved changes, and conflicts are never retried automatically.

Milestone 4B1 does not implement manual prompt, option, accepted-answer or Teacher-solution editing; hotspot coordinate editing; bulk cluster actions; reusable rules; publication; runtime/content-package generation; database writes; or APK generation. Those boundaries remain explicit prerequisites for any future milestone.
