import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function semanticSha256(value) {
  return sha256(stableStringify(value));
}

export async function fileIntegrity(file) {
  const bytes = await readFile(file);
  return {
    sizeBytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

export function containsForbiddenPackText(text) {
  const checks = [
    /[A-Za-z]:[\\/]Users[\\/]/i,
    /\bNextcloud\b/i,
    /Contents[\\/]Resources[\\/]/i,
    /Ultimate English B2\.app/i,
    /\.swf\b/i,
    /\.iwb\b/i,
    /https?:\/\//i,
    /\b(?:sourcePath|sourceRelativePath|sourceProvenance|localDevelopmentPath)\b/i,
    /\b(?:studentId|studentEmail|submissionId|gradeId)\b/i,
  ];
  return checks.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}
