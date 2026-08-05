import path from "node:path";
import { elementsNamed } from "./iwb-codec.js";
import { componentHierarchyKey, unitGroupHierarchyKey } from "../../book-hierarchy.js";

const STRUCTURE_PATTERN = /^Contents\/Resources\/assets\/books\/(book\d+)\/([^/]+)\/(\d+)(?:\/(.*))?$/i;
const PART_PATTERN = /(?:^|\/)part(\d+)(?:\/|$)/i;
const OBJECT_PATTERN = /(?:^|\/)obj(\d+)(?:\/|$)/i;
const ROLE_PROPOSALS = new Map([
  ["unit", "students_book"], ["work", "workbook"], ["grammar", "grammar_book"], ["test", "tests"], ["practice", "practice"],
  ["practiceWork", "workbook_practice"], ["review", "review"], ["reference", "reference"], ["companion", "companion"],
  ["video", "video"], ["extravideo", "extra_video"], ["game", "games"], ["tasks", "tasks"], ["speakingbank", "speaking_bank"],
  ["writingbank", "writing_bank"], ["worksheets", "worksheets"],
]);

export function sourceStructureIdentity(sourcePath) {
  const match = sourcePath.match(STRUCTURE_PATTERN);
  if (!match) return null;
  const remainder = match[4] || "";
  return { bookRoot: match[1], component: match[2], unit: Number(match[3]), part: Number(remainder.match(PART_PATTERN)?.[1]) || null, object: Number(remainder.match(OBJECT_PATTERN)?.[1]) || null };
}

export function buildUltimateStructure({ inventoryEntries, internalDocuments, pageCandidates = null }) {
  const components = new Map();
  for (const entry of inventoryEntries) {
    const identity = sourceStructureIdentity(entry.path);
    if (!identity) continue;
    const componentMapKey = `${identity.bookRoot}\0${identity.component}`;
    if (!components.has(componentMapKey)) components.set(componentMapKey, {
      name: identity.component,
      sourceBookRoot: identity.bookRoot,
      componentKey: componentHierarchyKey(identity.bookRoot, identity.component),
      sourceRelativePath: `Contents/Resources/assets/books/${identity.bookRoot}/${identity.component}`,
      units: new Map(),
      files: 0,
      bytes: 0,
    });
    const component = components.get(componentMapKey); component.files += 1; component.bytes += entry.byteSize;
    if (!component.units.has(identity.unit)) component.units.set(identity.unit, {
      number: identity.unit,
      unitKey: unitGroupHierarchyKey(identity.bookRoot, identity.component, identity.unit),
      parts: new Map(),
      sourceRelativePath: `${component.sourceRelativePath}/${identity.unit}`,
      navigation: [],
    });
    const unit = component.units.get(identity.unit);
    if (identity.part && !unit.parts.has(identity.part)) unit.parts.set(identity.part, { number: identity.part, sourceRelativePath: `${unit.sourceRelativePath}/part${identity.part}`, objectNumbers: new Set() });
    if (identity.part && identity.object) unit.parts.get(identity.part).objectNumbers.add(identity.object);
  }
  for (const [sourcePath, xml] of internalDocuments) {
    if (path.posix.basename(sourcePath).toLowerCase() !== "unit_params.iwb") continue;
    const identity = sourceStructureIdentity(sourcePath);
    const unit = identity && components.get(`${identity.bookRoot}\0${identity.component}`)?.units.get(identity.unit);
    if (!unit) continue;
    unit.navigation = elementsNamed(xml, "menuButton").map((element) => ({ name: element.attributes.name || null, destination: element.attributes.url || null, textureNames: element.attributes.textureNames || element.attributes.textures || null, labelCandidate: element.attributes.label || element.attributes.text || null }));
  }
  const pagesByComponent = new Map();
  for (const spread of pageCandidates?.spreads || []) {
    const key = `${spread.sourceBookRoot || "book1"}\0${spread.component}`;
    pagesByComponent.set(key, (pagesByComponent.get(key) || 0) + 1);
  }
  const normalized = [...components.values()].filter((item) => [...item.units.values()].some((unit) => unit.parts.size)).map((component) => {
    const units = [...component.units.values()].filter((unit) => unit.parts.size).sort((a, b) => a.number - b.number).map((unit) => ({
      number: unit.number, unitKey: unit.unitKey, sourceRelativePath: unit.sourceRelativePath, navigation: unit.navigation,
      parts: [...unit.parts.values()].sort((a, b) => a.number - b.number).map((part) => ({ ...part, objectNumbers: [...part.objectNumbers].sort((a, b) => a - b), objectCount: part.objectNumbers.size })),
    }));
    return { name: component.name, sourceBookRoot: component.sourceBookRoot, componentKey: component.componentKey, sourceRelativePath: component.sourceRelativePath, proposedSemanticRole: ROLE_PROPOSALS.get(component.name) || null, roleConfidence: ROLE_PROPOSALS.has(component.name) ? 0.75 : 0.4, approvalStatus: "unapproved", fileCount: component.files, byteSize: component.bytes, unitCount: units.length, partCount: units.reduce((sum, unit) => sum + unit.parts.length, 0), objectCount: units.reduce((sum, unit) => sum + unit.parts.reduce((partSum, part) => partSum + part.objectCount, 0), 0), pageSpreadCount: pagesByComponent.get(`${component.sourceBookRoot}\0${component.name}`) || 0, units };
  }).sort((a, b) => a.sourceBookRoot.localeCompare(b.sourceBookRoot) || a.name.localeCompare(b.name));
  return { schemaVersion: "1.0", parserId: "ultimate-air-v2-structure", parserVersion: "1.0", summary: { sourceBookRootCount: new Set(normalized.map((item) => item.sourceBookRoot)).size, componentCount: normalized.length, unitCount: normalized.reduce((sum, item) => sum + item.unitCount, 0), partCount: normalized.reduce((sum, item) => sum + item.partCount, 0), objectCount: normalized.reduce((sum, item) => sum + item.objectCount, 0) }, components: normalized };
}
