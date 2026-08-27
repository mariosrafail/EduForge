import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bucketForProfile, readBookAssetStorageConfig } from "./config.js";
import { validateObjectKey } from "./object-keys.js";

function isObjectMissing(error) {
  return error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound" || /not[ -]?found/i.test(error?.message || "");
}

function copySource(bucket, objectKey) {
  return `/${encodeURIComponent(bucket)}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

export class BookAssetImmutableCopyError extends Error {
  constructor(code) {
    super(code);
    this.name = "BookAssetImmutableCopyError";
    this.code = code;
  }
}

function immutableCopyError(code) {
  return new BookAssetImmutableCopyError(code);
}

function verifyHeadIdentity(head, expected, prefix) {
  if (head.checksumSha256 !== expected.checksumSha256) throw immutableCopyError(`${prefix}_checksum_mismatch`);
  if (head.byteSize !== expected.byteSize) throw immutableCopyError(`${prefix}_byte_size_mismatch`);
  if (head.contentType !== expected.contentType) throw immutableCopyError(`${prefix}_media_type_mismatch`);
}

export function applyR2CopyDestinationCreateOnlyHeader(request) {
  if (!request?.headers) throw immutableCopyError("copy_request_invalid");
  request.headers["cf-copy-destination-if-none-match"] = "*";
}

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
      if (!isObjectMissing(error)) throw error;
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

  async copyVerifiedImmutable({
    profile,
    sourceObjectKey,
    destinationObjectKey,
    expectedChecksumSha256,
    expectedByteSize,
    expectedContentType,
  }) {
    if (profile !== "private") throw immutableCopyError("copy_profile_invalid");
    if (!/^[a-f0-9]{64}$/.test(String(expectedChecksumSha256 || ""))) throw immutableCopyError("copy_checksum_invalid");
    if (!Number.isSafeInteger(expectedByteSize) || expectedByteSize < 1) throw immutableCopyError("copy_byte_size_invalid");
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(expectedContentType || ""))) throw immutableCopyError("copy_media_type_invalid");

    const Bucket = this.bucket(profile);
    const sourceKey = validateObjectKey(sourceObjectKey);
    const destinationKey = validateObjectKey(destinationObjectKey);
    if (sourceKey === destinationKey) throw immutableCopyError("copy_identity_invalid");
    const expected = { checksumSha256: expectedChecksumSha256, byteSize: expectedByteSize, contentType: expectedContentType };

    try {
      const existing = await this.head({ profile, objectKey: destinationKey });
      verifyHeadIdentity(existing, expected, "immutable");
      return { ...existing, reused: true, copied: false };
    } catch (error) {
      if (!isObjectMissing(error)) throw error;
    }

    let source;
    try {
      source = await this.head({ profile, objectKey: sourceKey });
    } catch (error) {
      if (isObjectMissing(error)) throw immutableCopyError("source_object_missing");
      throw immutableCopyError("source_head_failed");
    }
    verifyHeadIdentity(source, expected, "source");
    if (!source.etag) throw immutableCopyError("source_etag_missing");

    try {
      const command = new CopyObjectCommand({
        Bucket,
        Key: destinationKey,
        CopySource: copySource(Bucket, sourceKey),
        CopySourceIfMatch: source.etag,
        IfNoneMatch: "*",
        MetadataDirective: "REPLACE",
        Metadata: { sha256: expectedChecksumSha256 },
        ContentType: expectedContentType,
      });
      command.middlewareStack.add(
        (next) => async (args) => {
          applyR2CopyDestinationCreateOnlyHeader(args.request);
          return next(args);
        },
        { step: "build", name: "r2CopyDestinationCreateOnly" },
      );
      await this.client.send(command);
    } catch (error) {
      if ([409, 412].includes(error?.$metadata?.httpStatusCode)) {
        try {
          const concurrent = await this.head({ profile, objectKey: destinationKey });
          verifyHeadIdentity(concurrent, expected, "immutable");
          return { ...concurrent, reused: true, copied: false };
        } catch (verificationError) {
          if (verificationError instanceof BookAssetImmutableCopyError) throw verificationError;
          throw immutableCopyError("copy_precondition_failed");
        }
      }
      throw immutableCopyError("copy_failed");
    }

    let copied;
    try {
      copied = await this.head({ profile, objectKey: destinationKey });
    } catch {
      throw immutableCopyError("immutable_object_missing");
    }
    verifyHeadIdentity(copied, expected, "immutable");
    return { ...copied, reused: false, copied: true };
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
