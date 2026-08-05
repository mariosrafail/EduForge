import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decodeIwb } from "./iwb-codec.js";

const PARSER_ID = "ultimate-air-v2-iwb-index";
const PARSER_VERSION = "1.0";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

function familyFor(sourcePath) { return path.posix.basename(sourcePath).toLowerCase(); }

export async function buildIwbIndex({ sourceRoot, inventoryEntries, key, concurrency = 8 }) {
  const entries = inventoryEntries.filter((entry) => entry.path.toLowerCase().endsWith(".iwb")).sort((a, b) => a.path.localeCompare(b.path));
  const records = new Array(entries.length);
  const internalDocuments = new Map();
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= entries.length) return;
      const entry = entries[index];
      const input = await fs.readFile(path.join(sourceRoot, ...entry.path.split("/")));
      const decoded = decodeIwb(input, key);
      const base = {
        sourceRelativePath: entry.path,
        family: familyFor(entry.path),
        sourceSha256: entry.sha256 || sha256(input),
        sourceBytes: input.length,
        decodedStatus: decoded.status,
        decodedByteSize: decoded.decodedByteSize || null,
        rootElement: decoded.root || null,
        parserId: PARSER_ID,
        parserVersion: PARSER_VERSION,
        diagnostics: decoded.diagnostic ? [decoded.diagnostic] : [],
      };
      if (decoded.status === "strict_xml") {
        Object.assign(base, decoded.safeSummary);
        internalDocuments.set(entry.path, decoded.xml);
      } else if (decoded.status === "malformed_xml_after_valid_decode") {
        base.errorLocation = decoded.errorLocation;
        base.schemaFamilyCandidate = familyFor(entry.path);
      }
      records[index] = base;
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, entries.length)) }, () => worker()));
  const familyCounts = {};
  const statusCounts = {};
  const schemaFingerprintCounts = {};
  for (const record of records) {
    familyCounts[record.family] = (familyCounts[record.family] || 0) + 1;
    statusCounts[record.decodedStatus] = (statusCounts[record.decodedStatus] || 0) + 1;
    if (record.schemaFingerprint) schemaFingerprintCounts[record.schemaFingerprint] = (schemaFingerprintCounts[record.schemaFingerprint] || 0) + 1;
  }
  const artifact = {
    schemaVersion: "1.0",
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
    summary: {
      total: records.length,
      strictXml: statusCounts.strict_xml || 0,
      malformedXmlAfterValidDecode: statusCounts.malformed_xml_after_valid_decode || 0,
      invalidWrapper: statusCounts.invalid_wrapper || 0,
      invalidUtf8: statusCounts.invalid_utf8 || 0,
      wrongKeyOrNonXml: statusCounts.wrong_key_or_non_xml || 0,
      answerBearingDocuments: records.filter((item) => item.answerBearing).length,
      schemaFingerprintCount: Object.keys(schemaFingerprintCounts).length,
    },
    familyCounts: Object.fromEntries(Object.entries(familyCounts).sort()),
    statusCounts: Object.fromEntries(Object.entries(statusCounts).sort()),
    schemaFingerprintCounts: Object.fromEntries(Object.entries(schemaFingerprintCounts).sort()),
    documents: records,
  };
  return { artifact, internalDocuments };
}
