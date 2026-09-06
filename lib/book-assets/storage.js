import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bucketForProfile, readBookAssetStorageConfig } from "./config.js";
import { validateObjectKey } from "./object-keys.js";

function isObjectMissing(error) {
  return error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound" || /not[ -]?found/i.test(error?.message || "");
}

export class BookAssetImmutableCopyError extends Error {
  constructor(code, { providerStatus, providerCode } = {}) {
    super(code);
    this.name = "BookAssetImmutableCopyError";
    this.code = code;
    if (Number.isInteger(providerStatus) && providerStatus >= 100 && providerStatus <= 599) this.providerStatus = providerStatus;
    if (/^[A-Za-z0-9_.-]{1,64}$/.test(String(providerCode || ""))) this.providerCode = providerCode;
  }
}

function immutableCopyError(code, diagnostics) {
  return new BookAssetImmutableCopyError(code, diagnostics);
}

const SAFE_COPY_SOURCE_BUCKET = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

export function buildCopySource(bucket, objectKey) {
  const sourceBucket = String(bucket ?? "");
  if (
    !SAFE_COPY_SOURCE_BUCKET.test(sourceBucket)
    || sourceBucket.includes("..")
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(sourceBucket)
  ) throw immutableCopyError("copy_request_invalid");
  let sourceKey;
  try {
    sourceKey = validateObjectKey(objectKey);
  } catch {
    throw immutableCopyError("copy_request_invalid");
  }
  return `${encodeURIComponent(sourceBucket)}/${sourceKey.split("/").map(encodeURIComponent).join("/")}`;
}

const COPY_TRANSPORT_CODES = new Set([
  "AbortError",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT",
  "RequestTimeout",
  "TimeoutError",
]);

const COPY_PROVIDER_CODE_FAILURES = new Map([
  ["InvalidArgument", "copy_invalid_request"],
  ["InvalidRequest", "copy_invalid_request"],
  ["MalformedXML", "copy_invalid_request"],
  ["NoSuchKey", "copy_invalid_request"],
  ["AccessDenied", "copy_permission_denied"],
  ["InvalidAccessKeyId", "copy_permission_denied"],
  ["SignatureDoesNotMatch", "copy_permission_denied"],
  ["Conflict", "copy_precondition_failed"],
  ["ConditionalRequestConflict", "copy_precondition_failed"],
  ["PreconditionFailed", "copy_precondition_failed"],
  ["MethodNotAllowed", "copy_not_supported"],
  ["NotImplemented", "copy_not_supported"],
  ["SlowDown", "copy_throttled"],
  ["Throttling", "copy_throttled"],
  ["ThrottlingException", "copy_throttled"],
  ["TooManyRequests", "copy_throttled"],
  ["InternalError", "copy_provider_unavailable"],
  ["ServiceUnavailable", "copy_provider_unavailable"],
]);

function approvedProviderValue(value, field) {
  try { return value?.[field]; } catch { return undefined; }
}

function providerCauseChain(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while ((typeof current === "object" || typeof current === "function") && current !== null && chain.length < 3 && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = approvedProviderValue(current, "cause");
  }
  return chain;
}

function safeStatus(value) {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
}

function safeCode(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const code = String(value);
  return code !== "Error" && /^[A-Za-z0-9_.-]{1,64}$/.test(code) ? code : undefined;
}

function providerObservation(error) {
  const observations = providerCauseChain(error).map((candidate) => {
    const metadata = approvedProviderValue(candidate, "$metadata");
    const response = approvedProviderValue(candidate, "$response");
    const status = safeStatus(approvedProviderValue(metadata, "httpStatusCode"))
      ?? safeStatus(approvedProviderValue(response, "statusCode"));
    const codes = ["name", "Code", "code"]
      .map((field) => safeCode(approvedProviderValue(candidate, field)))
      .filter(Boolean);
    return { status, codes };
  });
  const statusObservation = observations.find((candidate) => candidate.status !== undefined);
  const codes = observations.flatMap((candidate) => candidate.codes);
  const providerCode = codes.find((code) => COPY_PROVIDER_CODE_FAILURES.has(code) || COPY_TRANSPORT_CODES.has(code)) || codes[0];
  return { providerStatus: statusObservation?.status, providerCode };
}

export function classifyImmutableCopyProviderFailure(error) {
  const { providerStatus, providerCode } = providerObservation(error);
  let failureClass = "copy_failed";
  if (providerStatus === 400) failureClass = "copy_invalid_request";
  else if ([401, 403].includes(providerStatus)) failureClass = "copy_permission_denied";
  else if ([409, 412].includes(providerStatus)) failureClass = "copy_precondition_failed";
  else if ([405, 501].includes(providerStatus)) failureClass = "copy_not_supported";
  else if (providerStatus === 429) failureClass = "copy_throttled";
  else if (providerStatus >= 500) failureClass = "copy_provider_unavailable";
  else if (COPY_TRANSPORT_CODES.has(providerCode)) failureClass = "copy_transport_failed";
  else if (COPY_PROVIDER_CODE_FAILURES.has(providerCode)) failureClass = COPY_PROVIDER_CODE_FAILURES.get(providerCode);
  return { failureClass, providerStatus, providerCode };
}

export function isCloudflareR2S3Endpoint(endpoint) {
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return hostname === "r2.cloudflarestorage.com" || hostname.endsWith(".r2.cloudflarestorage.com");
  } catch {
    return false;
  }
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
      const cloudflareR2 = isCloudflareR2S3Endpoint(this.config.endpoint);
      const command = new CopyObjectCommand({
        Bucket,
        Key: destinationKey,
        CopySource: buildCopySource(Bucket, sourceKey),
        CopySourceIfMatch: source.etag,
        ...(!cloudflareR2 ? { IfNoneMatch: "*" } : {}),
        MetadataDirective: "REPLACE",
        Metadata: { sha256: expectedChecksumSha256 },
        ContentType: expectedContentType,
      });
      if (cloudflareR2) {
        command.middlewareStack.add(
          (next) => async (args) => {
            applyR2CopyDestinationCreateOnlyHeader(args.request);
            return next(args);
          },
          { step: "build", name: "r2CopyDestinationCreateOnly" },
        );
      }
      await this.client.send(command);
    } catch (error) {
      if (error instanceof BookAssetImmutableCopyError) throw error;
      const providerFailure = classifyImmutableCopyProviderFailure(error);
      if (providerFailure.failureClass === "copy_precondition_failed") {
        try {
          const concurrent = await this.head({ profile, objectKey: destinationKey });
          verifyHeadIdentity(concurrent, expected, "immutable");
          return { ...concurrent, reused: true, copied: false };
        } catch {
          throw immutableCopyError("copy_precondition_failed", providerFailure);
        }
      }
      throw immutableCopyError(providerFailure.failureClass, providerFailure);
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

  async openReadStream({ profile, objectKey, range = null }) {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(profile), Key: validateObjectKey(objectKey),
      ...(range ? { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } : {}) }));
    if (!result.Body?.transformToWebStream) throw new Error("Storage response cannot be streamed");
    return { body: result.Body.transformToWebStream(), byteSize: Number(result.ContentLength), contentType: result.ContentType,
      checksumSha256: result.Metadata?.sha256 || null, contentRange: result.ContentRange || null };
  }

  publicUrl(objectKey) {
    if (!this.config.publicBaseUrl) throw new Error("BOOK_ASSET_PUBLIC_BASE_URL is required for public delivery");
    return `${this.config.publicBaseUrl}/${validateObjectKey(objectKey).split("/").map(encodeURIComponent).join("/")}`;
  }
}

export function createBookAssetStorage(options) {
  return new S3BookAssetStorage(options?.config, options?.client);
}
