import { createHash } from "node:crypto";

export const BOOK_HIERARCHY_SCHEMA_VERSION = "1.0";
export const BOOK_HIERARCHY_GROUPING_KINDS = new Set([
  "numbered_units",
  "numbered_groups",
  "supplementary_collection",
  "global_component",
  "unresolved",
]);

const PRINCIPAL_ROLES = new Set(["students_book", "workbook", "grammar_book"]);
const SUPPLEMENTARY_ROLES = new Set([
  "tests", "practice", "workbook_practice", "review", "reference", "companion",
  "video", "extra_video", "games", "tasks", "speaking_bank", "writing_bank", "worksheets",
]);
const ROLE_LABELS = new Map([
  ["students_book", "Students Book"],
  ["workbook", "Workbook"],
  ["grammar_book", "Grammar Book"],
  ["tests", "Tests"],
  ["practice", "Practice"],
  ["workbook_practice", "Workbook Practice"],
  ["review", "Review"],
  ["reference", "Reference"],
  ["companion", "Companion"],
  ["video", "Videos"],
  ["extra_video", "Extra Videos"],
  ["games", "Games"],
  ["tasks", "Tasks"],
  ["speaking_bank", "Speaking Bank"],
  ["writing_bank", "Writing Bank"],
  ["worksheets", "Worksheets"],
]);

const ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\\\\|\/(?:Users|home|var|tmp)\/)/i;
const FORBIDDEN_KEY = /^(?:answers?|correctAnswers?|acceptedAnswers?|modelAnswer|teacherSolutions?|decodedXml|rawXml|iwbKey|sourceKey|absolutePath)$/i;

function digest(prefix, ...parts) {
  const value = parts.map((part) => String(part ?? "").toLowerCase()).join("\0");
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function sourceBookRootKey(sourceBookRootName) {
  return digest("bookroot", sourceBookRootName);
}

export function componentHierarchyKey(sourceBookRootName, sourceComponentName) {
  return digest("componentkey", sourceBookRootName, sourceComponentName);
}

export function unitGroupHierarchyKey(sourceBookRootName, sourceComponentName, sourceNumber) {
  return digest("unitgroup", sourceBookRootName, sourceComponentName, sourceNumber);
}

export function pageHierarchyKey(sourceBookRootName, sourceComponentName, sourceNumber, part) {
  return digest("pagekey", sourceBookRootName, sourceComponentName, sourceNumber, part);
}

export function legacyComponentDecisionTargetId(sourceRelativeLocator) {
  const value = String(sourceRelativeLocator || "");
  return `component_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

export function detectedRoleDisplayName(role, sourceComponentName = "Unresolved component") {
  return ROLE_LABELS.get(role) || String(sourceComponentName || "Unresolved component");
}

export function classifyHierarchyGrouping({ role, sourceNumbers = [] }) {
  if (PRINCIPAL_ROLES.has(role)) return "numbered_units";
  if (SUPPLEMENTARY_ROLES.has(role)) return sourceNumbers.length > 1 ? "numbered_groups" : "supplementary_collection";
  if (sourceNumbers.length > 1) return "numbered_groups";
  if (sourceNumbers.length === 1) return "unresolved";
  return "global_component";
}

export function hierarchyGroupLabel(groupingKind, sourceNumber) {
  if (groupingKind === "numbered_units") return `Unit ${sourceNumber}`;
  if (groupingKind === "numbered_groups") return `Group ${sourceNumber}`;
  if (groupingKind === "supplementary_collection") return sourceNumber == null ? "Collection" : `Section ${sourceNumber}`;
  if (groupingKind === "global_component") return "Component-wide";
  return sourceNumber == null ? "Unresolved" : `Source group ${sourceNumber}`;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function approvedRoleDecision(decisions, component) {
  return list(decisions).find((decision) => decision.kind === "component_role"
    && decision.targetId === component.decisionTargetId
    && decision.approvalState === "approved"
    && decision.stale !== true) || null;
}

export function projectEffectiveBookHierarchy(hierarchy, decisions = []) {
  const sourceBookRoots = list(hierarchy?.sourceBookRoots).map((root) => ({
    ...root,
    components: list(root.components).map((component) => {
      const decision = approvedRoleDecision(decisions, component);
      const relatedDecision = list(decisions).find((item) => item.kind === "component_role" && item.targetId === component.decisionTargetId) || null;
      const effectiveRole = decision?.value || component.detectedRole || null;
      const effectiveGroupingKind = classifyHierarchyGrouping({
        role: effectiveRole,
        sourceNumbers: list(component.unitGroups).map((group) => group.sourceNumber),
      });
      return {
        ...component,
        effectiveRole,
        displayName: detectedRoleDisplayName(effectiveRole, component.sourceComponentName),
        effectiveGroupingKind,
        decisionState: relatedDecision?.approvalState || "detected_unapproved",
        decisionStale: relatedDecision?.stale === true,
        unitGroups: list(component.unitGroups).map((group) => ({
          ...group,
          displayLabel: hierarchyGroupLabel(effectiveGroupingKind, group.sourceNumber),
          kind: effectiveGroupingKind === "numbered_units" ? "unit" : "group",
        })),
      };
    }),
  }));
  return { ...hierarchy, sourceBookRoots };
}

function scanSafety(value, location, errors) {
  if (typeof value === "string") {
    if (ABSOLUTE_PATH.test(value)) errors.push(`${location} contains an absolute path`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanSafety(item, `${location}[${index}]`, errors));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) errors.push(`${location}.${key} is forbidden`);
    scanSafety(item, `${location}.${key}`, errors);
  }
}

export function validateBookHierarchy(hierarchy) {
  const errors = [];
  if (hierarchy?.schemaVersion !== BOOK_HIERARCHY_SCHEMA_VERSION) errors.push("Hierarchy schemaVersion is unsupported");
  if (!Array.isArray(hierarchy?.sourceBookRoots)) errors.push("Hierarchy sourceBookRoots must be an array");
  const rootIds = new Set();
  const componentKeys = new Set();
  const unitKeys = new Set();
  for (const root of list(hierarchy?.sourceBookRoots)) {
    if (rootIds.has(root.sourceBookRootId)) errors.push(`Duplicate source book root: ${root.sourceBookRootId}`);
    rootIds.add(root.sourceBookRootId);
    for (const component of list(root.components)) {
      if (componentKeys.has(component.componentKey)) errors.push(`Duplicate component key: ${component.componentKey}`);
      componentKeys.add(component.componentKey);
      if (!BOOK_HIERARCHY_GROUPING_KINDS.has(component.groupingKind)) errors.push(`Invalid grouping kind: ${component.groupingKind}`);
      for (const group of list(component.unitGroups)) {
        if (unitKeys.has(group.unitKey)) errors.push(`Duplicate Unit/group key: ${group.unitKey}`);
        unitKeys.add(group.unitKey);
      }
    }
  }
  scanSafety(hierarchy, "$", errors);
  return { valid: errors.length === 0, errors };
}

export function assertBookHierarchy(hierarchy) {
  const result = validateBookHierarchy(hierarchy);
  if (!result.valid) throw new Error(`Invalid Book hierarchy: ${result.errors.join("; ")}`);
  return hierarchy;
}
