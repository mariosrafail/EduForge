import { componentPublicationAssetStorageTarget, componentPublicationCanonicalPrivateSourceObjectKey } from "../../../lib/book-assets/publication-asset-storage.js";
import { nativeTeacherAnswerImages, nativeTeacherAnswerAssetDescriptors } from "../../../src/data/native-activities/nativeImageSampleAnswer.js";
import { serveProtectedNativeAnswer } from "./_builder-native-teacher-assets.js";

// Authorization must establish the requested release and activity before calling this helper.
export async function deliverNativeTeacherAnswer({ release, verified, activityId, sectionId = null, method, loadPin, storage }) {
  const teacher = verified.teacherProjection?.nativeActivities?.[activityId];
  const publicEntry = verified.publicProjection?.nativeActivities?.[activityId];
  if (!teacher || !publicEntry || teacher.kind !== publicEntry.kind) throw new Error("native_teacher_answer_not_found");
  const image = nativeTeacherAnswerImages(teacher.document).find((entry) => entry.sectionId === sectionId);
  if (!image) throw new Error("native_teacher_answer_not_found");
  const descriptor = nativeTeacherAnswerAssetDescriptors(teacher.document).find((entry) => entry.sha256 === image.reference.checksumSha256);
  if (!release.asset_manifest.some((entry) => entry.sha256 === descriptor.sha256 && entry.extension === descriptor.extension && entry.role === descriptor.role && entry.mediaType === descriptor.mediaType)) throw new Error("release_answer_integrity_failed");
  const identity = { bookSlug: verified.publicProjection.bookSlug, componentSlug: verified.publicProjection.componentSlug };
  const mode = release.asset_storage_mode || "materialized-v1";
  if (mode === "pinned-source-v1") {
    const pin = await loadPin(descriptor);
    if (!pin || pin.component_release_id !== release.id || pin.asset_role !== descriptor.role || pin.source_asset_role !== descriptor.role
      || pin.checksum_sha256 !== descriptor.sha256 || pin.extension !== descriptor.extension || pin.media_type !== descriptor.mediaType || pin.storage_profile !== "private") throw new Error("release_answer_integrity_failed");
    // A release may deduplicate identical bytes; its frozen source must still be a protected reference owned by a Teacher document in this exact release.
    const owner = verified.teacherProjection.nativeActivities[pin.source_owner_key];
    if (!owner || !nativeTeacherAnswerImages(owner.document).some((entry) => entry.reference.assetId === pin.book_asset_id && entry.reference.slot === pin.source_asset_slot && entry.reference.checksumSha256 === descriptor.sha256)) throw new Error("release_answer_integrity_failed");
    const canonical = componentPublicationCanonicalPrivateSourceObjectKey({ ...identity, descriptor, row: { source_metadata: { native_activity_id: pin.source_owner_key, asset_slot: pin.source_asset_slot } } });
    if (pin.object_key !== canonical) throw new Error("release_answer_integrity_failed");
    return serveProtectedNativeAnswer({ storage, method, asset: { asset_role: descriptor.role, storage_profile: "private", object_key: pin.object_key, mime_type: pin.media_type, byte_size: pin.byte_size, checksum_sha256: pin.checksum_sha256 } });
  }
  if (mode !== "materialized-v1") throw new Error("release_answer_integrity_failed");
  const target = componentPublicationAssetStorageTarget({ ...identity, ...descriptor });
  const head = await storage.head({ profile: "private", objectKey: target.objectKey });
  if (head.checksumSha256 !== descriptor.sha256 || head.contentType !== descriptor.mediaType) throw new Error("release_answer_integrity_failed");
  return serveProtectedNativeAnswer({ storage, method, asset: { asset_role: descriptor.role, storage_profile: "private", object_key: target.objectKey, mime_type: descriptor.mediaType, byte_size: head.byteSize, checksum_sha256: descriptor.sha256 } });
}
