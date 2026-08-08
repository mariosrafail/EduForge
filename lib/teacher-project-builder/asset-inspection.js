import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

import { parseGafSummary } from "../book-builder/profiles/ultimate-air-v2/safe-zip-gaf.js";
import {
  TEACHER_CHROME_SLOTS,
  TEACHER_EDITION_SLOTS,
  TEACHER_PROJECT_LIMITS,
  TEACHER_TOOLBAR_SLOTS,
  TEACHER_UNIT_SLOTS,
} from "./constants.js";
import { TeacherProjectError } from "./errors.js";

const IMAGE_TYPES = Object.freeze({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" });
const AUDIO_TYPES = Object.freeze({ mp3: "audio/mpeg", wav: "audio/wav" });
const VISUAL_SECTIONS = new Map([
  ["background", new Set(["main"])],
  ["chrome", new Set(TEACHER_CHROME_SLOTS.map(({ id }) => id))],
  ["units", new Set(TEACHER_UNIT_SLOTS.map(({ id }) => id))],
  ["editions", new Set(TEACHER_EDITION_SLOTS.map(({ id }) => id))],
  ["toolbar", new Set(TEACHER_TOOLBAR_SLOTS.map(({ id }) => id))],
]);

function fail(code, statusCode = 400, details = null) {
  throw new TeacherProjectError(code, statusCode, details);
}

function safeOriginalFilename(value) {
  const base = path.basename(String(value || "upload").split(/[\\/]/).at(-1) || "upload")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^A-Za-z0-9._() -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  if (!base || base === "." || base === "..") return "upload";
  return base.slice(0, 180);
}

function assertRasterDimensions(width, height) {
  if (![width, height].every((value) => Number.isSafeInteger(value) && value > 0 && value <= TEACHER_PROJECT_LIMITS.rasterDimension)) {
    fail("invalid_teacher_raster_dimensions");
  }
  return { width, height };
}

function pngDimensions(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return assertRasterDimensions(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return null;
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if ([0xd8, 0xd9].includes(marker) || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (length < 7) return null;
      return assertRasterDimensions(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
    }
    offset += length;
  }
  return null;
}

function webpDimensions(bytes) {
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  const declared = bytes.readUInt32LE(4) + 8;
  if (declared > bytes.length || declared < 20) return null;
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8X") return assertRasterDimensions(1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3));
  if (kind === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const packed = bytes.readUInt32LE(21);
    return assertRasterDimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1);
  }
  if (kind === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return assertRasterDimensions(bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff);
  }
  return null;
}

async function inspectRaster(bytes) {
  const detected = [
    ["png", pngDimensions(bytes)],
    ["jpeg", jpegDimensions(bytes)],
    ["webp", webpDimensions(bytes)],
  ].find(([, dimensions]) => dimensions);
  if (!detected) fail("invalid_teacher_raster");
  try {
    const metadata = await sharp(bytes, { failOn: "warning", limitInputPixels: TEACHER_PROJECT_LIMITS.rasterDimension ** 2 }).metadata();
    if (metadata.format !== detected[0] || metadata.width !== detected[1].width || metadata.height !== detected[1].height) fail("invalid_teacher_raster");
  } catch (error) {
    if (error instanceof TeacherProjectError) throw error;
    fail("invalid_teacher_raster");
  }
  return { mediaType: IMAGE_TYPES[detected[0]], extension: detected[0] === "jpeg" ? ".jpg" : `.${detected[0]}`, ...detected[1] };
}

function inspectWav(bytes) {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") return null;
  if (bytes.readUInt32LE(4) + 8 > bytes.length) return null;
  let offset = 12;
  let format = false;
  let data = false;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end > bytes.length) return null;
    if (type === "fmt " && length >= 16) format = true;
    if (type === "data" && length > 0) data = true;
    offset = end + (length % 2);
  }
  return format && data ? { mediaType: AUDIO_TYPES.wav, extension: ".wav" } : null;
}

function inspectMp3(bytes) {
  if (bytes.length < 4) return null;
  let offset = 0;
  if (bytes.toString("ascii", 0, 3) === "ID3") {
    if (bytes.length < 10 || [...bytes.subarray(6, 10)].some((value) => value & 0x80)) return null;
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    offset = 10 + size;
  }
  const searchEnd = Math.min(bytes.length - 1, offset + 4096);
  for (let index = offset; index < searchEnd; index += 1) {
    if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0 && (bytes[index + 1] & 0x06) !== 0) {
      return { mediaType: AUDIO_TYPES.mp3, extension: ".mp3" };
    }
  }
  return null;
}

function inspectAudio(bytes) {
  const result = inspectWav(bytes) || inspectMp3(bytes);
  if (!result) fail("invalid_teacher_audio");
  return { ...result, width: null, height: null };
}

function inspectGaf(bytes) {
  try {
    const summary = parseGafSummary(bytes);
    if (!summary.timeline?.frames || !summary.stage?.fps || !summary.sources?.length) fail("invalid_teacher_gaf");
    return { mediaType: "application/x-gaf", extension: ".gaf", width: null, height: null, gaf: summary };
  } catch (error) {
    if (error instanceof TeacherProjectError) throw error;
    fail("invalid_teacher_gaf");
  }
}

function normalizedImportDescriptor(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) fail("invalid_teacher_asset_slot");
  const keys = Object.keys(candidate).sort();
  if (keys.join(",") !== "index,section,slot,variant") fail("invalid_teacher_asset_slot");
  const section = String(candidate.section || "");
  const slot = String(candidate.slot || "");
  const variant = String(candidate.variant || "");
  const index = candidate.index === null ? null : Number(candidate.index);
  if (section === "pages") {
    if (slot !== "library" || variant !== "image" || index !== null) fail("invalid_teacher_asset_slot");
    return { section, slot, variant, index };
  }
  if (section === "audio") {
    if (slot !== "library" || variant !== "sound" || index !== null) fail("invalid_teacher_asset_slot");
    return { section, slot, variant, index };
  }
  if (section === "animation") {
    if (slot !== "title" || !["gaf", "sd", "hd"].includes(variant)) fail("invalid_teacher_asset_slot");
    if (variant === "gaf" ? index !== null : !Number.isSafeInteger(index) || index < 0 || index >= TEACHER_PROJECT_LIMITS.atlasCountPerDensity) fail("invalid_teacher_asset_slot");
    return { section, slot, variant, index };
  }
  if (!VISUAL_SECTIONS.get(section)?.has(slot)) fail("invalid_teacher_asset_slot");
  const allowedVariants = section === "background" ? ["image"] : section === "chrome" ? ["image"] : ["normal", "active"];
  if (!allowedVariants.includes(variant) || index !== null) fail("invalid_teacher_asset_slot");
  return { section, slot, variant, index };
}

function assetStem(descriptor) {
  if (descriptor.section === "pages") return "page";
  if (descriptor.section === "audio") return "shared";
  if (descriptor.section === "animation") return descriptor.variant === "gaf" ? "title" : `title-${descriptor.variant}-${String(descriptor.index + 1).padStart(2, "0")}`;
  return descriptor.section === "background" ? "main" : `${descriptor.slot}-${descriptor.variant}`;
}

export async function inspectTeacherAsset({ bytes: input, originalFilename, descriptor: candidate, now = new Date().toISOString() }) {
  const bytes = Buffer.from(input || []);
  const descriptor = normalizedImportDescriptor(candidate);
  const limit = descriptor.section === "audio" ? TEACHER_PROJECT_LIMITS.audioBytes
    : descriptor.section === "animation" && descriptor.variant === "gaf" ? TEACHER_PROJECT_LIMITS.gafBytes
      : TEACHER_PROJECT_LIMITS.rasterBytes;
  if (!bytes.length) fail("empty_teacher_asset");
  if (bytes.length > limit) fail("teacher_asset_too_large", 413, { limitBytes: limit });
  const inspection = descriptor.section === "audio" ? inspectAudio(bytes)
    : descriptor.section === "animation" && descriptor.variant === "gaf" ? inspectGaf(bytes)
      : await inspectRaster(bytes);
  if (descriptor.section === "animation" && descriptor.variant !== "gaf" && inspection.mediaType !== "image/png") fail("teacher_gaf_atlas_requires_png");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const identityDescriptor = descriptor.section === "audio" ? "audio/library/sound" : JSON.stringify(descriptor);
  const assetId = `asset-${createHash("sha256").update(`${identityDescriptor}:${sha256}`).digest("hex").slice(0, 32)}`;
  const folder = descriptor.section;
  const relativePath = `assets/${folder}/${assetStem(descriptor)}-${sha256.slice(0, 12)}${inspection.extension}`;
  return {
    bytes,
    descriptor,
    metadata: {
      assetId,
      relativePath,
      originalFilename: safeOriginalFilename(originalFilename),
      mediaType: inspection.mediaType,
      sizeBytes: bytes.length,
      sha256,
      width: inspection.width,
      height: inspection.height,
      importedAt: now,
    },
    inspection,
  };
}

export function parseTeacherAssetDescriptor(searchParams) {
  const indexValue = searchParams.get("index");
  return normalizedImportDescriptor({
    section: searchParams.get("section"),
    slot: searchParams.get("slot"),
    variant: searchParams.get("variant"),
    index: indexValue === null || indexValue === "" ? null : indexValue,
  });
}
