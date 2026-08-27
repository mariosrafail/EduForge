import { buildBookAssetHostedTeacherUiPublicKey } from "../../lib/book-assets/object-keys.js";

const ASSET_ROUTE = /^\/preview\/ui-assets\/([a-f0-9]{64})\.(png|jpg|webp|mp3|wav|gaf)\/?$/;
const CONTENT_TYPES = Object.freeze({
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  gaf: "application/x-gaf",
});

function assetHeaders(object, extension) {
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", CONTENT_TYPES[extension]);
  headers.set("Content-Length", String(object.size));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return headers;
}

function notFound() {
  return new Response("Teacher UI asset not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function isTeacherUiAssetNamespace(pathname) {
  return pathname === "/preview/ui-assets" || pathname.startsWith("/preview/ui-assets/");
}

export async function serveTeacherUiAsset(request, bucket) {
  const match = new URL(request.url).pathname.match(ASSET_ROUTE);
  if (!match) return notFound();
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (!bucket) return new Response("Teacher UI assets unavailable", { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

  const objectKey = buildBookAssetHostedTeacherUiPublicKey({ checksum: match[1], extension: match[2] });
  if (request.method === "HEAD") {
    const object = await bucket.head(objectKey);
    return object ? new Response(null, { status: 200, headers: assetHeaders(object, match[2]) }) : notFound();
  }
  const object = await bucket.get(objectKey);
  if (!object?.body) return notFound();
  return new Response(object.body, { status: 200, headers: assetHeaders(object, match[2]) });
}
