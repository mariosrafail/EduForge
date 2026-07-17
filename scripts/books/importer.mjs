import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { buildBookAssetObjectKey, ensureSourceWithinRoot } from "../../lib/book-assets/object-keys.js";
import { readBookAssetStorageConfig } from "../../lib/book-assets/config.js";
import { createBookAssetStorage } from "../../lib/book-assets/storage.js";
import { validateBookManifest } from "../../lib/book-assets/manifest.js";
import { createImportVariants, inspectSourceFile } from "./file-inspection.mjs";

const { Client } = pg;

export async function readManifest(manifestPath) {
  const raw = await fs.readFile(manifestPath, "utf8");
  return { manifest: JSON.parse(raw), raw, checksum: createHash("sha256").update(raw).digest("hex") };
}

function findContext(manifest, asset) {
  const component = manifest.components.find((item) => item.id === asset.componentId);
  const unit = component?.units.find((item) => item.id === asset.unitId) || null;
  const page = unit?.pages.find((item) => item.id === asset.pageId) || null;
  const lesson = unit?.lessons.find((item) => item.activities?.some((activityItem) => activityItem.id === asset.activityId)) || null;
  const activity = lesson?.activities.find((item) => item.id === asset.activityId) || null;
  return { component, unit, page, lesson, activity };
}

export async function prepareImportPlan({ manifest, sourceRoot }) {
  const validation = await validateBookManifest(manifest, { sourceRoot, checkFiles: true });
  if (!validation.valid) throw new Error(`Manifest validation failed:\n- ${validation.errors.join("\n- ")}`);
  const plannedAssets = [];
  for (const asset of manifest.assets) {
    const sourcePath = ensureSourceWithinRoot(sourceRoot, asset.source);
    const inspection = await inspectSourceFile(sourcePath, asset.mimeType);
    const variants = await createImportVariants(asset, inspection);
    const context = findContext(manifest, asset);
    for (const variant of variants) {
      const logicalKey = `${asset.logicalKey}${variant.suffix}`;
      const extension = variant.mimeType === "image/webp" ? ".webp" : path.extname(sourcePath).toLowerCase();
      const fileName = `${path.basename(sourcePath, path.extname(sourcePath))}${variant.suffix}${extension}`;
      const objectKey = buildBookAssetObjectKey({
        publisherSlug: manifest.publisher.slug,
        bookSlug: manifest.book.slug,
        edition: manifest.edition.identifier,
        version: manifest.book.version,
        componentSlug: context.component.slug,
        unitSlug: context.unit?.slug,
        pageNumber: context.page?.number,
        activitySlug: context.activity?.slug,
        role: variant.role,
        fileName,
        checksum: variant.checksumSha256,
      });
      plannedAssets.push({ ...asset, ...context, ...variant, id: `${asset.id}${variant.suffix}`, logicalKey, objectKey, sourcePath, sourceAssetLogicalKey: variant.suffix && variant.suffix !== ".source" ? `${asset.logicalKey}.source` : null });
    }
  }
  return plannedAssets;
}

export function assertCompatibleExistingAssets(plannedAssets, existingRows) {
  const existingByKey = new Map(existingRows.map((row) => [row.stable_logical_key, row]));
  for (const asset of plannedAssets) {
    const existing = existingByKey.get(asset.logicalKey);
    if (existing && existing.checksum_sha256 !== asset.checksumSha256) throw new Error(`Logical asset ${asset.logicalKey} changed without a new manifest book version`);
  }
  return existingByKey;
}

export async function cleanupUploadedObjects(storage, uploaded) {
  const removable = uploaded.filter((item) => item.profile !== "archive");
  const results = await Promise.allSettled(removable.map((item) => storage.delete(item)));
  return { removed: results.filter((item) => item.status === "fulfilled").length, failed: results.filter((item) => item.status === "rejected").length, retainedArchive: uploaded.length - removable.length };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function requireStagingEnvironment(environment, confirmation) {
  if (environment !== "staging" || confirmation !== "staging") throw new Error("Writes require --environment staging --confirm-staging; production imports are intentionally unsupported");
}

async function resolveDatabaseContext(client, manifest) {
  const publisher = (await client.query("insert into publishers(name,slug) values($1,$2) on conflict(slug) do update set name=excluded.name returning id", [manifest.publisher.name, manifest.publisher.slug])).rows[0];
  const packageResult = await client.query("insert into book_packages(publisher_id,title,slug,level,description,status) values($1,$2,$3,$4,$5,'draft') on conflict(slug) do update set title=excluded.title,level=excluded.level,description=excluded.description returning id,status,publisher_id", [publisher.id, manifest.book.title, manifest.book.slug, manifest.book.level || "", manifest.book.description || null]);
  if (packageResult.rows[0].publisher_id !== publisher.id) throw new Error("Book slug belongs to a different publisher");
  const bookPackageId = packageResult.rows[0].id;
  const componentRows = [];
  const unitRows = [];
  const activityRows = [];
  const lessonIds = [];
  const publishActivityIds = [];
  for (const [componentIndex, component] of manifest.components.entries()) {
    const componentRow = (await client.query("insert into book_components(book_package_id,title,slug,component_type,sort_order) values($1,$2,$3,$4,$5) on conflict(book_package_id,slug) do update set title=excluded.title,component_type=excluded.component_type,sort_order=excluded.sort_order returning id,slug", [bookPackageId, component.title, component.slug, component.type, componentIndex + 1])).rows[0];
    componentRows.push(componentRow);
    for (const [unitIndex, unit] of component.units.entries()) {
      const unitRow = (await client.query("insert into units(book_component_id,title,slug,unit_number,sort_order) values($1,$2,$3,$4,$5) on conflict(book_component_id,slug) do update set title=excluded.title,unit_number=excluded.unit_number,sort_order=excluded.sort_order returning id,slug", [componentRow.id, unit.title, unit.slug, unit.number || null, unitIndex + 1])).rows[0];
      unitRows.push({ ...unitRow, component_slug: component.slug });
      for (const [lessonIndex, lesson] of unit.lessons.entries()) {
        const lessonRow = (await client.query("insert into lessons(unit_id,title,slug,lesson_type,sort_order,position,instructions,status) values($1,$2,$3,$4,$5,$5,$6,'draft') on conflict(unit_id,slug) do update set title=excluded.title,lesson_type=excluded.lesson_type,sort_order=excluded.sort_order,position=excluded.position,instructions=excluded.instructions returning id", [unitRow.id, lesson.title, lesson.slug, lesson.type, lessonIndex + 1, lesson.instructions || null])).rows[0];
        lessonIds.push(lessonRow.id);
        for (const [activityIndex, activity] of lesson.activities.entries()) {
          const content = { answers: activity.answers || {}, feedback: activity.feedback || {}, sourceReference: activity.sourceReference || null, importStatus: activity.status };
          const activityRow = (await client.query("insert into activities(lesson_id,slug,title,type,activity_type,instructions,content,content_json,settings_json,sort_order,is_assignable,is_demo_active) values($1,$2,$3,$4,$4,$5,$6,$6,'{}'::jsonb,$7,$8,false) on conflict(lesson_id,slug) do update set title=excluded.title,type=excluded.type,activity_type=excluded.activity_type,instructions=excluded.instructions,content=excluded.content,content_json=excluded.content_json,sort_order=excluded.sort_order,is_assignable=excluded.is_assignable returning id,slug", [lessonRow.id, activity.slug, activity.title, activity.type, activity.instructions || null, content, activityIndex + 1, Boolean(activity.assignable)])).rows[0];
          activityRows.push({ ...activityRow, contextKey: `${component.slug}:${unit.slug}:${lesson.slug}:${activity.slug}` });
          if (activity.status === "fully-interactive" || activity.status === "media-only") publishActivityIds.push(activityRow.id);
        }
      }
    }
  }
  return {
    bookPackageId,
    packageWasDraft: packageResult.rows[0].status === "draft",
    componentIds: new Map(componentRows.map((row) => [row.slug, row.id])),
    unitIds: new Map(unitRows.map((row) => [`${row.component_slug}:${row.slug}`, row.id])),
    activityIds: new Map(activityRows.map((row) => [row.contextKey, row.id])),
    lessonIds,
    publishActivityIds,
  };
}

export async function executeImport({ manifest, rawManifest, manifestChecksum, sourceRoot, dryRun = false, environment = "staging", confirmation, concurrency = 4, storage: suppliedStorage, client: suppliedClient }) {
  const assets = await prepareImportPlan({ manifest, sourceRoot });
  const summary = { manifestChecksum, sourceAssets: manifest.assets.length, objectVariants: assets.length, totalBytes: assets.reduce((sum, item) => sum + item.byteSize, 0), uploaded: 0, skipped: 0, published: 0, objects: [] };
  if (dryRun) return { status: "dry-run", summary, assets: assets.map(({ buffer, component, unit, page, lesson, activity, ...asset }) => ({ ...asset, componentSlug: component.slug, unitSlug: unit?.slug || null, pageKey: page?.stableKey || null, activitySlug: activity?.slug || null })) };
  requireStagingEnvironment(environment, confirmation);
  const databaseUrl = process.env.BOOK_IMPORT_DATABASE_URL || process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
  if (!suppliedClient && !databaseUrl) throw new Error("BOOK_IMPORT_DATABASE_URL or STAGING_DATABASE_URL is required");
  const client = suppliedClient || new Client({ connectionString: databaseUrl, ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false } });
  const ownsClient = !suppliedClient;
  if (ownsClient) await client.connect();
  const storage = suppliedStorage || createBookAssetStorage({ config: readBookAssetStorageConfig() });
  let importId = null;
  const uploaded = [];
  try {
    const context = await resolveDatabaseContext(client, manifest);
    const existingImport = await client.query("select id,status from book_asset_imports where book_package_id=$1 and manifest_checksum_sha256=$2", [context.bookPackageId, manifestChecksum]);
    if (existingImport.rows[0]?.status === "published") return { status: "idempotent", summary: { ...summary, skipped: assets.length } };
    const isRollback = existingImport.rows[0]?.status === "archived";
    const editionResult = await client.query("insert into book_editions(book_package_id,edition_identifier,title,source_metadata) values($1,$2,$3,$4) on conflict(book_package_id,edition_identifier) do update set title=excluded.title returning id", [context.bookPackageId, manifest.edition.identifier, manifest.edition.title || null, { manifestSchemaVersion: manifest.schemaVersion }]);
    const editionId = editionResult.rows[0].id;
    const importResult = await client.query("insert into book_asset_imports(book_package_id,edition_id,manifest_checksum_sha256,manifest_schema_version,book_version,environment,status,summary) values($1,$2,$3,$4,$5,$6,'processing',$7) on conflict(book_package_id,manifest_checksum_sha256) do update set status='processing',failure_details='[]'::jsonb,summary=excluded.summary,started_at=now(),completed_at=null returning id", [context.bookPackageId, editionId, manifestChecksum, manifest.schemaVersion, manifest.book.version, environment, summary]);
    importId = importResult.rows[0].id;
    const existingAssets = isRollback
      ? await client.query("select stable_logical_key,checksum_sha256,publication_status from book_assets where import_id=$1 and publication_status='archived'", [importId])
      : await client.query("select stable_logical_key,checksum_sha256,publication_status from book_assets where book_package_id=$1 and edition_identifier=$2 and version=$3 and publication_status<>'archived'", [context.bookPackageId, manifest.edition.identifier, manifest.book.version]);
    const existingByKey = assertCompatibleExistingAssets(assets, existingAssets.rows);
    const pending = assets.filter((asset) => !existingByKey.has(asset.logicalKey));
    await mapLimit(pending, Math.max(1, Math.min(Number(concurrency) || 4, 12)), async (asset) => {
      const upload = await storage.upload({ profile: asset.profile, objectKey: asset.objectKey, body: asset.buffer, contentType: asset.mimeType, checksumSha256: asset.checksumSha256, byteSize: asset.byteSize });
      if (!upload?.reused) uploaded.push({ profile: asset.profile, objectKey: asset.objectKey });
      summary.objects.push({ profile: asset.profile, objectKey: asset.objectKey, checksumSha256: asset.checksumSha256 });
      if (upload?.reused) summary.skipped += 1; else summary.uploaded += 1;
    });
    summary.skipped += assets.length - pending.length;

    await client.query("begin");
    const pageIds = new Map();
    for (const component of manifest.components) for (const unit of component.units) for (const page of unit.pages) {
      const componentId = context.componentIds.get(component.slug);
      const unitId = context.unitIds.get(`${component.slug}:${unit.slug}`);
      if (!componentId || !unitId) throw new Error(`Database relationship is missing for ${component.slug}/${unit.slug}`);
      const pageResult = await client.query("insert into book_pages(book_package_id,book_component_id,unit_id,stable_key,page_number,label,source_metadata) values($1,$2,$3,$4,$5,$6,$7) on conflict(book_package_id,stable_key) do update set page_number=excluded.page_number,label=excluded.label,source_metadata=excluded.source_metadata returning id", [context.bookPackageId, componentId, unitId, page.stableKey, page.number, page.label || null, { sourceReference: page.sourceReference || null }]);
      pageIds.set(page.id, pageResult.rows[0].id);
    }
    const insertedIds = new Map();
    for (const asset of assets) {
      if (existingByKey.has(asset.logicalKey)) continue;
      const componentId = context.componentIds.get(asset.component.slug);
      const unitId = asset.unit ? context.unitIds.get(`${asset.component.slug}:${asset.unit.slug}`) : null;
      const activityId = asset.activity ? context.activityIds.get(`${asset.component.slug}:${asset.unit.slug}:${asset.lesson.slug}:${asset.activity.slug}`) : null;
      const sourceAssetId = asset.sourceAssetLogicalKey ? insertedIds.get(asset.sourceAssetLogicalKey) || null : null;
      const result = await client.query(`insert into book_assets(book_package_id,edition_id,book_component_id,unit_id,page_id,activity_id,import_id,source_asset_id,stable_logical_key,asset_role,object_key,storage_profile,storage_bucket,mime_type,byte_size,checksum_sha256,width,height,duration_seconds,edition_identifier,version,publication_status,access_level,source_metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'processing',$22,$23) returning id`, [context.bookPackageId, editionId, componentId, unitId, asset.page ? pageIds.get(asset.page.id) : null, activityId, importId, sourceAssetId, asset.logicalKey, asset.role, asset.objectKey, asset.profile, storage.bucket(asset.profile), asset.mimeType, asset.byteSize, asset.checksumSha256, asset.width, asset.height, asset.durationSeconds, manifest.edition.identifier, manifest.book.version, asset.accessLevel, { source: asset.source, sourceReference: asset.sourceReference || null, classification: asset.classification }]);
      insertedIds.set(asset.logicalKey, result.rows[0].id);
    }
    await client.query("update book_assets set publication_status='archived' where book_package_id=$1 and publication_status='published' and import_id is distinct from $2", [context.bookPackageId, importId]);
    await client.query("update book_asset_imports set status='archived' where book_package_id=$1 and status='published' and id<>$2", [context.bookPackageId, importId]);
    await client.query("update book_editions set status='archived' where book_package_id=$1 and status='published' and id<>$2", [context.bookPackageId, editionId]);
    await client.query("update book_assets set publication_status='published' where import_id=$1 and publication_status in ('processing','archived')", [importId]);
    await client.query("update book_editions set status='published' where id=$1", [editionId]);
    if (context.lessonIds.length) await client.query("update lessons set status='published' where id=any($1::uuid[])", [context.lessonIds]);
    if (context.publishActivityIds.length) await client.query("update activities set is_demo_active=true where id=any($1::uuid[])", [context.publishActivityIds]);
    if (context.packageWasDraft) await client.query("update book_packages set status='active' where id=$1", [context.bookPackageId]);
    summary.published = assets.length;
    await client.query("update book_asset_imports set status='published',summary=$2,completed_at=now() where id=$1", [importId, summary]);
    await client.query("commit");
    return { status: "published", summary };
  } catch (error) {
    try { await client.query("rollback"); } catch {}
    await cleanupUploadedObjects(storage, uploaded);
    if (importId) await client.query("update book_asset_imports set status='failed',failure_details=$2,summary=$3,completed_at=now() where id=$1", [importId, [{ message: error.message }], { ...summary, objects: uploaded }]).catch(() => {});
    throw error;
  } finally {
    if (ownsClient) await client.end();
  }
}

export async function verifyPublishedAssets({ client: suppliedClient, storage: suppliedStorage }) {
  const databaseUrl = process.env.BOOK_IMPORT_DATABASE_URL || process.env.STAGING_DATABASE_URL;
  if (!suppliedClient && !databaseUrl) throw new Error("BOOK_IMPORT_DATABASE_URL or STAGING_DATABASE_URL is required");
  const client = suppliedClient || new Client({ connectionString: databaseUrl, ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false } });
  if (!suppliedClient) await client.connect();
  const storage = suppliedStorage || createBookAssetStorage({ config: readBookAssetStorageConfig() });
  try {
    const rows = (await client.query("select id,storage_profile,object_key,byte_size,checksum_sha256 from book_assets where publication_status='published'")).rows;
    const failures = [];
    await mapLimit(rows, 4, async (row) => {
      try {
        const head = await storage.head({ profile: row.storage_profile, objectKey: row.object_key });
        const bytes = await storage.download({ profile: row.storage_profile, objectKey: row.object_key });
        const downloadedChecksum = createHash("sha256").update(bytes).digest("hex");
        if (Number(row.byte_size) !== head.byteSize || bytes.length !== Number(row.byte_size) || downloadedChecksum !== row.checksum_sha256 || (head.checksumSha256 && head.checksumSha256 !== row.checksum_sha256)) failures.push({ id: row.id, reason: "downloaded bytes or metadata mismatch" });
      } catch (error) { failures.push({ id: row.id, reason: error.message }); }
    });
    return { checked: rows.length, failures };
  } finally { if (!suppliedClient) await client.end(); }
}

export async function cleanupFailedImport({ importId, confirmation, client: suppliedClient, storage: suppliedStorage }) {
  requireStagingEnvironment("staging", confirmation);
  const databaseUrl = process.env.BOOK_IMPORT_DATABASE_URL || process.env.STAGING_DATABASE_URL;
  if (!suppliedClient && !databaseUrl) throw new Error("BOOK_IMPORT_DATABASE_URL or STAGING_DATABASE_URL is required");
  const client = suppliedClient || new Client({ connectionString: databaseUrl, ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false } });
  if (!suppliedClient) await client.connect();
  const storage = suppliedStorage || createBookAssetStorage({ config: readBookAssetStorageConfig() });
  try {
    const result = await client.query("select id,status,summary from book_asset_imports where id=$1 limit 1", [importId]);
    const run = result.rows[0];
    if (!run || run.status !== "failed") throw new Error("Only an explicitly selected failed import can be cleaned");
    const objects = Array.isArray(run.summary?.objects) ? run.summary.objects : [];
    const cleanup = await cleanupUploadedObjects(storage, objects);
    if (cleanup.failed) throw new Error(`${cleanup.failed} failed-import objects could not be removed`);
    await client.query("update book_asset_imports set status='cleaned',summary=summary || $2::jsonb,completed_at=now() where id=$1 and status='failed'", [importId, JSON.stringify({ cleanup })]);
    return { importId, ...cleanup };
  } finally { if (!suppliedClient) await client.end(); }
}
