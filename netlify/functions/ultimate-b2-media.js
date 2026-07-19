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

const media = new Map([
  ["ultimate-b2.students-book.unit-2.reading.video-intro", { type: "video/mp4", path: "Contents/Resources/assets/videos/book1/unit/2/part2/obj1.mp4" }],
  ["ultimate-b2.students-book.unit-2.reading.text-audio", { type: "audio/mpeg", path: "Contents/Resources/assets/books/book1/unit/2/part2/obj2/audio.mp3" }],
  ["ultimate-b2.students-book.unit-2.grammar.video-intro", { type: "video/mp4", path: "Contents/Resources/assets/videos/book1/unit/2/part4/obj1.mp4" }],
  ["ultimate-b2.students-book.unit-2.listening.fjords", { type: "audio/mpeg", path: "Contents/Resources/assets/books/book1/unit/2/part5/obj3/audio.mp3" }],
  ["ultimate-b2.students-book.unit-2.listening.iceland-trip", { type: "audio/mpeg", path: "Contents/Resources/assets/books/book1/unit/2/part5/obj4/audio.mp3" }],
  ["ultimate-b2.students-book.unit-2.speaking.photo-comparison", { type: "audio/mpeg", path: "Contents/Resources/assets/books/book1/unit/2/part6/obj2/audio.mp3" }],
  ["ultimate-b2.students-book.unit-2.practice.tristan-da-cunha", { type: "audio/mpeg", path: "Contents/Resources/assets/books/book1/unit/2/part10/obj3/audio.mp3" }],
]);

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

async function hasUltimateB2MediaAccess(sql, currentUser) {
  if (currentUser.role === "admin") {
    const rows = await sql`select 1 from book_packages where slug = 'ultimate-b2' and status = 'active' limit 1`;
    return Boolean(rows[0]);
  }
  const rows = await sql`
    select 1
    from book_packages bp
    where bp.slug = 'ultimate-b2' and bp.status = 'active'
      and (
        exists (
          select 1 from book_access ba
          where ba.book_package_id = bp.id and ba.user_id = ${currentUser.id}
        )
        or (
          ${currentUser.role === "teacher"}
          and exists (
            select 1 from classes c
            where c.book_package_id = bp.id and c.teacher_id = ${currentUser.id}
              and c.school_id = ${currentUser.school_id} and coalesce(c.status, 'active') = 'active'
          )
        )
      )
    limit 1
  `;
  return Boolean(rows[0]);
}

async function resolvedMediaFile(relativePath) {
  const configuredRoot = process.env.ULTIMATE_B2_SOURCE_ROOT || path.resolve(process.cwd(), "Ultimate English B2.app");
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
  const item = media.get(String(event.queryStringParameters?.logicalKey || ""));
  if (!item) return notFound();

  try {
    const sql = getSql();
    const auth = await requireAuth(event, sql);
    if (auth.error) return auth.error;
    if (!(await hasUltimateB2MediaAccess(sql, auth.currentUser))) return forbidden("Ultimate B2 entitlement required");

    const data = await readFile(await resolvedMediaFile(item.path));
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
    return safeServerError(error, "Protected Unit 2 media is unavailable");
  }
}
