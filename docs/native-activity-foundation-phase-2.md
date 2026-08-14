# Native Activity foundation — Phase 2

Phase 2 adds database-backed native `open-response` and `image` drafts to the hosted Activity Builder. It does not publish or render them in the LMS. Publication v1 deliberately ignores every `native_activity_*` document.

## Data boundary

Each activity has three canonical Builder-document records:

- `native_activity_index / default` contains identity, kind, placement, and ordering only.
- `native_activity_public / <activityId>` contains Student-safe metadata, managed-asset references, and exactly one `part-1` interaction.
- `native_activity_teacher / <activityId>` contains the matching private solution envelope.

The public and Teacher documents have independent strict validators. Public writes also pass the existing forbidden-private-key scanner. Asset references contain only a managed asset UUID, SHA-256 checksum, role, and logical slot; raw paths and upload URLs are not accepted.

Creation is one PostgreSQL transaction through `create_builder_native_activity`. It serializes component identity allocation, creates or updates all three documents, appends their immutable revisions, records idempotency, and writes a non-secret audit entry. The existing `builder_component_documents` tables remain the canonical payload store.

## Teacher preview authorization

The hosted Viewer is cross-origin, so the Builder's Strict session cookie is not shared. An authenticated, same-origin Builder request now obtains a five-minute HMAC-SHA-256 authorization scoped to the exact book/component, draft or release action, and activity/release where applicable. The Viewer forwards it only to the matching Teacher-only preview request. Public projections remain anonymous and Student-safe.

Configure `BUILDER_PREVIEW_AUTH_SECRET` independently on the Builder/preview Netlify site. It must be a randomly generated value of at least 32 bytes. Do not place it in source, a release document, audit metadata, or a `VITE_*` variable.

## Staging rollout prerequisite

Repository validation does not apply shared database changes. Before hosted staging can create native drafts, an operator must:

1. Back up and verify the dedicated staging database identity using the repository's existing staging preflight process.
2. Configure the same staging-only `BUILDER_PREVIEW_AUTH_SECRET` for the functions serving Builder and preview routes.
3. Apply migrations through the canonical migration runner so `database/036_builder_native_activity_foundation.sql` is the next and only pending migration.
4. Run the repository staging hardening/smoke checks and verify anonymous requests receive `401` from Teacher UI, Teacher solution, and Open Response Teacher projection routes.
5. Sign in as a Builder developer and perform the acceptance flow below. Do not point this procedure at production.

## Manual acceptance flow

In the hosted Builder, open Ultimate B2 → Students Book → Activities. Create an Open Response draft with **Add Activity**, select a valid placement, record its generated stable ID, edit the title and visible instruction, and save. Reload, select the same item under **Native drafts**, and verify the identity, metadata, revision, and `part-1` remain. Confirm the page states that the type editor arrives in Phase 3 and that the draft is excluded from publication v1.

Repeat with Image and confirm it receives a different stable ID, persists after reload, and states that the type editor arrives in Phase 4. Neither flow should request XML/IWB input. Verify the live LMS does not list either draft. In an anonymous/private window, directly request the Teacher UI draft, Open Response Teacher projection, release Teacher UI, and release Teacher solution routes; each must fail without a valid scoped authorization.

The automated equivalent is `npm run test:builder:hosted-native-activity` after `npm run build:book-builder`.
