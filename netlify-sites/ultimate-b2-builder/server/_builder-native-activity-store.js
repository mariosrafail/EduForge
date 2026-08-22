export async function createBuilderNativeActivity(sql, input) {
  if (typeof sql !== "function") throw new Error("Native activity creation requires PostgreSQL");
  const rows = await sql`
    select * from create_builder_native_activity(
      ${input.bookSlug}, ${input.componentSlug}, ${input.activityId}, ${input.kind},
      ${input.expectedIndexRevision}, ${JSON.stringify(input.indexDocument)}::jsonb, ${input.indexSha256},
      ${JSON.stringify(input.publicDocument)}::jsonb, ${input.publicSha256},
      ${JSON.stringify(input.teacherDocument)}::jsonb, ${input.teacherSha256},
      ${input.schemaVersion}, ${input.requestSha256}, ${input.builderUserId}::uuid, ${input.clientMutationId}::uuid
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("Native activity creation returned no result");
  return {
    outcome: row.outcome,
    activityId: row.activity_id || null,
    indexRevision: row.index_revision === null ? null : Number(row.index_revision),
    publicRevision: row.public_revision === null ? null : Number(row.public_revision),
    teacherRevision: row.teacher_revision === null ? null : Number(row.teacher_revision),
  };
}

export async function loadBuilderNativeActivityIds(sql, { bookSlug, componentSlug }) {
  const rows = await sql`
    select document.document_key as activity_id
    from builder_component_documents document
    join book_components component on component.id=document.book_component_id
      and component.book_package_id=document.book_package_id
    join book_packages package on package.id=document.book_package_id
    where package.slug=${bookSlug} and component.slug=${componentSlug}
      and document.document_type='native_activity_public'
    order by document.document_key
  `;
  return rows.map((row) => row.activity_id);
}

export async function deleteBuilderNativeActivity(sql, input) {
  const rows = await sql`
    select * from delete_builder_native_activity(
      ${input.bookSlug},${input.componentSlug},${input.activityId},
      ${input.expectedIndexRevision},${JSON.stringify(input.indexDocument)}::jsonb,${input.indexSha256},${input.indexSchemaVersion},
      ${input.expectedHotspotRevision},${JSON.stringify(input.hotspotDocument)}::jsonb,${input.hotspotSha256},${input.hotspotSchemaVersion},
      ${input.hotspotChanged},${input.removedHotspotCount},${input.requestSha256},
      ${input.builderUserId}::uuid,${input.clientMutationId}::uuid
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("Native activity deletion returned no result");
  return {
    outcome: row.outcome,
    activityId: row.activity_id || null,
    indexRevision: row.index_revision === null ? null : Number(row.index_revision),
    hotspotRevision: row.hotspot_revision === null ? null : Number(row.hotspot_revision),
    removedHotspotCount: row.removed_hotspot_count === null ? null : Number(row.removed_hotspot_count),
  };
}

export async function saveBuilderNativeActivityPair(sql, input) {
  const rows = await sql`
    select * from save_builder_native_activity_pair(
      ${input.bookSlug},${input.componentSlug},${input.activityId},${input.schemaVersion},
      ${input.expectedPublicRevision},${input.expectedTeacherRevision},
      ${JSON.stringify(input.publicDocument)}::jsonb,${input.publicSha256},
      ${JSON.stringify(input.teacherDocument)}::jsonb,${input.teacherSha256},
      ${input.requestSha256},${input.builderUserId}::uuid,${input.clientMutationId}::uuid
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("Native activity pair save returned no result");
  return {
    outcome: row.outcome,
    publicRevision: row.public_revision === null ? null : Number(row.public_revision),
    teacherRevision: row.teacher_revision === null ? null : Number(row.teacher_revision),
    currentPublicRevision: row.current_public_revision === null ? null : Number(row.current_public_revision),
    currentTeacherRevision: row.current_teacher_revision === null ? null : Number(row.current_teacher_revision),
  };
}

export async function prepareBuilderNativeAssetUpload(sql, input) {
  const rows = await sql`select * from prepare_builder_native_asset_upload(
    ${input.bookSlug},${input.componentSlug},${input.activityId},${input.assetSlot},
    ${input.clientMutationId}::uuid,${input.uploadId}::uuid,${input.requestSha256},
    ${JSON.stringify(input.fileDescriptor)}::jsonb,${input.stagingObjectKey},${input.builderUserId}::uuid,${input.expiresAt}
  )`;
  const row = rows[0];
  return row ? { outcome: row.outcome, uploadId: row.upload_id, state: row.session_state, fileDescriptor: row.file_descriptor, stagingObjectKey: row.staging_object_key } : null;
}

export async function claimBuilderNativeAssetUpload(sql, input) {
  const rows = await sql`select * from claim_builder_native_asset_upload(${input.uploadId}::uuid,${input.clientMutationId}::uuid,${input.builderUserId}::uuid)`;
  const row = rows[0];
  return row ? {
    outcome: row.outcome, bookPackageId: row.book_package_id, bookComponentId: row.book_component_id,
    activityId: row.activity_id, assetSlot: row.asset_slot, fileDescriptor: row.file_descriptor,
    stagingObjectKey: row.staging_object_key, resultingAssetId: row.resulting_asset_id,
  } : null;
}

export async function completeBuilderNativeAssetUpload(sql, input) {
  const rows = await sql`select complete_builder_native_asset_upload(
    ${input.uploadId}::uuid,${input.builderUserId}::uuid,${input.objectKey},${input.storageBucket},
    ${input.mimeType},${input.byteSize},${input.checksumSha256},${input.width},${input.height}
  ) as asset_id`;
  return rows[0]?.asset_id || null;
}

export async function failBuilderNativeAssetUpload(sql, input) {
  await sql`select fail_builder_native_asset_upload(${input.uploadId}::uuid,${input.builderUserId}::uuid,${input.failureCode})`;
}

export async function loadBuilderNativeAsset(sql, { bookSlug, componentSlug, activityId, assetId }) {
  const rows = await sql`
    select asset.id,asset.checksum_sha256,asset.asset_role,asset.object_key,asset.storage_profile,
      asset.storage_bucket,asset.mime_type,asset.byte_size,asset.width,asset.height,asset.publication_status,asset.access_level,
      asset.source_metadata
    from book_assets asset
    join book_packages package on package.id=asset.book_package_id
    join book_components component on component.id=asset.book_component_id and component.book_package_id=package.id
    where package.slug=${bookSlug} and component.slug=${componentSlug} and asset.id=${assetId}::uuid
      and asset.source_metadata->>'native_activity_id'=${activityId}
    limit 1
  `;
  return rows[0] || null;
}

export function isBuilderNativeDraftAssetRecord(asset, { activityId, reference = null }) {
  if (!asset || asset.publication_status !== "draft" || asset.access_level !== "internal" || asset.storage_profile !== "private"
    || asset.source_metadata?.native_activity_id !== activityId) return false;
  if (!reference) return true;
  return String(asset.id) === reference.assetId
    && asset.checksum_sha256 === reference.checksumSha256
    && asset.asset_role === reference.role
    && asset.source_metadata?.asset_slot === reference.slot;
}

export async function validateBuilderNativeAssetReferences(sql, { bookSlug, componentSlug, activityId, assets, requirements = [] }) {
  if (!assets.length) return true;
  const ids = assets.map((asset) => asset.assetId);
  const rows = await sql`
    select asset.id,asset.checksum_sha256,asset.asset_role,asset.publication_status,asset.access_level,asset.storage_profile,asset.source_metadata,asset.mime_type,asset.width,asset.height
    from book_assets asset
    join book_packages package on package.id=asset.book_package_id
    join book_components component on component.id=asset.book_component_id and component.book_package_id=package.id
    where package.slug=${bookSlug} and component.slug=${componentSlug} and asset.id=any(${ids}::uuid[])
  `;
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  for (const reference of assets) {
    const asset = byId.get(reference.assetId);
    if (!asset || asset.checksum_sha256 !== reference.checksumSha256 || asset.asset_role !== reference.role
      || asset.publication_status !== "draft" || asset.access_level !== "internal" || asset.storage_profile !== "private"
      || asset.source_metadata?.native_activity_id !== activityId || asset.source_metadata?.asset_slot !== reference.slot) {
      throw new Error("Native managed asset reference is not owned by this activity.");
    }
  }
  for (const requirement of requirements) {
    const reference = assets.find((asset) => asset.slot === requirement.slot);
    const asset = reference ? byId.get(reference.assetId) : null;
    if (!asset || (requirement.mediaType && asset.mime_type !== requirement.mediaType)) throw new Error(`${requirement.label || "Native managed asset"} media type does not match its managed asset.`);
    if ((requirement.width !== undefined || requirement.height !== undefined)
      && (Number(asset.width) !== requirement.width || Number(asset.height) !== requirement.height)) throw new Error(`${requirement.label || "Native managed image"} dimensions do not match its managed asset.`);
  }
  return true;
}
