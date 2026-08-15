import { buildComponentReleaseAssetObjectKey } from "../../../lib/book-assets/object-keys.js";
import { inspectManagedRaster } from "../../../lib/book-assets/raster-inspection.js";

export async function materializeNativeReleaseAssets(storage, { bookSlug, componentSlug, nativeAssetSources = [] }) {
  for (const source of nativeAssetSources) {
    const { descriptor, row } = source;
    try {
      const head = await storage.head({ profile: "private", objectKey: row.object_key });
      if (head.checksumSha256 !== descriptor.sha256 || head.byteSize !== Number(row.byte_size) || head.contentType !== descriptor.mediaType) throw new Error("source_head_mismatch");
      const inspected = await inspectManagedRaster(await storage.download({ profile: "private", objectKey: row.object_key }));
      if (inspected.checksumSha256 !== descriptor.sha256 || inspected.mimeType !== descriptor.mediaType
        || inspected.byteSize !== Number(row.byte_size) || inspected.width !== Number(row.width) || inspected.height !== Number(row.height)
        || inspected.extension !== `.${descriptor.extension}`) throw new Error("source_bytes_mismatch");
      const objectKey = buildComponentReleaseAssetObjectKey({ bookSlug, componentSlug, checksum: descriptor.sha256, extension: descriptor.extension });
      await storage.upload({ profile: "private", objectKey, body: inspected.bytes, contentType: descriptor.mediaType, checksumSha256: descriptor.sha256, byteSize: inspected.byteSize });
    } catch {
      throw new Error("release_asset_unavailable");
    }
  }
}
