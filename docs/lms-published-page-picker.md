# Published page delivery and assignment picker

The LMS Students Book read model previously sent canonical page logical keys to
the imported-asset registry. A canonical page without the published
edition/import/asset chain could therefore fail with `Book asset not found`.
The width-based page canvas also exceeded its height-limited stage, and the
class form submitted its book label and package ID from independent selections.

## Delivery contract

`published-page-image` is an authenticated GET/HEAD book-content action. It
checks LMS package access, the exact published release and publication event,
immutable release integrity, canonical book/component/page identity, active
page membership and the expected SHA-256. Historical requests never resolve a
newer publication head. The read-model source marker does not participate in
immutable release serialization.

The Cloudflare LMS build emits all 110 canonical Students Book pages from the
tracked manifest. The existing raster inspector verifies decoded width/height,
MIME, byte size and checksum before emission. Files live under the internal
`/.netlify/functions/_canonical-pages/` prefix in the existing ASSETS binding.
The existing `run_worker_first` rule and unknown-function rejection protect
this prefix; it is not a public download endpoint. No new binding, R2 bucket,
credential, migration, asset registration or publication is required.

After authorization, the Worker requests a trusted internal key through ASSETS,
checks status/MIME and verifies one page's bounded bytes and checksum before
returning them with `private, no-store`, `Vary: Cookie` and `nosniff`. HTML/SPA,
redirect, missing, truncated, oversized and corrupt responses fail closed.
Client-supplied source URLs and storage paths are never accepted. Sharp and
image binaries stay outside the Worker module. Managed Workbook/Grammar and
existing imported assets retain their established delivery contracts.

`verify:cloudflare:lms` verifies every emitted page, the browser bundle, the
Worker dependency graph and the existing compressed-size limit. It also runs
the actual local Workers asset router: GET/HEAD of direct and normalized keys
must be denied, while a temporary local probe confirms the private binding
resolves the expected bytes. This probe is never deployed. The verifier uses
local bindings and needs no Cloudflare credentials.

## Viewer and class workflow

The page stage measures its available inner width and height, then uses
`min(width / pageWidth, height / pageHeight)`. Image and percentage hotspots
share the same rendered rectangle. Deliberate zoom allows scrolling; Fit
restores the whole page. ResizeObserver/fullscreen listeners clean up and do
not trigger image refetches. Fixed exercise previews fit their measured
content; long text keeps normal scrolling. Native audio/text focus rendering
is unchanged.

Fullscreen targets only the book viewer. Its controls and preview dialog stay
inside that subtree. Browser exit restores focus, rejected fullscreen leaves
the embedded viewer usable, and resizing/preview/image retry preserve selected
exercises. The alternative keyboard-accessible activity list remains available.

Create and Edit show class/package compatibility beside the picker and retain
selected exercises across conflicts. The class form uses the existing
authorized package list, submits the selected package ID, and derives its label
from that same object. Loading, unavailable, empty and stale package selections
disable creation. Class read models include the linked package's actual title
so an old display label cannot mask a different package ID. Server role, school,
package and assignment compatibility rules remain authoritative.

Creating/joining a class does not grant student book access. Existing hosted QA
classes are not changed by this implementation.

## Regression and derived-state gates

Relevant local commands, using Node 22 and isolated PostgreSQL:

```text
npm ci
npm run verify:migration-manifest
npm run audit:runtime-schema-boundary
npm test
npm run build
npm run test:integration
npm run test:published-book-assignments
npm run test:integration:cleanup
npm run build:cloudflare:lms
npm run verify:cloudflare:lms
```

Run the first four commands in a fresh tracked-only checkout before any build
or generator. The exact candidate also needs the existing CI Builder, Viewer,
native layout, Android bundle and APK, source structure, branding, audit and
Cloudflare Builder gates. The shared surface and Worker/build graph are the
main regression risks. A route-source assertion was updated for the additional
Worker context argument while retaining its authentication-order assertion.
No immutable fixtures, compiler hashes, answers, authored placement, schema,
dependency lockfile or generated runtime contract is changed.

The DB browser acceptance uses real application/auth/Worker handlers and local
storage. It covers missing old registry rows, separate imported assets,
portrait and landscape Students Book plus a different Workbook ratio at
1366x768, 1920x1080, 1024x768, 768x1024 and 390x844. Geometry assertions cover
four corners, aspect ratio, stage/document overflow and hotspot alignment.
Further checks cover zoom/reset, container resize, fullscreen/preview/focus,
keyboard alternatives, reduced motion, selection retention and image retry.

It creates a compatible class through the UI with multiple authorized package
choices; an incompatible class stays rejected in UI and direct API calls.
Students Book Submit/reload remains pinned after a newer local publication.
Workbook multi-item Homework editing tests conflict retention, add/remove,
persisted item order and locators. Existing historical combined/Unit Extras,
Student/Teacher separation and tenant regressions remain required.
`PUBLISHED_BOOK_EVIDENCE_DIR` selects an external screenshot/geometry directory.

## Subsequent hosted acceptance

1. Sign in through the ordinary authorized teacher flow and open Classes.
2. Choose an existing class linked to the actual Ultimate B2 package, or create
   a new class selecting Ultimate B2 in the supported book-package selector.
3. Verify the student's existing Ultimate B2 entitlement separately, then use
   the ordinary invite flow for class membership.
4. Open Assignments, select Students Book and a published page, check fit and
   fullscreen, preview/add exercises and select compatible classes.
5. Create an assignment or Homework. Sign in as the entitled student, open the
   assigned exercise, answer, confirm Submit and reload to verify persistence.

Fresh local gates and exact-SHA CI establish repository correctness and readiness
for hosted acceptance. They do not prove an existing hosted session's data,
configuration or operational behavior, and do not establish production readiness.
