import { NATIVE_ACTIVITY_PART_ID, NATIVE_ACTIVITY_SCHEMA_VERSION } from "./nativeActivityPublic.js";

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

export function normalizeNativeActivityTeacher(input, { normalizeSolution, expectedActivityId = null, expectedKind = null } = {}) {
  if (typeof normalizeSolution !== "function") throw new Error("Native Teacher solution normalizer is required.");
  if (input?.kind === "multi-part" && new TextEncoder().encode(JSON.stringify(input)).length > 262144) throw new Error("Multi-Part aggregate Teacher content budget exceeded.");
  const value = structuredClone(object(input, "Native Teacher activity"));
  exactKeys(value, ["schemaVersion", "activityId", "kind", "parts"], "Native Teacher activity");
  if (value.schemaVersion !== NATIVE_ACTIVITY_SCHEMA_VERSION) throw new Error("Unsupported native Teacher activity schema version.");
  if (expectedActivityId && value.activityId !== expectedActivityId) throw new Error("Native Teacher activity identity does not match its resource.");
  if (expectedKind && value.kind !== expectedKind) throw new Error("Native Teacher activity kind is immutable.");
  if (!Array.isArray(value.parts) || value.parts.length !== 1) throw new Error("Native Teacher schema v1 requires exactly one Part.");
  exactKeys(value.parts[0], ["id", "solution"], "Native Teacher Part");
  if (value.parts[0].id !== NATIVE_ACTIVITY_PART_ID) throw new Error("Native Teacher schema v1 requires stable Part ID part-1.");
  return {
    schemaVersion: NATIVE_ACTIVITY_SCHEMA_VERSION,
    activityId: value.activityId,
    kind: value.kind,
    parts: [{ id: NATIVE_ACTIVITY_PART_ID, solution: normalizeSolution(value.parts[0].solution) }],
  };
}

export function validateNativeActivityDocumentPair(publicDocument, teacherDocument) {
  if (publicDocument.activityId !== teacherDocument.activityId || publicDocument.kind !== teacherDocument.kind) throw new Error("Native public and Teacher activity identities must match.");
  const publicIds = publicDocument.parts.map((part) => part.id);
  const teacherIds = teacherDocument.parts.map((part) => part.id);
  if (publicIds.length !== teacherIds.length || publicIds.some((id, index) => id !== teacherIds[index])) throw new Error("Native public and Teacher Part identities must match.");
  return true;
}
