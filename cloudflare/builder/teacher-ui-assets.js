import {
  buildBookAssetHostedOpenResponsePublicKey,
  buildBookAssetHostedTeacherUiPublicKey,
} from "../../lib/book-assets/object-keys.js";

const TEACHER_UI_ASSET_ROUTE = /^\/preview\/ui-assets(?:-v2)?\/([a-f0-9]{64})\.(png|jpg|webp|mp3|wav|gaf)\/?$/;
const OPEN_RESPONSE_ASSET_ROUTE = /^\/preview\/open-response-assets\/([a-f0-9]{64})\.(png|jpg|webp)\/?$/;
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
  return new Response("Public asset not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function isTeacherUiAssetNamespace(pathname) {
  return pathname === "/preview/ui-assets" || pathname.startsWith("/preview/ui-assets/")
    || pathname === "/preview/ui-assets-v2" || pathname.startsWith("/preview/ui-assets-v2/");
}

export function isBuilderPublicAssetNamespace(pathname) {
  return isTeacherUiAssetNamespace(pathname)
    || pathname === "/preview/open-response-assets" || pathname.startsWith("/preview/open-response-assets/");
}

function publicAssetRequest(pathname) {
  const teacherUi = pathname.match(TEACHER_UI_ASSET_ROUTE);
  if (teacherUi) return {
    extension: teacherUi[2],
    objectKey: buildBookAssetHostedTeacherUiPublicKey({ checksum: teacherUi[1], extension: teacherUi[2] }),
  };
  const openResponse = pathname.match(OPEN_RESPONSE_ASSET_ROUTE);
  if (openResponse) return {
    extension: openResponse[2],
    objectKey: buildBookAssetHostedOpenResponsePublicKey({ checksum: openResponse[1], extension: `.${openResponse[2]}` }),
  };
  return null;
}

export async function serveBuilderPublicAsset(request, bucket) {
  const asset = publicAssetRequest(new URL(request.url).pathname);
  if (!asset) return notFound();
  if (!["GET", "HEAD"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (!bucket) return new Response("Public assets unavailable", { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

  if (request.method === "HEAD") {
    const object = await bucket.head(asset.objectKey);
    return object ? new Response(null, { status: 200, headers: assetHeaders(object, asset.extension) }) : notFound();
  }
  const object = await bucket.get(asset.objectKey);
  if (!object?.body) return notFound();
  return new Response(object.body, { status: 200, headers: assetHeaders(object, asset.extension) });
}
