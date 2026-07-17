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
