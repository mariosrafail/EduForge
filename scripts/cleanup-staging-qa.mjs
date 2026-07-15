import { createSafePool, withAdvisoryLock } from "./_staging-db.mjs";
import { QA, QA_SEED_KEY } from "./_staging-qa-data.mjs";

const { pool, safeLabel } = createSafePool("staging");
const client = await pool.connect();

try {
  console.log(`Cleaning registered QA data from isolated staging target: ${safeLabel}`);
  await withAdvisoryLock(client, "eduforge:staging:qa-seed", async () => {
    await client.query("begin");
    try {
      const registryExists = (await client.query("select to_regclass('public.staging_qa_registry') is not null as exists")).rows[0].exists;
      if (!registryExists) throw new Error("staging_qa_registry does not exist; refusing unscoped cleanup");
      const registeredSchools = await client.query(
        "select entity_id from staging_qa_registry where seed_key = $1 and entity_type = 'school' order by entity_id",
        [QA_SEED_KEY],
      );
      const expectedSchoolIds = new Set(QA.schools.map((school) => school.id));
      if (registeredSchools.rows.length !== expectedSchoolIds.size || registeredSchools.rows.some((row) => !expectedSchoolIds.has(row.entity_id))) {
        throw new Error("QA registry school roots do not match the expected staging seed");
      }
      for (const school of QA.schools) {
        const row = (await client.query("select name from schools where id = $1", [school.id])).rows[0];
        if (row && row.name !== school.name) throw new Error(`School ${school.id} is not the expected QA school`);
      }
      const publisher = (await client.query("select slug from publishers where id = $1", [QA.publisher.id])).rows[0];
      if (publisher && publisher.slug !== QA.publisher.slug) throw new Error("QA publisher ID belongs to unexpected data");

      const schoolIds = QA.schools.map((school) => school.id);
      await client.query("delete from lesson_assignments where school_id = any($1::uuid[])", [schoolIds]);
      await client.query("delete from schools where id = any($1::uuid[])", [schoolIds]);
      await client.query("delete from publishers where id = $1", [QA.publisher.id]);
      await client.query("delete from staging_qa_registry where seed_key = $1", [QA_SEED_KEY]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });

  const remaining = Number((await pool.query(
    `select
      (select count(*) from schools where id = any($1::uuid[])) +
      (select count(*) from app_users where email like 'qa.%@eduforge.invalid') +
      (select count(*) from publishers where id = $2) as count`,
    [QA.schools.map((school) => school.id), QA.publisher.id],
  )).rows[0].count);
  if (remaining) throw new Error(`QA cleanup verification found ${remaining} remaining tagged root/account row(s)`);
  console.log("Staging QA cleanup completed; no QA schools, accounts, or publisher root remain.");
} finally {
  client.release();
  await pool.end();
}
