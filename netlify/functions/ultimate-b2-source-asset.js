import { readFile } from "node:fs/promises";

import {
  databaseNotConfiguredResponse,
  getSql,
  isDatabaseNotConfiguredError,
  notFound,
  requireAuth,
  safeServerError,
} from "./_auth-utils.js";
import { canAccessBookPackage } from "./_book-package-access.js";
import { getUltimateB2LocalAsset, resolveAllowlistedUltimateB2AssetFile } from "./_ultimate-b2-local-assets.js";
import { isLocalRequestHost } from "../../shared/legacyFlashProof.js";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function handler(event) {
  const method = event.httpMethod || "GET";
  if (method === "OPTIONS") return { statusCode: 204, headers: privateHeaders, body: "" };
  if (!["GET", "HEAD"].includes(method) || !isLocalRequestHost(event.headers?.host || event.headers?.Host || "")) return notFound();
  const asset = getUltimateB2LocalAsset(event.queryStringParameters?.logicalKey);
  if (!asset || asset.endpoint !== "source") return notFound();

  try {
    const sql = getSql();
    const auth = await requireAuth(event, sql);
    if (auth.error) return auth.error;
    const entitled = await canAccessBookPackage(sql, auth.currentUser, { packageSlug: "ultimate-b2" });
    if (!entitled) return notFound();

    const data = await readFile(await resolveAllowlistedUltimateB2AssetFile(asset));
    return {
      statusCode: 200,
      headers: {
        ...privateHeaders,
        "Content-Type": asset.type,
        "Content-Length": String(data.length),
      },
      body: method === "HEAD" ? "" : data.toString("base64"),
      isBase64Encoded: method !== "HEAD",
    };
  } catch (error) {
    if (isDatabaseNotConfiguredError(error)) return databaseNotConfiguredResponse();
    return safeServerError(error, "Protected Students Book asset is unavailable");
  }
}
