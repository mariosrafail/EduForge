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

## Known limitations and next boundary

Journey projects without profile artifacts show safe unavailable states. GAF, SWF and AIR content is never executed. Audio/video previews are excluded. Large lists are bounded to 100 items per response.

Milestone 4B owns durable approvals, manual overrides, bulk structural-cluster decisions, revision conflicts and source-diff resolution.
