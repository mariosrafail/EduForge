import { projectEffectiveBookHierarchy } from "../../lib/book-builder/book-hierarchy.js";
import { buildUltimateHierarchy } from "../../lib/book-builder/profiles/ultimate-air-v2/ultimate-hierarchy.js";
import { safeConfidence, safeCount, safeRelativeLocator, safeText } from "./review-studio-security.mjs";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function safeKey(value, fallback = "unresolved") {
  const text = String(value || "");
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/i.test(text) ? text : fallback;
}

function rootFromLocator(locator) {
  return String(locator || "").replaceAll("\\", "/").match(/\/books\/(book\d+)\//i)?.[1] || null;
}

function locatorStructureIdentity(item) {
  const locator = String(item?.sourceRelativeLocator || item?.sourceObjectLocator || "").replaceAll("\\", "/");
  const match = locator.match(/\/books\/(book\d+)\/([^/]+)\/(\d+)(?:\/|$)/i);
  return match ? { root: match[1], component: match[2], sourceNumber: Number(match[3]) } : null;
}

function sourceComponent(item) {
  const candidate = String(item?.component || item?.componentCandidateId || "").replace(/^component:/, "");
  if (candidate && candidate !== "Unavailable") return candidate;
  const locator = String(item?.sourceRelativeLocator || item?.sourceObjectLocator || "").replaceAll("\\", "/");
  return locator.match(/\/books\/book\d+\/([^/]+)\//i)?.[1] || null;
}

function safeGroup(group) {
  return {
    unitKey: safeKey(group.unitKey),
    sourceNumber: safeCount(group.sourceNumber),
    displayLabel: safeText(group.displayLabel, "Unresolved group", 120),
    kind: safeText(group.kind, "group", 40),
    sourceRelativeLocator: safeRelativeLocator(group.sourceRelativeLocator),
    partCount: list(group.parts).length,
    parts: list(group.parts).map((part) => ({
      part: safeCount(part.part),
      pageKey: safeKey(part.pageKey),
      objectCount: safeCount(part.objectCount),
    })),
    pageCount: safeCount(group.pageCount),
    activityCount: safeCount(group.activityCount),
    hotspotPartCount: safeCount(group.hotspotPartCount),
    reviewCount: safeCount(group.reviewCount),
  };
}

function safeComponent(component, root) {
  return {
    sourceBookRootId: safeKey(root.sourceBookRootId),
    sourceBookRootName: safeText(root.sourceBookRootName, "unresolved", 80),
    componentKey: safeKey(component.componentKey),
    decisionTargetId: safeKey(component.decisionTargetId),
    sourceComponentName: safeText(component.sourceComponentName, "unresolved", 120),
    sourceRelativeLocator: safeRelativeLocator(component.sourceRelativeLocator),
    detectedRole: component.detectedRole ? safeText(component.detectedRole, "unresolved", 80) : null,
    effectiveRole: component.effectiveRole ? safeText(component.effectiveRole, "unresolved", 80) : null,
    displayName: safeText(component.displayName, component.sourceComponentName || "Unresolved component", 160),
    roleConfidence: safeConfidence(component.roleConfidence),
    groupingKind: safeText(component.groupingKind, "unresolved", 80),
    effectiveGroupingKind: safeText(component.effectiveGroupingKind, component.groupingKind || "unresolved", 80),
    decisionState: safeText(component.decisionState, "detected_unapproved", 80),
    decisionStale: component.decisionStale === true,
    unitGroups: list(component.unitGroups).map(safeGroup),
    pageCount: safeCount(component.pageCount),
    activityCount: safeCount(component.activityCount),
    hotspotPartCount: safeCount(component.hotspotPartCount),
    reviewCount: safeCount(component.reviewCount),
  };
}

async function fallbackHierarchy(reader, projectId, project) {
  const [structure, pages, hotspots, activities, reviews, menu] = await Promise.all([
    reader.readArtifact(projectId, "components", { optional: true, project }),
    reader.readArtifact(projectId, "pages", { optional: true, project }),
    reader.readArtifact(projectId, "hotspots", { optional: true, project }),
    reader.readArtifact(projectId, "activities", { optional: true, project }),
    reader.readArtifact(projectId, "reviews", { optional: true, project }),
    reader.readArtifact(projectId, "menu", { optional: true, project }),
  ]);
  if (!structure) return null;
  return buildUltimateHierarchy({ structure, pages, hotspots, activities, reviews, menu });
}

export async function effectiveHierarchyView(reader, projectId, projectValue = null) {
  const project = projectValue || await reader.projectContext(projectId);
  const generated = await reader.readArtifact(projectId, "hierarchy", { optional: true, project })
    || await fallbackHierarchy(reader, projectId, project);
  if (!generated) return {
    available: false,
    summary: { sourceBookRootCount: 0, componentCount: 0, numberedUnitComponentCount: 0, supplementaryComponentCount: 0, warningCount: 0 },
    sourceBookRoots: [],
    components: [],
    warnings: [],
    menuEvidence: [],
  };
  const projected = projectEffectiveBookHierarchy(generated, project.approvedDecisions);
  const sourceBookRoots = list(projected.sourceBookRoots).map((root) => ({
    sourceBookRootId: safeKey(root.sourceBookRootId),
    sourceBookRootName: safeText(root.sourceBookRootName, "unresolved", 80),
    sourceRelativeLocator: safeRelativeLocator(root.sourceRelativeLocator),
    components: list(root.components).map((component) => safeComponent(component, root)),
  }));
  const components = sourceBookRoots.flatMap((root) => root.components);
  return {
    available: sourceBookRoots.length > 0,
    summary: {
      sourceBookRootCount: sourceBookRoots.length,
      componentCount: components.length,
      numberedUnitComponentCount: components.filter((item) => item.effectiveGroupingKind === "numbered_units").length,
      supplementaryComponentCount: components.filter((item) => item.effectiveGroupingKind !== "numbered_units").length,
      warningCount: list(projected.warnings).length,
    },
    sourceBookRoots,
    components,
    warnings: list(projected.warnings).map((warning) => ({
      code: safeText(warning.code, "unresolved_hierarchy_warning", 120),
      componentKey: warning.componentKey ? safeKey(warning.componentKey) : null,
      sourceNumbers: list(warning.sourceNumbers).map(safeCount),
      menuButtonId: warning.menuButtonId ? safeKey(warning.menuButtonId) : null,
    })),
    menuEvidence: list(projected.menuEvidence).map((item) => ({
      menuButtonId: safeKey(item.menuButtonId),
      destinationKind: safeText(item.destinationKind, "unresolved", 80),
      destinationRole: item.destinationRole ? safeText(item.destinationRole, "unresolved", 80) : null,
      sourceNumber: Number.isSafeInteger(item.sourceNumber) ? item.sourceNumber : null,
      targetComponentKey: item.targetComponentKey ? safeKey(item.targetComponentKey) : null,
      targetUnitKey: item.targetUnitKey ? safeKey(item.targetUnitKey) : null,
      status: safeText(item.status, "unresolved", 80),
    })),
  };
}

export function hierarchyOwnership(hierarchy, item) {
  const locatorIdentity = locatorStructureIdentity(item);
  const componentKey = item?.componentKey ? safeKey(item.componentKey, "") : "";
  const rootName = item?.sourceBookRoot || locatorIdentity?.root || rootFromLocator(item?.sourceRelativeLocator || item?.sourceObjectLocator);
  const rawComponent = sourceComponent(item) || locatorIdentity?.component || null;
  let component = hierarchy.components.find((candidate) => componentKey && candidate.componentKey === componentKey) || null;
  if (!component && rawComponent) {
    const matches = hierarchy.components.filter((candidate) => candidate.sourceComponentName === rawComponent && (!rootName || candidate.sourceBookRootName === rootName));
    component = matches.length === 1 ? matches[0] : null;
  }
  const sourceNumber = Number(item?.unit ?? item?.sourceNumber ?? locatorIdentity?.sourceNumber);
  const suppliedUnitKey = item?.unitKey ? safeKey(item.unitKey, "") : "";
  const group = component?.unitGroups.find((candidate) => suppliedUnitKey && candidate.unitKey === suppliedUnitKey)
    || component?.unitGroups.find((candidate) => candidate.sourceNumber === sourceNumber)
    || null;
  if (!component) return {
    resolved: false,
    sourceBookRootId: null,
    sourceBookRootName: rootName || null,
    componentKey: null,
    sourceComponentName: rawComponent,
    detectedRole: null,
    effectiveRole: null,
    componentDisplayName: rawComponent || "Unresolved component",
    groupingKind: "unresolved",
    unitKey: null,
    sourceNumber: Number.isSafeInteger(sourceNumber) ? sourceNumber : null,
    groupLabel: Number.isSafeInteger(sourceNumber) ? `Source group ${sourceNumber}` : "Unresolved",
  };
  return {
    resolved: Boolean(group),
    sourceBookRootId: component.sourceBookRootId,
    sourceBookRootName: component.sourceBookRootName,
    componentKey: component.componentKey,
    sourceComponentName: component.sourceComponentName,
    detectedRole: component.detectedRole,
    effectiveRole: component.effectiveRole,
    componentDisplayName: component.displayName,
    groupingKind: component.effectiveGroupingKind,
    unitKey: group?.unitKey || null,
    sourceNumber: group?.sourceNumber ?? (Number.isSafeInteger(sourceNumber) ? sourceNumber : null),
    groupLabel: group?.displayLabel || "Unresolved",
  };
}

export function hierarchyComponentOptions(hierarchy) {
  return hierarchy.components.map((component) => ({
    value: component.componentKey,
    label: component.displayName,
    sourceComponentName: component.sourceComponentName,
    sourceBookRootName: component.sourceBookRootName,
    detectedRole: component.detectedRole,
    effectiveRole: component.effectiveRole,
    groupingKind: component.effectiveGroupingKind,
    decisionState: component.decisionState,
    stale: component.decisionStale,
    unitGroupCount: component.unitGroups.length,
  }));
}

export function hierarchyUnitOptions(hierarchy, componentKey) {
  if (!componentKey) return [];
  const component = hierarchy.components.find((item) => item.componentKey === componentKey);
  return component ? component.unitGroups.map((group) => ({
    value: group.unitKey,
    sourceNumber: group.sourceNumber,
    label: group.displayLabel,
    kind: group.kind,
  })) : [];
}

export function hierarchyComponentForFilter(hierarchy, value) {
  if (!value) return null;
  const exact = hierarchy.components.find((item) => item.componentKey === value);
  if (exact) return exact;
  const rawMatches = hierarchy.components.filter((item) => item.sourceComponentName === value);
  return rawMatches.length === 1 ? rawMatches[0] : null;
}

export function hierarchyUnitForFilter(component, value) {
  if (!component || !value) return null;
  const exact = component.unitGroups.find((item) => item.unitKey === value);
  if (exact) return exact;
  if (/^\d+$/.test(String(value))) return component.unitGroups.find((item) => item.sourceNumber === Number(value)) || null;
  return null;
}
