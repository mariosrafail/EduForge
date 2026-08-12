# Netlify review build targets

The LMS, Ultimate B2 Builder review, and hosted Viewer review are three build profiles of the same `hhplms` repository. The generic public Viewer currently uses the internal Ultimate B2 Interactive target; its B2-specific code and asset graph are intentionally not renamed here. The profiles reuse the same React components, Student-safe activity projections, page/media assets, stable IDs, and UI assets. There are no copied applications.

| Future site | Purpose | Build command | Publish directory | Functions | Data source | Writes | Private answers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LMS | LMS and Platform Admin | `npm run build:netlify:lms` | `dist-netlify/lms` | Yes: `netlify/functions` | Existing LMS services | Existing authenticated LMS behavior | Server-authorized only |
| Ultimate B2 Builder | Authenticated publisher/developer read-only review | `npm run build:netlify:ultimate-b2-builder` | `dist-netlify/ultimate-b2-builder` | Builder auth only | Checked-in review-safe repository projections | Security/session writes only | No |
| Viewer (current Ultimate B2 Interactive) | Static stakeholder Interactive review | `npm run build:netlify:ultimate-b2-interactive` | `dist-netlify/ultimate-b2-interactive` | No | Checked-in public pack, Student-safe runtime, static assets | No | No |

Each command empties only its own publish directory, so all three outputs can coexist. `dist-netlify/` is ignored and must not be committed.

## Explicit profiles

Build behavior is selected explicitly in `src/config/buildProfiles.js` and `vite.config.js`; it is never inferred from a hostname or Netlify URL.

- The normal local Ultimate B2 Builder retains all three existing tabs and its loopback-only, workspace-first authoring endpoints.
- The authenticated hosted Builder loads a generic Book Library and component registry. Its first connected adapter is Ultimate B2 → Students Book, containing the existing Hotspot Builder, Activity Builder, and UI Controller reviews. It intentionally loads the committed hotspot manifest and has no save, upload, import, activity-creation, database-projection, or `__hhplms` client. See `docs/hosted-book-builder-architecture.md`.
- `ULTIMATE_B2_CONTENT_ROOT` remains local publisher configuration. Hosted builds do not need or read the external workspace.
- The hosted Interactive reuses the Android Teacher visual shell but substitutes a public-pack validator/provider, the no-solution provider, Student answer UI, Student-safe activity data, and committed hotspot data. `teacher-solutions.json` is not imported.
- Android Teacher continues to use the full private pack, strict Teacher validation, and Teacher reveal UI.

The review wrapper accepts local builds and Netlify `branch-deploy`/`deploy-preview` contexts. It accepts Netlify `production` only for two exact dedicated-site combinations: the Ultimate B2 Builder target on `dev` with `HHPLMS_NETLIFY_REVIEW_TARGET=ultimate-b2-builder`, or the current Ultimate B2 Interactive target on `dev` with `HHPLMS_NETLIFY_REVIEW_TARGET=viewer`. Every other review production context remains blocked. The existing root `netlify.toml`, `deploy:build`, LMS main-only production rule, migration check, and production database preflight remain unchanged.

## Verification

```text
npm run verify:netlify:lms
npm run verify:netlify:ultimate-b2-builder
npm run verify:netlify:ultimate-b2-interactive
```

The Builder and Interactive checks reject private answers, source/IWB provenance, workstation paths, workspace configuration, private pack filenames, and unintended application/network dependencies. The LMS check applies the existing web-bundle safety policy.

## Step 4: configure the dedicated Builder site

Create a second Netlify site from the same `mariosrafail/hhplms` repository. This site is only for the Ultimate B2 Builder hosted review.

### Initial project creation

Enter these values in Netlify's initial import form:

| Setting | Value |
| --- | --- |
| Repository | `mariosrafail/hhplms` |
| Project name | `hhplms-builder` |
| Branch to deploy | `dev` |
| Base directory | Leave unset (repository root) |
| Build command | `npm run build:netlify:ultimate-b2-builder` |
| Publish directory | `dist-netlify/ultimate-b2-builder` |
| Functions directory | `netlify-sites/ultimate-b2-builder/functions` |
| Environment variable | `HHPLMS_NETLIFY_REVIEW_TARGET=ultimate-b2-builder` |

For this dedicated Builder site only, Netlify's **Production branch** must be `dev`. "Production branch" is Netlify terminology for the branch published at the site's primary URL; it does not make the Builder product production-ready. The artifact remains a review-only, read-only static Builder. Because `dev` is this site's primary branch, no branch-deploy configuration is required for `dev`.

The initial UI marker is non-secret. If the initial form does not offer Package directory, Netlify may resolve the repository-root LMS configuration for its first attempted deploy. The root pipeline detects the marker and fails closed before migration verification, production preflight, Vite compilation, or artifact generation. It cannot deploy the LMS or root Functions for this marked review site.

### After project creation

In the new `hhplms-builder` project, navigate to:

```text
Project configuration
→ Build & deploy
→ Continuous deployment
→ Build settings
→ Configure
```

Set **Package directory** to `netlify-sites/ultimate-b2-builder`, keep **Base directory** unset, then save and trigger a new deploy. The successful redeploy resolves `netlify-sites/ultimate-b2-builder/netlify.toml` and uses its dedicated build, publish, and Builder-auth-only Functions settings.

The UI marker may remain because the dedicated package config declares the same non-secret `HHPLMS_NETLIFY_REVIEW_TARGET=ultimate-b2-builder` value. The review policy accepts Netlify `production` only when that marker, the Builder target, and branch `dev` all match exactly. Do not copy the marker into the LMS site's environment or use it for another review target.

After the `dev` primary deploy succeeds, the site URL has this shape:

```text
https://<builder-site-name>.netlify.app
```

Keep the Base directory unset so Netlify installs dependencies and runs the build from the repository root. The Package directory selects the Builder-specific `netlify.toml`; its paths are deliberately root-relative.

The configured Functions directory is site-local and must not be changed to the repository-root `netlify/functions` directory. It deploys only `builder-auth` plus its underscore-prefixed private helpers and exposes only `/builder/api/auth`. Do not add LMS authentication, Platform Admin, content persistence, or authoring mutation Functions to this site.

The Builder site requires server-only `DATABASE_URL` and `BUILDER_AUTH_RATE_LIMIT_SALT`. For dev/staging, `DATABASE_URL` points to the same isolated staging database used by LMS dev, while Builder identity/session/rate-limit/audit tables remain separate from LMS and Platform Administration. Do not configure `STAGING_DATABASE_URL`, `AUTH_RATE_LIMIT_SALT`, `PLATFORM_ADMIN_RATE_LIMIT_SALT`, `HHPLMS_STAGING_QA_PASSWORD`, `ULTIMATE_B2_CONTENT_ROOT`, or any `VITE_DATABASE_URL` substitute. See `docs/builder-auth-operations.md`.

This dedicated Builder branch model does not change the LMS site. The LMS continues to use its root configuration, `main` as its only production branch, LMS Functions, and the existing production database preflight.

## Configure the dedicated Viewer site

Create another Netlify project for the generic public Viewer identity. The implementation remains the existing internal `ultimate-b2-interactive` review target.

### Initial Viewer project creation

Enter these values in Netlify's initial import form:

| Setting | Value |
| --- | --- |
| Repository | `mariosrafail/hhplms` |
| Project name | `hhplms-viewer` |
| Branch to deploy | `dev` |
| Base directory | Leave unset (repository root) |
| Build command | `npm run build:netlify:ultimate-b2-interactive` |
| Publish directory | `dist-netlify/ultimate-b2-interactive` |
| Functions directory | `netlify-sites/viewer/functions` |
| Environment variable | `HHPLMS_NETLIFY_REVIEW_TARGET=viewer` |

For this dedicated Viewer site only, Netlify's **Production branch** is `dev`, meaning `dev` publishes to the primary Viewer URL. The Viewer remains a static review application; it is not an LMS production deployment and requires no branch-deploy configuration for `dev`.

If the initial form does not offer Package directory and Netlify resolves the repository-root LMS configuration, the root pipeline sees the Viewer marker and fails before migration verification, production preflight, Vite compilation, or artifact generation. It cannot deploy the LMS or root Functions.

### After Viewer project creation

Navigate to:

```text
Project configuration
→ Build & deploy
→ Continuous deployment
→ Build settings
→ Configure
```

Set **Package directory** to `netlify-sites/viewer`, keep **Base directory** unset, save, and trigger a fresh deploy. The successful redeploy resolves `netlify-sites/viewer/netlify.toml` and uses the existing internal Interactive build target with its dedicated empty Functions directory. The UI marker may remain because the package config declares the same non-secret value.

The expected primary URL is:

```text
https://hhplms-viewer.netlify.app
```

If that project name is unavailable, use the equivalent Netlify URL assigned to the selected name.

Do not copy LMS, authentication, database, staging, Neon, or publisher-workspace variables into the Viewer project. It does not need `DATABASE_URL`, `STAGING_DATABASE_URL`, `AUTH_RATE_LIMIT_SALT`, `PLATFORM_ADMIN_RATE_LIMIT_SALT`, `HHPLMS_STAGING_QA_PASSWORD`, `ULTIMATE_B2_CONTENT_ROOT`, Neon credentials, or publisher workspace credentials.

The Viewer package declares no redirects and its tracked Functions directory contains no deployable source. The hosted Viewer continues to use Student-safe runtime data, excludes Teacher solutions and reveal controls, and blocks LMS Functions, `/api/`, and `/auth/` runtime dependencies.
