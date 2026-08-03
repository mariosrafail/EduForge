export async function removeAssignmentLifecycleRecords(pool, {
  teacherId,
  titles,
  submissionIds = [],
}) {
  if (!teacherId || !Array.isArray(titles) || titles.length === 0) {
    throw new Error("Assignment lifecycle cleanup requires its exact teacher and titles");
  }
  const ownedSubmissionIds = [...new Set(submissionIds)];
  const client = await pool.connect();
  try {
    await client.query("begin");
    const deletedSubmissions = await client.query(`
      delete from activity_submissions
      where id=any($3::uuid[])
         or activity_assignment_id in (
           select id from activity_assignments where teacher_id=$1 and title=any($2::text[])
         )
      returning id
    `, [teacherId, titles, ownedSubmissionIds]);
    const deletedAssignments = await client.query(
      "delete from activity_assignments where teacher_id=$1 and title=any($2::text[]) returning id",
      [teacherId, titles],
    );
    const remaining = (await client.query(`
      select
        (select count(*)::int from activity_submissions where id=any($3::uuid[])) submissions,
        (select count(*)::int from activity_assignments where teacher_id=$1 and title=any($2::text[])) assignments
    `, [teacherId, titles, ownedSubmissionIds])).rows[0];
    if (Number(remaining.submissions) || Number(remaining.assignments)) {
      throw new Error("Assignment lifecycle cleanup left owned records behind");
    }
    await client.query("commit");
    return { submissions: deletedSubmissions.rowCount, assignments: deletedAssignments.rowCount };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
