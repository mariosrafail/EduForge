import { sortJsonValue, stableJson } from "./stable-json.js";
import { MANUAL_ACTIVITY_SCHEMA_VERSION, MANUAL_ACTIVITY_TYPES } from "./manual-activity-contract.js";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\\\\|\/(?:Users|home|var|tmp)\/)/i;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FORBIDDEN_KEY = /^(?:decodedXml|rawXml|iwbKey|absolutePath|script|html|sourceExecutionData)$/i;
const NORMALIZATION_POLICIES = new Set(["exact", "trim", "case_insensitive", "trim_case_insensitive"]);

function record(value) { return value && typeof value === "object" && !Array.isArray(value); }
function known(value, allowed, path, errors) { if (!record(value)) { errors.push(`${path} must be an object`); return false; } for (const key of Object.keys(value)) if (!allowed.has(key)) errors.push(`${path}.${key} is unknown`); return true; }
function id(value, path, errors) { if (!SAFE_ID.test(String(value || ""))) errors.push(`${path} must be a stable safe ID`); return String(value || ""); }
function text(value, path, errors, maximum = 2000) { if (typeof value !== "string" || !value.trim() || value.length > maximum || CONTROL.test(value) || ABSOLUTE_PATH.test(value) || /<(?:script|iframe|object|embed)\b|javascript\s*:/i.test(value)) errors.push(`${path} must be bounded safe text`); }
function list(value, path, errors, maximum = 50) { if (!Array.isArray(value)) { errors.push(`${path} must be an array`); return []; } if (value.length > maximum) errors.push(`${path} is too large`); return value.slice(0, maximum); }
function unique(items, key, path, errors) { const values = items.map((item) => item?.[key]); if (new Set(values).size !== values.length) errors.push(`${path} must have unique ${key} values`); }
function scan(value, path, errors) { if (typeof value === "string") { if (ABSOLUTE_PATH.test(value)) errors.push(`${path} contains an absolute path`); return; } if (Array.isArray(value)) return value.forEach((item, index) => scan(item, `${path}[${index}]`, errors)); if (!record(value)) return; for (const [key, item] of Object.entries(value)) { if (FORBIDDEN_KEY.test(key)) errors.push(`${path}.${key} is forbidden`); scan(item, `${path}.${key}`, errors); } }
function nodeMaps(activity) {
  return {
    questions: new Map((activity.content?.questions || []).map((item) => [item.id, item])),
    statements: new Map((activity.content?.statements || []).map((item) => [item.id, item])),
    fields: new Map([...(activity.content?.items || []).map((item) => [item.responseFieldId, item]), ...(activity.content?.fields || []).map((item) => [item.id, item])]),
  };
}
function validateAccepted(entry, path, errors) {
  if (!known(entry, new Set(["responseFieldId", "fieldId", "acceptedValues", "normalizationPolicy"]), path, errors)) return;
  const values = list(entry.acceptedValues, `${path}.acceptedValues`, errors, 20); values.forEach((value, index) => text(value, `${path}.acceptedValues[${index}]`, errors, 1000));
  if (!values.length) errors.push(`${path}.acceptedValues requires at least one value`);
  if (!NORMALIZATION_POLICIES.has(entry.normalizationPolicy)) errors.push(`${path}.normalizationPolicy is invalid`);
}

export function validateManualActivitySolution(solution, activity, { requireComplete = activity?.status === "approved" } = {}) {
  const errors = [];
  if (!known(solution, new Set(["schemaVersion", "activityId", "type", "solutions", "updatedAt"]), "$", errors)) return { valid: false, errors };
  if (solution.schemaVersion !== MANUAL_ACTIVITY_SCHEMA_VERSION) errors.push("$.schemaVersion is unsupported");
  id(solution.activityId, "$.activityId", errors);
  if (solution.activityId !== activity?.activityId) errors.push("$.activityId does not match Student activity");
  if (!MANUAL_ACTIVITY_TYPES.has(solution.type) || solution.type !== activity?.type) errors.push("$.type does not match Student activity");
  if (typeof solution.updatedAt !== "string" || !Number.isFinite(Date.parse(solution.updatedAt))) errors.push("$.updatedAt is invalid");
  const maps = nodeMaps(activity || {}); const body = solution.solutions;
  if (!record(body)) errors.push("$.solutions must be an object");
  else if (solution.type === "multiple_choice") {
    if (known(body, new Set(["questions"]), "$.solutions", errors)) { const items = list(body.questions, "$.solutions.questions", errors, 100); unique(items, "questionId", "$.solutions.questions", errors); items.forEach((item, index) => { const path = `$.solutions.questions[${index}]`; if (!known(item, new Set(["questionId", "correctOptionId"]), path, errors)) return; const question = maps.questions.get(id(item.questionId, `${path}.questionId`, errors)); if (!question) errors.push(`${path}.questionId is orphaned`); const option = id(item.correctOptionId, `${path}.correctOptionId`, errors); if (question && !(question.options || []).some((candidate) => candidate.id === option)) errors.push(`${path}.correctOptionId does not reference a Student option`); }); if (requireComplete && items.length !== maps.questions.size) errors.push("$.solutions.questions must cover every Student question"); }
  } else if (solution.type === "true_false") {
    if (known(body, new Set(["statements"]), "$.solutions", errors)) { const items = list(body.statements, "$.solutions.statements", errors, 200); unique(items, "statementId", "$.solutions.statements", errors); items.forEach((item, index) => { const path = `$.solutions.statements[${index}]`; if (!known(item, new Set(["statementId", "correctValue"]), path, errors)) return; if (!maps.statements.has(id(item.statementId, `${path}.statementId`, errors))) errors.push(`${path}.statementId is orphaned`); if (typeof item.correctValue !== "boolean") errors.push(`${path}.correctValue must be boolean`); }); if (requireComplete && items.length !== maps.statements.size) errors.push("$.solutions.statements must cover every Student statement"); }
  } else if (solution.type === "typed_gap_fill") {
    if (known(body, new Set(["fields"]), "$.solutions", errors)) { const items = list(body.fields, "$.solutions.fields", errors, 200); unique(items, "responseFieldId", "$.solutions.fields", errors); items.forEach((item, index) => { const path = `$.solutions.fields[${index}]`; validateAccepted(item, path, errors); if (!maps.fields.has(id(item.responseFieldId, `${path}.responseFieldId`, errors))) errors.push(`${path}.responseFieldId is orphaned`); }); if (requireComplete && items.length !== maps.fields.size) errors.push("$.solutions.fields must cover every Student response field"); }
  } else if (solution.type === "open_answer") {
    if (known(body, new Set(["rubric"]), "$.solutions", errors) && body.rubric !== null && body.rubric !== undefined && known(body.rubric, new Set(["guidance", "criteria"]), "$.solutions.rubric", errors)) { if (body.rubric.guidance) text(body.rubric.guidance, "$.solutions.rubric.guidance", errors, 4000); const criteria = list(body.rubric.criteria ?? [], "$.solutions.rubric.criteria", errors, 20); criteria.forEach((value, index) => text(value, `$.solutions.rubric.criteria[${index}]`, errors, 1000)); }
  } else if (solution.type === "image_backed") {
    if (known(body, new Set(["fields"]), "$.solutions", errors)) { const items = list(body.fields, "$.solutions.fields", errors, 200); unique(items, "fieldId", "$.solutions.fields", errors); items.forEach((item, index) => { const path = `$.solutions.fields[${index}]`; const field = maps.fields.get(id(item.fieldId, `${path}.fieldId`, errors)); if (!field) { errors.push(`${path}.fieldId is orphaned`); return; } if (field.kind === "single_choice") { if (!known(item, new Set(["fieldId", "correctOptionId"]), path, errors)) return; const option = id(item.correctOptionId, `${path}.correctOptionId`, errors); if (!(field.options || []).some((candidate) => candidate.id === option)) errors.push(`${path}.correctOptionId does not reference a Student option`); } else if (field.kind === "text_input") validateAccepted(item, path, errors); else errors.push(`${path}.fieldId does not require a Teacher solution`); }); const scored = [...maps.fields.values()].filter((field) => ["single_choice", "text_input"].includes(field.kind)); if (requireComplete && items.length !== scored.length) errors.push("$.solutions.fields must cover every auto-scored image field"); }
  } else if (!known(body, new Set(), "$.solutions", errors)) { /* handled by known */ }
  scan(solution, "$", errors);
  return { valid: errors.length === 0, errors };
}

export function normalizeManualActivitySolution(solution, activity, options = {}) {
  const validation = validateManualActivitySolution(solution, activity, options);
  if (!validation.valid && options.allowIncomplete !== true) throw new Error(`Invalid manual activity solution: ${validation.errors.join("; ")}`);
  return sortJsonValue(structuredClone(solution));
}

export function serializeManualActivitySolutionsArtifact(artifact, activities) {
  const errors = []; if (!known(artifact, new Set(["schemaVersion", "audience", "classification", "activities"]), "$", errors)) throw new Error(errors.join("; "));
  if (artifact.schemaVersion !== MANUAL_ACTIVITY_SCHEMA_VERSION || artifact.audience !== "teacher-only-internal" || artifact.classification !== "local-only" || !Array.isArray(artifact.activities)) throw new Error("Invalid manual activity solutions artifact");
  const byId = new Map((activities || []).map((activity) => [activity.activityId, activity])); const ids = new Set();
  for (const solution of artifact.activities) { if (ids.has(solution.activityId)) throw new Error(`Duplicate manual activity solution: ${solution.activityId}`); ids.add(solution.activityId); const validation = validateManualActivitySolution(solution, byId.get(solution.activityId), { requireComplete: byId.get(solution.activityId)?.status === "approved" }); if (!validation.valid) throw new Error(`Invalid manual activity solution: ${validation.errors.join("; ")}`); }
  return stableJson({ schemaVersion: MANUAL_ACTIVITY_SCHEMA_VERSION, audience: "teacher-only-internal", classification: "local-only", activities: [...artifact.activities].sort((a, b) => a.activityId.localeCompare(b.activityId)) });
}

export function removeOrphanManualSolutions(solution, activity) {
  if (!solution || !activity) return null;
  const copy = structuredClone(solution); const maps = nodeMaps(activity);
  if (copy.type === "multiple_choice") copy.solutions.questions = (copy.solutions.questions || []).filter((item) => maps.questions.has(item.questionId) && maps.questions.get(item.questionId).options.some((option) => option.id === item.correctOptionId));
  if (copy.type === "true_false") copy.solutions.statements = (copy.solutions.statements || []).filter((item) => maps.statements.has(item.statementId));
  if (copy.type === "typed_gap_fill") copy.solutions.fields = (copy.solutions.fields || []).filter((item) => maps.fields.has(item.responseFieldId));
  if (copy.type === "image_backed") copy.solutions.fields = (copy.solutions.fields || []).filter((item) => maps.fields.has(item.fieldId));
  return sortJsonValue(copy);
}
