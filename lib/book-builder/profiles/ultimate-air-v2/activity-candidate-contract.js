import { createHash } from "node:crypto";
import { normalizeSourceLocator } from "../../detected-facts.js";

const FORBIDDEN_STUDENT_KEY = /^(?:correct|correctAnswer|correctAnswers|acceptedAnswer|acceptedAnswers|answerRecords?|answers?|teacherSolution|solution|modelAnswer|answerMappings?|dragDropMappings?|score|scoring|iwbKey|key|rawXml|decodedXml|rawDecodedIwb|revealPayload)$/i;
const FORBIDDEN_TEACHER_KEY = /^(?:rawXml|decodedXml|rawDecodedIwb|iwbKey|key|absolutePath)$/i;

function digest(prefix, identity) { return `${prefix}_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`; }
export function activityCandidateId(locator) { return digest("activity", normalizeSourceLocator(locator).toLowerCase()); }
export function nestedCandidateId(prefix, activityId, sourceIdentity) { return digest(prefix, `${activityId}\0${String(sourceIdentity).toLowerCase()}`); }

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
