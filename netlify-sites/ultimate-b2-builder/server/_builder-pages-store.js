function normalizeBuilderPageRevision(value, { nullable }) {
  if (value === null && nullable) return null;
  const normalized = typeof value === "number"
    ? value
    : typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new Error("invalid_builder_page_revision");
  }
  return normalized;
}

function normalizeRevisionField(row, field, options = { nullable: true }) {
  return row ? { ...row, [field]: normalizeBuilderPageRevision(row[field], options) } : null;
}

export async function loadBuilderPages(sql, { bookSlug, componentSlug }) {
  const components = await sql`
    select component.id,coalesce(revision.revision,0) revision
    from book_packages package join book_components component on component.book_package_id=package.id
    left join builder_component_page_revisions revision on revision.book_component_id=component.id
    where package.slug=${bookSlug} and component.slug=${componentSlug} limit 1
  `;
  if (!components[0]) return null;
  const units = await sql`
    select unit.id,unit.slug,unit.title,unit.unit_number,unit.sort_order
    from units unit
    where unit.book_component_id=${components[0].id}
      and unit.unit_number between 1 and 10
    order by unit.sort_order,unit.unit_number,unit.slug
  `;
  const rows = await sql`
    select page.id,page.stable_key,page.label,page.sort_order,page.source_metadata,page.unit_id,
      unit.slug unit_slug,unit.title unit_title,unit.unit_number,unit.sort_order unit_sort_order,
      asset.id asset_id,package.slug book_slug,component.slug component_slug,
      asset.book_package_id,asset.book_component_id,asset.object_key,asset.asset_role,asset.storage_profile,asset.storage_bucket,
      asset.publication_status,asset.access_level,asset.mime_type,asset.byte_size,asset.checksum_sha256,asset.width,asset.height
    from book_pages page
    join book_packages package on package.id=page.book_package_id
    join book_components component on component.id=page.book_component_id and component.book_package_id=package.id
    left join lateral (
      select candidate.* from book_assets candidate
      where candidate.page_id=page.id and candidate.asset_role='page_image' and candidate.publication_status='draft'
      order by candidate.updated_at desc limit 1
    ) asset on true
    left join units unit on unit.id=page.unit_id and unit.book_component_id=page.book_component_id
    where package.slug=${bookSlug} and component.slug=${componentSlug}
      and page.stable_key like ${`${componentSlug}/pages/%`}
    order by unit.sort_order nulls last,page.sort_order,page.stable_key
  `;
  return { revision: normalizeBuilderPageRevision(components[0].revision, { nullable: false }), units, rows };
}

export async function prepareBuilderPageUpload(sql, input) {
  const rows = await sql`select * from prepare_builder_component_page_upload(
    ${input.bookSlug},${input.componentSlug},${input.pageKey},${input.mode},${input.expectedRevision},
    ${input.clientMutationId}::uuid,${input.uploadId}::uuid,${input.requestSha256},${JSON.stringify(input.pageMetadata)}::jsonb,
    ${JSON.stringify(input.fileDescriptor)}::jsonb,${input.stagingObjectKey},${input.builderUserId}::uuid,${input.expiresAt}
  )`;
  return normalizeRevisionField(rows[0] || null, "current_revision");
}

export async function claimBuilderPageUpload(sql, input) {
  const rows = await sql`select * from claim_builder_component_page_upload(${input.uploadId}::uuid,${input.expectedRevision},${input.clientMutationId}::uuid,${input.builderUserId}::uuid)`;
  return normalizeRevisionField(rows[0] || null, "current_revision");
}

export async function completeBuilderPageUpload(sql, input) {
  const rows = await sql`select * from complete_builder_component_page_upload(
    ${input.uploadId}::uuid,${input.builderUserId}::uuid,${input.objectKey},${input.storageBucket},${input.mimeType},
    ${input.byteSize},${input.checksumSha256},${input.width},${input.height}
  )`;
  return normalizeRevisionField(rows[0] || null, "revision", { nullable: false });
}

export async function failBuilderPageUpload(sql, input) {
  const rows = await sql`select fail_builder_component_page_upload(${input.uploadId}::uuid,${input.builderUserId}::uuid,${input.failureCode}) failed`;
  return rows[0]?.failed === true;
}

export async function mutateBuilderPage(sql, input) {
  const rows = await sql`select * from mutate_builder_component_page(
    ${input.bookSlug},${input.componentSlug},${input.pageKey},${input.action},${input.expectedRevision},
    ${input.clientMutationId}::uuid,${JSON.stringify(input.pageMetadata)}::jsonb,${input.builderUserId}::uuid
  )`;
  return normalizeRevisionField(rows[0] || null, "current_revision");
}

export async function loadBuilderPageAsset(sql, { bookSlug, componentSlug, pageKey, assetId }) {
  const rows = await sql`
    select asset.* from book_assets asset
    join book_pages page on page.id=asset.page_id and page.book_package_id=asset.book_package_id
    join book_packages package on package.id=asset.book_package_id
    join book_components component on component.id=asset.book_component_id and component.book_package_id=package.id
    where package.slug=${bookSlug} and component.slug=${componentSlug} and page.stable_key=${pageKey}
      and asset.id=${assetId}::uuid and asset.asset_role='page_image' and asset.publication_status='draft'
      and asset.storage_profile='private' and asset.access_level='internal' limit 1
  `;
  return rows[0] || null;
}
