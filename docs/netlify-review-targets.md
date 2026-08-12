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

## Step 4: configure the dedicated Builder site

Create a second Netlify site from the same `mariosrafail/hhplms` repository. This site is only for the Ultimate B2 Builder hosted review and must use these Netlify UI values:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Branch deploy | Enable `dev` as an individual branch deploy |
| Base directory | Leave unset (repository root) |
| Package directory | `netlify-sites/ultimate-b2-builder` |
| Build command | `npm run build:netlify:ultimate-b2-builder` |
| Publish directory | `dist-netlify/ultimate-b2-builder` |
| Functions directory | `netlify-sites/ultimate-b2-builder/functions` |

Do not set `dev` as the Production branch. The deployed Builder artifact must use Netlify's `branch-deploy` context; the review build continues to refuse the `production` context. After the `dev` branch deploy succeeds, its stable URL has this shape:

```text
https://dev--<builder-site-name>.netlify.app
```

Keep the Base directory unset so Netlify installs dependencies and runs the build from the repository root. The Package directory selects the Builder-specific `netlify.toml`; its paths are deliberately root-relative.

The configured Functions directory is a tracked, empty site-local directory. It contains no deployable function source and must not be changed to the repository-root `netlify/functions` directory. Do not add function redirects, LMS authentication functions, Platform Admin functions, database-backed Builder APIs, or authoring mutation endpoints to this site.

Do not configure LMS, authentication, database, staging, Neon, or publisher-workspace variables for the Builder site. In particular, it does not need `DATABASE_URL`, `STAGING_DATABASE_URL`, `AUTH_RATE_LIMIT_SALT`, `PLATFORM_ADMIN_RATE_LIMIT_SALT`, `HHPLMS_STAGING_QA_PASSWORD`, or `ULTIMATE_B2_CONTENT_ROOT`. It uses only the checked-in review-safe projections and public/static assets described above.
