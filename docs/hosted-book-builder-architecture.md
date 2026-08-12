# Authenticated hosted Book Builder architecture

## Phase 2 model

The hosted publisher application now follows one generic hierarchy:

```text
Authenticated Publisher Book Builder
└── Book
    └── Component
        └── Component adapter / read-only workspace
```

`BuilderAuthGate` remains outside the entire application. Until the dedicated Builder session is authenticated, neither the Book Library nor a component workspace renders. Authentication, the `hh_builder_session` cookie, logout, audit, rate limiting, and the dedicated Builder auth Function are unchanged from Phase 1.

The hosted catalog is deterministic, checked in, and separate from LMS rollout visibility. It does not query the database. The catalog registers book/component metadata and an optional adapter identity; the generic shell resolves only registered identities and fails unknown books, components, tools, or adapters closed.

## Current catalog

```text
Ultimate B2
├── Students Book — connected; read-only hosted adapter
├── Workbook — present; authoring adapter pending
├── Grammar Book — present; authoring adapter pending
└── Test Book — present; authoring adapter pending
```

All existing recovered and implemented hosted B2 work belongs to `Ultimate B2 → Students Book`: Hotspot Builder, Activity Builder, UI Controller, Unit 1/2 page navigation, committed hotspots, normalized Student-safe activities, and the Teacher shell preview. The adapter reuses those existing components and projections; no content is duplicated.

Grammar Book and Test Book remain visible here even though LMS Phase One visibility hides them. Builder authoring availability and LMS learner rollout are distinct policies.

## Routing

The single hosted hash router supports:

- `#/books`
- `#/books/ultimate-b2`
- `#/books/ultimate-b2/components/ultimate-b2-students-book`
- `#/books/ultimate-b2/components/ultimate-b2-students-book/hotspots`
- `#/books/ultimate-b2/components/ultimate-b2-students-book/activities`
- `#/books/ultimate-b2/components/ultimate-b2-students-book/ui`

Hashes preserve reload, Back, and Forward state without a server route. Unsupported component routes show their explicit pending state; unknown identities return safely to the Book Library through a not-found view.

## Naming boundary

Platform-level infrastructure uses generic names: `HostedBookBuilderApp`, `hostedBuilderCatalog`, `hostedBuilderRouter`, `book-builder-hosted-review`, `netlify-book-builder-review`, and `virtual:book-builder-app`.

Title-specific implementation keeps accurate names such as `UltimateB2StudentsBookHostedWorkspace`, `ultimateB2StudentsBookPageUnits`, the hosted B2 hotspot provider, B2 activity data, and B2 Teacher shell assets. These names describe real content rather than platform infrastructure.

The following B2-named operational compatibility identifiers intentionally remain unchanged so the existing Netlify project requires no reconfiguration:

- `netlify-sites/ultimate-b2-builder/`
- `npm run build:netlify:ultimate-b2-builder`
- review target `ultimate-b2-builder`
- `ultimate-b2-builder.html`
- existing `hhplms-builder` project/package-directory configuration

## Security and next phase

Phase 2 remains content read-only. No hosted content Function, persistence table, Save action, upload, filesystem operation, GitHub integration, or content mutation was added. Local `__hhplms` authoring and Review Studio session/write-capability endpoints remain Vite/loopback-only.

Phase 3 should add a server-authorized content persistence boundary keyed by the generic `bookSlug/componentSlug` registry identity. It should validate that the authenticated Builder developer has an allowed adapter/capability before invoking component-specific persistence. That API should be a new narrowly scoped Function surface and must not reuse or expose local filesystem middleware.
