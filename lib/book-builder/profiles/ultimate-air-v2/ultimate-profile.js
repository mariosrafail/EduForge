import path from "node:path";
import { buildAtlasInventoryAndCropPlan } from "./ultimate-atlases.js";
import { buildUltimateFacts } from "./ultimate-facts.js";
import { buildHotspotCandidates } from "./ultimate-hotspots.js";
import { buildIwbIndex } from "./iwb-index.js";
import { discoverIwbKey } from "./iwb-key-discovery.js";
import { buildMediaCandidates } from "./ultimate-media.js";
import { buildMenuAndBranding } from "./ultimate-menu.js";
import { buildPageCandidates } from "./ultimate-pages.js";
import { createReviewItem, createReviewQueue } from "./ultimate-review.js";
import { buildUltimateStructure } from "./ultimate-structure.js";
import { inspectStaticSwf, portableSwfEvidence } from "./swf-static-inspection.js";
import { buildActivitySignatures } from "./ultimate-activity-signatures.js";
import { activityExtractionReport, buildActivityExtraction } from "./ultimate-activity-extraction.js";

export const ULTIMATE_PROFILE_ID = "ultimate-air-v2";
export const ULTIMATE_PROFILE_VERSION = "1.0";

function report(result) {
  const s = result.summary;
  return `# Ultimate AIR v2 profile report

- Profile parser: ${ULTIMATE_PROFILE_ID} ${ULTIMATE_PROFILE_VERSION}
- Static inspection: ${result.artifacts.swfStaticEvidence.method}
- Publisher code executed: no
- UUID candidates: ${result.artifacts.iwbKeyDiscovery.candidateCount}
- Accepted candidate offset: ${result.artifacts.iwbKeyDiscovery.acceptedCandidateOffset}
- IWB: ${s.iwbTotal} total; ${s.iwbStrict} strict; ${s.iwbMalformed} malformed after valid decode
- Components: ${s.componentCandidates}
- Page images/spreads: ${s.pageImages}/${s.pageSpreads}
- Menu buttons: ${s.menuButtons}
- Atlas families/regions: ${s.atlasFamilies}/${s.atlasRegions}
- Hotspot cardinality: ${s.hotspotExact} exact; ${s.hotspotReview} review
- Review items: ${s.reviewItems}

Raw decoded IWB, discovered keys, answer values, question text, publisher bytes, and absolute source paths are excluded from portable artifacts. The startup intro remains distinct from the standalone on-menu GAF title. No publication or runtime integration was performed.
`;
}

export async function runUltimateProfile({ resolution, inventory, repositoryRoot, concurrency = 8 }) {
  const helperPath = path.resolve(repositoryRoot, "scripts", "ultimate-b2", "legacy-swf-static-extract.py");
  const swfInspection = await inspectStaticSwf(resolution.mainSwfAbsolutePath, { helperPath });
  const keyDiscovery = await discoverIwbKey({ sourceRoot: resolution.canonicalAppRoot, inventoryEntries: inventory.entries, swfInspection });
  const iwb = await buildIwbIndex({ sourceRoot: resolution.canonicalAppRoot, inventoryEntries: inventory.entries, key: keyDiscovery.key, concurrency });
  const unsafeIwb = iwb.artifact.documents.filter((item) => !new Set(["strict_xml", "malformed_xml_after_valid_decode"]).has(item.decodedStatus));
  if (unsafeIwb.length) {
    const error = new Error(`Ultimate IWB corpus contains ${unsafeIwb.length} unsafe or undecodable documents`);
    error.code = "unsafe_iwb_corpus";
    error.diagnostics = unsafeIwb.map((item) => ({ path: item.sourceRelativePath, status: item.decodedStatus }));
    throw error;
  }
  const pages = await buildPageCandidates({ sourceRoot: resolution.canonicalAppRoot, inventoryEntries: inventory.entries, internalDocuments: iwb.internalDocuments, concurrency });
  const structure = buildUltimateStructure({ inventoryEntries: inventory.entries, internalDocuments: iwb.internalDocuments, pageCandidates: pages.artifact });
  const menu = await buildMenuAndBranding({ sourceRoot: resolution.canonicalAppRoot, inventoryEntries: inventory.entries, internalDocuments: iwb.internalDocuments });
  const atlases = await buildAtlasInventoryAndCropPlan({ sourceRoot: resolution.canonicalAppRoot, inventoryEntries: inventory.entries, menu: menu.menu, concurrency });
  const hotspots = buildHotspotCandidates({ inventoryEntries: inventory.entries, internalDocuments: iwb.internalDocuments, structure, pageCandidates: pages.artifact });
  const media = await buildMediaCandidates({ sourceRoot: resolution.canonicalAppRoot, inventoryEntries: inventory.entries, concurrency });
  const activitySignatures = await buildActivitySignatures({ sourceRoot: resolution.canonicalAppRoot, inventoryEntries: inventory.entries, iwbIndex: iwb.artifact, internalDocuments: iwb.internalDocuments, pageCandidates: pages.artifact, hotspotCandidates: hotspots.artifact, mediaCandidates: media.artifact, concurrency });
  const activityExtraction = buildActivityExtraction({ signatures: activitySignatures.signatures, iwbIndex: iwb.artifact, internalDocuments: iwb.internalDocuments });
  const reviews = [
    ...iwb.artifact.documents.filter((item) => item.decodedStatus === "malformed_xml_after_valid_decode").map((item) => createReviewItem({ category: "iwb", locator: item.sourceRelativePath, reasonCode: "malformed_iwb", explanation: "IWB decoded deterministically but contains publisher-malformed XML; it was not repaired.", suggestedDecisionKind: "malformed_iwb_disposition", evidence: [{ sourceSha256: item.sourceSha256, diagnostic: item.diagnostics[0] || null }] })),
    ...structure.components.map((item) => createReviewItem({ category: "component", locator: item.sourceRelativePath, reasonCode: "ambiguous_component_role", explanation: `Proposed component role ${item.proposedSemanticRole || "unresolved"} remains unapproved.`, suggestedDecisionKind: "component_role", evidence: [{ proposedSemanticRole: item.proposedSemanticRole, confidence: item.roleConfidence }] })),
    ...pages.reviewItems, ...menu.reviewItems, ...atlases.reviewItems, ...hotspots.reviewItems, ...media.reviewItems, ...activityExtraction.activityReviewQueue.items,
  ];
  if (iwb.artifact.summary.answerBearingDocuments) reviews.push(createReviewItem({ category: "answer_boundary", locator: "metadata-family/answer-bearing", reasonCode: "answer_bearing_internal_data", explanation: `${iwb.artifact.summary.answerBearingDocuments} IWB documents contain answer-bearing structural indicators; values remain internal and unprojected.`, suggestedDecisionKind: "future_answer_audience_policy", evidence: [{ documentCount: iwb.artifact.summary.answerBearingDocuments }] }));
  const reviewQueue = createReviewQueue(reviews);
  const schemaSummary = { schemaVersion: "1.0", parserId: "ultimate-air-v2-iwb-schema", parserVersion: "1.0", familyCounts: iwb.artifact.familyCounts, statusCounts: iwb.artifact.statusCounts, schemaFingerprintCounts: iwb.artifact.schemaFingerprintCounts, summary: { schemaFingerprintCount: iwb.artifact.summary.schemaFingerprintCount } };
  const artifacts = {
    swfStaticEvidence: portableSwfEvidence(swfInspection), iwbKeyDiscovery: keyDiscovery.artifact, iwbIndex: iwb.artifact, iwbSchemaSummary: schemaSummary,
    structureCandidates: structure, pageCandidates: pages.artifact, menuModel: menu.menu, brandingModel: menu.branding, gafModel: menu.gaf || { schemaVersion: "1.0", parserId: "ultimate-air-v2-gaf", parserVersion: "1.0", status: "not_detected" },
    atlasInventory: atlases.atlasArtifact, atlasCropPlan: atlases.cropPlan, hotspotCandidates: hotspots.artifact, mediaCandidates: media.artifact,
    activitySignatures: activitySignatures.signatures, activityClusters: activitySignatures.clusters, studentActivityCandidates: activityExtraction.studentArtifact,
    activityEvidence: activityExtraction.evidenceArtifact, activityExtractionSummary: activityExtraction.summary, activityReviewItems: activityExtraction.activityReviewQueue,
    teacherSolutionCandidates: activityExtraction.teacherArtifact, answerEvidenceIndex: activityExtraction.answerEvidenceIndex,
  };
  const summary = { iwbTotal: iwb.artifact.summary.total, iwbStrict: iwb.artifact.summary.strictXml, iwbMalformed: iwb.artifact.summary.malformedXmlAfterValidDecode, componentCandidates: structure.summary.componentCount, pageImages: pages.artifact.summary.pageImageFileCount, pageSpreads: pages.artifact.summary.distinctSpreadCount, menuButtons: menu.menu.summary.buttonCount, atlasFamilies: atlases.atlasArtifact.summary.familyCount, atlasRegions: atlases.atlasArtifact.summary.regionCount, hotspotExact: hotspots.artifact.summary.exactCardinalityCount, hotspotReview: hotspots.artifact.summary.mismatchCount, reviewItems: reviewQueue.summary.total, ...activityExtraction.summary };
  const facts = buildUltimateFacts({ mainSwfPath: resolution.mainSwfRelativePath, keyDiscovery: keyDiscovery.artifact, iwbIndex: iwb.artifact, structure, pages: pages.artifact, menu: menu.menu, branding: menu.branding, gaf: menu.gaf, hotspots: hotspots.artifact, media: media.artifact, reviewQueue, atlasInventory: atlases.atlasArtifact, cropPlan: atlases.cropPlan, activitySignatures: activitySignatures.signatures, activityExtraction });
  const result = { profileId: ULTIMATE_PROFILE_ID, profileVersion: ULTIMATE_PROFILE_VERSION, summary, facts, reviewQueue, artifacts, report: null };
  result.report = report(result);
  result.activityReport = activityExtractionReport(activityExtraction.summary);
  Object.defineProperty(result, "discoveredKey", { value: keyDiscovery.key, enumerable: false });
  return result;
}
