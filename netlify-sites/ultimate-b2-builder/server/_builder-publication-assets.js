import { componentPublicationAssetStorageTarget, componentPublicationCanonicalPrivateSourceObjectKey } from "../../../lib/book-assets/publication-asset-storage.js";
import { isPrivateMaterializedComponentReleaseAssetRole } from "../../../src/data/ultimate-b2/componentPublicationAssetRoles.js";

const STORAGE_COPY_FAILURES = new Set([
  "source_object_missing",
  "source_head_failed",
  "source_checksum_mismatch",
  "source_byte_size_mismatch",
  "source_media_type_mismatch",
  "source_etag_missing",
  "immutable_object_missing",
  "immutable_checksum_mismatch",
  "immutable_byte_size_mismatch",
  "immutable_media_type_mismatch",
  "copy_invalid_request",
  "copy_request_invalid",
  "copy_permission_denied",
  "copy_precondition_failed",
  "copy_not_supported",
  "copy_throttled",
  "copy_provider_unavailable",
  "copy_transport_failed",
  "copy_failed",
]);

function safeDiagnosticValue(value, maximumLength) {
  const normalized = String(value || "");
  return /^[A-Za-z0-9_.:-]+$/.test(normalized) ? normalized.slice(0, maximumLength) : "unknown";
}

export class ComponentPublicationAssetError extends Error {
  constructor({ assetId, role, stage, failureClass, providerStatus, providerCode }) {
    super("release_asset_unavailable");
    this.name = "ComponentPublicationAssetError";
    this.code = "release_asset_unavailable";
    this.assetId = safeDiagnosticValue(assetId, 128);
    this.assetRole = safeDiagnosticValue(role, 64);
    this.assetStage = safeDiagnosticValue(stage, 64);
    this.failureClass = safeDiagnosticValue(failureClass, 64);
    if (Number.isInteger(providerStatus) && providerStatus >= 100 && providerStatus <= 599) this.providerStatus = providerStatus;
    if (/^[A-Za-z0-9_.-]{1,64}$/.test(String(providerCode || ""))) this.providerCode = providerCode;
  }
}

function unavailable(source, stage, failureClass, diagnostics = {}) {
  return new ComponentPublicationAssetError({
    assetId: source?.row?.id || source?.descriptor?.sha256,
    role: source?.descriptor?.role,
    stage,
    failureClass,
    providerStatus: diagnostics.providerStatus,
    providerCode: diagnostics.providerCode,
  });
}

export async function materializeNativeReleaseAssets(storage, { bookSlug, componentSlug, nativeAssetSources = [] }) {
  for (const source of nativeAssetSources) {
    const { descriptor, row } = source;
    try {
      if (!isPrivateMaterializedComponentReleaseAssetRole(descriptor.role)) throw unavailable(source, "materialize", "unsupported_asset_role");
      const expectedSourceRole = descriptor.role === "managed_page_image" ? "page_image" : descriptor.role;
      if (row.asset_role !== expectedSourceRole) throw unavailable(source, "materialize", "source_asset_role_mismatch");
      if (row.checksum_sha256 !== descriptor.sha256) throw unavailable(source, "materialize", "source_checksum_mismatch");
      if (row.mime_type !== descriptor.mediaType) throw unavailable(source, "materialize", "source_media_type_mismatch");
      if (!Number.isSafeInteger(Number(row.byte_size)) || Number(row.byte_size) < 1) throw unavailable(source, "materialize", "source_byte_size_invalid");
      if (row.storage_profile !== "private" || row.publication_status !== "draft" || row.access_level !== "internal") throw unavailable(source, "materialize", "source_storage_policy_mismatch");
      let privateBucket;
      try { privateBucket = storage.bucket("private"); }
      catch { throw unavailable(source, "materialize", "source_storage_policy_mismatch"); }
      if (row.storage_bucket !== privateBucket) throw unavailable(source, "materialize", "source_storage_bucket_mismatch");
      let canonicalSourceObjectKey;
      try { canonicalSourceObjectKey = componentPublicationCanonicalPrivateSourceObjectKey({ bookSlug, componentSlug, descriptor, row }); }
      catch { throw unavailable(source, "materialize", "source_identity_mismatch"); }
      if (!canonicalSourceObjectKey || row.object_key !== canonicalSourceObjectKey) throw unavailable(source, "materialize", "source_identity_mismatch");
      const target = componentPublicationAssetStorageTarget({ bookSlug, componentSlug, ...descriptor });
      if (!target || target.profile !== "private") throw unavailable(source, "materialize", "unsupported_asset_role");
      try {
        await storage.copyVerifiedImmutable({
          profile: target.profile,
          sourceObjectKey: canonicalSourceObjectKey,
          destinationObjectKey: target.objectKey,
          expectedChecksumSha256: descriptor.sha256,
          expectedByteSize: Number(row.byte_size),
          expectedContentType: descriptor.mediaType,
        });
      } catch (error) {
        throw unavailable(source, "materialize", STORAGE_COPY_FAILURES.has(error?.code) ? error.code : "storage_copy_failure", error);
      }
    } catch (error) {
      throw error instanceof ComponentPublicationAssetError ? error : unavailable(source, "materialize", "storage_copy_failure");
    }
  }
}
