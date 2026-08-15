export const NATIVE_ACTIVITY_SCHEMA_VERSION = "1.0";
export const NATIVE_ACTIVITY_INDEX_SCHEMA_VERSION = "1.0";
export const NATIVE_ACTIVITY_PART_ID = "part-1";

const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,127}$/;
const SAFE_ASSET_ROLE = /^[a-z][a-z0-9_]{1,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

function safeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function text(value, label, maximum, { required = false } = {}) {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  const normalized = value.trim();
  if (required && !normalized) throw new Error(`${label} is required.`);
  return normalized;
}

export function normalizeNativeManagedAssetReference(input) {
  const value = structuredClone(object(input, "Native managed asset reference"));
  exactKeys(value, ["assetId", "checksumSha256", "role", "slot"], "Native managed asset reference");
  if (!UUID.test(String(value.assetId || ""))) throw new Error("Native managed asset ID is invalid.");
  if (!SHA256.test(String(value.checksumSha256 || ""))) throw new Error("Native managed asset checksum is invalid.");
  if (!SAFE_ASSET_ROLE.test(String(value.role || ""))) throw new Error("Native managed asset role is invalid.");
  return { assetId: value.assetId.toLowerCase(), checksumSha256: value.checksumSha256, role: value.role, slot: safeId(value.slot, "Native managed asset slot") };
}

function sameManagedAssetReference(left, right) {
  return left.assetId === right.assetId
    && left.checksumSha256 === right.checksumSha256
    && left.role === right.role
    && left.slot === right.slot;
}

export function mergeNativeManagedAssetReference(inputAssets, inputReference) {
  if (!Array.isArray(inputAssets)) throw new Error("Native public assets must be an array.");
  const assets = inputAssets.map(normalizeNativeManagedAssetReference);
  const reference = normalizeNativeManagedAssetReference(inputReference);
  const assetIds = new Set();
  const assetSlots = new Set();
  for (const asset of assets) {
    if (assetIds.has(asset.assetId) || assetSlots.has(asset.slot)) throw new Error("Native managed asset references must be unique by ID and slot.");
    assetIds.add(asset.assetId);
    assetSlots.add(asset.slot);
  }
  const matchingId = assets.find((asset) => asset.assetId === reference.assetId);
  const matchingSlot = assets.find((asset) => asset.slot === reference.slot);
  if (!matchingId && !matchingSlot) return [...assets, reference];
  if (!matchingId || !matchingSlot || matchingId !== matchingSlot || !sameManagedAssetReference(matchingId, reference)) {
    throw new Error("Native managed asset reference conflicts with an existing ID or slot.");
  }
  return assets;
}

export function normalizeNativeActivityPlacement(input) {
  const value = structuredClone(object(input, "Native activity placement"));
  exactKeys(value, ["pageId"], "Native activity placement");
  return { pageId: safeId(value.pageId, "Native activity page ID") };
}

export function normalizeNativeActivityPublic(input, { normalizeInteraction, expectedActivityId = null, expectedKind = null } = {}) {
  if (typeof normalizeInteraction !== "function") throw new Error("Native public interaction normalizer is required.");
  const value = structuredClone(object(input, "Native public activity"));
  exactKeys(value, ["schemaVersion", "activityId", "kind", "metadata", "placement", "assets", "parts"], "Native public activity");
  if (value.schemaVersion !== NATIVE_ACTIVITY_SCHEMA_VERSION) throw new Error("Unsupported native public activity schema version.");
  const activityId = safeId(value.activityId, "Native activity ID");
  const kind = safeId(value.kind, "Native activity kind");
  if (expectedActivityId && activityId !== expectedActivityId) throw new Error("Native public activity identity does not match its resource.");
  if (expectedKind && kind !== expectedKind) throw new Error("Native public activity kind is immutable.");
  exactKeys(value.metadata, ["title", "visibleInstructionText"], "Native public metadata");
  if (!Array.isArray(value.assets)) throw new Error("Native public assets must be an array.");
  const assets = value.assets.map(normalizeNativeManagedAssetReference);
  const assetIds = new Set();
  const assetSlots = new Set();
  for (const asset of assets) {
    if (assetIds.has(asset.assetId) || assetSlots.has(asset.slot)) throw new Error("Native managed asset references must be unique by ID and slot.");
    assetIds.add(asset.assetId); assetSlots.add(asset.slot);
  }
  if (!Array.isArray(value.parts) || value.parts.length !== 1) throw new Error("Native activity schema v1 requires exactly one Part.");
  const part = structuredClone(object(value.parts[0], "Native activity Part"));
  exactKeys(part, ["id", "interaction"], "Native activity Part");
  if (part.id !== NATIVE_ACTIVITY_PART_ID) throw new Error("Native activity schema v1 requires stable Part ID part-1.");
  return {
    schemaVersion: NATIVE_ACTIVITY_SCHEMA_VERSION,
    activityId,
    kind,
    metadata: {
      title: text(value.metadata.title, "Native activity title", 300, { required: true }),
      visibleInstructionText: text(value.metadata.visibleInstructionText, "Native activity instruction", 2_000),
    },
    placement: normalizeNativeActivityPlacement(value.placement),
    assets,
    parts: [{ id: NATIVE_ACTIVITY_PART_ID, interaction: normalizeInteraction(part.interaction, { assets }) }],
  };
}

export function normalizeNativeActivityIndex(input, { allowedKinds = null } = {}) {
  const value = structuredClone(object(input, "Native activity index"));
  exactKeys(value, ["schemaVersion", "activities"], "Native activity index");
  if (value.schemaVersion !== NATIVE_ACTIVITY_INDEX_SCHEMA_VERSION || !Array.isArray(value.activities)) throw new Error("Unsupported native activity index.");
  const ids = new Set();
  const activities = value.activities.map((entry, index) => {
    const item = structuredClone(object(entry, `Native activity index entry ${index + 1}`));
    exactKeys(item, ["activityId", "kind", "placement", "sortOrder"], `Native activity index entry ${index + 1}`);
    const activityId = safeId(item.activityId, "Native activity index ID");
    const kind = safeId(item.kind, "Native activity index kind");
    if (allowedKinds && !allowedKinds.includes(kind)) throw new Error("Native activity index kind is not registered.");
    if (ids.has(activityId)) throw new Error("Native activity index IDs must be unique.");
    ids.add(activityId);
    if (!Number.isSafeInteger(item.sortOrder) || item.sortOrder < 0 || item.sortOrder > 10_000_000) throw new Error("Native activity index sort order is invalid.");
    return { activityId, kind, placement: normalizeNativeActivityPlacement(item.placement), sortOrder: item.sortOrder };
  });
  activities.sort((left, right) => left.sortOrder - right.sortOrder || left.activityId.localeCompare(right.activityId, undefined, { numeric: true }));
  return { schemaVersion: NATIVE_ACTIVITY_INDEX_SCHEMA_VERSION, activities };
}

export function createEmptyNativeActivityIndex() {
  return { schemaVersion: NATIVE_ACTIVITY_INDEX_SCHEMA_VERSION, activities: [] };
}

export function appendNativeActivityIndexEntry(index, entry, options) {
  return normalizeNativeActivityIndex({ ...structuredClone(index), activities: [...index.activities, entry] }, options);
}
