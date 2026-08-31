import path from "node:path";

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SAFE_OBJECT_KEY = /^[a-z0-9][a-z0-9._/-]{0,1023}$/;

export function normalizeObjectKeySegment(value, label = "object key segment") {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/-{2,}/g, "-");
  if (!SAFE_SEGMENT.test(normalized) || normalized === "." || normalized === "..") {
    throw new Error(`${label} is empty or unsafe`);
  }
  return normalized;
}

export function validateObjectKey(value) {
  const key = String(value ?? "");
  if (!SAFE_OBJECT_KEY.test(key) || key.includes("//") || key.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error("Object key is unsafe");
  }
  return key;
}

export function shortChecksum(checksum) {
  const value = String(checksum ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error("SHA-256 checksum must contain 64 lowercase hexadecimal characters");
  return value.slice(0, 12);
}

export function buildBookAssetObjectKey({
  publisherSlug,
  bookSlug,
  edition,
  version,
  componentSlug,
  unitSlug,
  pageNumber,
  activitySlug,
  role,
  fileName,
  checksum,
}) {
  const extension = path.extname(String(fileName || "")).toLowerCase();
  const stem = path.basename(String(fileName || "asset"), extension);
  const segments = [
    "publishers", normalizeObjectKeySegment(publisherSlug, "publisher slug"),
    "books", normalizeObjectKeySegment(bookSlug, "book slug"),
    "editions", normalizeObjectKeySegment(edition, "edition"),
    "versions", normalizeObjectKeySegment(version, "version"),
    "components", normalizeObjectKeySegment(componentSlug, "component slug"),
  ];
  if (unitSlug) segments.push("units", normalizeObjectKeySegment(unitSlug, "unit slug"));
  if (pageNumber) segments.push("pages", normalizeObjectKeySegment(String(pageNumber), "page number"));
  if (activitySlug) segments.push("activities", normalizeObjectKeySegment(activitySlug, "activity slug"));
  if (role === "thumbnail") segments.push("thumbnails");
  if (role === "audio") segments.push("audio");
  if (role === "video") segments.push("video");
  const safeStem = normalizeObjectKeySegment(stem, "file name");
  const safeExtension = extension && /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
  segments.push(`${safeStem}.${shortChecksum(checksum)}${safeExtension}`);
  return validateObjectKey(segments.join("/"));
}

function validatedUuidSegment(value, label) {
  const normalized = String(value || "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) throw new Error(`${label} must be a UUIDv4`);
  return normalized;
}

export function buildBookAssetImportStagingKey({ bookSlug, componentSlug, activityId, uploadId, fileId }) {
  return validateObjectKey([
    "builder-imports",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    normalizeObjectKeySegment(activityId, "activity id"),
    validatedUuidSegment(uploadId, "upload id"),
    "staging",
    validatedUuidSegment(fileId, "file id"),
  ].join("/"));
}

export function buildBookAssetHostedOpenResponsePublicKey({ checksum, extension }) {
  const digest = String(checksum || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Hosted Open Response public asset checksum is invalid");
  const suffix = String(extension || "").toLowerCase();
  if (![".png", ".jpg", ".webp"].includes(suffix)) throw new Error("Hosted Open Response public asset extension is invalid");
  return validateObjectKey(`publishers/hamilton-house/books/ultimate-b2/editions/students-book/versions/hosted-draft/components/ultimate-b2-students-book/open-response/assets/${digest}${suffix}`);
}

export function buildBookAssetHostedOpenResponseArchiveKey({ activityId, fingerprint, fileChecksum, extension }) {
  const sourceFingerprint = String(fingerprint || "").toLowerCase();
  const digest = String(fileChecksum || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sourceFingerprint) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Hosted Open Response archive identity is invalid");
  const suffix = String(extension || "").toLowerCase();
  if (![".xml", ".png", ".jpg", ".jpeg", ".webp"].includes(suffix)) throw new Error("Hosted Open Response archive extension is invalid");
  return validateObjectKey(`builder-imports/ultimate-b2/ultimate-b2-students-book/${normalizeObjectKeySegment(activityId, "activity id")}/archive/${sourceFingerprint}/${digest}${suffix}`);
}

export function buildBookAssetTeacherUiStagingKey({ bookSlug, componentSlug, uploadId, fileId }) {
  return validateObjectKey([
    "builder-ui-assets",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    validatedUuidSegment(uploadId, "upload id"),
    "staging",
    validatedUuidSegment(fileId, "file id"),
  ].join("/"));
}

export function buildNativeActivityAssetStagingKey({ bookSlug, componentSlug, activityId, uploadId }) {
  return validateObjectKey([
    "builder-native-assets",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    normalizeObjectKeySegment(activityId, "activity id"),
    validatedUuidSegment(uploadId, "upload id"),
    "staging",
    "asset",
  ].join("/"));
}

export function buildNativeActivityAssetObjectKey({ bookSlug, componentSlug, activityId, assetSlot = null, checksum, extension }) {
  const digest = String(checksum || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Native activity asset checksum is invalid");
  const suffix = String(extension || "").toLowerCase();
  if (![".png", ".jpg", ".webp", ".mp3", ".mp4", ".pdf"].includes(suffix)) throw new Error("Native activity asset extension is invalid");
  const segments = [
    "builder-native-assets",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    normalizeObjectKeySegment(activityId, "activity id"),
    "assets",
  ];
  if ([".mp3", ".mp4"].includes(suffix)) segments.push(normalizeObjectKeySegment(assetSlot, "native media asset slot"));
  segments.push(`${digest}${suffix}`);
  return validateObjectKey(segments.join("/"));
}

export function buildBuilderFontLibraryStagingKey({ bookSlug, componentSlug, uploadId }) {
  return validateObjectKey([
    "builder-font-library",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    validatedUuidSegment(uploadId, "upload id"),
    "staging",
    "font",
  ].join("/"));
}

export function buildBuilderFontLibraryObjectKey({ bookSlug, componentSlug, checksum }) {
  const digest = String(checksum || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Builder font checksum is invalid");
  return validateObjectKey([
    "builder-font-library",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    "assets",
    `${digest}.ttf`,
  ].join("/"));
}

export function buildUnitExtraAssetStagingKey({ bookSlug, componentSlug, unitSlug, itemId, uploadId }) {
  return validateObjectKey([
    "builder-unit-extra-assets",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    normalizeObjectKeySegment(unitSlug, "unit slug"),
    normalizeObjectKeySegment(itemId, "Unit Extra item id"),
    validatedUuidSegment(uploadId, "upload id"),
    "staging",
    "video",
  ].join("/"));
}

export function buildUnitExtraAssetObjectKey({ bookSlug, componentSlug, unitSlug, itemId, checksum, extension }) {
  const digest = String(checksum || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest) || String(extension || "").toLowerCase() !== ".mp4") throw new Error("Unit Extra MP4 identity is invalid");
  return validateObjectKey([
    "builder-unit-extra-assets",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    normalizeObjectKeySegment(unitSlug, "unit slug"),
    normalizeObjectKeySegment(itemId, "Unit Extra item id"),
    "assets",
    `${digest}.mp4`,
  ].join("/"));
}

export function buildBuilderPageAssetStagingKey({ bookSlug, componentSlug, pageId, uploadId }) {
  return validateObjectKey([
    "builder-page-assets",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    normalizeObjectKeySegment(pageId, "page id"),
    validatedUuidSegment(uploadId, "upload id"),
    "staging",
    "page-image",
  ].join("/"));
}

export function buildBuilderPageAssetObjectKey({ bookSlug, componentSlug, pageId, checksum, extension }) {
  const digest = String(checksum || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Builder page asset checksum is invalid");
  const suffix = String(extension || "").toLowerCase();
  if (![".png", ".jpg", ".webp"].includes(suffix)) throw new Error("Builder page asset extension is invalid");
  return validateObjectKey([
    "builder-page-assets",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    normalizeObjectKeySegment(pageId, "page id"),
    "assets",
    `${digest}${suffix}`,
  ].join("/"));
}

export function buildComponentReleaseAssetObjectKey({ bookSlug, componentSlug, checksum, extension }) {
  const digest = String(checksum || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Component release asset checksum is invalid");
  const suffix = String(extension || "").toLowerCase().replace(/^\./, "");
  if (!["png", "jpg", "webp", "mp3", "mp4", "pdf", "ttf"].includes(suffix)) throw new Error("Component release asset extension is invalid");
  return validateObjectKey([
    "builder-release-assets",
    normalizeObjectKeySegment(bookSlug, "book slug"),
    normalizeObjectKeySegment(componentSlug, "component slug"),
    `${digest}.${suffix}`,
  ].join("/"));
}

export function buildBookAssetHostedTeacherUiPublicKey({ checksum, extension }) {
  const digest = String(checksum || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Hosted Teacher UI public asset checksum is invalid");
  const suffix = String(extension || "").toLowerCase().replace(/^\./, "");
  if (!["png", "jpg", "webp", "mp3", "wav", "gaf"].includes(suffix)) throw new Error("Hosted Teacher UI public asset extension is invalid");
  return validateObjectKey(`publishers/hamilton-house/books/ultimate-b2/editions/students-book/versions/hosted-draft/components/ultimate-b2-students-book/teacher-ui/assets/${digest}.${suffix}`);
}

export function ensureSourceWithinRoot(sourceRoot, sourcePath) {
  const root = path.resolve(sourceRoot);
  const resolved = path.resolve(root, sourcePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    if (relative === "") throw new Error("Source path must identify a file inside the source root");
    throw new Error("Source path escapes the configured source root");
  }
  return resolved;
}
