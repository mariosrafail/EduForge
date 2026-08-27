import {
  COMPONENT_PUBLICATION_ASSET_ROLES,
  COMPONENT_PUBLICATION_ASSET_STORAGE,
  componentPublicationAssetRolePolicy,
} from "../../src/data/ultimate-b2/componentPublicationAssetRoles.js";
import {
  buildBookAssetHostedOpenResponsePublicKey,
  buildBookAssetHostedTeacherUiPublicKey,
  buildComponentReleaseAssetObjectKey,
  buildNativeActivityAssetObjectKey,
  buildUnitExtraAssetObjectKey,
} from "./object-keys.js";

export function componentPublicationAssetStorageTarget({ bookSlug, componentSlug, sha256, extension, role }) {
  const policy = componentPublicationAssetRolePolicy(role);
  if (!policy) return null;
  if (policy.storage === COMPONENT_PUBLICATION_ASSET_STORAGE.PRIVATE_IMMUTABLE_RELEASE) {
    return {
      profile: "private",
      objectKey: buildComponentReleaseAssetObjectKey({ bookSlug, componentSlug, checksum: sha256, extension }),
      public: false,
    };
  }
  if (policy.storage === COMPONENT_PUBLICATION_ASSET_STORAGE.PUBLIC_HOSTED_OPEN_RESPONSE) {
    return {
      profile: "public",
      objectKey: buildBookAssetHostedOpenResponsePublicKey({ checksum: sha256, extension: `.${String(extension || "").replace(/^\./, "")}` }),
      publicPath: `/preview/open-response-assets/${sha256}.${String(extension || "").replace(/^\./, "")}`,
      public: true,
    };
  }
  if (policy.storage === COMPONENT_PUBLICATION_ASSET_STORAGE.PUBLIC_HOSTED_TEACHER_UI) {
    return {
      profile: "public",
      objectKey: buildBookAssetHostedTeacherUiPublicKey({ checksum: sha256, extension }),
      publicPath: `/preview/ui-assets-v2/${sha256}.${String(extension || "").replace(/^\./, "")}`,
      public: true,
    };
  }
  return null;
}

export function componentPublicationCanonicalPrivateSourceObjectKey({ bookSlug, componentSlug, descriptor, row }) {
  const extension = `.${String(descriptor?.extension || "").toLowerCase().replace(/^\./, "")}`;
  if (descriptor?.role === COMPONENT_PUBLICATION_ASSET_ROLES.UNIT_EXTRA_VIDEO) {
    return buildUnitExtraAssetObjectKey({
      bookSlug,
      componentSlug,
      unitSlug: row?.source_metadata?.unit_slug,
      itemId: row?.source_metadata?.unit_extra_item_id,
      checksum: descriptor.sha256,
      extension,
    });
  }
  if (descriptor?.role === COMPONENT_PUBLICATION_ASSET_ROLES.ACTIVITY_ARTWORK) {
    return buildNativeActivityAssetObjectKey({
      bookSlug,
      componentSlug,
      activityId: row?.source_metadata?.native_activity_id,
      assetSlot: row?.source_metadata?.asset_slot,
      checksum: descriptor.sha256,
      extension,
    });
  }
  return null;
}
