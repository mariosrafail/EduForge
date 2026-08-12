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

The same current authoring document can be exposed to the dedicated Viewer only through a separate explicit resource capability: `previewReadable: true` plus `projectPreview(document)`. Authenticated Builder `readable` authorization does not imply public preview authorization. The public handler performs exact registry lookup, stored schema validation, canonical normalization, checksum and revision validation, repository-baseline fallback where appropriate, recursive private-key guarding, explicit projection, and a second guard on the projection. Unknown or non-preview resources fail closed.

## API and routing

The browser uses only same-origin routes:

- `/builder/api/auth`
- `/builder/api/content/books/:bookSlug/components/:componentSlug/:resource`

The dedicated review Viewer separately uses the intentionally public, GET-only Student-safe projection:

- Builder: `/builder/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots`
- Viewer: `/preview/content/books/ultimate-b2/components/ultimate-b2-students-book/hotspots`

The Viewer route is a narrow Netlify 200 proxy to the Builder route. The Viewer remains a static client with zero Functions and zero database credentials. No Builder session is required or forwarded. Responses contain only `bookSlug`, `componentSlug`, `resource`, `schemaVersion`, `revision`, `source`, and `document`, with JSON, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff` headers.

GET requires a valid Builder session and returns `{ bookSlug, componentSlug, resource, schemaVersion, revision, source, document }`.

PUT additionally requires same-origin Host/Origin validation, JSON content type, a bounded body, and exactly `{ expectedRevision, clientMutationId, document }`. The actor always comes from the HttpOnly Builder session. No `__hhplms`, direct Function URL, LMS API, Platform Admin API, workspace token, or database credential is exposed to the client.

The hosted hash routes remain:

- `#/books`
- `#/books/ultimate-b2`
- `#/books/ultimate-b2/components/ultimate-b2-students-book`
- the same component route ending in `/hotspots`, `/activities`, or `/ui`

## Local and publication boundaries

The hosted hotspot editor shares the established `EditableHotspotLayer`, canonical B2 pages, normalized geometry, and Student-safe activity catalog with existing code. Its persistence transport is the Builder content API. The local Ultimate B2 editor remains unauthenticated development tooling and continues to use loopback-only `/__hhplms/ultimate-b2-hotspots` and `/__hhplms/book-menu-skin-selection` middleware. Neither transport calls the other.

A hosted save persists a Builder authoring revision and makes that Student-safe structural revision available to the dedicated live review Viewer. On startup the Viewer validates its public content pack and performs one no-store preview fetch before becoming ready; failures enter an explicit unavailable state rather than silently using stale committed hotspots. Revision `0` repository fallback is an authoritative server response, not a client-side network fallback. Android uses its bundled hotspot provider and makes no preview request.

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
