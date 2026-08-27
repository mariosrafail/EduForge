import { componentPublicationAssetStorageTarget } from "../../../lib/book-assets/publication-asset-storage.js";
import { inspectManagedMp3 } from "../../../lib/book-assets/audio-inspection.js";
import { inspectManagedRaster } from "../../../lib/book-assets/raster-inspection.js";
import { inspectManagedPdf } from "../../../lib/book-assets/pdf-inspection.js";
import { inspectManagedMp4 } from "../../../lib/book-assets/video-inspection.js";
import { isPrivateMaterializedComponentReleaseAssetRole } from "../../../src/data/ultimate-b2/componentPublicationAssetRoles.js";

function safeDiagnosticValue(value, maximumLength) {
  const normalized = String(value || "");
  return /^[A-Za-z0-9_.:-]+$/.test(normalized) ? normalized.slice(0, maximumLength) : "unknown";
}

export class ComponentPublicationAssetError extends Error {
  constructor({ assetId, role, stage, failureClass }) {
    super("release_asset_unavailable");
    this.name = "ComponentPublicationAssetError";
    this.code = "release_asset_unavailable";
    this.assetId = safeDiagnosticValue(assetId, 128);
    this.assetRole = safeDiagnosticValue(role, 64);
    this.assetStage = safeDiagnosticValue(stage, 64);
    this.failureClass = safeDiagnosticValue(failureClass, 64);
  }
}

function unavailable(source, stage, failureClass) {
  return new ComponentPublicationAssetError({
    assetId: source?.row?.id || source?.descriptor?.sha256,
    role: source?.descriptor?.role,
    stage,
    failureClass,
  });
}

export async function materializeNativeReleaseAssets(storage, { bookSlug, componentSlug, nativeAssetSources = [] }) {
  for (const source of nativeAssetSources) {
    const { descriptor, row } = source;
    try {
      if (!isPrivateMaterializedComponentReleaseAssetRole(descriptor.role)) throw unavailable(source, "materialize", "unsupported_asset_role");
      let head;
      try { head = await storage.head({ profile: "private", objectKey: row.object_key }); }
      catch { throw unavailable(source, "materialize", "source_object_missing"); }
      if (head.checksumSha256 !== descriptor.sha256) throw unavailable(source, "materialize", "source_checksum_mismatch");
      if (head.byteSize !== Number(row.byte_size)) throw unavailable(source, "materialize", "source_byte_size_mismatch");
      if (head.contentType !== descriptor.mediaType) throw unavailable(source, "materialize", "source_media_type_mismatch");
      let bytes;
      try { bytes = await storage.download({ profile: "private", objectKey: row.object_key }); }
      catch { throw unavailable(source, "materialize", "source_download_failed"); }
      const inspected = descriptor.mediaType === "application/pdf" ? inspectManagedPdf(bytes) : descriptor.mediaType === "audio/mpeg" ? inspectManagedMp3(bytes) : descriptor.mediaType === "video/mp4" ? inspectManagedMp4(bytes) : await inspectManagedRaster(bytes);
      if (inspected.checksumSha256 !== descriptor.sha256) throw unavailable(source, "materialize", "downloaded_checksum_mismatch");
      if (inspected.byteSize !== Number(row.byte_size)) throw unavailable(source, "materialize", "downloaded_byte_size_mismatch");
      if (inspected.mimeType !== descriptor.mediaType || inspected.extension !== `.${descriptor.extension}`) throw unavailable(source, "materialize", "downloaded_media_type_mismatch");
      if (descriptor.mediaType === "video/mp4" && Math.round(Number(row.duration_seconds) * 1_000) !== inspected.durationMs) throw unavailable(source, "materialize", "downloaded_duration_mismatch");
      if (descriptor.mediaType.startsWith("image/") && (inspected.width !== Number(row.width) || inspected.height !== Number(row.height))) throw unavailable(source, "materialize", "downloaded_dimensions_mismatch");
      const target = componentPublicationAssetStorageTarget({ bookSlug, componentSlug, ...descriptor });
      if (!target || target.profile !== "private") throw unavailable(source, "materialize", "unsupported_asset_role");
      await storage.upload({ profile: target.profile, objectKey: target.objectKey, body: inspected.bytes, contentType: descriptor.mediaType, checksumSha256: descriptor.sha256, byteSize: inspected.byteSize });
    } catch (error) {
      throw error instanceof ComponentPublicationAssetError ? error : unavailable(source, "materialize", "storage_or_inspection_failure");
    }
  }
}
