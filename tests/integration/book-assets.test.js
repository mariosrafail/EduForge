import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { getBookAssetAccess } from "../../netlify/functions/_book-asset-access.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL || "";
const integrationEnabled = Boolean(testDatabaseUrl && process.env.TEST_DATABASE_CONFIRMATION === "isolated-test-database");
const { Pool } = pg;

function scopedDatabaseUrl(baseUrl, schema) { const url = new URL(baseUrl); url.searchParams.set("options", `-c search_path=${schema}`); return url.toString(); }
function postgresTemplate(pool) { return async (strings, ...values) => { let text = strings[0]; for (let index = 0; index < values.length; index += 1) text += `$${index + 1}${strings[index + 1]}`; return (await pool.query(text, values)).rows; }; }

test("book asset relationships, version constraints, and entitlement delivery are enforced", { skip: !integrationEnabled, timeout: 120_000 }, async (t) => {
  assert.notEqual(testDatabaseUrl, process.env.DATABASE_URL);
  const schema = `eduforge_assets_${randomBytes(6).toString("hex")}`;
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  await adminPool.query(`create schema "${schema}"`);
  const pool = new Pool({ connectionString: scopedDatabaseUrl(testDatabaseUrl, schema) });
  t.after(async () => { await pool.end(); await adminPool.query(`drop schema if exists "${schema}" cascade`); await adminPool.end(); });
  const migrations = (await readdir("database")).filter((name) => /^\d+.*\.sql$/.test(name) && name !== "012_demo_login_passwords.sql").sort((a, b) => a.localeCompare(b));
  for (const migration of migrations) await pool.query(await readFile(`database/${migration}`, "utf8"));

  const packageRow = (await pool.query("select id from book_packages where slug='ultimate-b2'")).rows[0];
  const component = (await pool.query("select id from book_components where book_package_id=$1 and slug='ultimate-b2-students-book'", [packageRow.id])).rows[0];
  const unit = (await pool.query("select id from units where book_component_id=$1 and slug='unit-2'", [component.id])).rows[0];
  const edition = (await pool.query("insert into book_editions(book_package_id,edition_identifier,status) values($1,'integration','published') returning id", [packageRow.id])).rows[0];
  const page = (await pool.query("insert into book_pages(book_package_id,book_component_id,unit_id,stable_key,page_number) values($1,$2,$3,'students-book/unit-2/page-20',20) returning id", [packageRow.id, component.id, unit.id])).rows[0];
  const assetValues = [packageRow.id, edition.id, component.id, unit.id, page.id, "ultimate-b2.students-book.unit-2.integration-page", "page_image", "publishers/hamilton-house/books/ultimate-b2/integration/page.aaaaaaaaaaaa.webp", "private", "integration-private", "image/webp", 100, "a".repeat(64), "integration", "1.0.0", "published", "entitled"];
  const asset = (await pool.query("insert into book_assets(book_package_id,edition_id,book_component_id,unit_id,page_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,edition_identifier,version,publication_status,access_level) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id", assetValues)).rows[0];

  await t.test("duplicate active logical versions and invalid checksums are rejected", async () => {
    const duplicate = [...assetValues]; duplicate[7] = "publishers/hamilton-house/books/ultimate-b2/integration/page-b.aaaaaaaaaaaa.webp";
    await assert.rejects(() => pool.query("insert into book_assets(book_package_id,edition_id,book_component_id,unit_id,page_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,edition_identifier,version,publication_status,access_level) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)", duplicate), (error) => error.code === "23505");
    const invalid = [...assetValues]; invalid[5] = "ultimate-b2.invalid-checksum"; invalid[7] = "publishers/hamilton-house/books/ultimate-b2/integration/invalid.webp"; invalid[12] = "not-a-checksum";
    await assert.rejects(() => pool.query("insert into book_assets(book_package_id,edition_id,book_component_id,unit_id,page_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,edition_identifier,version,publication_status,access_level) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)", invalid), (error) => error.code === "23514");
  });

  await t.test("package/component relationships cannot cross", async () => {
    const publisher = (await pool.query("select publisher_id from book_packages where id=$1", [packageRow.id])).rows[0];
    const foreignPackage = (await pool.query("insert into book_packages(publisher_id,title,slug,level,status) values($1,'Foreign Book',$2,'B2','active') returning id", [publisher.publisher_id, `foreign-${schema}`])).rows[0];
    const foreignEdition = (await pool.query("insert into book_editions(book_package_id,edition_identifier) values($1,'integration') returning id", [foreignPackage.id])).rows[0];
    const invalid = [...assetValues]; invalid[0] = foreignPackage.id; invalid[1] = foreignEdition.id; invalid[4] = null; invalid[5] = "foreign.invalid"; invalid[7] = "publishers/foreign/books/foreign/integration/invalid.webp";
    await assert.rejects(() => pool.query("insert into book_assets(book_package_id,edition_id,book_component_id,unit_id,page_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,edition_identifier,version,publication_status,access_level) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)", invalid), /component does not belong to package/);
  });

  const schools = (await pool.query("insert into schools(name) values('Asset School A'),('Asset School B') returning id,name")).rows;
  const schoolA = schools.find((row) => row.name.endsWith("A")).id;
  const schoolB = schools.find((row) => row.name.endsWith("B")).id;
  const users = (await pool.query("insert into app_users(school_id,full_name,email,role,status) values($1,'Student A',$3,'student','active'),($2,'Student B',$4,'student','active') returning id,school_id", [schoolA, schoolB, `a-${schema}@test.invalid`, `b-${schema}@test.invalid`])).rows;
  const userA = users.find((row) => row.school_id === schoolA); const userB = users.find((row) => row.school_id === schoolB);
  await pool.query("insert into book_access(user_id,book_package_id,role_scope) values($1,$2,'student')", [userA.id, packageRow.id]);
  const storage = { config: { signedUrlTtlSeconds: 60 }, signedGetUrl: async () => "https://signed.invalid/page", publicUrl: () => "https://public.invalid/page" };
  const sql = postgresTemplate(pool);

  await t.test("student entitlement permits only its package and school identity", async () => {
    const granted = await getBookAssetAccess(sql, { id: userA.id, school_id: schoolA, role: "student" }, { assetId: asset.id }, { storage });
    assert.equal(granted.statusCode, 200);
    const crossSchool = await getBookAssetAccess(sql, { id: userB.id, school_id: schoolB, role: "student" }, { assetId: asset.id }, { storage });
    assert.equal(crossSchool.statusCode, 404);
  });

  await t.test("draft and archived assets are denied", async () => {
    await pool.query("update book_assets set publication_status='draft' where id=$1", [asset.id]);
    assert.equal((await getBookAssetAccess(sql, { id: userA.id, school_id: schoolA }, { assetId: asset.id }, { storage })).statusCode, 404);
    await pool.query("update book_assets set publication_status='archived' where id=$1", [asset.id]);
    assert.equal((await getBookAssetAccess(sql, { id: userA.id, school_id: schoolA }, { assetId: asset.id }, { storage })).statusCode, 404);
  });
});
