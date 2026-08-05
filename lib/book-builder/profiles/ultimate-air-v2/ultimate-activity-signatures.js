import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { stableHash } from "../../stable-json.js";
import { activityCandidateId } from "./activity-candidate-contract.js";
import { classifyActivityDisposition } from "./ultimate-activity-types.js";
import { sourceStructureIdentity } from "./ultimate-structure.js";

const OBJECT_ROOT = /^(Contents\/Resources\/assets\/books\/book\d+\/[^/]+\/\d+\/part\d+\/obj\d+)(?:\/|$)/i;
const IMAGE = /\.(?:png|jpe?g|webp|gif)$/i;
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function objectRoot(sourcePath) { return sourcePath.match(OBJECT_ROOT)?.[1] || null; }
function boolSummary(documents, tag) { return documents.some((item) => Number(item.tagNameSummary?.[tag] || item.tagNameSummary?.[tag[0].toUpperCase() + tag.slice(1)] || 0) > 0); }

export async function buildActivitySignatures({ sourceRoot, inventoryEntries, iwbIndex, internalDocuments, pageCandidates, hotspotCandidates, mediaCandidates, concurrency = 8 }) {
  const groups = new Map();
  for (const entry of inventoryEntries) {
    const root = objectRoot(entry.path);
    if (root) (groups.get(root) || (groups.set(root, []), groups.get(root))).push(entry);
  }
  const iwbByPath = new Map(iwbIndex.documents.map((item) => [item.sourceRelativePath, item]));
  const records = new Array(groups.size); const roots = [...groups.keys()].sort(); let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++; if (index >= roots.length) return;
      const sourceObjectLocator = roots[index]; const members = groups.get(sourceObjectLocator).sort((a, b) => a.path.localeCompare(b.path));
      const files = [];
      for (const entry of members) {
        let sourceSha256 = entry.sha256;
        if (!sourceSha256) sourceSha256 = sha256(await fs.readFile(path.join(sourceRoot, ...entry.path.split("/"))));
        files.push({ sourceRelativePath: entry.path, filename: entry.filename, extension: entry.extension, byteSize: entry.byteSize, sourceSha256 });
      }
      const documents = members.map((entry) => iwbByPath.get(entry.path)).filter(Boolean);
      const publisherExerciseTypes = [...new Set(documents.flatMap((item) => item.exerciseTypeNames || []))].sort();
      const signals = {
        questionBank: members.some((item) => item.filename.toLowerCase() === "questions_params.iwb"), questions: boolSummary(documents, "question"), choices: boolSummary(documents, "choice"), sentences: boolSummary(documents, "sentence"),
        drags: boolSummary(documents, "drag"), drops: boolSummary(documents, "drop"), textResponseFields: boolSummary(documents, "text"), answerBearing: documents.some((item) => item.answerBearing),
        geometry: documents.some((item) => item.geometryBearing), audio: members.some((item) => /\.(?:mp3|wav|m4a|aac)$/i.test(item.path)), video: members.some((item) => /\.(?:mp4|flv|mov|m4v)$/i.test(item.path)),
        rasterBackground: members.some((item) => IMAGE.test(item.path)), rubricImage: members.some((item) => /rubric/i.test(item.filename)), objectLocalAtlas: members.some((item) => /atlas/i.test(item.filename)),
        structuredPrompt: documents.some((item) => Number(item.tagNameSummary?.question || 0) > 0), structuredChoiceText: false, structuredDragLabels: false, media: members.some((item) => /\.(?:mp3|wav|m4a|aac|mp4|flv|mov|m4v)$/i.test(item.path)),
      };
      for (const [docPath, xml] of internalDocuments.entries()) if (docPath.startsWith(`${sourceObjectLocator}/`)) {
        if (/<choice\b[^>]*>\s*(?:<!\[CDATA\[)?\s*[^<\s]/i.test(xml)) signals.structuredChoiceText = true;
        if (/<drag\b[^>]*>\s*(?:<!\[CDATA\[)?\s*[^<\s]/i.test(xml)) signals.structuredDragLabels = true;
      }
      const identity = sourceStructureIdentity(sourceObjectLocator); const activityId = activityCandidateId(sourceObjectLocator);
      const metadataFamilies = documents.map((item) => item.family).sort(); const schemaFingerprints = documents.map((item) => item.schemaFingerprint).filter(Boolean).sort();
      const filenameCounts = Object.fromEntries([...new Set(files.map((item) => item.filename.toLowerCase()))].sort().map((name) => [name, files.filter((item) => item.filename.toLowerCase() === name).length]));
      const extensionCounts = Object.fromEntries([...new Set(files.map((item) => item.extension))].sort().map((ext) => [ext, files.filter((item) => item.extension === ext).length]));
      const structuralBasis = { filenameCounts, extensionCounts, metadataFamilies, schemaFingerprints, publisherExerciseTypes, signals: Object.fromEntries(Object.entries(signals).filter(([, value]) => value)) };
      const disposition = classifyActivityDisposition({ publisherTypes: publisherExerciseTypes, signals, malformed: documents.some((item) => item.decodedStatus === "malformed_xml_after_valid_decode") });
      const part = hotspotCandidates.parts.find((item) => item.component === identity.component && item.unit === identity.unit && item.part === identity.part);
      const hotspotCandidateIds = part?.exactCardinality ? [`${part.sourceRelativePath}/hotspot/${identity.object}`] : [];
      const mediaCandidateIds = mediaCandidates.candidates.filter((item) => item.sourceRelativePath.toLowerCase().includes(`/${identity.component.toLowerCase()}/${identity.unit}/`) && item.sourceRelativePath.toLowerCase().includes(`/obj${identity.object}`)).map((item) => item.id || item.sourceRelativePath).sort();
      const page = pageCandidates.spreads.find((item) => item.component === identity.component && item.unit === identity.unit && item.part === identity.part);
      records[index] = { schemaVersion: "1.0", activityCandidateId: activityId, sourceObjectLocator, componentSourceDirectory: identity.component, unit: identity.unit, part: identity.part, object: identity.object,
        filenames: files.map((item) => item.filename), extensionCounts, metadataFamilies, schemaFingerprints, publisherExerciseTypes, signals,
        pageCandidateId: page ? `${page.component}/${page.unit}/part${page.part}` : null, hotspotCandidateIds, mediaCandidateIds,
        structuralSignatureHash: stableHash(structuralBasis), contentEvidenceHash: stableHash(files.map((item) => ({ path: item.sourceRelativePath.toLowerCase(), sha256: item.sourceSha256 }))),
        sourceFiles: files.map(({ sourceRelativePath, sourceSha256 }) => ({ sourceRelativePath, sourceSha256 })), disposition };
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(concurrency, 1), Math.max(roots.length, 1)) }, () => worker()));
  const clusters = new Map();
  for (const record of records) {
    if (!clusters.has(record.structuralSignatureHash)) clusters.set(record.structuralSignatureHash, { structuralSignatureHash: record.structuralSignatureHash, objectCount: 0, dispositions: {}, examples: [] });
    const cluster = clusters.get(record.structuralSignatureHash); cluster.objectCount += 1; cluster.dispositions[record.disposition.disposition] = (cluster.dispositions[record.disposition.disposition] || 0) + 1;
    if (cluster.examples.length < 5) cluster.examples.push(record.sourceObjectLocator);
  }
  return {
    signatures: { schemaVersion: "1.0", parserId: "ultimate-air-v2-activity-signatures", parserVersion: "1.0", summary: { objectCount: records.length, clusterCount: clusters.size }, records },
    clusters: { schemaVersion: "1.0", parserId: "ultimate-air-v2-activity-clusters", parserVersion: "1.0", summary: { clusterCount: clusters.size, objectCount: records.length }, clusters: [...clusters.values()].sort((a, b) => a.structuralSignatureHash.localeCompare(b.structuralSignatureHash)) },
  };
}
