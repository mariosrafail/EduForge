import {
  COMPONENT_PUBLICATION_ASSET_STORAGE,
  componentPublicationAssetRolePolicy,
} from "../../src/data/ultimate-b2/componentPublicationAssetRoles.js";
import {
  buildBookAssetHostedOpenResponsePublicKey,
  buildBookAssetHostedTeacherUiPublicKey,
  buildComponentReleaseAssetObjectKey,
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
      public: true,
    };
  }
  if (policy.storage === COMPONENT_PUBLICATION_ASSET_STORAGE.PUBLIC_HOSTED_TEACHER_UI) {
    return {
      profile: "public",
      objectKey: buildBookAssetHostedTeacherUiPublicKey({ checksum: sha256, extension }),
      public: true,
    };
  }
  return null;
}
