import { createHash } from "node:crypto";
import path from "node:path";

const ALLOWED_MIME = new Map([
  [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".webp", "image/webp"],
  [".mp3", "audio/mpeg"], [".m4a", "audio/mp4"], [".aac", "audio/aac"], [".mp4", "video/mp4"],
]);
const SHA256 = /^[a-f0-9]{64}$/i;

function list(value) { return Array.isArray(value) ? value : []; }
function relative(value) {
  const normalized = String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return normalized;
}
function digest(value) { return SHA256.test(String(value || "")) ? String(value).toLowerCase() : null; }
function opaqueAssetId(role, identity, sha256) { return `manual_asset_${createHash("sha256").update(`${role}\0${identity}\0${sha256}`).digest("hex").slice(0, 24)}`; }
function roleForMime(mimeType, preferred) { if (preferred) return preferred; if (mimeType.startsWith("image/")) return "image"; if (mimeType.startsWith("audio/")) return "audio"; if (mimeType.startsWith("video/")) return "video"; return null; }

function add(catalog, input) {
  const sourceRelativeIdentity = relative(input.sourceRelativeIdentity || input.sourceRelativePath || input.sourceRelativeLocator || input.mediaPath);
  const sha256 = digest(input.digest || input.sha256 || input.sourceSha256 || input.fingerprint);
  const mimeType = String(input.mimeType || ALLOWED_MIME.get(path.extname(sourceRelativeIdentity || "").toLowerCase()) || "");
  const role = roleForMime(mimeType, input.role);
  if (!sourceRelativeIdentity || !sha256 || !ALLOWED_MIME.has(path.extname(sourceRelativeIdentity).toLowerCase()) || !new Set(ALLOWED_MIME.values()).has(mimeType) || !role) return;
  const assetId = opaqueAssetId(role, sourceRelativeIdentity, sha256);
  catalog.set(assetId, { assetId, role, mimeType, sourceRelativeIdentity, digest: sha256, stale: input.stale === true, width: Number.isSafeInteger(input.width) ? input.width : null, height: Number.isSafeInteger(input.height) ? input.height : null, sourceKind: input.sourceKind || "detected" });
}

export function createManualActivityAssetCatalog({ pages, media, materialized = [] } = {}) {
  const catalog = new Map();
  for (const spread of list(pages?.spreads)) for (const variant of list(spread.variants)) add(catalog, { ...variant, role: "background", sourceKind: "page_raster" });
  for (const candidate of list(media?.candidates)) add(catalog, { ...candidate, sourceKind: "detected_media" });
  for (const asset of list(materialized)) add(catalog, { ...asset, sourceKind: "materialized_review_asset" });
  return catalog;
}

export function publicManualActivityAssetCatalog(catalog) {
  return [...catalog.values()].sort((a, b) => a.assetId.localeCompare(b.assetId)).map((asset) => ({ ...asset }));
}

export function attachManualActivityAsset(catalog, assetId, role = null) {
  const asset = catalog.get(String(assetId || ""));
  if (!asset || asset.stale) throw new Error("Manual activity asset is unavailable or stale");
  if (role && asset.role !== role && !(role === "poster" && asset.mimeType.startsWith("image/")) && !(role === "media_trigger" && /^(?:audio|video)\//.test(asset.mimeType))) throw new Error("Manual activity asset role is incompatible");
  return { assetId: asset.assetId, role: role || asset.role, mimeType: asset.mimeType, sourceRelativeIdentity: asset.sourceRelativeIdentity, digest: asset.digest, stale: false };
}
