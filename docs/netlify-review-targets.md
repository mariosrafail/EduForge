# Netlify review build targets

The LMS, Ultimate B2 Builder review, and Ultimate B2 Interactive review are three build profiles of the same `hhplms` repository. They reuse the same React components, Student-safe activity projections, page/media assets, stable IDs, and UI assets. There are no copied applications.

| Future site | Purpose | Build command | Publish directory | Functions | Data source | Writes | Private answers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LMS | LMS and Platform Admin | `npm run build:netlify:lms` | `dist-netlify/lms` | Yes: `netlify/functions` | Existing LMS services | Existing authenticated LMS behavior | Server-authorized only |
| Ultimate B2 Builder | Publisher/stakeholder read-only review | `npm run build:netlify:ultimate-b2-builder` | `dist-netlify/ultimate-b2-builder` | No | Checked-in review-safe repository projections | No | No |
| Ultimate B2 Interactive | Static stakeholder Interactive review | `npm run build:netlify:ultimate-b2-interactive` | `dist-netlify/ultimate-b2-interactive` | No | Checked-in public pack, Student-safe runtime, static assets | No | No |

Each command empties only its own publish directory, so all three outputs can coexist. `dist-netlify/` is ignored and must not be committed.

## Explicit profiles

Build behavior is selected explicitly in `src/config/buildProfiles.js` and `vite.config.js`; it is never inferred from a hostname or Netlify URL.

- The normal local Ultimate B2 Builder retains all three existing tabs and its loopback-only, workspace-first authoring endpoints.
- The hosted Builder substitutes a separate read-only root module before Rollup follows the local editor graph. It contains exactly Hotspot Builder, Activity Builder, and UI Controller, intentionally loads the committed hotspot manifest, and has no save, upload, import, activity-creation, database-projection, or `__hhplms` client.
- `ULTIMATE_B2_CONTENT_ROOT` remains local publisher configuration. Hosted builds do not need or read the external workspace.
- The hosted Interactive reuses the Android Teacher visual shell but substitutes a public-pack validator/provider, the no-solution provider, Student answer UI, Student-safe activity data, and committed hotspot data. `teacher-solutions.json` is not imported.
- Android Teacher continues to use the full private pack, strict Teacher validation, and Teacher reveal UI.

The review wrapper accepts local builds and Netlify `branch-deploy`/`deploy-preview` contexts, but refuses Netlify `production`. The existing root `netlify.toml`, `deploy:build`, main-only production rule, migration check, and production database preflight remain unchanged.

## Verification

```text
npm run verify:netlify:lms
npm run verify:netlify:ultimate-b2-builder
npm run verify:netlify:ultimate-b2-interactive
```

The Builder and Interactive checks reject private answers, source/IWB provenance, workstation paths, workspace configuration, private pack filenames, and unintended application/network dependencies. The LMS check applies the existing web-bundle safety policy.

Creating or configuring the three Netlify sites, their branch settings, and publish-directory settings is Step 4 and is intentionally outside this change.
