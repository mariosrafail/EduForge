# Netlify review build targets

The LMS, Ultimate B2 Builder review, and hosted Viewer review are three build profiles of the same `hhplms` repository. The generic public Viewer currently uses the internal Ultimate B2 Interactive target; its B2-specific code and asset graph are intentionally not renamed here. The profiles reuse the same React components, Student-safe activity projections, page/media assets, stable IDs, and UI assets. There are no copied applications.

| Future site | Purpose | Build command | Publish directory | Functions | Data source | Writes | Private answers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LMS | LMS and Platform Admin | `npm run build:netlify:lms` | `dist-netlify/lms` | Yes: `netlify/functions` | Existing LMS services | Existing authenticated LMS behavior | Server-authorized only |
| Ultimate B2 Builder | Authenticated publisher/developer Builder | `npm run build:netlify:ultimate-b2-builder` | `dist-netlify/ultimate-b2-builder` | Builder auth + content API + public review projection | Repository baseline + Builder document revisions | Sessions/audit + registered hotspot documents | No |
| Viewer (current Ultimate B2 Interactive) | Static stakeholder Interactive review | `npm run build:netlify:ultimate-b2-interactive` | `dist-netlify/ultimate-b2-interactive` | No | Checked-in public pack + live Student-safe hotspot preview | No | No |

Each command empties only its own publish directory, so all three outputs can coexist. `dist-netlify/` is ignored and must not be committed.

## Explicit profiles

Build behavior is selected explicitly in `src/config/buildProfiles.js` and `vite.config.js`; it is never inferred from a hostname or Netlify URL.

- The normal local Ultimate B2 Builder retains all three existing tabs and its loopback-only, workspace-first authoring endpoints.
- The authenticated hosted Builder loads a generic Book Library and component registry. Its first connected adapter is Ultimate B2 → Students Book. Hotspot Builder saves only through the registered Builder content API with revision concurrency; Activity Builder and UI Controller remain read-only. It has no upload, import, activity-creation, runtime projection, or `__hhplms` client. See `docs/hosted-book-builder-architecture.md`.
- `ULTIMATE_B2_CONTENT_ROOT` remains local publisher configuration. Hosted builds do not need or read the external workspace.
- The hosted Interactive reuses the Android Teacher visual shell but substitutes a public-pack validator/provider, the no-solution provider, Student answer UI, Student-safe activity data, and a live hotspot review projection initialized from a deterministic committed baseline. `teacher-solutions.json` is not imported.
- Android Teacher continues to use the full private pack, strict Teacher validation, and Teacher reveal UI.

The review wrapper accepts local builds and Netlify `branch-deploy`/`deploy-preview` contexts. It accepts Netlify `production` only for two exact dedicated-site combinations: the Ultimate B2 Builder target on `dev` with `HHPLMS_NETLIFY_REVIEW_TARGET=ultimate-b2-builder`, or the current Ultimate B2 Interactive target on `dev` with `HHPLMS_NETLIFY_REVIEW_TARGET=viewer`. Every other review production context remains blocked. The existing root `netlify.toml`, `deploy:build`, LMS main-only production rule, migration check, and production database preflight remain unchanged.

## Path-aware build starts

All three Netlify configurations run `scripts/netlify/ignore-site-build.mjs` before starting a build. The script compares `CACHED_COMMIT_REF` with `COMMIT_REF` and uses an explicit repository-path policy to start only the sites affected by the commit. Builder package, Function, server, and hosted UI changes start the Builder without starting Viewer or LMS builds. Viewer package changes start only the Viewer. Root LMS Functions, Platform Admin, and LMS entry changes start only the LMS. Proven shared build/runtime inputs start every site they can affect, while documentation and test-only commits can stop all three builds early.

The policy is deliberately fail-open: an unknown or malformed path, missing or unsafe commit reference, failed Git comparison, or otherwise ambiguous state continues the build. A first deploy therefore builds normally. Equal `CACHED_COMMIT_REF` and `COMMIT_REF` also continue the build so a manual redeploy of the current commit is never trapped by the ignore check. Netlify's `build.ignore` convention is inverted: exit 0 skips the build and exit 1 continues it.

This path-aware check is site-specific. A commit-wide `[skip netlify]` marker would suppress every Netlify site and must not be used as the normal monorepo workflow. The Builder and Viewer retain `dev` as their dedicated Netlify primary branch, while root LMS production remains main-only. Migration verification, production preflight, bundle verification, secret scanning, and all other Netlify security controls remain enabled and unchanged.

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

For this dedicated Builder site only, Netlify's **Production branch** must be `dev`. "Production branch" is Netlify terminology for the branch published at the site's primary URL; it does not make the Builder product production-ready. The authenticated artifact permits only its registered hotspot document mutation; other content tools remain read-only. Because `dev` is this site's primary branch, no branch-deploy configuration is required for `dev`.

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

The configured Functions directory is site-local and must not be changed to the repository-root `netlify/functions` directory. Its only deployable source entries are `builder-auth.js`, `builder-content.js`, and `builder-preview.js`; their implementation helpers live in the sibling `server/` directory and are bundled dependencies, not independently discoverable Functions. Authenticated routes remain `/builder/api/auth` and the registered `/builder/api/content/*` family. The separate GET-only public route `/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots` exposes only the explicitly opted-in Student-safe review projection. Do not add LMS authentication, Platform Admin, or unrelated authoring mutation Functions to this site.

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

The Viewer package keeps an empty tracked Functions directory and requires no `DATABASE_URL` or other database credential. Its one narrow external 200 rewrite maps the browser's same-origin `/preview/content/*` path to `https://hhplms-builder.netlify.app/builder/preview/content/:splat`. It does not proxy Builder auth, authenticated content, mutations, or direct Function paths, and it forwards no Builder session: the client fetch explicitly omits credentials. The hosted Viewer continues to use Student-safe runtime data, excludes Teacher solutions and reveal controls, and blocks LMS Functions, `/api/`, and `/auth/` runtime dependencies.

The Viewer becomes ready only after both its Student-safe content pack and one no-store live hotspot request succeed. A response with revision `0` and source `repository` is an authoritative baseline. An unreachable, non-200, or malformed response shows the safe unavailable state instead of silently rendering stale committed hotspots. There is no polling, WebSocket, SSE, or database access.

The first activation requires deploying the same commit to `hhplms-builder` first and `hhplms-viewer` second. After that, a Builder hotspot Save persists revision N and a Viewer open/refresh reads revision N without committing the authoring JSON or redeploying the Viewer. For a manual smoke test: record a harmless hotspot and the current revision; move it and Save; confirm revision N; do not commit `studentsBookHotspots.json` or deploy Viewer; refresh `https://hhplms-viewer.netlify.app`, navigate to the page, and confirm the new coordinates; refresh again and confirm they persist; move and Save revision N+1, refresh the already-deployed Viewer, and confirm N+1 appears.

This is live review preview behavior, not publication. Save still does not publish LMS runtime, publish Android packs, mutate production runtime tables, or commit repository files. A later explicit Validate -> Project -> Publish pipeline remains required for production distribution.
