import { createHash } from "node:crypto";
import { createInflate } from "node:zlib";

export const MANAGED_RASTER_MAXIMUM_BYTES = 10 * 1024 * 1024;
export const MANAGED_RASTER_MAXIMUM_DIMENSION = 8_192;
export const MANAGED_RASTER_TYPES = Object.freeze({ png: "image/png", jpeg: "image/jpeg", webp: "image/webp" });

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CHANNELS = Object.freeze({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 });
const PNG_BIT_DEPTHS = Object.freeze({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] });
const PNG_ADAM7 = Object.freeze([
  [0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4],
  [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2],
]);
const JPEG_SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3]);
const JPEG_STANDALONE_MARKERS = new Set([0x01, 0xd8, 0xd9, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7]);

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC_TABLE.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  CRC_TABLE[index] = value >>> 0;
}

function invalidRaster() {
  throw new Error("invalid_raster");
}

function validateDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1
    || width > MANAGED_RASTER_MAXIMUM_DIMENSION || height > MANAGED_RASTER_MAXIMUM_DIMENSION) invalidRaster();
}

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) crc = CRC_TABLE[(crc ^ bytes[offset]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngPasses(width, height, bitDepth, colorType, interlace) {
  const channels = PNG_CHANNELS[colorType];
  const patterns = interlace ? PNG_ADAM7 : [[0, 0, 1, 1]];
  const passes = [];
  for (const [xStart, yStart, xStep, yStep] of patterns) {
    const passWidth = width <= xStart ? 0 : Math.ceil((width - xStart) / xStep);
    const passHeight = height <= yStart ? 0 : Math.ceil((height - yStart) / yStep);
    if (passWidth && passHeight) passes.push({ rows: passHeight, bytesPerRow: Math.ceil((passWidth * channels * bitDepth) / 8) });
  }
  return passes;
}

async function validatePngImageData(idatChunks, passes) {
  await new Promise((resolve, reject) => {
    const inflater = createInflate();
    const totalInputBytes = idatChunks.reduce((total, chunk) => total + chunk.length, 0);
    let passIndex = 0;
    let rowsRemaining = passes[0]?.rows || 0;
    let rowRemaining = passes[0] ? passes[0].bytesPerRow + 1 : 0;
    let failed = false;

    const fail = () => {
      if (failed) return;
      failed = true;
      inflater.destroy();
      reject(new Error("invalid_raster"));
    };
    const advanceRow = () => {
      rowsRemaining -= 1;
      if (rowsRemaining === 0) {
        passIndex += 1;
        rowsRemaining = passes[passIndex]?.rows || 0;
      }
      rowRemaining = passes[passIndex] ? passes[passIndex].bytesPerRow + 1 : 0;
    };

    inflater.on("data", (chunk) => {
      if (failed) return;
      let offset = 0;
      while (offset < chunk.length) {
        if (!rowRemaining) return fail();
        const rowLength = passes[passIndex].bytesPerRow + 1;
        if (rowRemaining === rowLength) {
          if (chunk[offset] > 4) return fail();
          offset += 1;
          rowRemaining -= 1;
        }
        const consumed = Math.min(rowRemaining, chunk.length - offset);
        offset += consumed;
        rowRemaining -= consumed;
        if (rowRemaining === 0) advanceRow();
      }
    });
    inflater.once("error", fail);
    inflater.once("end", () => {
      if (failed) return;
      if (passIndex !== passes.length || rowRemaining !== 0 || inflater.bytesWritten !== totalInputBytes) return fail();
      resolve();
    });
    for (const chunk of idatChunks) inflater.write(chunk);
    inflater.end();
  });
}

async function inspectPng(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) invalidRaster();
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let sawHeader = false;
  let sawPalette = false;
  let sawImageData = false;
  let imageDataEnded = false;
  let sawEnd = false;
  const idatChunks = [];

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) invalidRaster();
    const length = bytes.readUInt32BE(offset);
    const typeOffset = offset + 4;
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > bytes.length) invalidRaster();
    for (let index = typeOffset; index < typeOffset + 4; index += 1) {
      const character = bytes[index];
      if (!((character >= 65 && character <= 90) || (character >= 97 && character <= 122))) invalidRaster();
    }
    if (bytes[typeOffset + 2] >= 97) invalidRaster();
    if (crc32(bytes, typeOffset, dataEnd) !== bytes.readUInt32BE(dataEnd)) invalidRaster();
    const type = bytes.toString("ascii", typeOffset, typeOffset + 4);

    if (!sawHeader && type !== "IHDR") invalidRaster();
    if (type === "IHDR") {
      if (sawHeader || offset !== 8 || length !== 13) invalidRaster();
      width = bytes.readUInt32BE(dataOffset);
      height = bytes.readUInt32BE(dataOffset + 4);
      bitDepth = bytes[dataOffset + 8];
      colorType = bytes[dataOffset + 9];
      interlace = bytes[dataOffset + 12];
      validateDimensions(width, height);
      if (!PNG_BIT_DEPTHS[colorType]?.includes(bitDepth)
        || bytes[dataOffset + 10] !== 0 || bytes[dataOffset + 11] !== 0 || (interlace !== 0 && interlace !== 1)) invalidRaster();
      sawHeader = true;
    } else if (type === "PLTE") {
      if (sawPalette || sawImageData || colorType === 0 || colorType === 4
        || length < 3 || length > 768 || length % 3 !== 0) invalidRaster();
      const paletteEntries = length / 3;
      if (colorType === 3 && paletteEntries > 2 ** bitDepth) invalidRaster();
      sawPalette = true;
    } else if (type === "IDAT") {
      if (imageDataEnded || (colorType === 3 && !sawPalette)) invalidRaster();
      sawImageData = true;
      idatChunks.push(bytes.subarray(dataOffset, dataEnd));
    } else if (type === "IEND") {
      if (length !== 0 || !sawImageData || chunkEnd !== bytes.length) invalidRaster();
      sawEnd = true;
      offset = chunkEnd;
      break;
    } else {
      if (sawImageData) imageDataEnded = true;
      if (bytes[typeOffset] < 97) invalidRaster();
    }
    offset = chunkEnd;
  }
  if (offset !== bytes.length || !sawHeader || !sawImageData || !sawEnd || !idatChunks.some((chunk) => chunk.length)) invalidRaster();
  await validatePngImageData(idatChunks, pngPasses(width, height, bitDepth, colorType, interlace));
  return { format: "png", width, height };
}

function readJpegMarker(bytes, offset) {
  if (offset >= bytes.length || bytes[offset] !== 0xff) invalidRaster();
  while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
  if (offset >= bytes.length || bytes[offset] === 0x00) invalidRaster();
  return { marker: bytes[offset], next: offset + 1 };
}

function inspectJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalidRaster();
  let offset = 2;
  let frame = null;
  let scans = 0;
  let sawEntropyData = false;
  const quantizationTables = new Set();
  const huffmanTables = new Set();

  while (offset < bytes.length) {
    const { marker, next } = readJpegMarker(bytes, offset);
    offset = next;
    if (marker === 0xd9) {
      if (offset !== bytes.length || !frame || scans === 0 || !sawEntropyData) invalidRaster();
      return { format: "jpeg", width: frame.width, height: frame.height };
    }
    if (JPEG_STANDALONE_MARKERS.has(marker)) {
      if (marker !== 0x01) invalidRaster();
      continue;
    }
    if (!(JPEG_SOF_MARKERS.has(marker) || marker === 0xc4 || marker === 0xda || marker === 0xdb || marker === 0xdd
      || (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe)) invalidRaster();
    if (offset + 2 > bytes.length) invalidRaster();
    const length = bytes.readUInt16BE(offset);
    if (length < 2) invalidRaster();
    const dataOffset = offset + 2;
    const dataEnd = offset + length;
    if (dataEnd > bytes.length) invalidRaster();

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (frame || length < 11) invalidRaster();
      const precision = bytes[dataOffset];
      const height = bytes.readUInt16BE(dataOffset + 1);
      const width = bytes.readUInt16BE(dataOffset + 3);
      const componentCount = bytes[dataOffset + 5];
      if (componentCount < 1 || componentCount > 4 || length !== 8 + (3 * componentCount)
        || (marker === 0xc0 && precision !== 8)
        || ((marker === 0xc1 || marker === 0xc2) && precision !== 8 && precision !== 12)
        || (marker === 0xc3 && (precision < 2 || precision > 16))) invalidRaster();
      validateDimensions(width, height);
      const components = new Map();
      for (let index = 0; index < componentCount; index += 1) {
        const componentOffset = dataOffset + 6 + (index * 3);
        const id = bytes[componentOffset];
        const sampling = bytes[componentOffset + 1];
        const horizontal = sampling >>> 4;
        const vertical = sampling & 0x0f;
        const quantizationTable = bytes[componentOffset + 2];
        if (components.has(id) || horizontal < 1 || horizontal > 4 || vertical < 1 || vertical > 4 || quantizationTable > 3
          || (marker === 0xc3 && (horizontal !== 1 || vertical !== 1 || quantizationTable !== 0))) invalidRaster();
        components.set(id, quantizationTable);
      }
      frame = { marker, width, height, components };
    } else if (marker === 0xdb) {
      let cursor = dataOffset;
      while (cursor < dataEnd) {
        const tableInfo = bytes[cursor++];
        const precision = tableInfo >>> 4;
        const tableId = tableInfo & 0x0f;
        if (precision > 1 || tableId > 3) invalidRaster();
        cursor += precision ? 128 : 64;
        if (cursor > dataEnd) invalidRaster();
        quantizationTables.add(tableId);
      }
      if (cursor !== dataEnd) invalidRaster();
    } else if (marker === 0xc4) {
      let cursor = dataOffset;
      while (cursor < dataEnd) {
        const tableInfo = bytes[cursor++];
        const tableClass = tableInfo >>> 4;
        const tableId = tableInfo & 0x0f;
        if (tableClass > 1 || tableId > 3 || cursor + 16 > dataEnd) invalidRaster();
        let symbols = 0;
        let availableCodes = 1;
        for (let index = 0; index < 16; index += 1) {
          availableCodes = (availableCodes * 2) - bytes[cursor + index];
          symbols += bytes[cursor + index];
          if (availableCodes < 0) invalidRaster();
        }
        cursor += 16;
        if (symbols < 1 || symbols > 256 || cursor + symbols > dataEnd) invalidRaster();
        cursor += symbols;
        huffmanTables.add(`${tableClass}:${tableId}`);
      }
      if (cursor !== dataEnd) invalidRaster();
    } else if (marker === 0xdd) {
      if (length !== 4) invalidRaster();
    } else if (marker === 0xda) {
      if (!frame) invalidRaster();
      const componentCount = bytes[dataOffset];
      if (componentCount < 1 || componentCount > frame.components.size || length !== 6 + (2 * componentCount)) invalidRaster();
      const scanComponents = new Set();
      const scanTables = [];
      for (let index = 0; index < componentCount; index += 1) {
        const componentOffset = dataOffset + 1 + (index * 2);
        const id = bytes[componentOffset];
        const tables = bytes[componentOffset + 1];
        if (!frame.components.has(id) || scanComponents.has(id) || (tables >>> 4) > 3 || (tables & 0x0f) > 3) invalidRaster();
        scanComponents.add(id);
        scanTables.push({ dc: tables >>> 4, ac: tables & 0x0f });
      }
      const spectralStart = bytes[dataEnd - 3];
      const spectralEnd = bytes[dataEnd - 2];
      const approximation = bytes[dataEnd - 1];
      const approximationHigh = approximation >>> 4;
      const approximationLow = approximation & 0x0f;
      if (frame.marker !== 0xc3 && [...frame.components.values()].some((table) => !quantizationTables.has(table))) invalidRaster();
      if (frame.marker === 0xc0 || frame.marker === 0xc1) {
        if (spectralStart !== 0 || spectralEnd !== 63 || approximation !== 0) invalidRaster();
      } else if (frame.marker === 0xc2) {
        if (spectralStart > spectralEnd || spectralEnd > 63 || (spectralStart > 0 && componentCount !== 1)
          || approximationHigh > 13 || approximationLow > 13
          || (approximationHigh > 0 && approximationHigh !== approximationLow + 1)) invalidRaster();
      } else if (spectralStart < 1 || spectralStart > 7 || spectralEnd !== 0 || approximationHigh !== 0) invalidRaster();
      for (const tables of scanTables) {
        const needsDc = frame.marker !== 0xc2 || spectralStart === 0;
        const needsAc = frame.marker !== 0xc3 && (frame.marker !== 0xc2 || spectralStart > 0);
        if ((needsDc && !huffmanTables.has(`0:${tables.dc}`)) || (needsAc && !huffmanTables.has(`1:${tables.ac}`))) invalidRaster();
      }
      scans += 1;
      offset = dataEnd;
      let scanHasData = false;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) {
          scanHasData = true;
          offset += 1;
          continue;
        }
        let markerOffset = offset + 1;
        while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) markerOffset += 1;
        if (markerOffset >= bytes.length) invalidRaster();
        const scanMarker = bytes[markerOffset];
        if (scanMarker === 0x00) {
          scanHasData = true;
          offset = markerOffset + 1;
        } else if (scanMarker >= 0xd0 && scanMarker <= 0xd7) {
          scanHasData = true;
          offset = markerOffset + 1;
        } else {
          break;
        }
      }
      if (!scanHasData) invalidRaster();
      sawEntropyData = true;
      continue;
    }
    offset = dataEnd;
  }
  invalidRaster();
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function inspectVp8(bytes, start, length) {
  if (length < 11 || start + length > bytes.length) invalidRaster();
  const frameTag = bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16);
  const firstPartitionLength = frameTag >>> 5;
  if ((frameTag & 1) !== 0 || ((frameTag >>> 1) & 0x07) > 3 || ((frameTag >>> 4) & 1) !== 1
    || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a
    || firstPartitionLength < 1 || 10 + firstPartitionLength > length) invalidRaster();
  const width = bytes.readUInt16LE(start + 6) & 0x3fff;
  const height = bytes.readUInt16LE(start + 8) & 0x3fff;
  validateDimensions(width, height);
  return { width, height, alpha: false };
}

function inspectVp8l(bytes, start, length) {
  if (length < 6 || start + length > bytes.length || bytes[start] !== 0x2f) invalidRaster();
  const header = bytes.readUInt32LE(start + 1);
  if ((header >>> 29) !== 0) invalidRaster();
  const width = (header & 0x3fff) + 1;
  const height = ((header >>> 14) & 0x3fff) + 1;
  validateDimensions(width, height);
  return { width, height, alpha: Boolean((header >>> 28) & 1) };
}

function readWebpChunks(bytes, start, end) {
  const chunks = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) invalidRaster();
    const type = bytes.toString("latin1", offset, offset + 4);
    const length = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + length;
    const chunkEnd = dataEnd + (length & 1);
    if (!/^[\x20-\x7e]{4}$/.test(type) || dataEnd > end || chunkEnd > end || ((length & 1) && bytes[dataEnd] !== 0)) invalidRaster();
    chunks.push({ type, length, dataOffset, dataEnd });
    offset = chunkEnd;
  }
  if (offset !== end) invalidRaster();
  return chunks;
}

function validateAlphaChunk(bytes, chunk) {
  if (chunk.length < 1) invalidRaster();
  const header = bytes[chunk.dataOffset];
  if ((header & 0xc0) !== 0 || (header & 0x03) > 1 || ((header >>> 4) & 0x03) > 1) invalidRaster();
}

function inspectAnimatedWebpFrame(bytes, chunk, canvasWidth, canvasHeight) {
  if (chunk.length < 24) invalidRaster();
  const x = readUInt24LE(bytes, chunk.dataOffset) * 2;
  const y = readUInt24LE(bytes, chunk.dataOffset + 3) * 2;
  const width = readUInt24LE(bytes, chunk.dataOffset + 6) + 1;
  const height = readUInt24LE(bytes, chunk.dataOffset + 9) + 1;
  const flags = bytes[chunk.dataOffset + 15];
  if ((flags & 0xfc) !== 0 || x + width > canvasWidth || y + height > canvasHeight) invalidRaster();
  const nested = readWebpChunks(bytes, chunk.dataOffset + 16, chunk.dataEnd);
  const imageChunks = nested.filter(({ type }) => type === "VP8 " || type === "VP8L");
  const alphaChunks = nested.filter(({ type }) => type === "ALPH");
  if (imageChunks.length !== 1 || alphaChunks.length > 1 || (alphaChunks.length && imageChunks[0].type !== "VP8 ")) invalidRaster();
  if (alphaChunks.length) validateAlphaChunk(bytes, alphaChunks[0]);
  const image = imageChunks[0].type === "VP8 "
    ? inspectVp8(bytes, imageChunks[0].dataOffset, imageChunks[0].length)
    : inspectVp8l(bytes, imageChunks[0].dataOffset, imageChunks[0].length);
  if (image.width !== width || image.height !== height) invalidRaster();
  return Boolean(alphaChunks.length || image.alpha);
}

function inspectWebp(bytes) {
  if (bytes.length < 20 || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP"
    || bytes.readUInt32LE(4) + 8 !== bytes.length) invalidRaster();
  const chunks = readWebpChunks(bytes, 12, bytes.length);
  if (!chunks.length) invalidRaster();
  const first = chunks[0];
  if (first.type === "VP8 " || first.type === "VP8L") {
    if (chunks.length !== 1) invalidRaster();
    const image = first.type === "VP8 " ? inspectVp8(bytes, first.dataOffset, first.length) : inspectVp8l(bytes, first.dataOffset, first.length);
    return { format: "webp", width: image.width, height: image.height };
  }
  if (first.type !== "VP8X" || first.length !== 10) invalidRaster();
  const flags = bytes[first.dataOffset];
  if ((flags & 0xc1) !== 0 || bytes[first.dataOffset + 1] !== 0 || bytes[first.dataOffset + 2] !== 0 || bytes[first.dataOffset + 3] !== 0) invalidRaster();
  const width = readUInt24LE(bytes, first.dataOffset + 4) + 1;
  const height = readUInt24LE(bytes, first.dataOffset + 7) + 1;
  validateDimensions(width, height);
  const rest = chunks.slice(1);
  const byType = (type) => rest.filter((chunk) => chunk.type === type);
  for (const type of ["ICCP", "ANIM", "ALPH", "VP8 ", "VP8L", "EXIF", "XMP "]) if (byType(type).length > 1) invalidRaster();
  const animated = Boolean(flags & 0x02);
  if (Boolean(flags & 0x20) !== Boolean(byType("ICCP").length)
    || Boolean(flags & 0x08) !== Boolean(byType("EXIF").length)
    || Boolean(flags & 0x04) !== Boolean(byType("XMP ").length)) invalidRaster();
  if (animated) {
    const animationHeaders = byType("ANIM");
    const frames = byType("ANMF");
    if (animationHeaders.length !== 1 || animationHeaders[0].length !== 6 || !frames.length
      || byType("VP8 ").length || byType("VP8L").length || byType("ALPH").length) invalidRaster();
    let hasAlpha = false;
    for (const frame of frames) hasAlpha = inspectAnimatedWebpFrame(bytes, frame, width, height) || hasAlpha;
    if (Boolean(flags & 0x10) !== hasAlpha) invalidRaster();
  } else {
    if (byType("ANIM").length || byType("ANMF").length) invalidRaster();
    const images = [...byType("VP8 "), ...byType("VP8L")];
    const alphaChunks = byType("ALPH");
    if (images.length !== 1 || alphaChunks.length > 1 || (alphaChunks.length && images[0].type !== "VP8 ")) invalidRaster();
    if (alphaChunks.length) validateAlphaChunk(bytes, alphaChunks[0]);
    const image = images[0].type === "VP8 "
      ? inspectVp8(bytes, images[0].dataOffset, images[0].length)
      : inspectVp8l(bytes, images[0].dataOffset, images[0].length);
    if (image.width !== width || image.height !== height || Boolean(flags & 0x10) !== Boolean(alphaChunks.length || image.alpha)) invalidRaster();
  }
  return { format: "webp", width, height };
}

async function inspectRasterStructure(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return inspectPng(bytes);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return inspectJpeg(bytes);
  if (bytes.length >= 12 && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") return inspectWebp(bytes);
  invalidRaster();
}

export async function inspectManagedRaster(input) {
  const bytes = Buffer.from(input || []);
  if (!bytes.length) throw new Error("empty_raster");
  if (bytes.length > MANAGED_RASTER_MAXIMUM_BYTES) throw new Error("raster_too_large");
  let metadata;
  try {
    metadata = await inspectRasterStructure(bytes);
  } catch (error) {
    if (error?.message === "empty_raster" || error?.message === "raster_too_large") throw error;
    throw new Error("invalid_raster");
  }
  return {
    bytes,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    mimeType: MANAGED_RASTER_TYPES[metadata.format],
    extension: metadata.format === "jpeg" ? ".jpg" : `.${metadata.format}`,
    byteSize: bytes.length,
    width: metadata.width,
    height: metadata.height,
  };
}
