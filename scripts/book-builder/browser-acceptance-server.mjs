import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

export const browserAssetMime = Object.freeze({
  ".css": "text/css",
  ".gaf": "application/x-gaf",
  ".html": "text/html",
  ".jpg": "image/jpeg",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
});

export function sendJson(response, value, status = 200) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}

export async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export async function requestBytes(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export function netlifyEvent(request, url, body = "") {
  return {
    httpMethod: request.method,
    path: url.pathname,
    headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value || "")])),
    queryStringParameters: Object.fromEntries(url.searchParams),
    multiValueQueryStringParameters: Object.fromEntries([...new Set(url.searchParams.keys())].map((key) => [key, url.searchParams.getAll(key)])),
    body,
  };
}

export function sendNetlify(response, result) {
  const body = result.body || "";
  response.writeHead(result.statusCode, { ...(result.headers || {}), "Content-Length": Buffer.byteLength(body) });
  response.end(body);
}

export async function staticFile(root, pathname, response) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  let file = path.resolve(root, relative);
  let details = file.startsWith(`${root}${path.sep}`) ? await stat(file).catch(() => null) : null;
  if (!details?.isFile()) { file = path.join(root, "index.html"); details = await stat(file); }
  response.writeHead(200, { "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-store", "Content-Length": details.size, "Content-Type": browserAssetMime[path.extname(file).toLowerCase()] || "application/octet-stream" });
  createReadStream(file).pipe(response);
}
