import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import sharp from "sharp";

import {
  inspectManagedRaster,
  MANAGED_RASTER_MAXIMUM_BYTES,
  MANAGED_RASTER_MAXIMUM_DIMENSION,
} from "../lib/book-assets/raster-inspection.js";

const source = sharp({
  create: { width: 37, height: 23, channels: 4, background: { r: 12, g: 34, b: 56, alpha: 0.5 } },
});
const [png, interlacedPng, jpeg, progressiveJpeg, webpVp8, webpVp8l, webpVp8x] = await Promise.all([
  source.clone().png().toBuffer(),
  source.clone().png({ progressive: true }).toBuffer(),
  source.clone().flatten().jpeg().toBuffer(),
  source.clone().flatten().jpeg({ progressive: true }).toBuffer(),
  source.clone().flatten().webp().toBuffer(),
  source.clone().webp({ lossless: true }).toBuffer(),
  source.clone().webp().toBuffer(),
]);

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) crc = CRC_TABLE[(crc ^ bytes[offset]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(bytes, wanted) {
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (type === wanted) return { offset, length, dataOffset: offset + 8, dataEnd: offset + 8 + length };
    offset += 12 + length;
  }
  throw new Error(`missing PNG chunk: ${wanted}`);
}

function rewritePngChunkCrc(bytes, chunk) {
  bytes.writeUInt32BE(crc32(bytes, chunk.offset + 4, chunk.dataEnd), chunk.dataEnd);
  return bytes;
}

function jpegMarker(bytes, wanted) {
  for (let offset = 2; offset + 1 < bytes.length; offset += 1) {
    if (bytes[offset] === 0xff && bytes[offset + 1] === wanted) return offset;
  }
  throw new Error(`missing JPEG marker: ${wanted.toString(16)}`);
}

function webpChunk(bytes, wanted) {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset + 4);
    const type = bytes.toString("ascii", offset, offset + 4);
    if (type === wanted) return { offset, length, dataOffset: offset + 8 };
    offset += 8 + length + (length & 1);
  }
  throw new Error(`missing WebP chunk: ${wanted}`);
}

async function rejectsInvalid(bytes, code = "invalid_raster") {
  await assert.rejects(inspectManagedRaster(bytes), (error) => error?.message === code);
}

async function currentSharpMetadataAccepts(bytes) {
  let format = null;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    && bytes.toString("ascii", 12, 16) === "IHDR") {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      const end = offset + 12 + length;
      if (!/^[A-Za-z]{4}$/.test(type) || end > bytes.length) break;
      if (type === "IEND" && length === 0 && end === bytes.length) {
        format = "png";
        break;
      }
      offset = end;
    }
  }
  else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) format = "jpeg";
  else if (bytes.length >= 20 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.readUInt32LE(4) + 8 === bytes.length) format = "webp";
  if (!format) return false;
  try {
    const metadata = await sharp(bytes, { failOn: "warning", limitInputPixels: MANAGED_RASTER_MAXIMUM_DIMENSION ** 2 }).metadata();
    return metadata.format === format && Number.isSafeInteger(metadata.width) && Number.isSafeInteger(metadata.height)
      && metadata.width > 0 && metadata.height > 0
      && metadata.width <= MANAGED_RASTER_MAXIMUM_DIMENSION && metadata.height <= MANAGED_RASTER_MAXIMUM_DIMENSION;
  } catch {
    return false;
  }
}

test("valid PNG, JPEG, and VP8/VP8L/VP8X WebP bytes report byte-derived metadata", async () => {
  for (const [bytes, mimeType, extension] of [
    [png, "image/png", ".png"],
    [interlacedPng, "image/png", ".png"],
    [jpeg, "image/jpeg", ".jpg"],
    [progressiveJpeg, "image/jpeg", ".jpg"],
    [webpVp8, "image/webp", ".webp"],
    [webpVp8l, "image/webp", ".webp"],
    [webpVp8x, "image/webp", ".webp"],
  ]) {
    const inspected = await inspectManagedRaster(bytes);
    assert.equal(inspected.width, 37);
    assert.equal(inspected.height, 23);
    assert.equal(inspected.mimeType, mimeType);
    assert.equal(inspected.extension, extension);
    assert.equal(inspected.byteSize, bytes.length);
    assert.equal(inspected.checksumSha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(inspected.bytes, bytes);
    assert.equal(await currentSharpMetadataAccepts(bytes), true);
  }
});

test("empty and over-limit inputs fail before parsing", async () => {
  await rejectsInvalid(Buffer.alloc(0), "empty_raster");
  await rejectsInvalid(Buffer.alloc(MANAGED_RASTER_MAXIMUM_BYTES + 1), "raster_too_large");
});

test("PNG validation rejects truncation, unsafe lengths, invalid IHDR/IEND, dimensions, and corrupt image data", async () => {
  await rejectsInvalid(png.subarray(0, png.length - 1));

  const overflowingChunk = Buffer.from(png);
  pngChunk(overflowingChunk, "IDAT");
  overflowingChunk.writeUInt32BE(0xffffffff, pngChunk(overflowingChunk, "IDAT").offset);
  await rejectsInvalid(overflowingChunk);

  const malformedHeader = Buffer.from(png);
  malformedHeader.writeUInt32BE(12, pngChunk(malformedHeader, "IHDR").offset);
  await rejectsInvalid(malformedHeader);

  const malformedEnd = Buffer.concat([png, Buffer.from("trailing")]);
  await rejectsInvalid(malformedEnd);

  for (const width of [0, MANAGED_RASTER_MAXIMUM_DIMENSION + 1]) {
    const badDimensions = Buffer.from(png);
    const header = pngChunk(badDimensions, "IHDR");
    badDimensions.writeUInt32BE(width, header.dataOffset);
    rewritePngChunkCrc(badDimensions, header);
    await rejectsInvalid(badDimensions);
  }

  const invalidCrc = Buffer.from(png);
  invalidCrc[pngChunk(invalidCrc, "IDAT").dataOffset] ^= 0x01;
  await rejectsInvalid(invalidCrc);

  const invalidDeflate = Buffer.from(png);
  const imageData = pngChunk(invalidDeflate, "IDAT");
  invalidDeflate[imageData.dataEnd - 1] ^= 0x01;
  rewritePngChunkCrc(invalidDeflate, imageData);
  assert.equal(await currentSharpMetadataAccepts(invalidDeflate), true, "the former metadata-only path accepted corrupt IDAT data");
  await rejectsInvalid(invalidDeflate);
});

test("JPEG validation rejects truncation, malformed lengths, missing SOF, and invalid dimensions", async () => {
  await rejectsInvalid(jpeg.subarray(0, jpeg.length - 1));

  const malformedLength = Buffer.from(jpeg);
  const quantization = jpegMarker(malformedLength, 0xdb);
  malformedLength.writeUInt16BE(1, quantization + 2);
  await rejectsInvalid(malformedLength);

  const overflowingLength = Buffer.from(jpeg);
  overflowingLength.writeUInt16BE(0xffff, jpegMarker(overflowingLength, 0xdb) + 2);
  await rejectsInvalid(overflowingLength);

  const reservedMarker = Buffer.from(jpeg);
  reservedMarker[jpegMarker(reservedMarker, 0xdb) + 1] = 0x24;
  assert.equal(await currentSharpMetadataAccepts(reservedMarker), false);
  await rejectsInvalid(reservedMarker);

  const noFrame = Buffer.from(jpeg);
  noFrame[jpegMarker(noFrame, 0xc0) + 1] = 0xc8;
  await rejectsInvalid(noFrame);

  for (const width of [0, MANAGED_RASTER_MAXIMUM_DIMENSION + 1]) {
    const badDimensions = Buffer.from(jpeg);
    badDimensions.writeUInt16BE(width, jpegMarker(badDimensions, 0xc0) + 7);
    await rejectsInvalid(badDimensions);
  }
});

test("WebP validation rejects truncation, RIFF disagreement, malformed chunks/padding, and invalid dimensions", async () => {
  await rejectsInvalid(webpVp8.subarray(0, webpVp8.length - 1));

  const wrongRiffLength = Buffer.from(webpVp8);
  wrongRiffLength.writeUInt32LE(wrongRiffLength.readUInt32LE(4) - 2, 4);
  await rejectsInvalid(wrongRiffLength);

  const highBitMagicAlias = Buffer.from(webpVp8);
  highBitMagicAlias[0] |= 0x80;
  assert.equal(await currentSharpMetadataAccepts(highBitMagicAlias), false);
  await rejectsInvalid(highBitMagicAlias);

  const overflowingChunk = Buffer.from(webpVp8);
  overflowingChunk.writeUInt32LE(0xffffffff, webpChunk(overflowingChunk, "VP8 ").offset + 4);
  await rejectsInvalid(overflowingChunk);

  const nonzeroPadding = Buffer.concat([
    webpVp8x,
    Buffer.from([0x4a, 0x55, 0x4e, 0x4b, 0x01, 0x00, 0x00, 0x00, 0x00, 0x01]),
  ]);
  nonzeroPadding.writeUInt32LE(nonzeroPadding.length - 8, 4);
  await rejectsInvalid(nonzeroPadding);

  for (const width of [0, MANAGED_RASTER_MAXIMUM_DIMENSION + 1]) {
    const badDimensions = Buffer.from(webpVp8);
    const image = webpChunk(badDimensions, "VP8 ");
    const stored = badDimensions.readUInt16LE(image.dataOffset + 6) & 0xc000;
    badDimensions.writeUInt16LE(stored | width, image.dataOffset + 6);
    await rejectsInvalid(badDimensions);
  }
});

test("format labels are derived from bytes rather than a spoofable name or MIME hint", async () => {
  const uploadedAsPng = Buffer.from(jpeg);
  const inspected = await inspectManagedRaster(uploadedAsPng);
  assert.equal(inspected.mimeType, "image/jpeg");
  assert.equal(inspected.extension, ".jpg");
});

test("adversarial declared sizes are rejected without declared-size allocation or out-of-bounds reads", async () => {
  const tinyPng = Buffer.from(png.subarray(0, 40));
  tinyPng.writeUInt32BE(0xffffffff, 33);
  await rejectsInvalid(tinyPng);

  const tinyJpeg = Buffer.from(jpeg.subarray(0, 20));
  tinyJpeg.writeUInt16BE(0xffff, jpegMarker(tinyJpeg, 0xdb) + 2);
  await rejectsInvalid(tinyJpeg);

  const tinyWebp = Buffer.from(webpVp8.subarray(0, 24));
  tinyWebp.writeUInt32LE(tinyWebp.length - 8, 4);
  tinyWebp.writeUInt32LE(0xffffffff, 16);
  await rejectsInvalid(tinyWebp);
});

test("the bounded parser never accepts the malformed differential corpus when the former Sharp path rejects it", async () => {
  const corpus = [
    png.subarray(0, 24),
    png.subarray(0, png.length - 4),
    jpeg.subarray(0, 20),
    jpeg.subarray(0, jpeg.length - 2),
    webpVp8.subarray(0, 20),
    webpVp8.subarray(0, webpVp8.length - 2),
  ];
  for (const bytes of corpus) {
    assert.equal(await currentSharpMetadataAccepts(bytes), false);
    await rejectsInvalid(bytes);
  }
});
