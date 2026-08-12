# Ultimate B2 content workspace

The Ultimate B2 content workspace is the publisher-controlled authoring and source store for the current Students Book implementation. It is deliberately separate from application deployment. The LMS, static web build, Interactive Teacher build, Android builds, Netlify functions, tests, and migrations continue to consume deterministic files in this repository.

## Configuration

Set `ULTIMATE_B2_CONTENT_ROOT` in an ignored local environment file, normally `.env.local`. It is a server-side/local-authoring variable. Never give it a `VITE_` prefix and never write the machine-specific value into committed data, browser responses, runtime JSON, or build output.

If the variable is absent, repository-only development retains the previous behavior. When it is present, the local Ultimate B2 Builder reads canonical authoring content from the workspace and writes the workspace first, followed by the established repository projection. Endpoints remain loopback-only and accept stable IDs rather than filesystem paths.

## Structure and ownership

```text
B2/
  00-manifest/              book identity, provenance, inventory, checksums
  students-book/
    structure/              learner-safe canonical page structure
    pages/unit-XX/          the 110 current page images
    hotspots/               canonical hotspot authoring
    activities/unit-XX/<stable-activity-id>/
      manifest.json
      source-private/       publisher XML/IWB/original uploads and authoring source
      student-runtime/      recursively validated learner-safe projection/assets
      teacher-private/      model answers and authoritative solutions
    teacher-private/        private registries used by repository projections
  interactive-ui/           live logical UI assets, replacements, and UI config
  shared-media/
    student-runtime/
    teacher-private/
```

`source-private` is private even when it also contains visible prompt text. IWB/XML and original authoring bundles can contain correctness data. `student-runtime` must not contain accepted answers, correct option identities, model answers, solution payloads, hidden correctness flags, source-private dependencies, or workstation paths. `teacher-private` is projected only into authenticated server behavior or an explicitly Teacher-only package.

## Commands

```text
npm run ultimate-b2:workspace:migrate
npm run ultimate-b2:workspace:index
npm run ultimate-b2:workspace:verify
npm run ultimate-b2:workspace:status
npm run ultimate-b2:workspace:sync
```

- `migrate` performs the copy-first curated migration. Existing differing workspace files are never overwritten.
- `index` refreshes the central inventory and checksums after intentional Builder authoring changes; it never prunes content.
- `verify` checks every indexed byte and recursively validates student JSON and local/private dependency boundaries.
- `status` is a read-only comparison of canonical authoring files and repository projections.
- `sync` updates only the explicit allowlisted projections. It does not prune or delete unknown files.

The migration selects current page artwork, currently bound UI assets, activity-linked publisher source, current authoring data, current learner-safe runtime data, Teacher solutions, and current shared media. It does not copy the complete recovered application or the complete `legacy-source` mirror.

## Builder behavior

- Hotspot Builder reads/writes `students-book/hotspots/hotspots.json`, then projects to the existing hotspot manifest.
- Activity Builder editors use per-activity canonical `source-private`, `student-runtime`, and `teacher-private` locations while keeping the established repository JSON/assets as build projections. Publisher-created activities remain official publisher activities and retain guarded test/staging database projection.
- UI Controller reads the logical asset manifest and canonical UI files. Replacement uploads are written to `interactive-ui/authored-replacements` before their content-addressed repository asset projection; UI config is written to the workspace before its repository manifest.

Writes are staged. If a workspace-first write succeeds but a repository projection fails, a record is placed under `00-manifest/pending-projections/` so partial success is visible and recoverable.

## Student and Teacher contract

Both applications share the learner-safe activity model and interaction components. Student Android continues to resolve the solution provider to `noOfflineSolutions.js` and answer controls to `NoTeacherAnswerUi.jsx`. It can collect responses without possessing the answer key. Connected LMS scoring remains server-authoritative through existing activity/question/submission services.

Teacher offline separately imports the generated Teacher solution pack and uses `TeacherAnswerUi`. This is capability and data separation, not CSS hiding. A Teacher package is private by design.

## Future books

Future books should use stable book/component/unit/page/activity identities, the same three activity classifications, explicit logical asset IDs, relative provenance paths, deterministic repository projections, and independent public/Teacher build validation. Runtime clients must never depend directly on Nextcloud or another publisher-master filesystem.
