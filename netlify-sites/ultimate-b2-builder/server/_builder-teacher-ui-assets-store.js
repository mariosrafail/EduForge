export async function prepareTeacherUiAssetUploadSession(sql, input) {
  const rows = await sql`
    select * from prepare_builder_teacher_ui_asset_upload(
      ${input.bookSlug},${input.componentSlug},${input.expectedRevision},
      ${input.clientMutationId}::uuid,${input.uploadId}::uuid,${input.requestSha256},
      ${JSON.stringify(input.fileDescriptors)}::jsonb,${input.builderUserId}::uuid,${input.expiresAt}
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("Teacher UI upload preparation returned no result");
  return { outcome: row.outcome, uploadId: row.upload_id, currentRevision: row.current_revision === null ? null : Number(row.current_revision), state: row.session_state, fileDescriptors: row.file_descriptors || null };
}

export async function claimTeacherUiAssetUploadSession(sql, input) {
  const rows = await sql`select * from claim_builder_teacher_ui_asset_upload(${input.uploadId}::uuid,${input.expectedRevision},${input.clientMutationId}::uuid,${input.builderUserId}::uuid)`;
  const row = rows[0];
  if (!row) throw new Error("Teacher UI upload claim returned no result");
  return { outcome: row.outcome, currentRevision: row.current_revision === null ? null : Number(row.current_revision), state: row.session_state, fileDescriptors: row.file_descriptors || null, validatedAssets: row.validated_assets || null };
}

export async function completeTeacherUiAssetUploadSession(sql, { uploadId, builderUserId, validatedAssets }) {
  const rows = await sql`select complete_builder_teacher_ui_asset_upload(${uploadId}::uuid,${builderUserId}::uuid,${JSON.stringify(validatedAssets)}::jsonb) as completed`;
  if (!rows[0]?.completed) throw new Error("Teacher UI upload could not be completed");
}

export async function failTeacherUiAssetUploadSession(sql, { uploadId, builderUserId, failureCode }) {
  await sql`select fail_builder_teacher_ui_asset_upload(${uploadId}::uuid,${builderUserId}::uuid,${failureCode})`;
}

export async function loadValidatedTeacherUiAssetCandidates(sql, { uploadIds, builderUserId }) {
  if (!uploadIds.length) return [];
  const rows = await sql`
    select id,state,expected_revision,validated_assets
    from builder_teacher_ui_asset_upload_sessions
    where id=any(${uploadIds}::uuid[])
      and created_by_builder_user_id=${builderUserId}::uuid
      and state in ('validated','saved')
  `;
  return rows.map((row) => ({ id: row.id, state: row.state, expectedRevision: Number(row.expected_revision), validatedAssets: row.validated_assets }));
}

export async function markTeacherUiAssetCandidatesSaved(sql, { uploadIds, builderUserId, resultingRevision }) {
  if (!uploadIds.length) return;
  await sql`
    update builder_teacher_ui_asset_upload_sessions
    set state='saved',resulting_document_revision=${resultingRevision},updated_at=now()
    where id=any(${uploadIds}::uuid[])
      and created_by_builder_user_id=${builderUserId}::uuid
      and state in ('validated','saved')
  `;
}
