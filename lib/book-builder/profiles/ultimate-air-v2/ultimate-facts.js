import { createDetectedFact } from "../../detected-facts.js";

const parserId = "ultimate-air-v2";
const parserVersion = "1.0";

function fact(kind, locator, value, confidence = 1, evidence = [], diagnostics = []) {
  return createDetectedFact({ kind, locator, value, parserId, parserVersion, confidence, evidence, diagnostics });
}

export function buildUltimateFacts({ mainSwfPath, keyDiscovery, iwbIndex, structure, pages, menu, branding, gaf, hotspots, media, reviewQueue, atlasInventory = null, cropPlan = null }) {
  const facts = [fact("iwb_decoder_identity", mainSwfPath, { keyFingerprint: keyDiscovery.acceptedKeyFingerprint, acceptedCandidateOffset: keyDiscovery.acceptedCandidateOffset, candidateCount: keyDiscovery.candidateCount, validationSamplePaths: keyDiscovery.validationSamplePaths, decoder: "canonical-base64-repeating-xor-strict-utf8-safe-xml" }, 1, [{ validationSamplePathHash: keyDiscovery.validationSamplePathHash }])];
  for (const document of iwbIndex.documents) {
    const { sourceRelativePath, ...safeValue } = document;
    facts.push(fact("iwb_document_summary", sourceRelativePath, safeValue, document.decodedStatus === "strict_xml" ? 1 : 0.8, [{ sourceSha256: document.sourceSha256 }], document.diagnostics));
  }
  for (const component of structure.components) {
    facts.push(fact("component_structure_candidate", component.sourceRelativePath, { name: component.name, proposedSemanticRole: component.proposedSemanticRole, approvalStatus: component.approvalStatus, unitCount: component.unitCount, partCount: component.partCount, objectCount: component.objectCount, pageSpreadCount: component.pageSpreadCount }, component.roleConfidence, [{ fileCount: component.fileCount, byteSize: component.byteSize }]));
    for (const unit of component.units) facts.push(fact("unit_structure_candidate", unit.sourceRelativePath, { component: component.name, unit: unit.number, partCount: unit.parts.length, navigation: unit.navigation }, 0.9, [{ partPaths: unit.parts.map((item) => item.sourceRelativePath) }]));
  }
  for (const spread of pages.spreads) {
    const locator = spread.variants.find((item) => item.quality === "HD")?.sourceRelativePath || spread.variants[0].sourceRelativePath;
    facts.push(fact("part_page_candidate", locator, { component: spread.component, unit: spread.unit, part: spread.part, canonicalQualityCandidate: spread.canonicalQualityCandidate, printedPageCandidate: spread.printedPageCandidate, variantCount: spread.variants.length }, spread.printedPageCandidate.direct ? 0.95 : 0.6, spread.variants.map((item) => ({ path: item.sourceRelativePath, sha256: item.sha256 }))));
    for (const variant of spread.variants) facts.push(fact("page_asset_variant", variant.sourceRelativePath, { component: variant.component, unit: variant.unit, part: variant.part, quality: variant.quality, width: variant.width, height: variant.height, byteSize: variant.byteSize }, 1, [{ sha256: variant.sha256 }]));
  }
  facts.push(fact("menu_layout_candidate", menu.sourceRelativePath, { buttonCount: menu.summary.buttonCount }, 1, menu.buttons.map((item) => ({ id: item.id, textureTriple: item.textureTriple }))));
  for (const button of menu.buttons) facts.push(fact("menu_button_candidate", `${button.sourceRelativePath}/menu-button/${button.id}`, button, button.confidence, [{ sourceRelativePath: button.sourceRelativePath }]));
  facts.push(fact("home_branding_candidate", branding.sourceRelativePath, { movieClips: branding.movieClips, menuTitleKind: branding.menuTitleKind, startupIntroIsSeparate: branding.startupIntroIsSeparate, assets: branding.assets, archive: branding.archive }, branding.archive ? 1 : 0.4, branding.assets.map((item) => ({ path: item.sourceRelativePath, sha256: item.sha256 }))));
  if (gaf) facts.push(fact("gaf_timeline_candidate", `${gaf.sourceArchivePath}/${gaf.entryPath}`, { version: gaf.version, stage: gaf.stage, scales: gaf.scales, csfs: gaf.csfs, timeline: gaf.timeline, sources: gaf.sources }, 1, [{ archivePath: gaf.sourceArchivePath }]));
  for (const part of hotspots.parts) facts.push(fact("hotspot_geometry_candidate", part.sourceRelativePath, { component: part.component, unit: part.unit, part: part.part, buttonCount: part.buttonCount, quadCount: part.quadCount, objectDirectoryCount: part.objectDirectoryCount, exactCardinality: part.exactCardinality, normalizedCandidateCount: part.hotspots.filter((item) => item.normalizedGeometry).length + part.quads.filter((item) => item.normalizedGeometry).length }, part.exactCardinality ? 0.75 : 0.4, [{ sourceSha256: part.sourceSha256 }]));
  for (const candidate of media.candidates) facts.push(fact("media_binding_candidate", candidate.sourceRelativePath, candidate, candidate.confidence, [{ sha256: candidate.sha256 }]));
  if (media.intro) facts.push(fact("media_binding_candidate", `${media.intro.descriptorPath}/intro-binding`, { ...media.intro, kind: "startup_intro" }, 1, [{ descriptorSha256: media.intro.descriptorSha256 }]));
  for (const atlas of atlasInventory?.atlases || []) facts.push(fact("atlas_definition_candidate", atlas.metadataSourcePath, { imageSourcePath: atlas.imageSourcePath, imageWidth: atlas.imageWidth, imageHeight: atlas.imageHeight, regionCount: atlas.regionCount, quality: atlas.quality }, atlas.valid ? 1 : 0.3, [{ metadataSha256: atlas.metadataSha256, imageSha256: atlas.imageSha256 }]));
  for (const crop of cropPlan?.crops || []) facts.push(fact("atlas_crop_candidate", `${crop.sourceMetadataPath}/crop/${crop.id}`, crop, crop.confidence, [{ sourceAtlasSha256: crop.sourceAtlasSha256, sourceMetadataSha256: crop.sourceMetadataSha256 }]));
  for (const item of reviewQueue.items) facts.push(fact("review_issue_dependency", `${item.sourceRelativeLocator}/review/${item.reasonCode}`, { reviewId: item.id, category: item.category, severity: item.severity, reasonCode: item.reasonCode, suggestedDecisionKind: item.suggestedDecisionKind, blocking: item.blocking }, 1, item.evidence));
  return facts.sort((a, b) => a.id.localeCompare(b.id));
}
