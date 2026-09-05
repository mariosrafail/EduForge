const PUBLIC_ACCESS_LEVELS = new Set(["public", "preview"]);
const PROTECTED_ACCESS_LEVELS = new Set(["entitled"]);

export function classifyAssetAccess(asset = {}) {
  if ((asset.asset_role || asset.assetRole) === "native_teacher_answer") return "denied";
  if (asset.publication_status !== "published" && asset.publicationStatus !== "published") return "denied";
  const access = asset.access_level || asset.accessLevel;
  if (PUBLIC_ACCESS_LEVELS.has(access)) return "public";
  if (PROTECTED_ACCESS_LEVELS.has(access)) return "protected";
  return "denied";
}

export function canDeliverAsset(asset = {}, hasEntitlement = false) {
  const classification = classifyAssetAccess(asset);
  return classification === "public" || (classification === "protected" && hasEntitlement);
}
