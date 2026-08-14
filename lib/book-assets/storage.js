import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bucketForProfile, readBookAssetStorageConfig } from "./config.js";
import { validateObjectKey } from "./object-keys.js";

export class S3BookAssetStorage {
  constructor(config = readBookAssetStorageConfig(), client = null) {
    this.config = config;
    this.client = client || new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: false,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  bucket(profile) {
    return bucketForProfile(this.config, profile);
  }

  async upload({ profile, objectKey, body, contentType, checksumSha256, byteSize }) {
    const Bucket = this.bucket(profile);
    const Key = validateObjectKey(objectKey);
    try {
      const existing = await this.head({ profile, objectKey: Key });
      if (existing.byteSize !== byteSize || !existing.checksumSha256 || existing.checksumSha256 !== checksumSha256) throw new Error(`Object already exists with different or unverifiable content: ${Key}`);
      return { ...existing, reused: true };
    } catch (error) {
      if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== "NotFound" && !/not[ -]?found/i.test(error?.message || "")) throw error;
    }
    await this.client.send(new PutObjectCommand({
      Bucket,
      Key,
      Body: body,
      ContentType: contentType,
      ContentLength: byteSize,
      Metadata: { sha256: checksumSha256 },
      IfNoneMatch: "*",
    }));
    const head = await this.head({ profile, objectKey: Key });
    if (head.checksumSha256 && head.checksumSha256 !== checksumSha256) throw new Error(`Uploaded checksum metadata mismatch for ${Key}`);
    return { ...head, reused: false };
  }

  async head({ profile, objectKey }) {
    const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket(profile), Key: validateObjectKey(objectKey) }));
    return {
      byteSize: Number(result.ContentLength || 0),
      contentType: result.ContentType || "application/octet-stream",
      checksumSha256: result.Metadata?.sha256 || null,
      etag: result.ETag || null,
    };
  }

  async delete({ profile, objectKey }) {
    if (profile === "archive") throw new Error("Archive objects require manual retention review and cannot be cleaned automatically");
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(profile), Key: validateObjectKey(objectKey) }));
  }

  async signedGetUrl({ profile, objectKey, ttlSeconds = this.config.signedUrlTtlSeconds }) {
    if (profile === "archive") throw new Error("Archive assets cannot be delivered");
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket(profile), Key: validateObjectKey(objectKey) }),
      { expiresIn: ttlSeconds },
    );
  }

  async signedPutUrl({ profile, objectKey, contentType, ttlSeconds = this.config.signedUrlTtlSeconds }) {
    if (profile !== "private") throw new Error("Direct book asset uploads are restricted to private staging");
    const Key = validateObjectKey(objectKey);
    const normalizedContentType = String(contentType || "application/octet-stream");
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket(profile), Key, ContentType: normalizedContentType }),
      { expiresIn: ttlSeconds },
    );
    return { url, headers: { "Content-Type": normalizedContentType }, expiresIn: ttlSeconds };
  }

  async download({ profile, objectKey }) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(profile), Key: validateObjectKey(objectKey) }));
    if (!result.Body?.transformToByteArray) throw new Error("Storage response body cannot be verified");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  publicUrl(objectKey) {
    if (!this.config.publicBaseUrl) throw new Error("BOOK_ASSET_PUBLIC_BASE_URL is required for public delivery");
    return `${this.config.publicBaseUrl}/${validateObjectKey(objectKey).split("/").map(encodeURIComponent).join("/")}`;
  }
}

export function createBookAssetStorage(options) {
  return new S3BookAssetStorage(options?.config, options?.client);
}
