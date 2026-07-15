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
  console.log(`Removed ${rows.length} temporary integration schema(s) from isolated test target ${safeLabel}.`);
} finally {
  await pool.end();
}
