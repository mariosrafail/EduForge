# Authenticated hosted Book Builder architecture

## Phase 3A model

The hosted publisher application keeps the generic Phase 2 navigation hierarchy and adds one narrowly registered persistence resource:

```text
Authenticated Publisher Book Builder
└── Book
    └── Component
        └── Registered resource / component adapter
            └── server-authorized Builder content Function
                ├── current Builder component document
                └── append-only revision history
```

`BuilderAuthGate` remains outside the application. The Book Library and all component workspaces render only after the `hh_builder_session` resolves to an active `builder_users` developer. LMS and Platform Admin identities do not authorize this surface.

The hosted catalog remains deterministic, checked in, and independent from LMS rollout visibility. A separate server-safe registry is the authorization boundary for content resources. It accepts only the exact registered `bookSlug`, `componentSlug`, and resource tuple; frontend catalog presence alone never grants writes.

## Current catalog and capabilities

```text
Ultimate B2
├── Students Book — connected
│   ├── Hotspot Builder — editable
│   ├── Activity Builder — read-only; persistence pending
│   └── UI Controller — read-only; persistence pending
├── Workbook — present; authoring adapter pending
├── Grammar Book — present; authoring adapter pending
└── Test Book — present; authoring adapter pending
```

Grammar Book and Test Book remain visible even though LMS Phase One visibility hides them. Builder authoring availability and LMS learner rollout are distinct policies.

## Resource and identity boundary

Phase 3A registers exactly:

```text
ultimate-b2
└── ultimate-b2-students-book
    └── hotspots
```

The route identity is `ultimate-b2/ultimate-b2-students-book`. The established hotspot document intentionally retains its internal `packageSlug: ultimate-b2` and `componentSlug: students-book` contract. The adapter translates between these identities rather than rewriting the existing schema.

The server resolves the canonical `book_packages` and `book_components` UUIDs from the registered slugs. A composite database foreign key proves the component belongs to the package. No client UUID, user ID, role, or email participates in authorization.

## Persistence contract

`builder_component_documents` stores the latest public/structural authoring state. `builder_component_document_revisions` stores every successful revision and rejects normal update/delete operations. These are Builder authoring tables, not LMS runtime, Viewer, Android, or publication tables. Existing `book_page_hotspots`, `book_activities`, `book_media_assets`, and `book_assets` retain their historical runtime/import purposes.

If no database document exists, GET validates and returns the committed hotspot manifest as revision `0` with source `repository`. The migration does not seed or copy the payload. The first save must specify `expectedRevision: 0` and creates database revision `1` plus history revision `1`.

Every later save supplies the revision that was loaded. PostgreSQL locks the logical document identity, compares the expected revision, updates current state, appends history, and writes `builder_document_saved` audit metadata inside one database function call. A stale revision returns HTTP `409 revision_conflict`; the UI retains its local edits and offers an explicit **Reload latest** action. No auto-merge or auto-save occurs.

Each save also supplies a UUID `clientMutationId`. Retrying the same document identity, mutation ID, and normalized payload checksum returns the existing successful revision without adding history. Reusing that ID with a different payload returns a conflict.

The public document guard recursively rejects exact normalized private/security key concepts, including answers, correct-option identities, model answers, Teacher solutions, reveal text, passwords, credentials, tokens, secrets, and database URLs. The canonical Ultimate B2 hotspot validator then enforces document identity, page IDs, hotspot IDs, Unit/page relationships, geometry, action type, labels, and Student-safe activity identities.

The same current authoring document can be exposed to the dedicated Viewer only through a separate explicit resource capability: `previewReadable: true` plus `projectPreview(document, context)`. Authenticated Builder `readable` authorization does not imply public preview authorization. A resource may explicitly declare the related public document families required by its projection. Hotspot preview declares the native activity index and native public activity documents, then validates against the same canonical-plus-current-native activity universe used at save time. Missing, deleted, malformed, or undeclared related resources fail closed; Teacher documents are never part of this context. The public handler performs exact registry lookup, stored schema validation, canonical normalization, checksum and revision validation, repository-baseline fallback where appropriate, recursive private-key guarding, explicit projection, and a second guard on the projection. Unknown or non-preview resources fail closed.

## API and routing

The browser uses only same-origin routes:

- `/builder/api/auth`
- `/builder/api/content/books/:bookSlug/components/:componentSlug/:resource`

The dedicated Viewer uses a GET-only Student-safe draft projection:

- Builder: `/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots`
- Viewer: `/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots`

The Viewer route is a narrow Netlify 200 proxy to the Builder route. The Viewer remains a static client with zero Functions and zero database credentials. No Builder session is forwarded. Student-safe hotspot/public projections remain separate from Teacher UI, imported Teacher solutions, release Teacher solutions, and native Teacher documents. Those Teacher projections require a signed, expiring `previewAuthorization` (or a valid Builder session) at the Builder server.

GET requires a valid Builder session and returns `{ bookSlug, componentSlug, resource, schemaVersion, revision, source, document }`.

PUT additionally requires same-origin Host/Origin validation, JSON content type, a bounded body, and exactly `{ expectedRevision, clientMutationId, document }`. The actor always comes from the HttpOnly Builder session. No `__hhplms`, direct Function URL, LMS API, Platform Admin API, workspace token, or database credential is exposed to the client.

The hosted hash routes remain:

- `#/books`
- `#/books/ultimate-b2`
- `#/books/ultimate-b2/components/ultimate-b2-students-book`
- the same component route ending in `/hotspots`, `/activities`, or `/ui`

## Canonical Viewer preview boundary

The hosted Builder is the authenticated authoring/control surface; it does not embed a second copy of the Student/Teacher interactive runtime. Activity and UI review render the dedicated Viewer in a cross-origin frame at the single configured origin `https://hhplms-viewer.netlify.app`. Hotspot geometry remains editable on the local Builder canvas, while its Viewer frame represents only the last successfully saved revision and reloads after a successful PUT.

The Builder creates these bounded query intents and appends a signed, short-lived `previewAuthorization` issued for the exact intent. Page intents sign the stable `pageId`; activity intents sign the exact `activityId`; library intents grant neither native scope. The frame uses the issuer's returned `expiresAt` to schedule one replacement authorization thirty seconds before expiry. Intent, release, page, activity, manual-refresh, and unmount changes cancel the previous timer/request. Renewal failure removes the iframe authorization and fails the explicit preview closed rather than downgrading it to bare mode:

- `?builderPreview=1&view=library`
- `?builderPreview=1&view=page&unitNumber=<number>&pageId=<stable-page-id>`
- `?builderPreview=1&view=activity&activityId=<stable-activity-id>`

The contract is enabled only by the hosted interactive startup provider. It uses an exact parameter allowlist, bounded stable IDs, real Viewer page units, and the canonical activity-location resolver against the validated loaded content pack. Duplicate, extra, malformed, missing-authorization, unknown-page, and unknown-activity values fail visibly. Android providers ignore the query. The server, not the query string alone, authorizes every protected data request by checking the token signature, expiry, action, component, release, and activity scope.

The frame sends no Builder cookie or mutation data, uses `no-referrer`, and has no postMessage or cross-origin DOM bridge. Its URL contains the short-lived preview authorization so same-origin Viewer requests can forward it to protected proxy routes. The token never contains Teacher answers and cannot protect or excuse private data in static assets. Viewer bundles contain presentation code but no Teacher solution pack or private publication projection.

The hosted runtime has three explicit valid modes. Bare/canonical Viewer uses committed public content, committed hotspots, tracked UI, and Student activity mode without any preview request. Authorized Builder preview loads the saved Student-safe draft/hotspot state and protected Teacher UI/Teacher import state. For a non-canonical native hotspot target it loads the current public native document from `/preview/native-activities/.../public`, renders Open Response or Image with the shared native surfaces, and resolves managed artwork only through `/preview/native-activities/.../assets/<asset-id>`. Open Response model answers use the distinct protected `/teacher` route; Image makes no Teacher request. Page-scoped access succeeds only when the signed page and authoritative current native placement agree. Exact release preview remains independent: it loads a protected immutable public projection, then obtains Teacher UI, legacy solutions, and native Teacher documents only on demand from release routes. The draft provider does not activate in release mode. An invalid explicit preview fails closed; it never silently becomes bare mode.

The native draft server boundary is GET-only and private/no-store. It checks the token action, exact component, activity or authoritative page placement, current index/public consistency, recursive public safety, and public/Teacher pair integrity. Draft assets additionally require an exact current public reference plus matching activity ownership, role, slot, checksum, and draft/internal/private lifecycle state before a short-lived signed private-storage redirect is returned. It never exposes object keys or makes the authenticated Builder asset-preview route anonymous. Bare Viewer and library preview make zero native draft, Teacher-draft, or draft-asset requests.

## Local and publication boundaries

The hosted hotspot editor shares the established `EditableHotspotLayer`, canonical B2 pages, normalized geometry, and Student-safe activity catalog with existing code. Its persistence transport is the Builder content API. The local Ultimate B2 editor remains unauthenticated development tooling and continues to use loopback-only `/__hhplms/ultimate-b2-hotspots` and `/__hhplms/book-menu-skin-selection` middleware. Neither transport calls the other.

A hosted save persists a Builder authoring revision and makes that Student-safe structural revision available to an explicitly authorized draft Viewer. That mode validates its public content pack and performs one no-store preview fetch before becoming ready; failures enter an explicit unavailable state rather than silently using stale committed hotspots. Bare Viewer instead treats the committed manifest as canonical and makes no preview fetch. Revision `0` repository fallback remains an authoritative server response for explicit draft preview. Android uses its bundled hotspot provider and makes no preview request.

A hosted save still does not publish LMS runtime, publish Android packs, mutate production runtime tables, or commit repository files. This is review preview, not publication. Planned follow-ons are:

- Phase 3B: Activity Builder public/private authoring persistence
- Phase 3C: media/assets and UI Controller persistence
- Phase 4: explicit validate/publish/project pipeline into deterministic runtime artifacts

## Naming and operational compatibility

Generic infrastructure uses `HostedBookBuilderApp`, `hostedBuilderCatalog`, `hostedBuilderRouter`, `builder_component_documents`, `book-builder-hosted-review`, `netlify-book-builder-review`, and `virtual:book-builder-app`. Ultimate B2 page, hotspot, activity, and Teacher shell implementation keeps title-specific names because those describe real content.

These deployment identifiers remain unchanged so the Netlify project needs no package-directory reconfiguration:

- `netlify-sites/ultimate-b2-builder/`
- `npm run build:netlify:ultimate-b2-builder`
- review target `ultimate-b2-builder`
- `ultimate-b2-builder.html`
- existing `hhplms-builder` project configuration
