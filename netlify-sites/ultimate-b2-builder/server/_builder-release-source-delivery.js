function headers(pin, { contentLength, range = null } = {}) {
  const result = new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=31536000, immutable",
    "Content-Type": pin.media_type,
    "Content-Length": String(contentLength ?? pin.byte_size),
    "X-Content-Type-Options": "nosniff",
    Vary: "Cookie",
  });
  if (range) result.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${pin.byte_size}`);
  return result;
}

function requestedRange(value, size) {
  if (!value) return null;
  const match = String(value).match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return false;
  if (!match[1]) {
    const length = Math.min(Number(match[2]), size);
    return Number.isSafeInteger(length) && length > 0 ? { offset: size - length, length } : false;
  }
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return false;
  return { offset: start, length: Math.min(end, size - 1) - start + 1 };
}

function unavailable(status = 409, code = "release_pin_integrity_failed", extraHeaders = {}) {
  return new Response(JSON.stringify({ error: code }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders } });
}

export async function servePinnedReleaseSourceAsset({ event, context, pin }) {
  const bucket = context?.cloudflare?.releaseSourceAssets;
  const request = context?.cloudflare?.request;
  if (!bucket || !request) return unavailable(503, "release_asset_unavailable");
  const range = requestedRange(request.headers.get("range"), Number(pin.byte_size));
  if (range === false) return unavailable(416, "invalid_range", { "Content-Range": `bytes */${pin.byte_size}` });
  try {
    if (event.httpMethod === "HEAD") {
      const object = await bucket.head(pin.object_key);
      if (!object || Number(object.size) !== Number(pin.byte_size)) return unavailable();
      return new Response(null, { status: range ? 206 : 200, headers: headers(pin, { contentLength: range?.length, range }) });
    }
    const object = await bucket.get(pin.object_key, range ? { range } : undefined);
    if (!object || Number(object.size) !== Number(pin.byte_size)) return unavailable();
    return new Response(object.body, { status: range ? 206 : 200, headers: headers(pin, { contentLength: range?.length, range }) });
  } catch {
    return unavailable();
  }
}

export { requestedRange as parseReleaseAssetRange };
