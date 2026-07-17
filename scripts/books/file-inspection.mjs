import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

const extensionMime = new Map([
  [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"], [".svg", "image/svg+xml"],
  [".mp3", "audio/mpeg"], [".m4a", "audio/mp4"], [".mp4", "video/mp4"], [".pdf", "application/pdf"], [".zip", "application/zip"], [".json", "application/json"],
]);

export function detectMimeType(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9) return "image/jpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return "application/zip";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return extensionMime.get(".m4a");
  if (buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  const text = buffer.subarray(0, 512).toString("utf8").trimStart();
  if (text.startsWith("<svg") || /^<\?xml[^>]*>\s*<svg/i.test(text)) return "image/svg+xml";
  if (text.startsWith("{") || text.startsWith("[")) { try { JSON.parse(buffer.toString("utf8")); return "application/json"; } catch {} }
  return null;
}

export function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function sha256File(filePath) {
  return sha256(await fs.readFile(filePath));
}

function ffprobeDuration(filePath) {
  return new Promise((resolve) => {
    const child = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], { windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      const duration = Number(output.trim());
      resolve(code === 0 && Number.isFinite(duration) ? Number(duration.toFixed(3)) : null);
    });
  });
}

export async function inspectSourceFile(filePath, declaredMimeType) {
  const buffer = await fs.readFile(filePath);
  const mimeType = extensionMime.get(path.extname(filePath).toLowerCase());
  if (!mimeType) throw new Error(`Unsupported source extension: ${path.extname(filePath)}`);
  if (declaredMimeType && declaredMimeType !== mimeType) throw new Error(`Declared MIME ${declaredMimeType} does not match detected MIME ${mimeType}`);
  const contentMimeType = detectMimeType(buffer);
  const compatibleMp4 = contentMimeType === "audio/mp4" && mimeType === "video/mp4";
  if (!contentMimeType || (contentMimeType !== mimeType && !compatibleMp4)) throw new Error(`File signature does not match ${mimeType}`);
  const result = { buffer, mimeType, byteSize: buffer.length, checksumSha256: sha256(buffer), width: null, height: null, durationSeconds: null };
  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") {
    const metadata = await sharp(buffer).metadata();
    result.width = metadata.width || null;
    result.height = metadata.height || null;
  }
  if (mimeType.startsWith("audio/") || mimeType.startsWith("video/")) result.durationSeconds = await ffprobeDuration(filePath);
  return result;
}

async function imageVariant(buffer, { width, quality }) {
  let pipeline = sharp(buffer, { failOn: "warning" });
  if (width) pipeline = pipeline.resize({ width, withoutEnlargement: true });
  const output = await pipeline.webp({ quality, effort: 4, smartSubsample: true }).toBuffer({ resolveWithObject: true });
  return {
    buffer: output.data,
    mimeType: "image/webp",
    byteSize: output.data.length,
    checksumSha256: sha256(output.data),
    width: output.info.width,
    height: output.info.height,
    durationSeconds: null,
  };
}

export async function createImportVariants(asset, inspection) {
  if (!asset.mimeType.startsWith("image/") || asset.mimeType === "image/svg+xml" || asset.imageStrategy !== "page") {
    return [{ suffix: "", role: asset.role, profile: asset.accessLevel === "public" || asset.accessLevel === "preview" ? "public" : "private", accessLevel: asset.accessLevel, ...inspection }];
  }
  const source = { suffix: ".source", role: "source", profile: "archive", accessLevel: "internal", ...inspection };
  const production = { suffix: "", role: asset.role, profile: asset.accessLevel === "public" || asset.accessLevel === "preview" ? "public" : "private", accessLevel: asset.accessLevel, ...(await imageVariant(inspection.buffer, { width: 2400, quality: 94 })) };
  const thumbnail = { suffix: ".thumbnail", role: "thumbnail", profile: asset.accessLevel === "public" || asset.accessLevel === "preview" ? "public" : "private", accessLevel: asset.accessLevel, ...(await imageVariant(inspection.buffer, { width: 480, quality: 84 })) };
  return [source, production, thumbnail];
}
