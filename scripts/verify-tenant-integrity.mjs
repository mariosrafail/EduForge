import { createSafePool, loadProductionMigrationManifest } from "./_staging-db.mjs";

const { pool, safeLabel } = createSafePool("staging");
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

const relationshipChecks = [
  ["users_without_school", "select count(*)::int as count from app_users where school_id is null"],
  ["classes_with_cross_school_teacher", `select count(*)::int as count from classes c join app_users t on t.id = c.teacher_id where c.school_id is distinct from t.school_id`],
  ["cross_school_class_memberships", `select count(*)::int as count from class_students cs join classes c on c.id = cs.class_id join app_users s on s.id = cs.student_id where c.school_id is distinct from s.school_id`],
  ["activity_assignments_cross_school_class", `select count(*)::int as count from activity_assignments a join classes c on c.id = a.class_id where a.school_id is distinct from c.school_id`],
  ["activity_assignments_cross_school_teacher", `select count(*)::int as count from activity_assignments a join app_users t on t.id = a.teacher_id where a.school_id is distinct from t.school_id`],
  ["activity_assignments_cross_school_student", `select count(*)::int as count from activity_assignments a join app_users s on s.id = a.student_id where a.school_id is distinct from s.school_id`],
  ["legacy_assignments_cross_school_owner", `select count(*)::int as count from assignments a join app_users u on u.id = a.assigned_by where a.school_id is distinct from u.school_id`],
  ["legacy_assignments_cross_school_class", `select count(*)::int as count from assignments a join classes c on a.target_type = 'class' and c.id = a.target_id where a.school_id is distinct from c.school_id`],
  ["legacy_assignments_cross_school_student", `select count(*)::int as count from assignments a join app_users s on a.target_type = 'student' and s.id = a.target_id where a.school_id is distinct from s.school_id`],
  ["activity_submissions_cross_school_student", `select count(*)::int as count from activity_submissions s join app_users u on u.id = s.student_id where s.school_id is distinct from u.school_id`],
  ["activity_submissions_cross_school_assignment", `select count(*)::int as count from activity_submissions s join activity_assignments a on a.id = s.activity_assignment_id where s.school_id is distinct from a.school_id`],
  ["lesson_submissions_cross_school_student", `select count(*)::int as count from lesson_submissions s join app_users u on u.id = s.student_id where s.school_id is distinct from u.school_id`],
  ["lessons_cross_school_course", `select count(*)::int as count from lessons l join courses c on c.id = l.course_id where l.school_id is distinct from c.school_id`],
  ["lesson_activities_cross_school_lesson", `select count(*)::int as count from lesson_activities a join lessons l on l.id = a.lesson_id where a.school_id is not null and l.school_id is not null and a.school_id is distinct from l.school_id`],
  ["custom_activities_without_creator", `select count(*)::int as count from activities where ownership_type = 'custom' and created_by is null`],
  ["custom_lesson_activities_without_creator", `select count(*)::int as count from lesson_activities where ownership_type = 'custom' and created_by is null`],
  ["custom_hotspots_without_creator", `select count(*)::int as count from book_page_hotspots where created_by is null`],
  ["custom_book_activities_without_creator", `select count(*)::int as count from book_activities where created_by is null`],
  ["custom_media_without_creator", `select count(*)::int as count from book_media_assets where created_by is null`],
  ["custom_activities_cross_school_creator", `select count(*)::int as count from activities a join app_users u on u.id = a.created_by where a.ownership_type = 'custom' and a.school_id is distinct from u.school_id`],
  ["custom_lesson_activities_cross_school_creator", `select count(*)::int as count from lesson_activities a join app_users u on u.id = a.created_by where a.ownership_type = 'custom' and a.school_id is distinct from u.school_id`],
  ["custom_hotspots_cross_school_creator", `select count(*)::int as count from book_page_hotspots a join app_users u on u.id = a.created_by where a.school_id is distinct from u.school_id`],
  ["custom_book_activities_cross_school_creator", `select count(*)::int as count from book_activities a join app_users u on u.id = a.created_by where a.school_id is distinct from u.school_id`],
  ["book_access_missing_relationship", `select count(*)::int as count from book_access a left join app_users u on u.id = a.user_id left join book_packages p on p.id = a.book_package_id where u.id is null or p.id is null`],
];

const requiredNotNull = [
  ["app_users", "school_id"], ["classes", "school_id"], ["courses", "school_id"],
  ["assignments", "school_id"], ["activity_assignments", "school_id"],
  ["activity_submissions", "school_id"], ["lesson_submissions", "school_id"],
];

const requiredForeignKeys = [
  ["activity_assignments", "school_id", "schools"], ["lesson_submissions", "school_id", "schools"],
  ["book_page_hotspots", "school_id", "schools"], ["book_media_assets", "school_id", "schools"],
  ["book_activities", "school_id", "schools"], ["courses", "book_package_id", "book_packages"],
  ["lessons", "school_id", "schools"], ["lessons", "created_by", "app_users"],
  ["lesson_activities", "school_id", "schools"], ["lesson_activities", "created_by", "app_users"],
  ["lesson_assignments", "school_id", "schools"], ["lesson_assignments", "lesson_id", "lessons"],
];

const requiredIndexes = [
  "auth_sessions_token_hash_unique_idx", "app_users_school_role_status_idx", "classes_school_teacher_status_idx",
  "activity_assignments_school_teacher_idx", "activity_assignments_school_class_idx",
  "activity_submissions_school_student_idx", "lesson_submissions_school_student_idx",
  "book_access_user_package_idx", "courses_school_package_idx", "lessons_school_course_idx",
  "lesson_activities_school_owner_idx", "activities_school_owner_type_idx",
  "lesson_assignments_student_idx", "lesson_assignments_class_idx", "class_invite_attempts_window_idx",
];

try {
  console.log(`Verifying isolated staging tenant integrity: ${safeLabel}`);
  const migrations = await loadProductionMigrationManifest();
  const history = await pool.query("select filename, checksum_sha256 from eduforge_migration_history");
  const applied = new Map(history.rows.map((row) => [row.filename, row.checksum_sha256]));
  for (const migration of migrations) {
    if (!applied.has(migration.filename)) fail(`migration not recorded: ${migration.filename}`);
    else if (applied.get(migration.filename) !== migration.checksum) fail(`migration checksum mismatch: ${migration.filename}`);
  }

  const tenantRows = await pool.query("select table_name, null_school_rows from tenant_integrity_issues order by table_name");
  const unresolved = tenantRows.rows.filter((row) => Number(row.null_school_rows) > 0);
  if (unresolved.length) {
    for (const row of unresolved) fail(`${row.table_name} has ${row.null_school_rows} unresolved tenant row(s)`);
  } else pass("tenant_integrity_issues contains no unresolved rows");

  for (const [name, sql] of relationshipChecks) {
    const count = Number((await pool.query(sql)).rows[0].count);
    if (count) fail(`${name}: ${count} inconsistent row(s)`);
    else pass(name);
  }

  for (const [table, column] of requiredNotNull) {
    const row = (await pool.query(
      `select is_nullable from information_schema.columns where table_schema = current_schema() and table_name = $1 and column_name = $2`,
      [table, column],
    )).rows[0];
    if (!row || row.is_nullable !== "NO") fail(`${table}.${column} is not enforced NOT NULL`);
    else pass(`${table}.${column} is NOT NULL`);
  }

  for (const [table, column, referencedTable] of requiredForeignKeys) {
    const exists = (await pool.query(`
      select exists (
        select 1
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
        join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
        where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = current_schema()
          and tc.table_name = $1 and kcu.column_name = $2 and ccu.table_name = $3
      ) as exists
    `, [table, column, referencedTable])).rows[0].exists;
    if (!exists) fail(`missing foreign key ${table}.${column} -> ${referencedTable}`);
    else pass(`foreign key ${table}.${column} -> ${referencedTable}`);
  }

  const indexRows = await pool.query("select indexname from pg_indexes where schemaname = current_schema()");
  const indexes = new Set(indexRows.rows.map((row) => row.indexname));
  for (const index of requiredIndexes) {
    if (!indexes.has(index)) fail(`missing critical index ${index}`);
    else pass(`index ${index}`);
  }

  if (failures) throw new Error(`Tenant integrity verification failed with ${failures} issue(s)`);
  console.log("Tenant integrity verification passed.");
} finally {
  await pool.end();
}
