import { createHash } from "node:crypto";

export const MANAGED_MP3_MAXIMUM_BYTES = 50 * 1024 * 1024;

const MPEG1_BITRATES = Object.freeze({
  1: [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  3: [32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
});
const MPEG2_BITRATES = Object.freeze({
  1: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  2: [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  3: [32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
});

function mpegFrameLength(bytes, offset) {
  const first = bytes[offset]; const second = bytes[offset + 1]; const third = bytes[offset + 2]; const fourth = bytes[offset + 3];
  if (first !== 0xff || (second & 0xe0) !== 0xe0) return 0;
  const version = (second >> 3) & 0x03;
  const layer = (second >> 1) & 0x03;
  const bitrateIndex = (third >> 4) & 0x0f;
  const sampleRateIndex = (third >> 2) & 0x03;
  if (version === 1 || layer === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3 || (fourth & 0x03) === 2) return 0;
  const bitrate = (version === 3 ? MPEG1_BITRATES : MPEG2_BITRATES)[layer][bitrateIndex - 1] * 1000;
  const baseSampleRate = [44_100, 48_000, 32_000][sampleRateIndex];
  const sampleRate = version === 3 ? baseSampleRate : version === 2 ? baseSampleRate / 2 : baseSampleRate / 4;
  const padding = (third >> 1) & 0x01;
  if (layer === 3) return Math.floor((12 * bitrate / sampleRate + padding) * 4);
  return Math.floor(((layer === 1 && version !== 3 ? 72 : 144) * bitrate / sampleRate) + padding);
}

function firstMpegFrameOffset(bytes) {
  let offset = 0;
  if (bytes.toString("ascii", 0, 3) === "ID3") {
    if (bytes.length < 10 || [...bytes.subarray(6, 10)].some((value) => value & 0x80)) return -1;
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    offset = 10 + size;
  }
  const searchEnd = Math.min(bytes.length - 1, offset + 64 * 1024);
  for (let index = offset; index < searchEnd; index += 1) {
    const frameLength = mpegFrameLength(bytes, index);
    if (frameLength > 0 && index + frameLength <= bytes.length) return index;
  }
  return -1;
}

export function inspectManagedMp3(input) {
  const bytes = Buffer.from(input || []);
  if (!bytes.length) throw Object.assign(new Error("empty_audio"), { code: "empty_audio" });
  if (bytes.length > MANAGED_MP3_MAXIMUM_BYTES) throw Object.assign(new Error("audio_file_too_large"), { code: "audio_file_too_large" });
  if (firstMpegFrameOffset(bytes) < 0) throw Object.assign(new Error("invalid_audio"), { code: "invalid_audio" });
  return {
    bytes,
    mimeType: "audio/mpeg",
    extension: ".mp3",
    byteSize: bytes.length,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    width: null,
    height: null,
  };
}
