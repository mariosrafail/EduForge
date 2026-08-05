import {
  BOOK_HIERARCHY_SCHEMA_VERSION,
  assertBookHierarchy,
  classifyHierarchyGrouping,
  componentHierarchyKey,
  legacyComponentDecisionTargetId,
  pageHierarchyKey,
  sourceBookRootKey,
  unitGroupHierarchyKey,
} from "../../book-hierarchy.js";
import { sourceStructureIdentity } from "./ultimate-structure.js";

const PARSER_ID = "ultimate-air-v2-component-hierarchy";
const PARSER_VERSION = "1.0";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sourceBookRoot(component) {
  return component.sourceBookRoot
    || String(component.sourceRelativePath || "").match(/\/books\/(book\d+)\//i)?.[1]
    || "unresolved";
}

function countBy(items, identityOf) {
  const counts = new Map();
  for (const item of list(items)) {
    const identity = identityOf(item);
    if (!identity) continue;
    const key = `${identity.bookRoot}\0${identity.component}\0${identity.unit}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function count(counts, root, component, unit) {
  return counts.get(`${root}\0${component}\0${unit}`) || 0;
}

function missingNumbers(numbers) {
  if (!numbers.length) return [];
  const present = new Set(numbers);
  return Array.from({ length: numbers.at(-1) - numbers[0] + 1 }, (_, index) => numbers[0] + index)
    .filter((number) => !present.has(number));
}

function menuRoot(menu, fallbackRoot) {
  return menu?.sourceBookRoot
    || String(menu?.sourceRelativePath || "").match(/\/books\/(book\d+)\//i)?.[1]
    || fallbackRoot;
}

export function buildUltimateHierarchy({ structure, pages, hotspots, activities, reviews, menu }) {
  const pageCounts = countBy(pages?.spreads, (spread) => ({
    bookRoot: spread.sourceBookRoot || "book1",
    component: spread.component,
    unit: spread.unit,
  }));
  const activityRecords = activities?.records || activities?.candidates || [];
  const activityCounts = countBy(activityRecords, (activity) => sourceStructureIdentity(activity.sourceObjectLocator));
  const hotspotCounts = countBy(hotspots?.parts, (part) => ({
    bookRoot: part.sourceBookRoot || "book1",
    component: part.component,
    unit: part.unit,
  }));
  const reviewCounts = countBy(reviews?.items, (review) => sourceStructureIdentity(review.sourceRelativeLocator));
  const roots = new Map();
  const warnings = [];

  for (const component of list(structure?.components)) {
    const rootName = sourceBookRoot(component);
    const rootId = sourceBookRootKey(rootName);
    const root = roots.get(rootName) || {
      sourceBookRootId: rootId,
      sourceBookRootName: rootName,
      sourceRelativeLocator: `Contents/Resources/assets/books/${rootName}`,
      components: [],
    };
    roots.set(rootName, root);
    const units = list(component.units);
    const numbers = units.map((unit) => Number(unit.number)).filter(Number.isSafeInteger).sort((a, b) => a - b);
    const groupingKind = classifyHierarchyGrouping({ role: component.proposedSemanticRole, sourceNumbers: numbers });
    const componentKey = componentHierarchyKey(rootName, component.name);
    const sourceRelativeLocator = component.sourceRelativePath || `${root.sourceRelativeLocator}/${component.name}`;
    const numberCounts = new Map();
    for (const number of numbers) numberCounts.set(number, (numberCounts.get(number) || 0) + 1);
    const duplicates = [...numberCounts].filter(([, occurrences]) => occurrences > 1).map(([number]) => number);
    const missing = missingNumbers([...new Set(numbers)]);
    if (!component.proposedSemanticRole) warnings.push({ code: "unknown_component_role", componentKey });
    if (missing.length) warnings.push({ code: "non_contiguous_source_numbers", componentKey, sourceNumbers: missing });
    if (duplicates.length) warnings.push({ code: "duplicate_scoped_source_number", componentKey, sourceNumbers: duplicates });
    const unitsByNumber = new Map();
    for (const unit of units) {
      const number = Number(unit.number);
      const current = unitsByNumber.get(number) || { ...unit, parts: [] };
      current.parts.push(...list(unit.parts));
      unitsByNumber.set(number, current);
    }
    const unitGroups = [...unitsByNumber.values()].map((unit) => ({
      unitKey: unitGroupHierarchyKey(rootName, component.name, unit.number),
      sourceNumber: Number(unit.number),
      sourceRelativeLocator: unit.sourceRelativePath,
      parts: [...new Map(list(unit.parts).map((part) => [Number(part.number), {
        part: Number(part.number),
        pageKey: pageHierarchyKey(rootName, component.name, unit.number, part.number),
        objectCount: Number(part.objectCount || list(part.objectNumbers).length || 0),
      }])).values()].sort((left, right) => left.part - right.part),
      pageCount: count(pageCounts, rootName, component.name, unit.number),
      activityCount: count(activityCounts, rootName, component.name, unit.number),
      hotspotPartCount: count(hotspotCounts, rootName, component.name, unit.number),
      reviewCount: count(reviewCounts, rootName, component.name, unit.number),
    })).sort((left, right) => left.sourceNumber - right.sourceNumber);
    root.components.push({
      componentKey,
      decisionTargetId: legacyComponentDecisionTargetId(sourceRelativeLocator),
      sourceComponentName: component.name,
      sourceRelativeLocator,
      detectedRole: component.proposedSemanticRole || null,
      roleConfidence: Number.isFinite(component.roleConfidence) ? component.roleConfidence : null,
      groupingKind,
      unitGroups,
      pageCount: unitGroups.reduce((sum, group) => sum + group.pageCount, 0),
      activityCount: unitGroups.reduce((sum, group) => sum + group.activityCount, 0),
      hotspotPartCount: unitGroups.reduce((sum, group) => sum + group.hotspotPartCount, 0),
      reviewCount: unitGroups.reduce((sum, group) => sum + group.reviewCount, 0),
    });
  }

  const sourceBookRoots = [...roots.values()].sort((left, right) => left.sourceBookRootName.localeCompare(right.sourceBookRootName));
  for (const root of sourceBookRoots) root.components.sort((left, right) => left.sourceComponentName.localeCompare(right.sourceComponentName));
  const fallbackRoot = sourceBookRoots[0]?.sourceBookRootName || "unresolved";
  const menuEvidence = list(menu?.buttons).map((button) => {
    const destination = button.proposedDestination || {};
    const rootName = button.sourceBookRoot || menuRoot(menu, fallbackRoot);
    const root = roots.get(rootName);
    let target = null;
    if (destination.kind === "unit") target = root?.components.find((component) => component.detectedRole === "students_book") || null;
    else if (destination.kind === "component") target = root?.components.find((component) => component.detectedRole === destination.role) || null;
    const group = destination.kind === "unit" ? target?.unitGroups.find((item) => item.sourceNumber === destination.unit) : null;
    const status = destination.kind === "unresolved" ? "unresolved"
      : destination.role === "extras" ? "supplementary_destination"
        : target && (destination.kind !== "unit" || group) ? "matched" : "mismatch";
    if (status === "mismatch") warnings.push({ code: "menu_destination_mismatch", menuButtonId: button.id });
    return {
      menuButtonId: button.id,
      destinationKind: destination.kind || "unresolved",
      destinationRole: destination.role || null,
      sourceNumber: Number.isSafeInteger(destination.unit) ? destination.unit : null,
      targetComponentKey: target?.componentKey || null,
      targetUnitKey: group?.unitKey || null,
      status,
    };
  }).sort((left, right) => left.menuButtonId.localeCompare(right.menuButtonId));
  for (const root of sourceBookRoots) {
    const menuNumbers = new Set(menuEvidence.filter((item) => item.targetComponentKey && item.destinationKind === "unit").map((item) => item.sourceNumber));
    for (const component of root.components.filter((item) => item.groupingKind === "numbered_units" && item.detectedRole === "students_book")) {
      const extras = component.unitGroups.map((group) => group.sourceNumber).filter((number) => !menuNumbers.has(number));
      if (extras.length) warnings.push({ code: "principal_source_number_without_menu_destination", componentKey: component.componentKey, sourceNumbers: extras });
    }
  }

  const hierarchy = {
    schemaVersion: BOOK_HIERARCHY_SCHEMA_VERSION,
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
    summary: {
      sourceBookRootCount: sourceBookRoots.length,
      componentCount: sourceBookRoots.reduce((sum, root) => sum + root.components.length, 0),
      numberedUnitComponentCount: sourceBookRoots.reduce((sum, root) => sum + root.components.filter((component) => component.groupingKind === "numbered_units").length, 0),
      supplementaryComponentCount: sourceBookRoots.reduce((sum, root) => sum + root.components.filter((component) => component.groupingKind !== "numbered_units").length, 0),
      warningCount: warnings.length,
    },
    sourceBookRoots,
    menuEvidence,
    warnings: warnings.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
  return assertBookHierarchy(hierarchy);
}
