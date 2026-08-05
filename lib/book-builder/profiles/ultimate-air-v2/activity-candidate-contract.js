import { createHash } from "node:crypto";
import { normalizeSourceLocator } from "../../detected-facts.js";

const FORBIDDEN_STUDENT_KEY = /^(?:correct|correctAnswer|correctAnswers|acceptedAnswer|acceptedAnswers|answerRecords?|answers?|teacherSolution|solution|modelAnswer|answerMappings?|dragDropMappings?|score|scoring|iwbKey|key|rawXml|decodedXml|rawDecodedIwb|revealPayload)$/i;
const FORBIDDEN_TEACHER_KEY = /^(?:rawXml|decodedXml|rawDecodedIwb|iwbKey|key|absolutePath)$/i;

function digest(prefix, identity) { return `${prefix}_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`; }
export function activityCandidateId(locator) { return digest("activity", normalizeSourceLocator(locator).toLowerCase()); }
export function nestedCandidateId(prefix, activityId, sourceIdentity) { return digest(prefix, `${activityId}\0${String(sourceIdentity).toLowerCase()}`); }

export function createNestedCandidateIdAllocator() {
  const claimedIds = new Set();
  const contextOccurrences = new Map();

  return ({ prefix, parentId, sourceIdentity, sourceRelativePath, structuralPosition }) => {
    const legacyId = nestedCandidateId(prefix, parentId, sourceIdentity);
    if (!claimedIds.has(legacyId)) {
      claimedIds.add(legacyId);
      return legacyId;
    }

    const stableContext = `${sourceIdentity}\0source-document:${normalizeSourceLocator(sourceRelativePath)}\0structural-position:${structuralPosition}`;
    const contextKey = `${prefix}\0${parentId}\0${stableContext}`.toLowerCase();
    let occurrence = (contextOccurrences.get(contextKey) || 0) + 1;
    let candidateId;
    do {
      const disambiguatedIdentity = occurrence === 1 ? stableContext : `${stableContext}\0context-occurrence-${occurrence}`;
      candidateId = nestedCandidateId(prefix, parentId, disambiguatedIdentity);
      occurrence += 1;
    } while (claimedIds.has(candidateId));
    contextOccurrences.set(contextKey, occurrence - 1);
    claimedIds.add(candidateId);
    return candidateId;
  };
}

export function allocateNestedCandidateIds(prefix, parentId, items, publisherIdentity, fallbackPrefix, options = {}) {
  const identities = items.map((item, index) => {
    const publisherId = publisherIdentity(item);
    return publisherId === null || publisherId === undefined ? `${fallbackPrefix}-${index + 1}` : String(publisherId);
  });
  const totals = new Map();
  for (const identity of identities) {
    const key = identity.toLowerCase();
    totals.set(key, (totals.get(key) || 0) + 1);
  }
  const occurrences = new Map();
  return identities.map((identity, index) => {
    const key = identity.toLowerCase();
    const occurrence = (occurrences.get(key) || 0) + 1;
    occurrences.set(key, occurrence);
    const uniqueIdentity = totals.get(key) > 1 && occurrence > 1 ? `${identity}\0occurrence-${occurrence}` : identity;
    if (!options.idAllocator) return nestedCandidateId(prefix, parentId, uniqueIdentity);
    return options.idAllocator({
      prefix,
      parentId,
      sourceIdentity: uniqueIdentity,
      sourceRelativePath: options.sourceRelativePath,
      structuralPosition: options.structuralPosition?.(index) || `${fallbackPrefix}[${index + 1}]`,
    });
  });
}

function absolute(value) { return typeof value === "string" && (/^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value) || value.startsWith("/")); }
function unsafeText(value) { return typeof value === "string" && /<\/?(?:script|iframe|object|embed)\b|(?:javascript|data\s*:\s*text\/html)\s*:/i.test(value); }
function scan(value, location, forbidden, errors) {
  if (absolute(value)) errors.push(`${location} contains an absolute path`);
  else if (unsafeText(value)) errors.push(`${location} contains unsafe markup`);
  else if (Array.isArray(value)) value.forEach((item, index) => scan(item, `${location}[${index}]`, forbidden, errors));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    if (forbidden.test(key)) errors.push(`${location}.${key} is forbidden`);
    scan(item, `${location}.${key}`, forbidden, errors);
  }
}

export function validateStudentActivityCandidates(artifact) {
  const errors = [];
  if (artifact?.schemaVersion !== "1.0" || artifact?.audience !== "student-safe-authoring") errors.push("Student artifact classification is invalid");
  if (!Array.isArray(artifact?.candidates)) errors.push("Student candidates must be an array");
  scan(artifact, "$", FORBIDDEN_STUDENT_KEY, errors);
  const ids = new Set();
  const addId = (id, location) => {
    if (typeof id !== "string" || !id) return;
    if (ids.has(id)) errors.push(`${location} contains a duplicate stable ID`);
    ids.add(id);
  };
  for (const [activityIndex, activity] of (artifact?.candidates || []).entries()) {
    addId(activity?.activityCandidateId, `$.candidates[${activityIndex}].activityCandidateId`);
    for (const [questionIndex, question] of (activity?.questions || []).entries()) {
      addId(question?.id, `$.candidates[${activityIndex}].questions[${questionIndex}].id`);
      for (const [optionIndex, option] of (question?.options || []).entries()) {
        addId(option?.id, `$.candidates[${activityIndex}].questions[${questionIndex}].options[${optionIndex}].id`);
      }
    }
    for (const field of ["draggables", "targets", "responseFields"]) {
      for (const [index, item] of (activity?.[field] || []).entries()) {
        addId(item?.id, `$.candidates[${activityIndex}].${field}[${index}].id`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function assertStudentActivityCandidates(artifact) {
  const result = validateStudentActivityCandidates(artifact);
  if (!result.valid) throw new Error(`Unsafe Student activity candidates: ${result.errors.join("; ")}`);
  return artifact;
}

export function validateTeacherSolutionCandidates(artifact) {
  const errors = [];
  if (artifact?.schemaVersion !== "1.0" || artifact?.audience !== "teacher-only-internal" || artifact?.classification !== "local-only") errors.push("Teacher artifact classification is invalid");
  if (!Array.isArray(artifact?.candidates)) errors.push("Teacher candidates must be an array");
  scan(artifact, "$", FORBIDDEN_TEACHER_KEY, errors);
  return { valid: errors.length === 0, errors };
}
