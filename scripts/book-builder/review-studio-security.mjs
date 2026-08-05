import { timingSafeEqual } from "node:crypto";
import path from "node:path";

export const BOOK_BUILDER_API_ROOT = "/__hhplms/book-builder";
export const BOOK_BUILDER_SESSION_HEADER = "x-hhplms-book-builder-session";
export const MAXIMUM_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAXIMUM_ARTIFACT_BYTES = 64 * 1024 * 1024;
export const MAXIMUM_PREVIEW_BYTES = 12 * 1024 * 1024;
export const MAXIMUM_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

export const LOOPBACK_ADDRESSES = new Set([
  "127.0.0.1",
  "::1",
  "::ffff:127.0.0.1",
]);

const safeProjectId = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const loopbackHost = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i;
const forbiddenArtifact = /(?:^|[\\/])internal(?:[\\/]|$)|(?:solution|answer-evidence|decoded|iwb-key|local-source-binding)/i;
const absoluteWindowsPath = /(?:^|[\s"'])(?:[a-z]:[\\/]|\\\\)[^\s"']*/i;
const absoluteUserPath = /(?:^|[\s"'])(?:\/Users\/|\/home\/)[^\s"']*/i;

export class ReviewStudioError extends Error {
  constructor(code, statusCode = 400) {
    super(code);
    this.name = "ReviewStudioError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function assertSafeProjectId(value) {
  if (!safeProjectId.test(String(value || ""))) throw new ReviewStudioError("invalid_project_id", 400);
  return String(value);
}

export function assertAllowedArtifactPath(parts) {
  const normalized = parts.map((part) => String(part));
  if (normalized.some((part) => part === ".." || part === "." || path.isAbsolute(part))) {
    throw new ReviewStudioError("artifact_not_available", 404);
  }
  if (forbiddenArtifact.test(normalized.join("/"))) {
    throw new ReviewStudioError("artifact_not_available", 404);
  }
  return normalized;
}

export function isForbiddenArtifactName(value) {
  return forbiddenArtifact.test(String(value || ""));
}

export function isLoopbackHost(value) {
  return loopbackHost.test(String(value || ""));
}

export function sameOriginForHost(origin, host) {
  if (!origin) return true;
  try {
    const parsed = new URL(String(origin));
    return parsed.protocol === "http:" && parsed.host.toLowerCase() === String(host || "").toLowerCase();
  } catch {
    return false;
  }
}

export function equalSessionToken(actual, expected) {
  const left = Buffer.from(String(actual || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export function boundedInteger(value, { fallback, minimum = 1, maximum = MAXIMUM_PAGE_SIZE } = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(String(value))) throw new ReviewStudioError("invalid_pagination", 400);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ReviewStudioError("invalid_pagination", 400);
  }
  return parsed;
}

export function safeText(value, fallback = "Unavailable", maximumLength = 512) {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || absoluteWindowsPath.test(normalized) || absoluteUserPath.test(normalized)) return fallback;
  return normalized.slice(0, maximumLength);
}

export function safeRelativeLocator(value, fallback = "Unavailable") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized)) return fallback;
  if (normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) return fallback;
  return safeText(normalized, fallback, 2048);
}

export function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function safeConfidence(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : null;
}

export function safeCountRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key, count]) => /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(key) && Number.isSafeInteger(count) && count >= 0)
    .sort(([left], [right]) => left.localeCompare(right)));
}

export function assertSafeResponseBody(serialized) {
  const bytes = Buffer.byteLength(serialized);
  if (bytes > MAXIMUM_JSON_RESPONSE_BYTES) throw new ReviewStudioError("response_too_large", 413);
  if (absoluteWindowsPath.test(serialized) || absoluteUserPath.test(serialized)) {
    throw new ReviewStudioError("unsafe_response_blocked", 500);
  }
  if (/"(?:selectedOuterPath|selectedOuterRealPath|canonicalApplicationRoot|canonicalApplicationRealPath|iwbKey|decodedXml|acceptedAnswers|correctAnswers|answerValues?)"\s*:/i.test(serialized)) {
    throw new ReviewStudioError("unsafe_response_blocked", 500);
  }
  return bytes;
}

export function publicError(error) {
  if (error instanceof ReviewStudioError) return error;
  if (error?.code === "ENOENT") return new ReviewStudioError("resource_not_available", 404);
  return new ReviewStudioError("review_studio_request_failed", 500);
}
