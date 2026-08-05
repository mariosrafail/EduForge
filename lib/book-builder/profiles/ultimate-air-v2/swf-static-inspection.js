import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";

const defaultExecFile = promisify(execFileCallback);
const UUID_PATTERN = /[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/g;

export class StaticSwfInspectionError extends Error {
  constructor(code, message, diagnostics = []) {
    super(message);
    this.name = "StaticSwfInspectionError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export function findUuidCandidates(bytes) {
  const text = Buffer.from(bytes).toString("latin1");
  const seen = new Set();
  const candidates = [];
  for (const match of text.matchAll(UUID_PATTERN)) {
    // The UUID-shaped string is also the byte-exact XOR key. Preserve its
    // original ASCII case: normalizing a lowercase publisher key corrupts it.
    const value = match[0];
    if (seen.has(value)) continue;
    seen.add(value);
    candidates.push({ value, offset: match.index, discoveryMethod: "decompressed-swf-ascii-uuid" });
  }
  return candidates;
}

export function inspectUncompressedSwfBytes(sourceBytes) {
  const bytes = Buffer.from(sourceBytes);
  if (bytes.length < 8) throw new StaticSwfInspectionError("truncated_swf", "SWF header is truncated");
  const signature = bytes.subarray(0, 3).toString("ascii");
  let decompressed;
  if (signature === "FWS") decompressed = bytes;
  else if (signature === "CWS") {
    try { decompressed = Buffer.concat([Buffer.from("FWS"), bytes.subarray(3, 8), inflateSync(bytes.subarray(8))]); }
    catch (error) { throw new StaticSwfInspectionError("invalid_compressed_swf", `CWS decompression failed: ${error.message}`); }
  } else if (signature === "ZWS") {
    throw new StaticSwfInspectionError("zws_requires_static_helper", "ZWS requires the tracked static LZMA helper");
  } else throw new StaticSwfInspectionError("unsupported_swf_signature", `Unsupported SWF signature: ${signature}`);
  const declared = bytes.readUInt32LE(4);
  if (declared !== decompressed.length) throw new StaticSwfInspectionError("swf_length_mismatch", `SWF length mismatch: declared ${declared}, decoded ${decompressed.length}`);
  return {
    schemaVersion: "1.0",
    method: "static byte decompression; no SWF or ActionScript execution",
    sourceSignature: signature,
    sourceVersion: bytes[3],
    sourceSizeBytes: bytes.length,
    decompressedSizeBytes: decompressed.length,
    uuidCandidates: findUuidCandidates(decompressed),
  };
}

async function runPythonHelper(mainSwfPath, helperPath, commandCandidates, execFileImpl) {
  const diagnostics = [];
  for (const candidate of commandCandidates) {
    try {
      const { stdout } = await execFileImpl(candidate.command, [...candidate.prefixArgs, helperPath, mainSwfPath], {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
      });
      const parsed = JSON.parse(stdout);
      if (!Array.isArray(parsed.uuidCandidates)) throw new Error("Static helper omitted UUID candidates");
      return parsed;
    } catch (error) {
      diagnostics.push({ command: candidate.command, code: error.code || "helper_failed", message: error.message });
      if (!new Set(["ENOENT", "UNKNOWN"]).has(error.code)) {
        throw new StaticSwfInspectionError("swf_static_helper_failed", `Static SWF helper failed: ${error.message}`, diagnostics);
      }
    }
  }
  throw new StaticSwfInspectionError("python_unavailable", "Python is unavailable for static ZWS decompression", diagnostics);
}

export async function inspectStaticSwf(mainSwfPath, {
  helperPath,
  commandCandidates = [
    { command: "python", prefixArgs: [] },
    { command: "python3", prefixArgs: [] },
    { command: "py", prefixArgs: ["-3"] },
  ],
  execFileImpl = defaultExecFile,
} = {}) {
  const absolute = path.resolve(mainSwfPath);
  if (path.extname(absolute).toLowerCase() !== ".swf") throw new StaticSwfInspectionError("invalid_swf_path", "Main SWF path must name a .swf file");
  const handle = await fs.open(absolute, "r");
  let header;
  try {
    header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, 8, 0);
    if (bytesRead < 8) throw new StaticSwfInspectionError("truncated_swf", "SWF header is truncated");
  } finally { await handle.close(); }
  const signature = header.subarray(0, 3).toString("ascii");
  if (signature !== "ZWS") return inspectUncompressedSwfBytes(await fs.readFile(absolute));
  if (!helperPath) throw new StaticSwfInspectionError("static_helper_missing", "A tracked static helper path is required for ZWS");
  const report = await runPythonHelper(absolute, path.resolve(helperPath), commandCandidates, execFileImpl);
  return {
    schemaVersion: "1.0",
    method: report.method,
    sourceSignature: report.sourceSignature,
    sourceVersion: report.sourceVersion,
    sourceSizeBytes: report.sourceSizeBytes,
    sourceSha256: report.sourceSha256,
    decompressedSizeBytes: report.decompressedSizeBytes,
    uuidCandidates: report.uuidCandidates,
  };
}

export function portableSwfEvidence(inspection) {
  return {
    schemaVersion: "1.0",
    method: inspection.method,
    sourceSignature: inspection.sourceSignature,
    sourceVersion: inspection.sourceVersion,
    sourceSizeBytes: inspection.sourceSizeBytes,
    sourceSha256: inspection.sourceSha256 || null,
    decompressedSizeBytes: inspection.decompressedSizeBytes,
    uuidCandidateCount: inspection.uuidCandidates.length,
    uuidCandidateOffsets: inspection.uuidCandidates.map((item) => item.offset),
  };
}
