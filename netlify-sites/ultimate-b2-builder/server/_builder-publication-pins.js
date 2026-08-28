import { createHash } from "node:crypto";

import { componentPublicationCanonicalPrivateSourceObjectKey } from "../../../lib/book-assets/publication-asset-storage.js";
import { isPrivatePinnableComponentReleaseAssetRole } from "../../../src/data/ultimate-b2/componentPublicationAssetRoles.js";
import { ComponentPublicationAssetError } from "./_builder-publication-assets.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identity = (descriptor) => `${descriptor.sha256}.${descriptor.extension}`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function publicationAssetPinFingerprint(pin) {
  return [
    "builder-release-asset-pin-v1", pin.assetId, pin.role, pin.sourceAssetRole, pin.checksumSha256,
    pin.byteSize, pin.mediaType, pin.extension, pin.storageProfile, pin.storageBucket, pin.objectKey,
    pin.ownerKey, pin.assetSlot,
  ].join("\n");
}

function failure(source, componentSlug, failureClass) {
  return new ComponentPublicationAssetError({
    assetId: source?.row?.id || source?.descriptor?.sha256,
    role: source?.descriptor?.role,
    stage: `pin-${componentSlug}`,
    failureClass,
  });
}

function pinOwner(source) {
  if (source.descriptor.role === "managed_page_image") return { ownerKey: source.row.source_metadata?.publication_page_id || "", assetSlot: "" };
  if (source.descriptor.role === "unit_extra_video") return { ownerKey: source.row.source_metadata?.unit_extra_item_id || "", assetSlot: source.row.source_metadata?.asset_slot || "" };
  return { ownerKey: source.row.source_metadata?.native_activity_id || "", assetSlot: source.row.source_metadata?.asset_slot || "" };
}

async function verifySource(storage, source, { bookSlug, componentSlug, privateBucket }) {
  const { descriptor, row } = source;
  if (!row || !UUID.test(String(row.id || ""))) throw failure(source, componentSlug, "source_asset_row_missing");
  if (row.book_slug && row.book_slug !== bookSlug || row.component_slug && row.component_slug !== componentSlug) throw failure(source, componentSlug, "source_component_mismatch");
  const expectedRole = descriptor.role === "managed_page_image" ? "page_image" : descriptor.role;
  if (!isPrivatePinnableComponentReleaseAssetRole(descriptor.role) || row.asset_role !== expectedRole) throw failure(source, componentSlug, "source_role_mismatch");
  if (row.checksum_sha256 !== descriptor.sha256) throw failure(source, componentSlug, "source_checksum_mismatch");
  if (Number(row.byte_size) < 1 || !Number.isSafeInteger(Number(row.byte_size))) throw failure(source, componentSlug, "source_byte_size_mismatch");
  if (row.mime_type !== descriptor.mediaType) throw failure(source, componentSlug, "source_media_type_mismatch");
  let canonicalKey;
  try { canonicalKey = componentPublicationCanonicalPrivateSourceObjectKey({ bookSlug, componentSlug, descriptor, row }); } catch { /* bounded below */ }
  if (!canonicalKey || row.object_key !== canonicalKey || row.storage_profile !== "private" || row.storage_bucket !== privateBucket
    || row.publication_status !== "draft" || row.access_level !== "internal") throw failure(source, componentSlug, "source_storage_identity_invalid");
  let head;
  try { head = await storage.head({ profile: "private", objectKey: canonicalKey }); } catch { throw failure(source, componentSlug, "source_object_missing"); }
  if (head.checksumSha256 !== descriptor.sha256) throw failure(source, componentSlug, "source_checksum_mismatch");
  if (Number(head.byteSize) !== Number(row.byte_size)) throw failure(source, componentSlug, "source_byte_size_mismatch");
  if (head.contentType !== descriptor.mediaType) throw failure(source, componentSlug, "source_media_type_mismatch");
  const ownership = pinOwner(source);
  if (!ownership.ownerKey || (descriptor.role === "unit_extra_video" && ownership.assetSlot !== ownership.ownerKey)) throw failure(source, componentSlug, "source_storage_identity_invalid");
  const pin = {
    assetId: String(row.id).toLowerCase(),
    role: descriptor.role,
    sourceAssetRole: expectedRole,
    checksumSha256: descriptor.sha256,
    byteSize: Number(row.byte_size),
    mediaType: descriptor.mediaType,
    extension: descriptor.extension,
    storageProfile: "private",
    storageBucket: row.storage_bucket,
    objectKey: canonicalKey,
    ownerKey: ownership.ownerKey,
    assetSlot: ownership.assetSlot,
  };
  return { ...pin, pinSha256: sha256(publicationAssetPinFingerprint(pin)) };
}

async function mapBounded(values, concurrency, mapper) {
  const result = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      result[index] = await mapper(values[index], index);
    }
  }));
  return result;
}

export async function freezeComponentPublicationAssetPins(storage, { bookSlug, componentSlug, assetManifest = [], nativeAssetSources = [], concurrency = 4 }) {
  let privateBucket;
  try { privateBucket = storage.bucket("private"); } catch { throw failure(nativeAssetSources[0], componentSlug, "source_storage_identity_invalid"); }
  const expected = assetManifest.filter((descriptor) => isPrivatePinnableComponentReleaseAssetRole(descriptor.role));
  const sources = new Map();
  for (const source of nativeAssetSources) {
    const key = identity(source.descriptor);
    if (sources.has(key)) throw failure(source, componentSlug, "release_pin_conflict");
    sources.set(key, source);
  }
  if (sources.size !== expected.length) throw failure(nativeAssetSources[0] || { descriptor: expected[0] }, componentSlug, "source_asset_row_missing");
  const ordered = expected.map((descriptor) => {
    const source = sources.get(identity(descriptor));
    if (!source || source.descriptor.role !== descriptor.role || source.descriptor.mediaType !== descriptor.mediaType) throw failure(source || { descriptor }, componentSlug, "source_asset_row_missing");
    return source;
  });
  return mapBounded(ordered, concurrency, (source) => verifySource(storage, source, { bookSlug, componentSlug, privateBucket }));
}

export function safePublicationPinReport(componentSlug, pins) {
  return pins.map((pin) => ({ componentSlug, role: pin.role, assetId: pin.assetId, status: "verified" }));
}
