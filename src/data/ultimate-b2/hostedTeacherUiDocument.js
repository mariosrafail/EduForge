import {
  HOSTED_EDITABLE_UI_BINDINGS_BY_ID,
  HOSTED_TEACHER_UI_MEDIA_POLICIES,
  HOSTED_TEACHER_UI_PACKAGE_ID,
  HOSTED_TEACHER_UI_SCHEMA_VERSION,
  HOSTED_TEACHER_UI_TITLE_BINDING_IDS,
} from "./hostedTeacherUiBindingCatalog.js";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._() -]{0,179}$/;

function exactObject(value, keys, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(message);
}

function normalizeAsset(bindingId, value, { publicProjection = false } = {}) {
  const binding = HOSTED_EDITABLE_UI_BINDINGS_BY_ID[bindingId];
  if (!binding) throw new Error(`Unsupported hosted Teacher UI binding: ${bindingId}`);
  const keys = ["sha256", "extension", "mediaType", "sizeBytes", "width", "height", ...(publicProjection ? [] : ["originalFilename"])];
  exactObject(value, keys, `Invalid hosted Teacher UI asset metadata: ${bindingId}`);
  const policy = HOSTED_TEACHER_UI_MEDIA_POLICIES[binding.mediaFamily];
  const sha256 = String(value.sha256 || "");
  const extension = String(value.extension || "").toLowerCase();
  const mediaType = String(value.mediaType || "").toLowerCase();
  if (!SHA256.test(sha256) || !policy.extensions.includes(extension) || !policy.mediaTypes.includes(mediaType)) throw new Error(`Invalid hosted Teacher UI asset identity: ${bindingId}`);
  if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 1 || value.sizeBytes > policy.maximumBytes) throw new Error(`Invalid hosted Teacher UI asset size: ${bindingId}`);
  const raster = mediaType.startsWith("image/");
  if (raster && ![value.width, value.height].every((dimension) => Number.isSafeInteger(dimension) && dimension > 0 && dimension <= 32_768)) throw new Error(`Invalid hosted Teacher UI raster dimensions: ${bindingId}`);
  if (!raster && (value.width !== null || value.height !== null)) throw new Error(`Invalid hosted Teacher UI non-raster dimensions: ${bindingId}`);
  const normalized = { sha256, extension, mediaType, sizeBytes: value.sizeBytes, width: value.width, height: value.height };
  if (!publicProjection) {
    const originalFilename = String(value.originalFilename || "");
    if (!SAFE_FILENAME.test(originalFilename) || originalFilename === "." || originalFilename === "..") throw new Error(`Invalid hosted Teacher UI filename: ${bindingId}`);
    normalized.originalFilename = originalFilename;
  }
  return Object.freeze(normalized);
}

function assertAtomicTitle(assets) {
  const present = HOSTED_TEACHER_UI_TITLE_BINDING_IDS.filter((id) => assets[id]);
  if (present.length && present.length !== HOSTED_TEACHER_UI_TITLE_BINDING_IDS.length) throw new Error("The hosted title animation must be saved or reverted as one complete GAF/atlas group.");
}

export function createEmptyHostedTeacherUiDocument() {
  return Object.freeze({ schemaVersion: HOSTED_TEACHER_UI_SCHEMA_VERSION, packageId: HOSTED_TEACHER_UI_PACKAGE_ID, assets: Object.freeze({}) });
}

export function normalizeHostedTeacherUiDocument(candidate) {
  exactObject(candidate, ["schemaVersion", "packageId", "assets"], "Invalid hosted Teacher UI document.");
  if (candidate.schemaVersion !== HOSTED_TEACHER_UI_SCHEMA_VERSION || candidate.packageId !== HOSTED_TEACHER_UI_PACKAGE_ID) throw new Error("Unsupported hosted Teacher UI document identity.");
  exactObject(candidate.assets, Object.keys(candidate.assets || {}), "Invalid hosted Teacher UI asset map.");
  const assets = Object.fromEntries(Object.entries(candidate.assets).map(([id, value]) => [id, normalizeAsset(id, value)]));
  assertAtomicTitle(assets);
  return Object.freeze({ schemaVersion: candidate.schemaVersion, packageId: candidate.packageId, assets: Object.freeze(assets) });
}

export function projectHostedTeacherUiPreview(candidate) {
  const document = normalizeHostedTeacherUiDocument(candidate);
  const assets = Object.fromEntries(Object.entries(document.assets).map(([id, value]) => [id, normalizeAsset(id, {
    sha256: value.sha256,
    extension: value.extension,
    mediaType: value.mediaType,
    sizeBytes: value.sizeBytes,
    width: value.width,
    height: value.height,
  }, { publicProjection: true })]));
  return Object.freeze({ schemaVersion: document.schemaVersion, packageId: document.packageId, assets: Object.freeze(assets) });
}

export function normalizeHostedTeacherUiPreview(candidate) {
  exactObject(candidate, ["schemaVersion", "packageId", "assets"], "Invalid hosted Teacher UI preview.");
  if (candidate.schemaVersion !== HOSTED_TEACHER_UI_SCHEMA_VERSION || candidate.packageId !== HOSTED_TEACHER_UI_PACKAGE_ID) throw new Error("Unsupported hosted Teacher UI preview identity.");
  exactObject(candidate.assets, Object.keys(candidate.assets || {}), "Invalid hosted Teacher UI preview asset map.");
  const assets = Object.fromEntries(Object.entries(candidate.assets).map(([id, value]) => [id, normalizeAsset(id, value, { publicProjection: true })]));
  assertAtomicTitle(assets);
  return Object.freeze({ schemaVersion: candidate.schemaVersion, packageId: candidate.packageId, assets: Object.freeze(assets) });
}

export function hostedTeacherUiAssetPath(asset) {
  const parameters = new URLSearchParams(globalThis.location?.search || "");
  const releaseIds = parameters.getAll("releaseId");
  if (releaseIds.length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(releaseIds[0])) {
    return `/preview/releases/books/ultimate-b2/components/ultimate-b2-students-book/${releaseIds[0].toLowerCase()}/assets/${asset.sha256}.${asset.extension}`;
  }
  return `/preview/ui-assets/${asset.sha256}.${asset.extension}`;
}
