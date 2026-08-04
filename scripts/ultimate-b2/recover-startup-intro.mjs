import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRelativePath = "Ultimate English B2.app/Contents/Resources/assets/videos/intro.flv";
const outputRelativePath = "src/assets/books/ultimate-b2/teacher-offline-media/ultimate-b2-startup-intro.mp4";
const expectedSourceSha256 = "8aacc2a90f2f19e529b39e09debad3af9c5c495e35a21ccf4a7c40898435655f";
const sourcePath = path.join(repositoryRoot, ...sourceRelativePath.split("/"));
const outputPath = path.join(repositoryRoot, ...outputRelativePath.split("/"));
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

const sourceBytes = await readFile(sourcePath);
assert.equal(
  sha256(sourceBytes),
  expectedSourceSha256,
  "The archived Ultimate B2 intro does not match the documented source hash.",
);

await mkdir(path.dirname(outputPath), { recursive: true });
const ffmpegArguments = [
  "-hide_banner",
  "-loglevel", "warning",
  "-y",
  "-i", sourcePath,
  "-map", "0:v:0",
  "-map", "0:a:0",
  "-map_metadata", "-1",
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "18",
  "-pix_fmt", "yuv420p",
  "-r", "25",
  "-fps_mode", "cfr",
  "-c:a", "aac",
  "-b:a", "128k",
  "-ar", "44100",
  "-ac", "2",
  "-threads", "1",
  "-movflags", "+faststart",
  outputPath,
];
const conversion = spawnSync(ffmpeg, ffmpegArguments, { cwd: repositoryRoot, encoding: "utf8" });
if (conversion.error) throw conversion.error;
if (conversion.status !== 0) throw new Error(conversion.stderr || `FFmpeg exited with ${conversion.status}`);

const outputBytes = await readFile(outputPath);
assert.equal(outputBytes.toString("ascii", 4, 8), "ftyp", "Recovered intro is not an MP4 container.");
assert.ok(outputBytes.includes(Buffer.from("avc1", "ascii")), "Recovered intro does not contain H.264 video.");
assert.ok(outputBytes.includes(Buffer.from("mp4a", "ascii")), "Recovered intro does not contain AAC audio.");

console.log(JSON.stringify({
  status: "recovered",
  ffmpeg,
  source: { path: sourceRelativePath, sha256: expectedSourceSha256, sizeBytes: sourceBytes.length },
  output: { path: outputRelativePath, sha256: sha256(outputBytes), sizeBytes: outputBytes.length },
  ffmpegArguments: ffmpegArguments.map((value) => value === sourcePath ? sourceRelativePath : value === outputPath ? outputRelativePath : value),
}, null, 2));
