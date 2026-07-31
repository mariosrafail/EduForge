import { createSafePool } from "./_staging-db.mjs";

const { pool, safeLabel } = createSafePool("test");
try {
  const rows = (await pool.query(
    "select nspname from pg_namespace where nspname like 'eduforge_test_%' order by nspname",
  )).rows;
  for (const { nspname } of rows) {
    if (!/^eduforge_test_[a-f0-9]+$/.test(nspname)) {
      throw new Error(`Refusing to remove unexpected integration schema name: ${nspname}`);
    }
    await pool.query(`drop schema "${nspname}" cascade`);
  }
  const roles = (await pool.query(
    "select rolname from pg_roles where rolname like 'runtime_role_%' order by rolname",
  )).rows;
  for (const { rolname } of roles) {
    if (!/^runtime_role_[a-f0-9]{12}$/.test(rolname)) {
      throw new Error(`Refusing to remove unexpected integration role name: ${rolname}`);
    }
    await pool.query(`drop owned by "${rolname}" cascade`);
    await pool.query(`drop role "${rolname}"`);
  }
  console.log(`Removed ${rows.length} temporary integration schema(s) and ${roles.length} runtime role(s) from isolated test target ${safeLabel}.`);
} finally {
  await pool.end();
}
