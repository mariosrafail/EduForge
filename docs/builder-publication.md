# Hosted Builder component publication

Hosted Builder publication is a data-release workflow. It does not rewrite tracked content, invoke the staging book importer, create Git commits, deploy an application, or update Android packages.

Only `ultimate-b2/ultimate-b2-students-book` currently advertises a production publication compiler. Registered or pending components remain non-publishable until they have their own explicit compiler and runtime support.

## State model

- Builder drafts remain mutable, revisioned authoring heads.
- A preview release is an immutable cross-document snapshot with deterministic public and Teacher projections.
- The publication head is the only mutable release state. It points to one immutable release for a component.

The release compiler composes canonical Open Response authoring, a committed source import, and a saved public-text document in that order. Hotspots and Teacher UI use their canonical revision-zero state when no saved Builder document exists. The public projection is recursively validated as Student-safe; imported Teacher solutions and Teacher UI remain in the separate Teacher projection.

Publishing revalidates release integrity, runtime compatibility, current source identity, expected head revision, and component ownership. Component-scoped advisory locking serializes the final staleness check and head transition with Builder document/import writes. A concurrent save may commit immediately after publication, but it remains an unpublished draft and cannot alter the release.

## Runtime boundaries

The web LMS requests only the authenticated and entitled active public release. An explicit `404/no_publication` preserves the canonical runtime. Service errors, malformed data, and compatibility failures do not masquerade as no publication. Published Teacher overrides continue through the separately authorized Teacher solution endpoint. Android Student and Android Teacher remain packaged and offline.

Published binary URLs identify an exact previously published release plus an immutable checksum and extension. The server proves release membership before deriving the configured public object key. Objects are not copied, renamed, or garbage-collected during publication.

Viewer release-preview routes are read-only and pinned to an exact release UUID. Every public, asset, Teacher UI, Teacher solution, and native Teacher release request requires either a valid Builder session or a signed, short-lived `previewAuthorization` whose action/component/release/activity scope is checked server-side. Public and Teacher projections remain separate, and Teacher data is loaded only on demand rather than compiled into the Viewer. This preview authorization is distinct from production LMS authorization; LMS Teacher solutions still require the ordinary Teacher/admin role and package entitlement.

## Rollout boundary

Migration 035 creates repository support only. Applying the migration, configuring production storage/runtime capacity, operating observability, validating disaster recovery, and defining a rollback procedure are separate production-readiness work. No release is created or activated automatically by deployment.
