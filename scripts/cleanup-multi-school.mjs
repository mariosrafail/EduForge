import { withAdvisoryLock } from "./_staging-db.mjs";
import { createMultiSchoolPool } from "./_multi-school-db.mjs";
import { MULTI_SCHOOL, MULTI_SCHOOL_CONFIRMATION, MULTI_SCHOOL_SEED_KEY, multiSchoolRegistryEntries } from "./_multi-school-seed-data.mjs";

if (process.env.NODE_ENV === "production") throw new Error("Multi-school demo cleanup is forbidden when NODE_ENV=production");
if (process.env.ALLOW_DEMO_SEED !== "true") throw new Error("ALLOW_DEMO_SEED=true is required");
if (process.env.MULTI_SCHOOL_SEED_CONFIRMATION !== MULTI_SCHOOL_CONFIRMATION) throw new Error(`MULTI_SCHOOL_SEED_CONFIRMATION must equal ${MULTI_SCHOOL_CONFIRMATION}`);

const { pool, safeLabel } = createMultiSchoolPool();
const client = await pool.connect();
try {
  console.log(`Cleaning fictional multi-school data from isolated target: ${safeLabel}`);
  await withAdvisoryLock(client, "eduforge:multi-school-seed", async () => {
    await client.query("begin");
    try {
      const exists = (await client.query("select to_regclass('public.multi_school_seed_registry') is not null exists")).rows[0].exists;
      if (!exists) throw new Error("multi_school_seed_registry is missing; refusing unscoped cleanup");
      const actual = (await client.query("select entity_type,entity_id from multi_school_seed_registry where seed_key=$1 order by entity_type,entity_id", [MULTI_SCHOOL_SEED_KEY])).rows.map((row) => `${row.entity_type}:${row.entity_id}`);
      const expected = multiSchoolRegistryEntries().map(([type, id]) => `${type}:${id}`).sort();
      const rootCount = Number((await client.query("select count(*)::int count from schools where id=any($1::uuid[])", [MULTI_SCHOOL.map((school) => school.id)])).rows[0].count);
      if (!actual.length && rootCount === 0) { await client.query("commit"); return; }
      if (JSON.stringify(actual.sort()) !== JSON.stringify(expected)) throw new Error("Registry does not exactly match expected fictional school roots; refusing cleanup");
      for (const school of MULTI_SCHOOL) {
        const row = (await client.query("select name from schools where id=$1", [school.id])).rows[0];
        if (!row || row.name !== school.name) throw new Error(`School root does not match seed ownership: ${school.id}`);
      }
      await client.query("delete from activation_code_batches where school_id=any($1::uuid[])", [MULTI_SCHOOL.map((school) => school.id)]);
      await client.query("delete from schools where id=any($1::uuid[])", [MULTI_SCHOOL.map((school) => school.id)]);
      await client.query("delete from multi_school_seed_registry where seed_key=$1", [MULTI_SCHOOL_SEED_KEY]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; }
  });
  const remaining = Number((await pool.query("select count(*)::int count from schools where id=any($1::uuid[])", [MULTI_SCHOOL.map((school) => school.id)])).rows[0].count);
  if (remaining) throw new Error(`Cleanup verification found ${remaining} remaining school root(s)`);
  console.log("Fictional multi-school cleanup completed; only registered school roots and their cascaded records were removed.");
} finally { client.release(); await pool.end(); }
