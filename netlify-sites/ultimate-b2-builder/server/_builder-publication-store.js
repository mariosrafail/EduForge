import { builderDocumentSha256 } from "./_builder-content-security.js";
import { resolveBuilderContentResource } from "./_builder-content-registry.js";
import { ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS } from "../../../src/data/ultimate-b2/openResponseActivityRegistry.js";

function document(row, resource) {
  if (!row) return null;
  const sha256 = builderDocumentSha256(row.payload);
  if (sha256 !== row.payload_sha256) throw new Error("Stored Builder document checksum is invalid");
  if (row.schema_version !== resource.schemaVersion) throw new Error("Stored Builder document schema is unsupported");
  const payload = resource.validate(row.payload);
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Stored Builder document revision is invalid");
  return { revision, sha256, payload, resource };
}

export async function collectUltimateB2PublicationV2Sources(sql) {
  const legacy = await collectUltimateB2PublicationSources(sql);
  const rows = await sql`
    select coalesce(jsonb_agg(jsonb_build_object(
      'document_type',document.document_type,'document_key',document.document_key,'schema_version',document.schema_version,
      'revision',document.revision,'payload',document.payload,'payload_sha256',document.payload_sha256
    ) order by document.document_type,document.document_key), '[]'::jsonb) as documents
    from book_packages package
    join book_components component on component.book_package_id=package.id
    left join builder_component_documents document on document.book_component_id=component.id
      and document.document_type in ('native_activity_index','native_activity_public','native_activity_teacher')
    where package.slug='ultimate-b2' and component.slug='ultimate-b2-students-book'
    group by component.id
    limit 1
  `;
  if (!rows[0]) throw new Error("Publication component is unavailable");
  const documentRows = new Map((rows[0].documents || []).filter((row) => row.document_type).map((row) => [`${row.document_type}/${row.document_key}`, row]));
  const indexResource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "native-activity-index");
  const index = document(documentRows.get("native_activity_index/default"), indexResource);
  const activities = {};
  for (const entry of index?.payload?.activities || []) {
    const [publicResource, teacherResource] = await Promise.all([
      resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "native-activity-public", entry.activityId),
      resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "native-activity-teacher", entry.activityId),
    ]);
    activities[entry.activityId] = {
      index: entry,
      public: document(documentRows.get(`native_activity_public/${entry.activityId}`), publicResource),
      teacher: document(documentRows.get(`native_activity_teacher/${entry.activityId}`), teacherResource),
    };
  }
  const references = Object.values(activities).flatMap((entry) => entry.public?.payload?.assets || []);
  const assetRows = await loadNativePublicationAssets(sql, { bookSlug: "ultimate-b2", componentSlug: "ultimate-b2-students-book", references });
  return { ...legacy, native: { index, activities, assetRows } };
}

export async function loadNativePublicationAssets(sql, { bookSlug, componentSlug, references }) {
  if (!references.length) return [];
  const ids = [...new Set(references.map((reference) => reference.assetId))];
  return sql`
    select asset.id,asset.checksum_sha256,asset.asset_role,asset.object_key,asset.storage_profile,
      asset.storage_bucket,asset.mime_type,asset.byte_size,asset.width,asset.height,
      asset.publication_status,asset.access_level,asset.source_metadata
    from book_assets asset
    join book_packages package on package.id=asset.book_package_id
    join book_components component on component.id=asset.book_component_id and component.book_package_id=package.id
    where package.slug=${bookSlug} and component.slug=${componentSlug} and asset.id=any(${ids}::uuid[])
    order by asset.id
  `;
}

export async function publicationV2DatabaseReady(sql) {
  const rows = await sql`
    select position('ultimate-b2-students-book-v2' in pg_get_functiondef('builder_release_sources_are_current(uuid)'::regprocedure)) > 0 as ready
  `;
  return rows[0]?.ready === true;
}

export async function collectUltimateB2PublicationSources(sql) {
  const activityIds = [...ULTIMATE_B2_OPEN_RESPONSE_ACTIVITY_IDS].sort();
  const rows = await sql`
    select
      coalesce((select jsonb_agg(jsonb_build_object(
        'document_type',document.document_type,'document_key',document.document_key,'schema_version',document.schema_version,
        'revision',document.revision,'payload',document.payload,'payload_sha256',document.payload_sha256
      ) order by document.document_type,document.document_key)
      from builder_component_documents document
      where document.book_component_id=component.id and (
        (document.document_type='hotspots' and document.document_key='default')
        or (document.document_type='activity_lifecycle' and document.document_key='default')
        or (document.document_type='teacher_ui' and document.document_key='default')
        or (document.document_type='open_response' and document.document_key in (select jsonb_array_elements_text(${JSON.stringify(activityIds)}::jsonb)))
      )), '[]'::jsonb) as documents,
      coalesce((select jsonb_agg(jsonb_build_object(
        'activity_key',current.activity_key,'revision',current.revision,'fingerprint_sha256',current.fingerprint_sha256,
        'public_projection',current.public_projection,'teacher_projection',current.teacher_projection,'updated_at',current.updated_at
      ) order by current.activity_key)
      from builder_open_response_imports current
      where current.book_component_id=component.id and current.activity_key in (select jsonb_array_elements_text(${JSON.stringify(activityIds)}::jsonb))), '[]'::jsonb) as imports
    from book_packages package join book_components component on component.book_package_id=package.id
    where package.slug='ultimate-b2' and component.slug='ultimate-b2-students-book'
    limit 1
  `;
  if (!rows[0]) throw new Error("Publication component is unavailable");
  const documentRows = new Map(rows[0].documents.map((row) => [`${row.document_type}/${row.document_key}`, row]));
  const importRows = new Map(rows[0].imports.map((row) => [row.activity_key, row]));
  const hotspotsResource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "hotspots");
  const lifecycleResource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "activity-lifecycle");
  const teacherUiResource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "ui-controller");
  const openResponse = {};
  const imports = {};
  for (const activityId of activityIds) {
    const resource = await resolveBuilderContentResource("ultimate-b2", "ultimate-b2-students-book", "open-response", activityId);
    const stored = document(documentRows.get(`open_response/${activityId}`), resource);
    if (stored) openResponse[activityId] = stored;
    const imported = importRows.get(activityId);
    if (imported) imports[activityId] = { revision: Number(imported.revision), fingerprint: imported.fingerprint_sha256, publicProjection: imported.public_projection, teacherProjection: imported.teacher_projection, updatedAt: imported.updated_at };
  }
  return {
    documents: {
      hotspots: document(documentRows.get("hotspots/default"), hotspotsResource),
      activityLifecycle: document(documentRows.get("activity_lifecycle/default"), lifecycleResource),
      teacherUi: document(documentRows.get("teacher_ui/default"), teacherUiResource),
      openResponse,
    },
    imports,
  };
}

function releaseMetadata(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: Number(row.release_number),
    compilerId: row.compiler_id,
    releaseSchemaVersion: row.release_schema_version,
    releaseSha256: row.release_sha256,
    sourceSnapshotSha256: row.source_snapshot_sha256,
    compatibility: row.runtime_compatibility_sha256,
    createdAt: row.created_at,
    releaseNote: row.release_note || "",
  };
}

export async function createComponentRelease(sql, input) {
  const rows = await sql`select * from create_builder_component_release(
    ${input.bookSlug},${input.componentSlug},${input.releaseSchemaVersion},${input.compilerId},${input.compatibility},
    ${JSON.stringify(input.sourceSnapshot)}::jsonb,${input.sourceSnapshotSha256},
    ${JSON.stringify(input.publicProjection)}::jsonb,${input.publicProjectionSha256},
    ${JSON.stringify(input.teacherProjection)}::jsonb,${input.teacherProjectionSha256},
    ${JSON.stringify(input.assetManifest)}::jsonb,${input.releaseSha256},${input.requestSha256},${input.releaseNote},
    ${input.builderUserId}::uuid,${input.clientMutationId}::uuid
  )`;
  const row = rows[0];
  if (!row) throw new Error("Release creation returned no result");
  return { outcome: row.outcome, releaseId: row.release_id, releaseNumber: row.release_number === null ? null : Number(row.release_number), releaseSha256: row.release_sha256 };
}

export async function publishComponentRelease(sql, input) {
  const rows = await sql`select * from publish_builder_component_release(
    ${input.bookSlug},${input.componentSlug},${input.releaseId}::uuid,${input.expectedHeadRevision},${input.requestSha256},${input.builderUserId}::uuid,${input.clientMutationId}::uuid
  )`;
  const row = rows[0];
  if (!row) throw new Error("Release publication returned no result");
  return { outcome: row.outcome, releaseId: row.release_id, releaseNumber: row.release_number === null ? null : Number(row.release_number), headRevision: row.head_revision === null ? null : Number(row.head_revision), previousReleaseId: row.previous_release_id, publishedAt: row.published_at };
}

export async function loadComponentPublicationStatus(sql, bookSlug, componentSlug) {
  const rows = await sql`
    select release.*, head.release_id=release.id as is_current, head.head_revision, head.published_at,
      event.published_at as last_published_at
    from book_packages package join book_components component on component.book_package_id=package.id
    left join book_component_releases release on release.book_component_id=component.id
    left join book_component_publication_heads head on head.book_component_id=component.id
    left join lateral (select published_at from book_component_publication_events e where e.release_id=release.id order by e.id desc limit 1) event on true
    where package.slug=${bookSlug} and component.slug=${componentSlug}
    order by release.release_number desc nulls last limit 20
  `;
  const releases = rows.filter((row) => row.id).map((row) => ({ ...releaseMetadata(row), current: row.is_current === true, publishedAt: row.last_published_at || null }));
  const headRow = rows.find((row) => row.is_current === true);
  return { headRevision: headRow ? Number(headRow.head_revision) : 0, published: headRow ? { ...releaseMetadata(headRow), publishedAt: headRow.published_at } : null, releases };
}

export async function loadComponentRelease(sql, { bookSlug, componentSlug, releaseId, activeOnly = false }) {
  const rows = await sql`
    select release.*, head.release_id=release.id as is_current, head.head_revision, head.published_at
    from book_component_releases release
    join book_packages package on package.id=release.book_package_id
    join book_components component on component.id=release.book_component_id and component.book_package_id=package.id
    left join book_component_publication_heads head on head.book_component_id=component.id
    where package.slug=${bookSlug} and component.slug=${componentSlug} and release.id=${releaseId}::uuid
      and (${activeOnly}::boolean=false or head.release_id=release.id)
    limit 1
  `;
  return rows[0] || null;
}

export async function loadComponentPublicationMutation(sql, { bookSlug, componentSlug, clientMutationId }) {
  const rows = await sql`
    select mutation.release_id,mutation.request_sha256,mutation.outcome,mutation.resulting_head_revision
    from book_component_publication_mutations mutation
    join book_components component on component.id=mutation.book_component_id
    join book_packages package on package.id=component.book_package_id
    where package.slug=${bookSlug} and component.slug=${componentSlug} and mutation.client_mutation_id=${clientMutationId}::uuid
    limit 1
  `;
  return rows[0] || null;
}

export async function loadActiveComponentRelease(sql, { bookSlug, componentSlug }) {
  const rows = await sql`
    select release.*,head.head_revision,head.published_at
    from book_component_publication_heads head
    join book_component_releases release on release.id=head.release_id and release.book_component_id=head.book_component_id
    join book_packages package on package.id=release.book_package_id
    join book_components component on component.id=release.book_component_id and component.book_package_id=package.id
    where package.slug=${bookSlug} and component.slug=${componentSlug} limit 1
  `;
  return rows[0] || null;
}
