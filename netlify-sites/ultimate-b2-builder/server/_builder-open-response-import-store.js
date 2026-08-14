export async function prepareOpenResponseImportSession(sql, input) {
  const rows = await sql`
    select * from prepare_builder_open_response_import(
      ${input.bookSlug},${input.componentSlug},${input.activityId},${input.expectedRevision},
      ${input.clientMutationId}::uuid,${input.uploadId}::uuid,${input.requestSha256},
      ${JSON.stringify(input.fileDescriptors)}::jsonb,${input.builderUserId}::uuid,${input.expiresAt}
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("Open Response import preparation returned no result");
  return { outcome: row.outcome, uploadId: row.upload_id, currentRevision: row.current_revision === null ? null : Number(row.current_revision), state: row.session_state, fileDescriptors: row.file_descriptors || null };
}

export async function claimOpenResponseImportSession(sql, input) {
  const rows = await sql`select * from claim_builder_open_response_import(${input.uploadId}::uuid,${input.expectedRevision},${input.clientMutationId}::uuid,${input.builderUserId}::uuid)`;
  const row = rows[0];
  if (!row) throw new Error("Open Response import claim returned no result");
  return { outcome: row.outcome, currentRevision: row.current_revision === null ? null : Number(row.current_revision), state: row.session_state, activityId: row.activity_key, fileDescriptors: row.file_descriptors || null };
}

export async function commitOpenResponseImport(sql, input) {
  const rows = await sql`
    select * from commit_builder_open_response_import(
      ${input.uploadId}::uuid,${input.expectedRevision},${input.clientMutationId}::uuid,
      ${input.fingerprint},${JSON.stringify(input.publicProjection)}::jsonb,
      ${JSON.stringify(input.teacherProjection)}::jsonb,${JSON.stringify(input.archiveManifest)}::jsonb,
      ${input.builderUserId}::uuid
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("Open Response import commit returned no result");
  return { outcome: row.outcome, revision: row.saved_revision === null ? null : Number(row.saved_revision), currentRevision: row.current_revision === null ? null : Number(row.current_revision), fingerprint: row.fingerprint_sha256 || null };
}

export async function failOpenResponseImportSession(sql, { uploadId, builderUserId, failureCode }) {
  await sql`select fail_builder_open_response_import(${uploadId}::uuid,${builderUserId}::uuid,${failureCode})`;
}

export async function loadCurrentOpenResponseImport(sql, activityId) {
  const rows = await sql`
    select current.revision,current.fingerprint_sha256,current.public_projection,current.teacher_projection,current.updated_at
    from builder_open_response_imports current
    join book_components component on component.id=current.book_component_id and component.book_package_id=current.book_package_id
    join book_packages package on package.id=current.book_package_id
    where package.slug='ultimate-b2' and component.slug='ultimate-b2-students-book' and current.activity_key=${activityId}
    limit 1
  `;
  if (!rows[0]) return null;
  return { revision: Number(rows[0].revision), fingerprint: rows[0].fingerprint_sha256, publicProjection: rows[0].public_projection, teacherProjection: rows[0].teacher_projection, updatedAt: rows[0].updated_at };
}
