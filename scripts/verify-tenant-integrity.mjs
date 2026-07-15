import { createSafePool, loadProductionMigrationManifest } from "./_staging-db.mjs";
import { relationshipChecks } from "./_tenant-integrity-checks.mjs";

const { pool, safeLabel } = createSafePool("staging");
let failures = 0;

function fail(message) {
  failures += 1;
  console.error(`FAIL: ${message}`);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

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
