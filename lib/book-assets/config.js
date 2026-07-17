const MIN_SIGNED_URL_TTL_SECONDS = 30;
const MAX_SIGNED_URL_TTL_SECONDS = 900;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 120;
const MEDIA_SIGNED_URL_TTL_SECONDS = 900;
const DOWNLOAD_SIGNED_URL_TTL_SECONDS = 600;

const MEDIA_ASSET_ROLES = new Set(["audio", "video"]);
const DOWNLOAD_ASSET_ROLES = new Set(["download", "pdf", "attachment"]);

export function normalizeSignedUrlTtl(value) {
  if (value === undefined || value === null || value === "") return DEFAULT_SIGNED_URL_TTL_SECONDS;
  const ttl = Number(value);
  if (!Number.isInteger(ttl) || ttl < MIN_SIGNED_URL_TTL_SECONDS || ttl > MAX_SIGNED_URL_TTL_SECONDS) {
    throw new Error(`BOOK_ASSET_SIGNED_URL_TTL_SECONDS must be an integer from ${MIN_SIGNED_URL_TTL_SECONDS} to ${MAX_SIGNED_URL_TTL_SECONDS}`);
  }
  return ttl;
}

export function signedUrlTtlForAsset(asset = {}, configuredDefault = DEFAULT_SIGNED_URL_TTL_SECONDS) {
  const fallback = normalizeSignedUrlTtl(configuredDefault);
  const role = String(asset.asset_role || asset.role || "").toLowerCase();
  if (MEDIA_ASSET_ROLES.has(role)) return MEDIA_SIGNED_URL_TTL_SECONDS;
  if (DOWNLOAD_ASSET_ROLES.has(role)) return Math.max(fallback, DOWNLOAD_SIGNED_URL_TTL_SECONDS);
  return fallback;
}

export function readBookAssetStorageConfig(env = process.env, { requireCredentials = true } = {}) {
  const provider = String(env.BOOK_ASSET_STORAGE_PROVIDER || "").trim().toLowerCase();
  if (provider !== "s3") throw new Error("BOOK_ASSET_STORAGE_PROVIDER must be set to s3");
  const config = {
    provider,
    endpoint: String(env.BOOK_ASSET_S3_ENDPOINT || "").trim().replace(/\/$/, ""),
    region: String(env.BOOK_ASSET_S3_REGION || "auto").trim(),
    accessKeyId: String(env.BOOK_ASSET_S3_ACCESS_KEY_ID || "").trim(),
    secretAccessKey: String(env.BOOK_ASSET_S3_SECRET_ACCESS_KEY || "").trim(),
    publicBucket: String(env.BOOK_ASSET_PUBLIC_BUCKET || "").trim(),
    privateBucket: String(env.BOOK_ASSET_PRIVATE_BUCKET || "").trim(),
    archiveBucket: String(env.BOOK_ASSET_ARCHIVE_BUCKET || "").trim(),
    publicBaseUrl: String(env.BOOK_ASSET_PUBLIC_BASE_URL || "").trim().replace(/\/$/, ""),
    signedUrlTtlSeconds: normalizeSignedUrlTtl(env.BOOK_ASSET_SIGNED_URL_TTL_SECONDS),
  };
  const required = ["endpoint", "region", "publicBucket", "privateBucket", "archiveBucket", "publicBaseUrl"];
  if (requireCredentials) required.push("accessKeyId", "secretAccessKey");
  const missing = required.filter((key) => !config[key]);
  if (missing.length) throw new Error(`Missing book asset storage configuration: ${missing.join(", ")}`);
  for (const [label, value] of [["BOOK_ASSET_S3_ENDPOINT", config.endpoint], ["BOOK_ASSET_PUBLIC_BASE_URL", config.publicBaseUrl]]) {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error(`${label} must use HTTPS (HTTP is allowed only for a local emulator)`);
  }
  return config;
}

export function bucketForProfile(config, profile) {
  if (profile === "public") return config.publicBucket;
  if (profile === "private") return config.privateBucket;
  if (profile === "archive") return config.archiveBucket;
  throw new Error("Unsupported book asset storage profile");
}

export const signedUrlTtlBounds = Object.freeze({
  min: MIN_SIGNED_URL_TTL_SECONDS,
  max: MAX_SIGNED_URL_TTL_SECONDS,
  default: DEFAULT_SIGNED_URL_TTL_SECONDS,
  media: MEDIA_SIGNED_URL_TTL_SECONDS,
  download: DOWNLOAD_SIGNED_URL_TTL_SECONDS,
});
