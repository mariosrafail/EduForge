import { createHash } from "node:crypto";

import { sortJsonValue } from "./stable-json.js";

export const DECISION_SCHEMA_VERSION = "1.0";
export const DECISION_APPROVAL_STATES = new Set(["draft", "approved", "rejected"]);
export const DECISION_TARGET_TYPES = new Set(["component", "page", "activity", "hotspot", "review"]);
export const DECISION_KINDS = new Set([
  "component_role",
  "printed_page_number",
  "canonical_page_variant",
  "activity_type",
  "activity_disposition",
  "activity_audience_policy",
  "hotspot_candidate_disposition",
  "review_disposition",
]);

export const COMPONENT_ROLES = new Set([
  "students_book", "workbook", "grammar_book", "tests", "practice", "workbook_practice",
  "review", "reference", "companion", "video", "extra_video", "games", "tasks",
  "speaking_bank", "writing_bank", "worksheets",
]);
export const ACTIVITY_DISPOSITIONS = new Set([
  "structured-activity-candidate", "structured-activity-with-raster-gaps", "media-only",
  "teacher-reveal-only", "display-or-print-content", "unsupported-publisher-interaction",
  "non-exercise", "malformed-or-unresolved",
]);
export const ACTIVITY_AUDIENCE_POLICIES = new Set(["student_and_teacher", "teacher_only", "disabled"]);
export const HOTSPOT_DISPOSITIONS = new Set(["accepted_candidate", "rejected_candidate", "deferred"]);
export const REVIEW_DISPOSITIONS = new Set(["deferred", "not_applicable", "accepted_risk"]);

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,159}$/;
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const MAXIMUM_NOTE_LENGTH = 2000;
const FORBIDDEN_VALUE_KEY = /^(?:correctAnswers?|acceptedAnswers?|modelAnswer|answerRecords?|dragDropMappings?|decodedXml|rawDecodedIwb|iwbKey|discoveredKey|teacherSolutions?)$/i;
const FORBIDDEN_VALUE_TEXT = /\b(?:correctAnswers?|acceptedAnswers?|modelAnswer|answerRecords?|dragDropMappings?|decodedXml|rawDecodedIwb|iwbKey|discoveredKey)\b/i;
const ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\\\\|\/Users\/|\/home\/)/i;

const LEGACY_FIELDS = new Set([
  "id", "kind", "value", "dependencyFactIds", "dependencyEvidenceHashes", "approvalState",
  "stale", "staleReasons", "editorNote", "createdAt", "updatedAt",
]);
const CURRENT_FIELDS = new Set([
  "schemaVersion", "id", "kind", "targetType", "targetId", "value", "dependencyFactIds",
  "dependencyEvidenceHashes", "resolvesReviewIds", "approvalState", "stale", "staleReasons",
  "editorNote", "createdAt", "updatedAt",
]);

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
}

function assertKnownFields(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unknown field ${key}`);
}

function assertSafeId(value, label) {
  if (!SAFE_ID.test(String(value || ""))) throw new Error(`${label} must be a safe identifier`);
  return String(value);
}

function assertSafeValue(value, location = "decision.value") {
  if (typeof value === "string") {
    if (value.length > 512 || ABSOLUTE_PATH.test(value) || FORBIDDEN_VALUE_TEXT.test(value)) throw new Error(`${location} contains forbidden data`);
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`${location} must be a safe integer`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 20) throw new Error(`${location} is too large`);
    value.forEach((item, index) => assertSafeValue(item, `${location}[${index}]`));
    return;
  }
  assertPlainObject(value, location);
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_VALUE_KEY.test(key)) throw new Error(`${location}.${key} is forbidden`);
    assertSafeValue(item, `${location}.${key}`);
  }
}

function normalizePrintedPage(value) {
  if (Number.isSafeInteger(value) && value >= 1 && value <= 9999) return value;
  assertPlainObject(value, "printed_page_number value");
  assertKnownFields(value, new Set(["start", "end"]), "printed_page_number value");
  if (!Number.isSafeInteger(value.start) || value.start < 1 || value.start > 9999) throw new Error("printed_page_number start is invalid");
  if (!Number.isSafeInteger(value.end) || value.end < value.start || value.end > 9999) throw new Error("printed_page_number end is invalid");
  return { start: value.start, end: value.end };
}

export function normalizeDecisionValue(kind, value, { allowedValues } = {}) {
  if (!DECISION_KINDS.has(kind)) throw new Error(`Unsupported decision kind: ${kind}`);
  assertSafeValue(value);
  if (kind === "printed_page_number") return normalizePrintedPage(value);
  if (typeof value !== "string" || !SAFE_TOKEN.test(value)) throw new Error(`${kind} requires a safe string value`);
  const staticAllowed = kind === "component_role" ? COMPONENT_ROLES
    : kind === "activity_disposition" ? ACTIVITY_DISPOSITIONS
      : kind === "activity_audience_policy" ? ACTIVITY_AUDIENCE_POLICIES
        : kind === "hotspot_candidate_disposition" ? HOTSPOT_DISPOSITIONS
          : kind === "review_disposition" ? REVIEW_DISPOSITIONS : null;
  const effectiveAllowed = allowedValues ? new Set(allowedValues) : staticAllowed;
  if (effectiveAllowed && !effectiveAllowed.has(value)) throw new Error(`${kind} value is not allowed`);
  return value;
}

export function stableDecisionId(kind, targetType, targetId) {
  if (!DECISION_KINDS.has(kind)) throw new Error(`Unsupported decision kind: ${kind}`);
  if (!DECISION_TARGET_TYPES.has(targetType)) throw new Error(`Unsupported decision target type: ${targetType}`);
  assertSafeId(targetId, "targetId");
  const digest = createHash("sha256").update(`${kind}\0${targetType}\0${targetId}`).digest("hex").slice(0, 24);
  return `decision_${digest}`;
}

function normalizeIds(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return [...new Set(values.map((value) => assertSafeId(value, label)))].sort();
}

function normalizeEvidenceHashes(ids, value, factsById, label) {
  assertPlainObject(value || {}, `${label}.dependencyEvidenceHashes`);
  const result = {};
  for (const key of Object.keys(value || {})) if (!ids.includes(key)) throw new Error(`${label} contains an unrelated evidence hash`);
  for (const factId of ids) {
    const supplied = value?.[factId];
    const current = factsById.get(factId)?.evidenceHash;
    const hash = supplied || current;
    if (!/^[a-f0-9]{64}$/i.test(String(hash || ""))) throw new Error(`${label} has no valid evidence hash for ${factId}`);
    result[factId] = String(hash).toLowerCase();
  }
  return result;
}

function normalizeNote(value, label) {
  if (typeof value !== "string") throw new Error(`${label}.editorNote must be a string`);
  if (value.length > MAXIMUM_NOTE_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${label}.editorNote is invalid`);
  if (ABSOLUTE_PATH.test(value) || FORBIDDEN_VALUE_TEXT.test(value)) throw new Error(`${label}.editorNote contains forbidden data`);
  return value;
}

function normalizeDate(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${label} must be an ISO-compatible timestamp`);
  return value;
}

export function normalizeDecision(decision, facts = [], { requireCurrent = false } = {}) {
  assertPlainObject(decision, "Decision");
  const current = decision.schemaVersion !== undefined || decision.targetType !== undefined || decision.targetId !== undefined;
  if (requireCurrent && !current) throw new Error("A current decision contract is required");
  assertKnownFields(decision, current ? CURRENT_FIELDS : LEGACY_FIELDS, `Decision ${decision.id || "unknown"}`);
  const label = `Decision ${assertSafeId(decision.id, "Decision id")}`;
  if (!DECISION_KINDS.has(decision.kind) && current) throw new Error(`${label} has an unsupported kind`);
  if (!decision.kind || typeof decision.kind !== "string") throw new Error(`${label} requires a kind`);
  if (!DECISION_APPROVAL_STATES.has(decision.approvalState)) throw new Error(`${label} has an invalid approval state`);
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));
  const dependencyFactIds = normalizeIds(decision.dependencyFactIds || [], `${label}.dependencyFactIds`);
  const base = {
    id: decision.id,
    kind: decision.kind,
    value: current ? normalizeDecisionValue(decision.kind, decision.value) : sortJsonValue(decision.value),
    dependencyFactIds,
    dependencyEvidenceHashes: normalizeEvidenceHashes(dependencyFactIds, decision.dependencyEvidenceHashes, factsById, label),
    approvalState: decision.approvalState,
    stale: Boolean(decision.stale),
    staleReasons: normalizeIds(decision.staleReasons || [], `${label}.staleReasons`),
    editorNote: normalizeNote(decision.editorNote ?? "", label),
    createdAt: normalizeDate(decision.createdAt, `${label}.createdAt`),
    updatedAt: normalizeDate(decision.updatedAt, `${label}.updatedAt`),
  };
  if (!current) return base;
  if (decision.schemaVersion !== DECISION_SCHEMA_VERSION) throw new Error(`${label} has an unsupported schemaVersion`);
  if (!DECISION_TARGET_TYPES.has(decision.targetType)) throw new Error(`${label} has an invalid targetType`);
  const targetId = assertSafeId(decision.targetId, `${label}.targetId`);
  if (decision.id !== stableDecisionId(decision.kind, decision.targetType, targetId)) throw new Error(`${label} has an unstable identity`);
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    ...base,
    targetType: decision.targetType,
    targetId,
    resolvesReviewIds: normalizeIds(decision.resolvesReviewIds || [], `${label}.resolvesReviewIds`),
  };
}

export function normalizeDecisionMutationInput(input) {
  assertPlainObject(input, "Decision mutation");
  const allowed = new Set(["targetId", "kind", "value", "approvalState", "editorNote", "expectedRevision", "clientMutationId"]);
  assertKnownFields(input, allowed, "Decision mutation");
  const targetId = assertSafeId(input.targetId, "targetId");
  if (!DECISION_KINDS.has(input.kind)) throw new Error("Decision kind is not allowed");
  if (!DECISION_APPROVAL_STATES.has(input.approvalState)) throw new Error("Decision approvalState is invalid");
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw new Error("expectedRevision must be a positive integer");
  const clientMutationId = assertSafeId(input.clientMutationId, "clientMutationId");
  return {
    targetId,
    kind: input.kind,
    value: normalizeDecisionValue(input.kind, input.value),
    approvalState: input.approvalState,
    editorNote: normalizeNote(input.editorNote ?? "", "Decision mutation"),
    expectedRevision: input.expectedRevision,
    clientMutationId,
  };
}
