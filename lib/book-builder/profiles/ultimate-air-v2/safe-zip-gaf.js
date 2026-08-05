import { inflateRawSync, inflateSync } from "node:zlib";
import path from "node:path";

function normalizeEntryPath(value) {
  const normalized = String(value).replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || path.posix.isAbsolute(normalized) || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) throw new Error(`Unsafe ZIP entry path: ${value}`);
  return normalized;
}

export function readSafeZipEntries(bytes) {
  const archive = Buffer.from(bytes);
  let endOffset = -1;
  for (let offset = archive.length - 22; offset >= Math.max(0, archive.length - 65_557); offset -= 1) {
    if (offset + 22 <= archive.length && archive.readUInt32LE(offset) === 0x06054b50) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw new Error("ZIP end-of-central-directory record not found");
  if (archive.readUInt16LE(endOffset + 4) !== 0 || archive.readUInt16LE(endOffset + 6) !== 0) throw new Error("Multi-disk ZIP archives are unsupported");
  const entryCount = archive.readUInt16LE(endOffset + 10);
  if (entryCount !== archive.readUInt16LE(endOffset + 8)) throw new Error("ZIP entry-count mismatch");
  const directorySize = archive.readUInt32LE(endOffset + 12);
  let offset = archive.readUInt32LE(endOffset + 16);
  const directoryEnd = offset + directorySize;
  if (directoryEnd > endOffset) throw new Error("ZIP central directory exceeds archive bounds");
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) throw new Error(`Invalid ZIP central-directory entry ${index}`);
    const method = archive.readUInt16LE(offset + 10);
    if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method ${method}`);
    const compressedSize = archive.readUInt32LE(offset + 20); const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28); const extraLength = archive.readUInt16LE(offset + 30); const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    if (offset + 46 + nameLength + extraLength + commentLength > archive.length) throw new Error("Truncated ZIP central directory");
    const name = normalizeEntryPath(archive.toString("utf8", offset + 46, offset + 46 + nameLength));
    const identity = name.toLowerCase();
    if (entries.has(identity)) throw new Error(`Duplicate normalized ZIP entry: ${name}`);
    if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP header for ${name}`);
    const localNameLength = archive.readUInt16LE(localOffset + 26); const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localName = normalizeEntryPath(archive.toString("utf8", localOffset + 30, localOffset + 30 + localNameLength));
    if (localName !== name) throw new Error(`ZIP local/central name mismatch for ${name}`);
    const start = localOffset + 30 + localNameLength + localExtraLength; const end = start + compressedSize;
    if (end > archive.length) throw new Error(`Truncated ZIP entry: ${name}`);
    const compressed = archive.subarray(start, end);
    const content = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
    if (content.length !== uncompressedSize) throw new Error(`ZIP length mismatch for ${name}`);
    entries.set(identity, { path: name, compressionMethod: method, compressedSize, uncompressedSize, content });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== directoryEnd) throw new Error("ZIP central-directory length mismatch");
  return new Map([...entries.values()].sort((a, b) => a.path.localeCompare(b.path)).map((entry) => [entry.path, entry]));
}

class Reader {
  constructor(bytes) { this.bytes = bytes; this.position = 0; }
  require(length) { if (this.position + length > this.bytes.length) throw new Error("GAF record exceeds declared payload"); }
  u8() { this.require(1); return this.bytes.readUInt8(this.position++); }
  i8() { this.require(1); return this.bytes.readInt8(this.position++); }
  u16() { this.require(2); const value = this.bytes.readUInt16LE(this.position); this.position += 2; return value; }
  i16() { this.require(2); const value = this.bytes.readInt16LE(this.position); this.position += 2; return value; }
  u32() { this.require(4); const value = this.bytes.readUInt32LE(this.position); this.position += 4; return value; }
  i32() { this.require(4); const value = this.bytes.readInt32LE(this.position); this.position += 4; return value; }
  f32() { this.require(4); const value = this.bytes.readFloatLE(this.position); this.position += 4; return value; }
  utf() { const length = this.u16(); this.require(length); const value = this.bytes.toString("utf8", this.position, this.position + length); this.position += length; return value; }
}

export function parseGafSummary(bytes) {
  const file = Buffer.from(bytes);
  if (file.length < 10) throw new Error("Truncated GAF header");
  const signature = file.readUInt32LE(0); const version = `${file.readInt8(4)}.${file.readInt8(5)}`; const declaredLength = file.readUInt32LE(6);
  let payload;
  if (signature === 0x00474143) payload = inflateSync(file.subarray(10));
  else if (signature === 0x00474146) payload = file.subarray(10);
  else throw new Error(`Unsupported GAF signature: ${signature.toString(16)}`);
  if (payload.length !== declaredLength) throw new Error("GAF decompressed length mismatch");
  const reader = new Reader(payload); const scales = Array.from({ length: reader.u32() }, () => reader.f32()); const csfs = Array.from({ length: reader.u32() }, () => reader.f32());
  let stage = null; let timeline = null; let sources = []; let timelineEnd = -1;
  while (reader.position + 6 <= payload.length) {
    const tag = reader.i16(); const length = reader.u32(); const end = reader.position + length;
    if (end > payload.length) throw new Error(`GAF tag ${tag} exceeds declared payload`);
    let entersTimeline = false;
    if (tag === 9) stage = { fps: reader.i8(), color: reader.i32(), width: reader.u16(), height: reader.u16() };
    else if (tag === 13) { timeline = { id: reader.u32(), frames: reader.u32(), bounds: { x: reader.f32(), y: reader.f32(), width: reader.f32(), height: reader.f32() }, pivot: { x: reader.f32(), y: reader.f32() } }; if (reader.u8()) timeline.linkage = reader.utf(); timelineEnd = end; entersTimeline = true; }
    else if (tag === 8 && timeline) { const scale = reader.f32(); const atlasCount = reader.i8(); sources = []; for (let atlas = 0; atlas < atlasCount; atlas += 1) { const atlasId = reader.u32(); const sourceCount = reader.i8(); for (let source = 0; source < sourceCount; source += 1) sources.push({ atlasId, source: reader.utf(), csf: reader.f32() }); } timeline.atlas = { scale, sources, elementCount: reader.u32() }; }
    else if (tag === 10 && timeline) { const count = reader.u32(); const types = { 0: "texture", 1: "text", 2: "timeline" }; const byType = {}; for (let index = 0; index < count; index += 1) { reader.u32(); reader.u32(); const type = types[reader.u16()] || "unknown"; byType[type] = (byType[type] || 0) + 1; } timeline.objects = { count, byType }; }
    else if (tag === 6 && timeline) { const count = reader.u32(); timeline.sequences = Array.from({ length: count }, () => ({ id: reader.utf(), start: reader.i16(), end: reader.i16() })); }
    else if (tag === 12 && timeline) timeline.frameRecords = reader.u32();
    if (!entersTimeline) reader.position = end;
    if (tag === 0 && timelineEnd < 0) break;
    if (tag === 0) timelineEnd = -1;
  }
  if (!stage || !timeline) throw new Error("GAF stage or root timeline is missing");
  return { signature: signature.toString(16).padStart(8, "0"), version, declaredLength, scales, csfs, stage, timeline, sources };
}
