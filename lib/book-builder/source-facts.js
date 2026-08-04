import path from "node:path";
import { createDetectedFact } from "./detected-facts.js";

const parserId = "hamilton-air-base";
const parserVersion = "1.0";

function uniqueMatches(entries, pattern, kind, valueBuilder) {
  const matches = new Map();
  for (const entry of entries) {
    const match = entry.path.match(pattern);
    if (!match) continue;
    const locator = match[0].replace(/\/$/, "");
    if (!matches.has(locator.toLowerCase())) matches.set(locator.toLowerCase(), createDetectedFact({
      kind,
      locator,
      value: valueBuilder(match, entry),
      parserId,
      parserVersion,
      confidence: 0.85,
      evidence: [{ path: entry.path, category: entry.category }],
    }));
  }
  return [...matches.values()];
}

export function buildFoundationFacts({ resolution, inventory, fingerprint, profile }) {
  const facts = [];
  if (resolution.descriptor) {
    facts.push(createDetectedFact({ kind: "application_identity", locator: resolution.descriptor.sourceRelativePath, value: { id: resolution.descriptor.id, name: resolution.descriptor.name, version: resolution.descriptor.versionNumber, airVersion: resolution.descriptor.airVersion }, parserId, parserVersion, evidence: [{ sha256: resolution.descriptor.descriptorSha256 }] }));
    facts.push(createDetectedFact({ kind: "main_swf_identity", locator: resolution.mainSwfRelativePath, value: { path: resolution.mainSwfRelativePath, header: fingerprint.swfHeader }, parserId, parserVersion, evidence: [{ sha256: inventory.entries.find((entry) => entry.category === "main_swf")?.sha256 || null }] }));
  }
  facts.push(createDetectedFact({ kind: "canonical_app_root", locator: resolution.canonicalAppRelativePath, value: { sourceKind: resolution.kind, outerWrapper: resolution.outerWrapper }, parserId, parserVersion, evidence: [{ descriptorPath: resolution.descriptor?.sourceRelativePath || null }] }));
  facts.push(createDetectedFact({ kind: "profile_evidence", locator: ".", value: { id: profile.id, confidence: profile.confidence, matched: profile.matchedEvidence, missing: profile.missingEvidence, conflicting: profile.conflictingEvidence }, parserId: "profile-registry", parserVersion: profile.detectorVersion, confidence: profile.confidence, evidence: [{ fingerprintSha256: fingerprint.fingerprintSha256 }] }));
  const entries = inventory.entries;
  facts.push(...uniqueMatches(entries, /Contents\/Resources\/assets\/books\/book\d+\/[^/]+(?=\/)/i, "component_directory_candidate", (match) => ({ name: path.posix.basename(match[0]), path: match[0] })));
  facts.push(...uniqueMatches(entries, /Contents\/Resources\/assets\/books\/book\d+\/[^/]+\/\d+(?=\/)/i, "unit_directory_candidate", (match) => ({ number: Number(path.posix.basename(match[0])), path: match[0] })));
  facts.push(...uniqueMatches(entries, /Contents\/Resources\/assets\/books\/book\d+\/[^/]+\/\d+\/part\d+(?=\/)/i, "part_directory_candidate", (match) => ({ name: path.posix.basename(match[0]), path: match[0] })));
  facts.push(...uniqueMatches(entries, /Contents\/Resources\/assets\/books\/book\d+\/[^/]+\/\d+\/part\d+\/obj\d+(?=\/)/i, "object_directory_candidate", (match) => ({ name: path.posix.basename(match[0]), path: match[0] })));
  const atlasParents = new Map();
  const mediaParents = new Map();
  const metadataNames = new Map();
  for (const entry of entries) {
    if (["atlas_image", "atlas_metadata"].includes(entry.category)) atlasParents.set(path.posix.dirname(entry.path).toLowerCase(), path.posix.dirname(entry.path));
    if (["audio", "video"].includes(entry.category)) mediaParents.set(path.posix.dirname(entry.path).toLowerCase(), path.posix.dirname(entry.path));
    if (["iwb_metadata", "structured_metadata", "atlas_metadata"].includes(entry.category)) metadataNames.set(entry.filename.toLowerCase(), entry.filename);
  }
  for (const locator of atlasParents.values()) facts.push(createDetectedFact({ kind: "atlas_family_candidate", locator, value: { directory: locator }, parserId, parserVersion, confidence: 0.7, evidence: entries.filter((entry) => path.posix.dirname(entry.path) === locator && ["atlas_image", "atlas_metadata"].includes(entry.category)).map((entry) => ({ path: entry.path, sha256: entry.sha256 })) }));
  for (const locator of mediaParents.values()) facts.push(createDetectedFact({ kind: "media_family_candidate", locator, value: { directory: locator }, parserId, parserVersion, confidence: 0.7, evidence: entries.filter((entry) => path.posix.dirname(entry.path) === locator && ["audio", "video"].includes(entry.category)).map((entry) => ({ path: entry.path, byteSize: entry.byteSize })) }));
  for (const filename of metadataNames.values()) {
    const matching = entries.filter((entry) => entry.filename.toLowerCase() === filename.toLowerCase());
    facts.push(createDetectedFact({ kind: "metadata_family_candidate", locator: `metadata-family/${filename.toLowerCase()}`, value: { filename, count: matching.length }, parserId, parserVersion, confidence: 0.8, evidence: matching.map((entry) => ({ path: entry.path, sha256: entry.sha256 })) }));
  }
  return facts.sort((left, right) => left.id.localeCompare(right.id));
}
