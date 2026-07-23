import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import {
  databaseNotConfiguredResponse,
  forbidden,
  getSql,
  isDatabaseNotConfiguredError,
  notFound,
  requireAuth,
  safeServerError,
} from "./_auth-utils.js";
import { isLocalRequestHost } from "../../shared/legacyFlashProof.js";
import { canAccessBookPackage } from "./_book-package-access.js";
import { getUltimateB2MediaAsset } from "./_ultimate-b2-local-assets.js";

const privateHeaders = {
  "Accept-Ranges": "bytes",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export function parseMediaRange(value, size) {
  const match = String(value || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  let start = match[1] ? Number(match[1]) : null;
  let end = match[2] ? Number(match[2]) : null;
  if (start === null && end !== null) {
    start = Math.max(size - end, 0);
    end = size - 1;
  } else {
    start ??= 0;
    end = end === null ? size - 1 : Math.min(end, size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return null;
  return { start, end };
}

export async function hasUltimateB2MediaAccess(sql, currentUser) {
  return canAccessBookPackage(sql, currentUser, { packageSlug: "ultimate-b2" });
}

export async function resolveUltimateB2MediaFile(relativePath, configuredRoot = process.env.ULTIMATE_B2_SOURCE_ROOT || path.resolve(process.cwd(), "Ultimate English B2.app")) {
  const root = await realpath(configuredRoot);
  const file = await realpath(path.resolve(root, relativePath));
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Publisher media path escaped its source root");
  return file;
}

export async function handler(event) {
  const method = event.httpMethod || "GET";
  if (method === "OPTIONS") return { statusCode: 204, headers: privateHeaders, body: "" };
  if (!["GET", "HEAD"].includes(method) || !isLocalRequestHost(event.headers?.host || event.headers?.Host || "")) return notFound();
  const item = getUltimateB2MediaAsset(event.queryStringParameters?.logicalKey);
  if (!item) return notFound();

  try {
    const sql = getSql();
    const auth = await requireAuth(event, sql);
    if (auth.error) return auth.error;
    if (!(await hasUltimateB2MediaAccess(sql, auth.currentUser))) return forbidden("Ultimate B2 entitlement required");

    const data = await readFile(await resolveUltimateB2MediaFile(item.path));
    const requestedRange = event.headers?.range || event.headers?.Range || "";
    const range = requestedRange ? parseMediaRange(requestedRange, data.length) : null;
    if (requestedRange && !range) {
      return { statusCode: 416, headers: { ...privateHeaders, "Content-Range": `bytes */${data.length}` }, body: "" };
    }
    const body = range ? data.subarray(range.start, range.end + 1) : data;
    const headers = {
      ...privateHeaders,
      "Content-Type": item.type,
      "Content-Length": String(body.length),
      ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${data.length}` } : {}),
    };
    return {
      statusCode: range ? 206 : 200,
      headers,
      body: method === "HEAD" ? "" : body.toString("base64"),
      isBase64Encoded: method !== "HEAD",
    };
  } catch (error) {
    if (isDatabaseNotConfiguredError(error)) return databaseNotConfiguredResponse();
    return safeServerError(error, "Protected Students Book media is unavailable");
  }
}
