import { createHash } from "node:crypto";

export async function serveBuilderPrivateFont({ storage, asset, method = "GET", vary = null }) {
  const byteSize = Number(asset.byte_size);
  const headers = {
    "Cache-Control": "private, no-store",
    "Content-Length": String(byteSize),
    "Content-Type": "font/ttf",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    ...(vary ? { Vary: vary } : {}),
  };
  if (method === "HEAD") return { statusCode: 200, headers, body: "" };
  const bytes = Buffer.from(await storage.download({ profile: "private", objectKey: asset.object_key }));
  if (bytes.length !== byteSize || createHash("sha256").update(bytes).digest("hex") !== asset.checksum_sha256) {
    throw new Error("managed_font_integrity_failed");
  }
  return { statusCode: 200, headers, body: bytes.toString("base64"), isBase64Encoded: true };
}
