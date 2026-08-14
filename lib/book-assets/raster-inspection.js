import { createHash } from "node:crypto";
import sharp from "sharp";

export const MANAGED_RASTER_MAXIMUM_BYTES = 10 * 1024 * 1024;
export const MANAGED_RASTER_MAXIMUM_DIMENSION = 8_192;
export const MANAGED_RASTER_TYPES = Object.freeze({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" });

function completePng(bytes) {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) || bytes.toString("ascii",12,16)!=="IHDR") return false;
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset); const type = bytes.toString("ascii", offset + 4, offset + 8); const end = offset + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > bytes.length) return false;
    if (type === "IEND") return length === 0 && end === bytes.length;
    offset = end;
  }
  return false;
}

function detectedFormat(bytes) {
  if (completePng(bytes)) return "png";
  if (bytes.length >= 4 && bytes[0]===0xff && bytes[1]===0xd8 && bytes.at(-2)===0xff && bytes.at(-1)===0xd9) return "jpeg";
  if (bytes.length >= 20 && bytes.toString("ascii",0,4)==="RIFF" && bytes.toString("ascii",8,12)==="WEBP" && bytes.readUInt32LE(4)+8===bytes.length) return "webp";
  return null;
}

export async function inspectManagedRaster(input) {
  const bytes = Buffer.from(input || []);
  if (!bytes.length) throw new Error("empty_raster");
  if (bytes.length > MANAGED_RASTER_MAXIMUM_BYTES) throw new Error("raster_too_large");
  const format = detectedFormat(bytes);
  if (!format) throw new Error("invalid_raster");
  let metadata;
  try {
    metadata = await sharp(bytes, { failOn: "warning", limitInputPixels: MANAGED_RASTER_MAXIMUM_DIMENSION ** 2 }).metadata();
  } catch {
    throw new Error("invalid_raster");
  }
  if (metadata.format !== format || !Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)
    || metadata.width < 1 || metadata.height < 1 || metadata.width > MANAGED_RASTER_MAXIMUM_DIMENSION || metadata.height > MANAGED_RASTER_MAXIMUM_DIMENSION) {
    throw new Error("invalid_raster");
  }
  return {
    bytes,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    mimeType: MANAGED_RASTER_TYPES[format],
    extension: format === "jpeg" ? ".jpg" : `.${format}`,
    byteSize: bytes.length,
    width: metadata.width,
    height: metadata.height,
  };
}
