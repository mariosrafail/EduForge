import manifest from "./player-media-manifest.json" with { type: "json" };

const recordsByPublicPath = new Map(manifest.objects.map((record) => [record.publicPath, Object.freeze(record)]));

export const PLAYER_MEDIA_BINDING = manifest.binding;
export const PLAYER_MEDIA_BUCKET = manifest.bucketName;
export const PLAYER_MEDIA_RECORDS = Object.freeze([...recordsByPublicPath.values()]);

function mediaHeaders(object, contentLength) {
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", "video/mp4");
  headers.set("Content-Length", String(contentLength));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  headers.set("X-Content-Type-Options", "nosniff");
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  return headers;
}

export function parsePlayerMediaRange(value, size) {
  if (value === null) return null;
  if (!Number.isSafeInteger(size) || size <= 0 || typeof value !== "string" || value.includes(",")) return false;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return false;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return false;
    const length = Math.min(suffix, size);
    return { offset: size - length, length, end: size - 1 };
  }
  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(requestedEnd) || offset >= size || requestedEnd < offset) return false;
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1, end };
}

function notFound() {
  return new Response("Player media not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function rangeNotSatisfiable(size) {
  return new Response(null, {
    status: 416,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes */${size}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function servePlayerMedia(request, bucket) {
  const record = recordsByPublicPath.get(new URL(request.url).pathname);
  if (!record) return notFound();
  if (!bucket) return new Response("Player media unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  }

  if (request.method === "HEAD") {
    const object = await bucket.head(record.objectKey);
    if (!object) return notFound();
    return new Response(null, { status: 200, headers: mediaHeaders(object, object.size) });
  }

  const range = parsePlayerMediaRange(request.headers.get("Range"), record.byteSize);
  if (range === false) return rangeNotSatisfiable(record.byteSize);
  const object = await bucket.get(record.objectKey, range ? { range: { offset: range.offset, length: range.length } } : undefined);
  if (!object || !("body" in object)) return notFound();
  const headers = mediaHeaders(object, range ? range.length : object.size);
  if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.end}/${record.byteSize}`);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
