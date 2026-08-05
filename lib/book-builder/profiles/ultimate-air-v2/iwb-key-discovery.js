import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decodeIwb, keyFingerprint } from "./iwb-codec.js";

const SAMPLE_COUNTS = new Map([
  ["home_params.iwb", 1],
  ["book1_params.iwb", 1],
  ["unit_params.iwb", 2],
  ["part_params.iwb", 2],
  ["obj_params.iwb", 2],
]);

export class IwbKeyDiscoveryError extends Error {
  constructor(code, message, diagnostics = []) {
    super(message);
    this.name = "IwbKeyDiscoveryError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

export function selectIwbValidationSamples(entries) {
  const sorted = [...entries].filter((entry) => entry.path.toLowerCase().endsWith(".iwb")).sort((a, b) => a.path.localeCompare(b.path));
  const samples = [];
  for (const [family, count] of SAMPLE_COUNTS) {
    const matches = sorted.filter((entry) => path.posix.basename(entry.path).toLowerCase() === family).slice(0, count);
    if (!matches.length) throw new IwbKeyDiscoveryError("core_iwb_family_missing", `Required IWB family is missing: ${family}`, [{ family }]);
    samples.push(...matches);
  }
  return samples;
}

export async function discoverIwbKey({ sourceRoot, inventoryEntries, swfInspection, decode = decodeIwb }) {
  const samples = selectIwbValidationSamples(inventoryEntries);
  const sampleInputs = await Promise.all(samples.map(async (entry) => ({
    path: entry.path,
    input: await fs.readFile(path.join(sourceRoot, ...entry.path.split("/"))),
  })));
  const tested = [];
  const accepted = [];
  for (const candidate of swfInspection.uuidCandidates) {
    const results = sampleInputs.map((sample) => ({ path: sample.path, status: decode(sample.input, candidate.value).status }));
    const successCount = results.filter((item) => item.status === "strict_xml").length;
    const evidence = { offset: candidate.offset, successCount, failureCount: results.length - successCount, statuses: Object.fromEntries(results.map((item) => [item.path, item.status])) };
    tested.push(evidence);
    if (successCount === results.length) accepted.push({ ...candidate, evidence });
  }
  if (!accepted.length) throw new IwbKeyDiscoveryError("iwb_key_not_found", "No SWF UUID candidate decoded every required IWB sample", tested);
  if (accepted.length > 1) throw new IwbKeyDiscoveryError("multiple_valid_iwb_keys", "Multiple SWF UUID candidates decoded every required IWB sample", accepted.map(({ offset }) => ({ offset })));
  const selected = accepted[0];
  const rejectedCandidateCounts = {};
  for (const item of tested.filter((candidate) => candidate.offset !== selected.offset)) rejectedCandidateCounts[item.failureCount] = (rejectedCandidateCounts[item.failureCount] || 0) + 1;
  return {
    key: selected.value,
    artifact: {
      schemaVersion: "1.0",
      parserId: "ultimate-air-v2-iwb-key-discovery",
      parserVersion: "1.0",
      discoveryMethod: selected.discoveryMethod,
      candidateCount: swfInspection.uuidCandidates.length,
      acceptedCandidateOffset: selected.offset,
      acceptedKeyFingerprint: keyFingerprint(selected.value),
      validationSamplePaths: sampleInputs.map((item) => item.path),
      validationSamplePathHash: createHash("sha256").update(sampleInputs.map((item) => item.path).join("\n")).digest("hex"),
      acceptedSampleCount: sampleInputs.length,
      rejectedCandidateCounts: Object.fromEntries(Object.entries(rejectedCandidateCounts).sort(([a], [b]) => Number(a) - Number(b))),
      validationRules: ["canonical_base64", "repeating_xor", "strict_utf8", "plausible_xml_root", "safe_strict_xml", "all_required_samples"],
    },
  };
}
