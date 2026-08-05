import { createHash } from "node:crypto";
import path from "node:path";
import { elementsNamed } from "./iwb-codec.js";
import { booleanValue, finiteNumber } from "./source-files.js";
import { sourceStructureIdentity } from "./ultimate-structure.js";
import { createReviewItem } from "./ultimate-review.js";

function id(value) { return `hotspot_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`; }

function rawGeometry(element) {
  const attributes = element.attributes;
  return {
    x: finiteNumber(attributes.x), y: finiteNumber(attributes.y), width: finiteNumber(attributes.width), height: finiteNumber(attributes.height),
    textureNames: attributes.textureNames || attributes.textures || null, name: attributes.name || null,
    active: booleanValue(attributes.active), visible: booleanValue(attributes.visible), childIndex: finiteNumber(attributes.childIndex),
  };
}

function normalizedGeometry(raw, width, height) {
  if (![raw.x, raw.y, raw.width, raw.height, width, height].every(Number.isFinite) || width <= 0 || height <= 0 || raw.width <= 0 || raw.height <= 0) return null;
  const result = { xPct: raw.x / width * 100, yPct: raw.y / height * 100, widthPct: raw.width / width * 100, heightPct: raw.height / height * 100 };
  if (result.xPct < 0 || result.yPct < 0 || result.widthPct <= 0 || result.heightPct <= 0 || result.xPct + result.widthPct > 100.000001 || result.yPct + result.heightPct > 100.000001) return null;
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Number(value.toFixed(6))]));
}

export function buildHotspotCandidates({ inventoryEntries, internalDocuments, structure, pageCandidates }) {
  const objectsByPart = new Map();
  for (const component of structure.components) for (const unit of component.units) for (const part of unit.parts) objectsByPart.set(`${component.sourceBookRoot || "book1"}\0${component.name}\0${unit.number}\0${part.number}`, part.objectNumbers);
  const pageByPart = new Map(pageCandidates.spreads.map((spread) => [`${spread.sourceBookRoot || "book1"}\0${spread.component}\0${spread.unit}\0${spread.part}`, spread]));
  const sourceHashByPath = new Map(inventoryEntries.map((entry) => [entry.path, entry.sha256]));
  const parts = []; const reviewItems = [];
  for (const [sourcePath, xml] of internalDocuments) {
    if (path.posix.basename(sourcePath).toLowerCase() !== "part_params.iwb") continue;
    const identity = sourceStructureIdentity(sourcePath); if (!identity?.part) continue;
    const key = `${identity.bookRoot}\0${identity.component}\0${identity.unit}\0${identity.part}`; const objectNumbers = objectsByPart.get(key) || [];
    const buttons = elementsNamed(xml, "button").map((element, index) => ({ index, ...rawGeometry(element) }));
    const quads = elementsNamed(xml, "quad").map((element, index) => ({ index, ...rawGeometry(element) }));
    const spread = pageByPart.get(key); const canonical = spread?.variants.find((item) => item.quality === "HD") || spread?.variants[0];
    const exactCardinality = buttons.length === objectNumbers.length;
    const candidates = buttons.map((button, index) => {
      const normalized = normalizedGeometry(button, canonical?.width, canonical?.height);
      return { id: id(`${sourcePath}\0button\0${index}`), rawElement: "button", rawGeometry: button, normalizedGeometry: normalized, candidateTargetObject: exactCardinality ? objectNumbers[index] ?? null : null, mappingConfidence: exactCardinality ? 0.6 : 0, evidence: exactCardinality ? ["exact_button_object_cardinality", "authored_element_order_candidate"] : ["cardinality_mismatch"], reviewStatus: "unapproved" };
    });
    const normalizedQuads = quads.map((quad, index) => ({ id: id(`${sourcePath}\0quad\0${index}`), rawElement: "quad", rawGeometry: quad, normalizedGeometry: normalizedGeometry(quad, canonical?.width, canonical?.height), candidateTargetObject: null, mappingConfidence: 0, evidence: ["authored_quad_geometry"], reviewStatus: "unapproved" }));
    if (!exactCardinality) reviewItems.push(createReviewItem({ category: "hotspot", locator: sourcePath, reasonCode: "part_button_object_count_mismatch", explanation: "Part button and object-directory counts differ; no object pairing was forced.", suggestedDecisionKind: "hotspot_object_binding", evidence: [{ buttonCount: buttons.length, objectDirectoryCount: objectNumbers.length }] }));
    parts.push({ sourceRelativePath: sourcePath, sourceSha256: sourceHashByPath.get(sourcePath) || null, sourceBookRoot: identity.bookRoot, component: identity.component, componentKey: spread?.componentKey || null, unit: identity.unit, unitKey: spread?.unitKey || null, part: identity.part, pageKey: spread?.pageKey || null, buttonCount: buttons.length, quadCount: quads.length, objectDirectoryCount: objectNumbers.length, exactCardinality, coordinateSpace: canonical ? { width: canonical.width, height: canonical.height, evidence: canonical.sourceRelativePath } : null, hotspots: candidates, quads: normalizedQuads });
  }
  parts.sort((a, b) => a.sourceRelativePath.localeCompare(b.sourceRelativePath));
  return { artifact: { schemaVersion: "1.0", parserId: "ultimate-air-v2-hotspots", parserVersion: "1.0", summary: { partMetadataCount: parts.length, buttonElementCount: parts.reduce((sum, item) => sum + item.buttonCount, 0), quadElementCount: parts.reduce((sum, item) => sum + item.quadCount, 0), exactCardinalityCount: parts.filter((item) => item.exactCardinality).length, mismatchCount: parts.filter((item) => !item.exactCardinality).length, normalizedCandidateCount: parts.reduce((sum, item) => sum + item.hotspots.filter((candidate) => candidate.normalizedGeometry).length + item.quads.filter((candidate) => candidate.normalizedGeometry).length, 0) }, parts }, reviewItems };
}
