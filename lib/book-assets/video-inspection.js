import { createHash } from "node:crypto";

export const MANAGED_MP4_MAXIMUM_BYTES = 100 * 1024 * 1024;

const MP4_BRANDS = new Set(["avc1", "dash", "isom", "M4V ", "mp41", "mp42", "MSNV"]);

function invalidVideo(code = "invalid_video") {
  throw Object.assign(new Error(code), { code });
}

function boxes(bytes, start, end) {
  const result = [];
  let offset = start;
  while (offset < end) {
    if (end - offset < 8) invalidVideo();
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    let headerSize = 8;
    if (size === 1) {
      if (end - offset < 16) invalidVideo();
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) invalidVideo();
      size = Number(extended);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < headerSize || offset + size > end || !/^[\x20-\x7e]{4}$/.test(type)) invalidVideo();
    result.push({ type, dataStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  if (offset !== end) invalidVideo();
  return result;
}

function child(parent, bytes, type) {
  return boxes(bytes, parent.dataStart, parent.end).find((box) => box.type === type) || null;
}

function movieDurationMs(moov, bytes) {
  const mvhd = child(moov, bytes, "mvhd");
  if (!mvhd || mvhd.end - mvhd.dataStart < 20) invalidVideo("invalid_video_metadata");
  const version = bytes[mvhd.dataStart];
  let timescale;
  let duration;
  if (version === 0) {
    timescale = bytes.readUInt32BE(mvhd.dataStart + 12);
    duration = BigInt(bytes.readUInt32BE(mvhd.dataStart + 16));
  } else if (version === 1) {
    if (mvhd.end - mvhd.dataStart < 32) invalidVideo("invalid_video_metadata");
    timescale = bytes.readUInt32BE(mvhd.dataStart + 20);
    duration = bytes.readBigUInt64BE(mvhd.dataStart + 24);
  } else {
    invalidVideo("invalid_video_metadata");
  }
  if (!timescale || duration < 1n) invalidVideo("invalid_video_duration");
  const durationMs = Number((duration * 1_000n + BigInt(Math.floor(timescale / 2))) / BigInt(timescale));
  if (!Number.isSafeInteger(durationMs) || durationMs < 1 || durationMs > 99 * 60 * 60 * 1_000) invalidVideo("invalid_video_duration");
  return durationMs;
}

function hasVideoTrack(moov, bytes) {
  return boxes(bytes, moov.dataStart, moov.end).filter((box) => box.type === "trak").some((trak) => {
    const mdia = child(trak, bytes, "mdia");
    const hdlr = mdia ? child(mdia, bytes, "hdlr") : null;
    return Boolean(hdlr && hdlr.end - hdlr.dataStart >= 12 && bytes.toString("latin1", hdlr.dataStart + 8, hdlr.dataStart + 12) === "vide");
  });
}

export function inspectManagedMp4(input) {
  const bytes = Buffer.from(input || []);
  if (!bytes.length) invalidVideo("empty_video");
  if (bytes.length > MANAGED_MP4_MAXIMUM_BYTES) invalidVideo("video_file_too_large");
  const topLevel = boxes(bytes, 0, bytes.length);
  const ftyp = topLevel.find((box) => box.type === "ftyp");
  const moov = topLevel.find((box) => box.type === "moov");
  const mdat = topLevel.find((box) => box.type === "mdat");
  if (!ftyp || !moov || !mdat || ftyp.end - ftyp.dataStart < 8 || mdat.end === mdat.dataStart) invalidVideo();
  const brands = [];
  for (let offset = ftyp.dataStart; offset + 4 <= ftyp.end; offset += 4) {
    if (offset === ftyp.dataStart + 4) continue;
    brands.push(bytes.toString("latin1", offset, offset + 4));
  }
  if (!brands.some((brand) => MP4_BRANDS.has(brand) || /^iso[2-9]$/.test(brand))) invalidVideo("unsupported_video_brand");
  if (!hasVideoTrack(moov, bytes)) invalidVideo("video_track_required");
  return {
    bytes,
    mimeType: "video/mp4",
    extension: ".mp4",
    byteSize: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    width: null,
    height: null,
    durationMs: movieDurationMs(moov, bytes),
  };
}
