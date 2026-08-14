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
