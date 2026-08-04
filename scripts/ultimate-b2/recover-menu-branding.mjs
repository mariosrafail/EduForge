import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const write = args.includes("--write");
const sourceArg = args.find((value) => !value.startsWith("--"));
if (!sourceArg) throw new Error("Usage: node scripts/ultimate-b2/recover-menu-branding.mjs <source.app> [--write]");

const sourceRoot = path.resolve(sourceArg);
const outputRoot = path.join(repoRoot, "src/assets/books/ultimate-b2/legacy-classroom-ui/branding");
const logoArchive = "Contents/Resources/assets/home/common/logo_1.zip";
const publisherLogo = "Contents/Resources/assets/topbar/HD/topBar_URL.png";
const expectedEntries = new Map([
  ["logo/logo.gaf", "menu-title-animation/logo.gaf"],
  ["logo/logo_SD.png", "menu-title-animation/logo_SD.png"],
  ["logo/logo_HD.png", "menu-title-animation/logo_HD.png"],
  ["logo/logo_SD_2.png", "menu-title-animation/logo_SD_2.png"],
  ["logo/logo_HD_2.png", "menu-title-animation/logo_HD_2.png"],
]);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function ensureOutsideSource(output) {
  const relative = path.relative(sourceRoot, path.resolve(output));
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) throw new Error(`Refusing to write inside source bundle: ${output}`);
}

function readZipEntries(bytes) {
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) { endOffset = offset; break; }
  }
  if (endOffset < 0) throw new Error("ZIP end-of-central-directory record not found");
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  let offset = bytes.readUInt32LE(endOffset + 16);
  const entries = new Map();
  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error(`Invalid ZIP central-directory entry ${index}`);
    const method = bytes.readUInt16LE(offset + 10);
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const localOffset = bytes.readUInt32LE(offset + 42);
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameLength).replaceAll("\\", "/");
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`Invalid local ZIP header for ${name}`);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(start, start + compressedSize);
    const content = method === 0 ? Buffer.from(compressed) : method === 8 ? zlib.inflateRawSync(compressed) : null;
    if (!content) throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    if (content.length !== uncompressedSize) throw new Error(`ZIP length mismatch for ${name}`);
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseGafSummary(bytes) {
  const signature = bytes.readUInt32LE(0);
  const version = `${bytes.readInt8(4)}.${bytes.readInt8(5)}`;
  const declaredLength = bytes.readUInt32LE(6);
  const payload = signature === 0x00474143 ? zlib.inflateSync(bytes.subarray(10)) : bytes.subarray(10);
  if (payload.length !== declaredLength) throw new Error("GAF decompressed length mismatch");
  let position = 0;
  const u8 = () => payload.readUInt8(position++);
  const i8 = () => payload.readInt8(position++);
  const u16 = () => { const value = payload.readUInt16LE(position); position += 2; return value; };
  const i16 = () => { const value = payload.readInt16LE(position); position += 2; return value; };
  const u32 = () => { const value = payload.readUInt32LE(position); position += 4; return value; };
  const f32 = () => { const value = payload.readFloatLE(position); position += 4; return value; };
  const utf = () => { const length = u16(); const value = payload.toString("utf8", position, position + length); position += length; return value; };
  const scales = Array.from({ length: u32() }, f32);
  const csfs = Array.from({ length: u32() }, f32);
  let stage;
  let timeline;
  let sources = [];
  let timelineEnd = -1;
  while (position + 6 <= payload.length) {
    const tag = i16();
    const length = u32();
    const end = position + length;
    if (tag === 9) {
      stage = { fps: i8(), color: payload.readInt32LE(position), width: (position += 4, u16()), height: u16() };
      position = end;
    } else if (tag === 13) {
      timeline = {
        id: u32(),
        frames: u32(),
        bounds: { x: f32(), y: f32(), width: f32(), height: f32() },
        pivot: { x: f32(), y: f32() },
      };
      if (u8()) timeline.linkage = utf();
      timelineEnd = end;
    } else if (tag === 8) {
      const scale = f32();
      const atlasCount = i8();
      sources = [];
      for (let atlas = 0; atlas < atlasCount; atlas += 1) {
        const atlasId = u32();
        const sourceCount = i8();
        for (let source = 0; source < sourceCount; source += 1) sources.push({ atlasId, source: utf(), csf: f32() });
      }
      timeline.atlas = { scale, sources, elementCount: u32() };
      position = end;
    } else if (tag === 10) {
      const count = u32();
      const types = { 0: "texture", 1: "text", 2: "timeline" };
      const byType = {};
      for (let index = 0; index < count; index += 1) {
        u32(); u32();
        const type = types[u16()] || "unknown";
        byType[type] = (byType[type] || 0) + 1;
      }
      timeline.objects = { count, byType };
      position = end;
    } else if (tag === 6) {
      const count = u32();
      timeline.sequences = Array.from({ length: count }, () => ({ id: utf(), start: i16(), end: i16() }));
      position = end;
    } else if (tag === 12) {
      timeline.frameRecords = u32();
      position = end;
    } else {
      position = end;
      if (tag === 0 && timelineEnd < 0) break;
      if (tag === 0) timelineEnd = -1;
    }
  }
  return { signature: signature.toString(16).padStart(8, "0"), version, declaredLength, scales, csfs, stage, timeline, sources };
}

if (!fs.existsSync(sourceRoot) || !sourceRoot.toLowerCase().endsWith(".app")) throw new Error("Explicit source path must be an existing .app directory");
const archiveBytes = fs.readFileSync(path.join(sourceRoot, ...logoArchive.split("/")));
const entries = readZipEntries(archiveBytes);
const missing = [...expectedEntries.keys()].filter((name) => !entries.has(name));
if (missing.length) throw new Error(`Missing expected logo archive entries: ${missing.join(", ")}`);

const report = {
  method: "static ZIP extraction and GAF metadata parsing; no native or ActionScript execution",
  sourceArchive: logoArchive,
  sourceArchiveSha256: sha256(archiveBytes),
  publisherLogo: {
    sourceRelativePath: publisherLogo,
    sha256: sha256(fs.readFileSync(path.join(sourceRoot, ...publisherLogo.split("/")))),
  },
  animation: parseGafSummary(entries.get("logo/logo.gaf")),
  entries: [...expectedEntries].map(([source, output]) => ({ source, output, sizeBytes: entries.get(source).length, sha256: sha256(entries.get(source)) })),
};

if (write) {
  ensureOutsideSource(outputRoot);
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, ...publisherLogo.split("/")), path.join(outputRoot, "hamilton-house-logo.png"));
  for (const [source, output] of expectedEntries) {
    const destination = path.join(outputRoot, ...output.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, entries.get(source));
  }
}

console.log(JSON.stringify(report, null, 2));
