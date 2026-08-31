import { createHash } from "node:crypto";

export const MANAGED_TTF_MAXIMUM_BYTES = 12 * 1024 * 1024;
export const MANAGED_TTF_MEDIA_TYPE = "font/ttf";

const REQUIRED_TABLES = Object.freeze(["cmap", "head", "maxp", "name"]);

function uint16(bytes, offset) {
  return bytes.readUInt16BE(offset);
}

function uint32(bytes, offset) {
  return bytes.readUInt32BE(offset);
}

export function inspectManagedTtf(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  if (!bytes.length) throw new Error("empty_font");
  if (bytes.length > MANAGED_TTF_MAXIMUM_BYTES) throw new Error("actual_file_too_large");
  if (bytes.length < 12) throw new Error("truncated_font");
  const signature = uint32(bytes, 0);
  if (signature !== 0x00010000 && signature !== 0x74727565) throw new Error("unsupported_font_signature");
  const tableCount = uint16(bytes, 4);
  if (tableCount < REQUIRED_TABLES.length || tableCount > 4096 || 12 + tableCount * 16 > bytes.length) throw new Error("truncated_font");
  const tables = new Map();
  for (let index = 0; index < tableCount; index += 1) {
    const offset = 12 + index * 16;
    const tag = bytes.toString("latin1", offset, offset + 4);
    const tableOffset = uint32(bytes, offset + 8);
    const tableLength = uint32(bytes, offset + 12);
    if (!/^[ -~]{4}$/.test(tag) || tables.has(tag) || tableLength < 1 || tableOffset % 4 !== 0 || tableOffset > bytes.length || tableLength > bytes.length - tableOffset) throw new Error("truncated_font");
    tables.set(tag, { offset: tableOffset, length: tableLength });
  }
  if (REQUIRED_TABLES.some((tag) => !tables.has(tag))) throw new Error("unsupported_font_tables");
  const head = tables.get("head");
  const maxp = tables.get("maxp");
  const cmap = tables.get("cmap");
  const name = tables.get("name");
  if (head.length < 54 || uint32(bytes, head.offset + 12) !== 0x5f0f3cf5) throw new Error("malformed_font");
  const maxpVersion = maxp.length >= 6 ? uint32(bytes, maxp.offset) : 0;
  if (![0x00010000, 0x00005000].includes(maxpVersion) || uint16(bytes, maxp.offset + 4) < 1) throw new Error("malformed_font");
  if (cmap.length < 4 || uint16(bytes, cmap.offset) !== 0 || uint16(bytes, cmap.offset + 2) < 1 || 4 + uint16(bytes, cmap.offset + 2) * 8 > cmap.length) throw new Error("malformed_font");
  const nameVersion = name.length >= 6 ? uint16(bytes, name.offset) : -1;
  const nameCount = name.length >= 6 ? uint16(bytes, name.offset + 2) : 0;
  const nameStrings = name.length >= 6 ? uint16(bytes, name.offset + 4) : name.length + 1;
  if (![0, 1].includes(nameVersion) || nameCount < 1 || 6 + nameCount * 12 > name.length || nameStrings > name.length) throw new Error("malformed_font");
  return {
    bytes,
    mimeType: MANAGED_TTF_MEDIA_TYPE,
    extension: ".ttf",
    byteSize: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    width: null,
    height: null,
  };
}
