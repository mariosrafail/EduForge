import { classifyAssetAccess } from "../../lib/book-assets/access.js";
import { readBookAssetStorageConfig } from "../../lib/book-assets/config.js";
import { createBookAssetStorage } from "../../lib/book-assets/storage.js";
import { json } from "./_book-content-utils.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const logicalKeyPattern = /^[a-z0-9][a-z0-9._/-]{0,255}$/;

function hiddenAssetResponse() {
  return json(404, { error: "Book asset not found" }, { "Cache-Control": "private, no-store" });
}

export async function getBookAssetAccess(sql, currentUser, query, { storage: suppliedStorage } = {}) {
  const assetId = String(query.assetId || "");
  const logicalKey = String(query.logicalKey || "");
  if ((!assetId || !uuidPattern.test(assetId)) && (!logicalKey || !logicalKeyPattern.test(logicalKey) || logicalKey.includes(".."))) return hiddenAssetResponse();
  const rows = assetId
    ? await sql`
        select ba.*, bp.status as package_status
        from book_assets ba join book_packages bp on bp.id=ba.book_package_id
        where ba.id=${assetId} limit 1
      `
    : await sql`
        select ba.*, bp.status as package_status
        from book_assets ba join book_packages bp on bp.id=ba.book_package_id
        where ba.stable_logical_key=${logicalKey}
          and ba.publication_status='published'
        order by ba.created_at desc limit 1
      `;
  const asset = rows[0];
  if (!asset || asset.package_status !== "active") return hiddenAssetResponse();
  const classification = classifyAssetAccess(asset);
  if (classification === "denied" || asset.storage_profile === "archive") return hiddenAssetResponse();
  if (classification === "protected") {
    const access = await sql`
      select 1
      from book_access ba
      join app_users u on u.id=ba.user_id
      where ba.user_id=${currentUser.id}
        and ba.book_package_id=${asset.book_package_id}
        and u.school_id=${currentUser.school_id}
        and u.status='active'
      limit 1
    `;
    if (!access.length) return hiddenAssetResponse();
  }
  let storage;
  try {
    storage = suppliedStorage || createBookAssetStorage({ config: readBookAssetStorageConfig() });
    const url = classification === "public"
      ? storage.publicUrl(asset.object_key)
      : await storage.signedGetUrl({ profile: asset.storage_profile, objectKey: asset.object_key });
    const ttl = classification === "public" ? null : storage.config.signedUrlTtlSeconds;
    return json(200, {
      asset: {
        id: asset.id,
        logicalKey: asset.stable_logical_key,
        role: asset.asset_role,
        mimeType: asset.mime_type,
        byteSize: Number(asset.byte_size),
        width: asset.width,
        height: asset.height,
        durationSeconds: asset.duration_seconds === null ? null : Number(asset.duration_seconds),
        accessLevel: asset.access_level,
        checksumSha256: asset.checksum_sha256,
      },
      url,
      expiresAt: ttl ? new Date(Date.now() + ttl * 1000).toISOString() : null,
    }, { "Cache-Control": "private, no-store" });
  } catch {
    return json(503, { error: "Book asset storage is unavailable" }, { "Cache-Control": "private, no-store", "Retry-After": "30" });
  }
}
