import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

import assetsManifest from "../../android-content-packs/ultimate-b2-students-book/assets-manifest.json" with { type: "json" };
import packManifest from "../../android-content-packs/ultimate-b2-students-book/manifest.json" with { type: "json" };
import { teacherPackAssetSources } from "./pack-asset-sources.mjs";

const videoCodecs = ["avc1", "hvc1", "hev1", "vp09", "av01", "mp4v"];
const audioCodecs = ["mp4a", "ac-3", "ec-3", "opus"];
const mpeg1Layer3Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const mpeg2Layer3Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

function asciiIncludes(bytes, value) {
  return bytes.indexOf(Buffer.from(value, "ascii")) >= 0;
}

function mp4DurationSeconds(bytes) {
  const typeOffset = bytes.indexOf(Buffer.from("mvhd", "ascii"));
  if (typeOffset < 0 || typeOffset + 32 >= bytes.length) return null;
  const version = bytes[typeOffset + 4];
  const timescaleOffset = typeOffset + (version === 1 ? 24 : 16);
  const durationOffset = typeOffset + (version === 1 ? 28 : 20);
  const timescale = bytes.readUInt32BE(timescaleOffset);
  const duration = version === 1
    ? Number(bytes.readBigUInt64BE(durationOffset))
    : bytes.readUInt32BE(durationOffset);
  return timescale && duration ? duration / timescale : null;
}

function mp4Resolution(bytes) {
  for (const codec of videoCodecs) {
    const marker = Buffer.from(codec, "ascii");
    let typeOffset = -1;
    while ((typeOffset = bytes.indexOf(marker, typeOffset + 1)) >= 0) {
      if (typeOffset + 32 >= bytes.length) break;
      const boxSize = typeOffset >= 4 ? bytes.readUInt32BE(typeOffset - 4) : 0;
      if (boxSize < 86 || typeOffset - 4 + boxSize > bytes.length) continue;
      const width = bytes.readUInt16BE(typeOffset + 28);
      const height = bytes.readUInt16BE(typeOffset + 30);
      if (width > 0 && height > 0 && width <= 16384 && height <= 16384) return `${width}x${height}`;
    }
  }
  return null;
}

function mp3Frame(bytes) {
  let offset = 0;
  if (bytes.toString("ascii", 0, 3) === "ID3" && bytes.length >= 10) {
    offset = 10
      + ((bytes[6] & 0x7f) << 21)
      + ((bytes[7] & 0x7f) << 14)
      + ((bytes[8] & 0x7f) << 7)
      + (bytes[9] & 0x7f);
  }
  for (; offset + 4 < bytes.length; offset += 1) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (bytes[offset + 1] >> 3) & 0x03;
    const layerBits = (bytes[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
    if (layerBits !== 1 || !bitrateIndex || bitrateIndex === 15 || sampleRateIndex === 3) continue;
    const mpeg1 = versionBits === 3;
    const rates = mpeg1 ? [44100, 48000, 32000] : versionBits === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000];
    return {
      bitrateKbps: (mpeg1 ? mpeg1Layer3Bitrates : mpeg2Layer3Bitrates)[bitrateIndex],
      sampleRateHz: rates[sampleRateIndex],
    };
  }
  return null;
}

async function inspect(source) {
  const bytes = await readFile(source.sourcePath);
  const file = await stat(source.sourcePath);
  if (source.type === "audio") {
    const frame = mp3Frame(bytes);
    assert.ok(frame, `Unsupported or damaged MP3: ${source.logicalKey}`);
    return {
      logicalKey: source.logicalKey,
      unit: source.logicalKey.includes(".unit-1.") ? 1 : 2,
      type: "audio",
      container: "MP3",
      audioCodec: "MPEG Layer III",
      sampleRateHz: frame.sampleRateHz,
      approximateBitrateKbps: frame.bitrateKbps,
      sizeBytes: file.size,
    };
  }

  assert.equal(bytes.toString("ascii", 4, 8), "ftyp", `Unsupported or damaged MP4: ${source.logicalKey}`);
  const videoCodec = videoCodecs.find((codec) => asciiIncludes(bytes, codec)) || null;
  const audioCodec = audioCodecs.find((codec) => asciiIncludes(bytes, codec)) || null;
  const durationSeconds = mp4DurationSeconds(bytes);
  const resolution = mp4Resolution(bytes);
  assert.ok(videoCodec, `Video codec could not be identified: ${source.logicalKey}`);
  assert.ok(resolution, `Video resolution could not be identified: ${source.logicalKey}`);
  return {
    logicalKey: source.logicalKey,
    unit: source.logicalKey.includes(".unit-1.") ? 1 : 2,
    type: "video",
    container: "MP4",
    videoCodec,
    audioCodec,
    resolution,
    durationSeconds: durationSeconds ? Number(durationSeconds.toFixed(2)) : null,
    approximateBitrateKbps: durationSeconds
      ? Math.round((file.size * 8) / durationSeconds / 1000)
      : null,
    sizeBytes: file.size,
  };
}

async function main() {
  const mediaSources = teacherPackAssetSources().filter((asset) => ["audio", "video"].includes(asset.type));
  const results = await Promise.all(mediaSources.map(inspect));
  assert.equal(results.filter((asset) => asset.type === "audio").length, 11);
  assert.equal(results.filter((asset) => asset.type === "video").length, 7);
  for (const unit of [1, 2]) {
    assert.ok(results.some((asset) => asset.unit === unit && asset.type === "audio"), `Unit ${unit} audio is missing`);
    assert.ok(results.some((asset) => asset.unit === unit && asset.type === "video"), `Unit ${unit} video is missing`);
  }
  const totals = Object.fromEntries(["cover", "page", "audio", "video"].map((type) => [
    type,
    assetsManifest.assets.filter((asset) => asset.type === type).reduce((sum, asset) => sum + asset.sizeBytes, 0),
  ]));
  console.log(JSON.stringify({
    status: "compatible-codecs",
    broadlySupportedAndroidCombination: results.every((asset) => (
      asset.type === "audio"
        ? asset.audioCodec === "MPEG Layer III"
        : asset.videoCodec === "avc1" && [null, "mp4a"].includes(asset.audioCodec)
    )),
    counts: { audio: 11, video: 7 },
    contentBytes: packManifest.totalContentSizeBytes,
    metadataBytes: packManifest.totalMetadataBytes,
    assetBytesByType: totals,
    media: results,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
