# Milestone 4A: Publisher Review Studio

Milestone 4A adds a local, read-only visual review surface for the Book Project artifacts produced by Milestones 1–3. It does not change Book Project schema `1.0`, source scanning, approved-decision semantics, publication drafts, runtime data or title-specific authored data.

## Start locally

Use the default local Book Builder workspace:

```text
npm run dev:book-builder
```

Select an existing alternate workspace at server startup:

```text
npm run dev:book-builder -- --workspace "<workspace-directory>" --port 4177
```

The launcher validates an existing non-symlink directory, binds only to `127.0.0.1`, and prints the exact local URL plus a basename-only workspace label. A browser request cannot select or submit a workspace path.

Open `http://127.0.0.1:<port>/builder.html`. Hash routes preserve dashboard/project deep links, reloads and browser navigation without a server-side SPA rewrite.

## Available review views

- Dashboard: safe project summaries, search, profile/lifecycle filters, corrupt and empty states.
- Overview: application identity, profile, revisions, validation and review counts.
- Components: role proposals, evidence counts and server-side bounded filtering.
- Pages & Hotspots: approved raster previews and normalized, non-editable hotspot overlays.
- Menu & Branding: buttons, bounds, texture states, branding, atlas and static GAF evidence. Startup intro evidence remains separate from the central on-menu title animation.
- Activities: paginated Student-safe prompts/options and structural references without correctness data.
- Review Queue: grouped/paginated unresolved items and structural-cluster previews.
- Source Diff: the recorded `rescan-diff.json` summary and bounded safe fact IDs.

The banner is authoritative: **Read-only review — approvals and manual corrections are not enabled in Milestone 4A.** There are no scan, rescan, materialize, approve, reject, save, publish, package or APK actions.

## Legacy authoring compatibility

`/ultimate-b2-builder.html` loads the unchanged tracked Ultimate B2 hotspot/menu-skin utility. Its existing local write endpoints remain specific to that tool. The generic Review Studio does not read or write the tracked B2 authoring model.

## Build separation

`npm run build:book-builder` writes only the Studio client to ignored `dist-book-builder/`. It is not a normal Vite input, Android input or Netlify deployment input. Use `npm run verify:book-builder-bundle-safety` to reject server implementation, absolute paths, Teacher artifacts and answer payload keys from that client.

## Project capabilities and real-workspace validation

Book Projects may legitimately contain the artifacts produced by an earlier milestone. A project with components, pages, menu evidence and reviews but without Student activity or activity-cluster artifacts is older, not corrupt. The Activities and structural-cluster views show explicit unavailable states and never infer replacement data.

`npm run validate:book-builder:studio -- --url http://127.0.0.1:4177` inspects every listed project through the sanitized local API. It builds an in-memory capability matrix and selects projects by available evidence for overview, components, page preview and normalized hotspots, menu, Student-safe activities, activity clusters, grouped review reasons and source diff. Selection never depends on a title, an ID substring or project order. Independent flows may use different capable projects, while one fully capable project is preferred.

An old-only workspace completes promptly with machine-readable status `real-workspace-incomplete`, missing capabilities, unavailable flows, API timings and screenshots of the unavailable states. Full status `real-workspace-safe` requires at least one current project with Student-safe structured prompts and options, raster-gap activity candidates and activity structural clusters. Milestone 4B remains blocked until that full validator passes.

Prepare repeatable real-project evidence outside both the repository and the original workspace:

1. Create a timestamped temporary validation workspace.
2. Hash the original project and representative source files.
3. Copy the project directory into the temporary workspace.
4. Run `npm run book-builder:rescan -- --project "<copied-project-directory>"` only on that copy.
5. Confirm the copied project has current Student activity, activity review, cluster and local internal Teacher artifacts.
6. Start the Studio with `npm run dev:book-builder -- --workspace "<temporary-validation-workspace>" --port 4177` and run the validator.
7. Compare hashes again. The original project and source must be unchanged, and the copy must remain unchanged from its post-rescan state after Studio validation.

The rescan is an explicit CLI preparation step. The Studio itself remains read-only and never receives a rescan or mutation endpoint.

## Known limitations and next boundary

Journey projects without profile artifacts show safe unavailable states. GAF, SWF and AIR content is never executed. Audio/video previews are excluded. Large lists are bounded to 100 items per response.

Milestone 4B owns durable approvals, manual overrides, bulk structural-cluster decisions, revision conflicts and source-diff resolution.
