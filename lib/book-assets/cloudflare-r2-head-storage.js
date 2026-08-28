import { validateObjectKey } from "./object-keys.js";

const SAFE_R2_BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const SHA256 = /^[a-f0-9]{64}$/;

function validatePrivateBucket(value) {
  const bucket = String(value || "");
  if (!SAFE_R2_BUCKET.test(bucket)) throw new Error("Cloudflare release source bucket identity is invalid");
  return bucket;
}

export class CloudflareR2BookAssetHeadStorage {
  constructor({ binding, privateBucket }) {
    if (!binding || typeof binding.head !== "function") throw new Error("Cloudflare release source binding is unavailable");
    this.binding = binding;
    this.privateBucket = validatePrivateBucket(privateBucket);
  }

  bucket(profile) {
    if (profile !== "private") throw new Error("Cloudflare release source storage is private-only");
    return this.privateBucket;
  }

  async head({ profile, objectKey }) {
    this.bucket(profile);
    const result = await this.binding.head(validateObjectKey(objectKey));
    if (!result) throw new Error("Cloudflare release source object is unavailable");
    const checksum = result.customMetadata?.sha256;
    return {
      byteSize: Number.isSafeInteger(result.size) && result.size >= 0 ? result.size : null,
      contentType: typeof result.httpMetadata?.contentType === "string" ? result.httpMetadata.contentType : null,
      checksumSha256: typeof checksum === "string" && SHA256.test(checksum) ? checksum : null,
      etag: typeof result.etag === "string" ? result.etag : null,
    };
  }
}

export function createCloudflareR2BookAssetHeadStorage(options) {
  return new CloudflareR2BookAssetHeadStorage(options);
}
