import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import test from "node:test";

import sharp from "sharp";

import { inspectRasterBytes } from "../lib/book-assets/raster-inspection.js";
import { inspectTeacherAsset } from "../lib/teacher-project-builder/asset-inspection.js";
import { TEACHER_PROJECT_LIMITS } from "../lib/teacher-project-builder/constants.js";
import { createBuilderOpenResponseImportHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-open-response-import.js";
import { createBuilderTeacherUiAssetsHandler } from "../netlify-sites/ultimate-b2-builder/server/_builder-teacher-ui-assets.js";
import {
  OPEN_RESPONSE_IMPORT_LIMITS,
  inspectOpenResponseRaster,
} from "../scripts/ultimate-b2/open-response-publisher-importer.js";

const source = sharp({ create: { width: 37, height: 23, channels: 4, background: "#294f73" } });
const [png, jpeg, webp] = await Promise.all([
  source.clone().png().toBuffer(),
  source.clone().jpeg().toBuffer(),
  source.clone().webp().toBuffer(),
]);

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  CRC_TABLE[index] = value >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

function grayscalePng(width, height, { targetBytes = null } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 1;
  const rows = Buffer.alloc((Math.ceil(width / 8) + 1) * height);
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
  ];
  const imageData = chunk("IDAT", deflateSync(rows));
  const end = chunk("IEND", Buffer.alloc(0));
  const baseBytes = parts.reduce((total, part) => total + part.length, 0) + imageData.length + end.length;
  if (targetBytes !== null) {
    const fillerLength = targetBytes - baseBytes - 12;
    if (fillerLength < 0) throw new Error("Target PNG byte size is too small.");
    parts.push(chunk("tEXt", Buffer.alloc(fillerLength)));
  }
  return Buffer.concat([...parts, imageData, end]);
}

function rewritePngDimensions(bytes, width, height) {
  const changed = Buffer.from(bytes);
  changed.writeUInt32BE(width, 16);
  changed.writeUInt32BE(height, 20);
  changed.writeUInt32BE(crc32(changed.subarray(12, 29)), 29);
  return changed;
}

const commonPolicy = {
  allowedFormats: ["png", "jpeg", "webp"],
  maximumBytes: 16 * 1024 * 1024,
  maximumDimension: 32_768,
  maximumPixels: 32_768 ** 2,
};
const teacherDescriptor = { section: "pages", slot: "library", variant: "image", index: null };

test("shared policy inspection matches Sharp for valid PNG, JPEG, and WebP metadata and stable outputs", async () => {
  for (const [bytes, format, mimeType, extension] of [
    [png, "png", "image/png", ".png"],
    [jpeg, "jpeg", "image/jpeg", ".jpg"],
    [webp, "webp", "image/webp", ".webp"],
  ]) {
    const [inspected, oracle] = await Promise.all([inspectRasterBytes(bytes, commonPolicy), sharp(bytes).metadata()]);
    assert.deepEqual([inspected.width, inspected.height], [oracle.width, oracle.height]);
    assert.equal(inspected.format, format);
    assert.equal(inspected.mimeType, mimeType);
    assert.equal(inspected.extension, extension);
    assert.equal(inspected.byteSize, bytes.length);
    assert.equal(inspected.checksumSha256, createHash("sha256").update(bytes).digest("hex"));
  }
});

test("shared policy fails closed for truncation, hostile lengths, zero dimensions, and caller ceilings", async () => {
  const hostilePng = Buffer.from(png.subarray(0, 40));
  hostilePng.writeUInt32BE(0xffffffff, 33);
  const hostileJpeg = Buffer.from(jpeg.subarray(0, 20));
  hostileJpeg.writeUInt16BE(0xffff, 4);
  const hostileWebp = Buffer.from(webp.subarray(0, 24));
  hostileWebp.writeUInt32LE(hostileWebp.length - 8, 4);
  hostileWebp.writeUInt32LE(0xffffffff, 16);
  for (const bytes of [png.subarray(0, -1), jpeg.subarray(0, -1), webp.subarray(0, -1), hostilePng, hostileJpeg, hostileWebp, rewritePngDimensions(png, 0, 23)]) {
    await assert.rejects(inspectRasterBytes(bytes, commonPolicy), /invalid_raster/);
  }
  await assert.rejects(inspectRasterBytes(grayscalePng(101, 100), { ...commonPolicy, maximumPixels: 10_000 }), (error) => error.code === "raster_pixel_limit");
  await assert.rejects(inspectRasterBytes(grayscalePng(101, 1), { ...commonPolicy, maximumDimension: 100 }), (error) => error.code === "raster_dimension_limit");
  await assert.rejects(inspectRasterBytes(Buffer.alloc(101), { ...commonPolicy, maximumBytes: 100 }), (error) => error.code === "raster_too_large");
});

test("Open Response preserves PNG/JPEG, 12 MiB, 8192, and 40,000,000-pixel policy while rejecting WebP", async () => {
  for (const [name, bytes] of [["source.png", png], ["source.jpg", jpeg], ["source.jpeg", jpeg]]) {
    const inspected = await inspectOpenResponseRaster({ name, bytes });
    assert.deepEqual([inspected.width, inspected.height], [37, 23]);
    assert.equal(inspected.sha256, createHash("sha256").update(bytes).digest("hex"));
  }
  await assert.rejects(inspectOpenResponseRaster({ name: "source.png", bytes: jpeg }), /do not match its supported raster extension/);
  await assert.rejects(inspectOpenResponseRaster({ name: "source.webp", bytes: webp }), /do not match its supported raster extension/);

  const exactMaximum = grayscalePng(1, 1, { targetBytes: OPEN_RESPONSE_IMPORT_LIMITS.rasterBytes });
  assert.equal((await inspectOpenResponseRaster({ name: "maximum.png", bytes: exactMaximum })).sha256, createHash("sha256").update(exactMaximum).digest("hex"));
  await assert.rejects(inspectOpenResponseRaster({ name: "too-large.png", bytes: Buffer.alloc(OPEN_RESPONSE_IMPORT_LIMITS.rasterBytes + 1) }), /raster size limit/);
  assert.deepEqual(
    [
      (await inspectOpenResponseRaster({ name: "dimension.png", bytes: grayscalePng(8_192, 1) })).width,
      (await inspectOpenResponseRaster({ name: "pixels.png", bytes: grayscalePng(8_000, 5_000) })).height,
    ],
    [8_192, 5_000],
  );
  await assert.rejects(inspectOpenResponseRaster({ name: "dimension.png", bytes: grayscalePng(8_193, 1) }), /raster dimension limit/);
  await assert.rejects(inspectOpenResponseRaster({ name: "pixels.png", bytes: grayscalePng(8_000, 5_001) }), /raster pixel limit/);
});

test("Open Response prepare rejects WebP with the existing safe 400 status mapping", async () => {
  const handler = createBuilderOpenResponseImportHandler({
    getDatabase: () => ({}),
    authorize: async () => ({ builderUser: { id: "actor" } }),
    logger: { error() {} },
  });
  const response = await handler({
    httpMethod: "POST",
    path: "/builder/api/open-response-import/prepare",
    headers: { host: "builder.test", origin: "https://builder.test", "content-type": "application/json" },
    body: JSON.stringify({
      activityId: "ultimate-b2-sb-u2-p1-o1",
      expectedRevision: 0,
      clientMutationId: randomUUID(),
      files: [
        { name: "obj_params.xml", size: 10, type: "application/xml" },
        { name: "ebook_obj_params.xml", size: 10, type: "application/xml" },
        { name: "image_1.webp", size: webp.length, type: "image/webp" },
      ],
    }),
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: "unsupported_file_type" });
});

test("Teacher Project preserves PNG/JPEG/WebP, 16 MiB, 32768, inferred MIME, and metadata shape", async () => {
  for (const [name, bytes, mediaType, extension] of [
    ["misleading.jpg", png, "image/png", ".png"],
    ["source.jpeg", jpeg, "image/jpeg", ".jpg"],
    ["source.webp", webp, "image/webp", ".webp"],
  ]) {
    const inspected = await inspectTeacherAsset({ bytes, originalFilename: name, descriptor: teacherDescriptor, now: "2026-08-18T12:00:00.000Z" });
    assert.equal(inspected.metadata.mediaType, mediaType);
    assert.equal(inspected.inspection.extension, extension);
    assert.deepEqual([inspected.metadata.width, inspected.metadata.height], [37, 23]);
    assert.equal(inspected.metadata.sizeBytes, bytes.length);
    assert.equal(inspected.metadata.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.equal(inspected.metadata.originalFilename, name);
  }

  const exactMaximum = grayscalePng(1, 1, { targetBytes: TEACHER_PROJECT_LIMITS.rasterBytes });
  assert.equal((await inspectTeacherAsset({ bytes: exactMaximum, originalFilename: "maximum.png", descriptor: teacherDescriptor })).metadata.sizeBytes, TEACHER_PROJECT_LIMITS.rasterBytes);
  await assert.rejects(
    inspectTeacherAsset({ bytes: Buffer.alloc(TEACHER_PROJECT_LIMITS.rasterBytes + 1), originalFilename: "too-large.png", descriptor: teacherDescriptor }),
    (error) => error.code === "teacher_asset_too_large" && error.statusCode === 413,
  );
  assert.equal((await inspectTeacherAsset({ bytes: grayscalePng(32_768, 1), originalFilename: "dimension.png", descriptor: teacherDescriptor })).metadata.width, 32_768);
  await assert.rejects(
    inspectTeacherAsset({ bytes: grayscalePng(32_769, 1), originalFilename: "dimension.png", descriptor: teacherDescriptor }),
    (error) => error.code === "invalid_teacher_raster_dimensions",
  );
});

test("hosted Teacher UI keeps exact declared-MIME rejection before storage access", async () => {
  const handler = createBuilderTeacherUiAssetsHandler({
    getDatabase: () => ({}),
    authorize: async () => ({ builderUser: { id: "actor" } }),
    logger: { error() {} },
  });
  const response = await handler({
    httpMethod: "POST",
    path: "/builder/api/ui-assets/prepare",
    headers: { host: "builder.test", origin: "https://builder.test", "content-type": "application/json" },
    body: JSON.stringify({
      expectedRevision: 0,
      clientMutationId: randomUUID(),
      files: [{ bindingId: "background.main", name: "source.png", size: png.length, type: "image/gif" }],
    }),
  });
  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), { error: "declared_mime_mismatch" });
});
