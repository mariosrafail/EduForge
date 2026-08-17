const DEFAULT_MAX_BODY_BYTES = 6 * 1024 * 1024;

export class RequestBodyTooLargeError extends Error {
  constructor(limit) {
    super(`Request body exceeds the ${limit}-byte compatibility limit.`);
    this.name = "RequestBodyTooLargeError";
    this.statusCode = 413;
  }
}

function queryParameters(searchParams) {
  const single = {};
  const multiple = {};
  for (const [key, value] of searchParams) {
    single[key] = value;
    (multiple[key] ||= []).push(value);
  }
  return { single, multiple };
}

async function boundedBody(request, limit) {
  if (request.method === "GET" || request.method === "HEAD" || !request.body) {
    return { body: null, isBase64Encoded: false };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) throw new RequestBodyTooLargeError(limit);

  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new RequestBodyTooLargeError(limit);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { body: new TextDecoder("utf-8", { fatal: true }).decode(bytes), isBase64Encoded: false };
  } catch {
    return { body: bytesToBase64(bytes), isBase64Encoded: true };
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function requestToNetlifyEvent(request, { maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  const url = new URL(request.url);
  const headers = Object.fromEntries([...request.headers].map(([name, value]) => [name.toLowerCase(), value]));
  // Cloudflare sets CF-Connecting-IP at the edge. Always replace the legacy
  // trusted field so caller-supplied Netlify/X-Forwarded-For values cannot win.
  headers["x-nf-client-connection-ip"] = request.headers.get("cf-connecting-ip") || "unknown";
  const query = queryParameters(url.searchParams);
  return {
    httpMethod: request.method,
    path: url.pathname,
    rawUrl: request.url,
    rawQuery: url.search.slice(1),
    queryStringParameters: query.single,
    multiValueQueryStringParameters: query.multiple,
    headers,
    ...await boundedBody(request, maxBodyBytes),
  };
}

function appendHeader(headers, name, value) {
  if (Array.isArray(value)) {
    for (const item of value) headers.append(name, String(item));
  } else if (value !== undefined && value !== null) {
    headers.append(name, String(value));
  }
}

export function netlifyResultToResponse(result = {}) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(result.headers || {})) appendHeader(headers, name, value);
  for (const [name, values] of Object.entries(result.multiValueHeaders || {})) {
    headers.delete(name);
    appendHeader(headers, name, values);
  }
  const status = Number(result.statusCode) || 200;
  const body = result.body === undefined || result.body === null || status === 204 || status === 304
    ? null
    : result.isBase64Encoded ? base64ToBytes(result.body) : String(result.body);
  return new Response(body, { status, headers });
}

export async function invokeNetlifyHandler(handler, request, options) {
  try {
    const event = await requestToNetlifyEvent(request, options);
    return netlifyResultToResponse(await handler(event, {}));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return new Response(JSON.stringify({ error: "Request body too large" }), {
        status: 413,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
      });
    }
    throw error;
  }
}
