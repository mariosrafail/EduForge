import { validateBookManifestStructure } from "../book-assets/manifest.js";
import { normalizeApprovedDecisions } from "./decisions.js";
import { normalizeDetectedFacts } from "./detected-facts.js";
import { sortJsonValue, stableJson } from "./stable-json.js";

export const BOOK_PROJECT_SCHEMA_VERSION = "1.0";
export const BOOK_PROJECT_LIFECYCLE_STATES = new Set(["draft", "scanned", "review_required", "source_changed"]);
export const BOOK_PROJECT_TOP_LEVEL_FIELDS = new Set([
  "schemaVersion", "projectId", "revision", "lifecycleStatus", "createdAt", "updatedAt",
  "sourceDescriptor", "sourceSnapshot", "selectedProfile", "detectedFacts", "approvedDecisions",
  "publicationDraft", "validationSummary",
]);

const publicationFields = new Set(["schemaVersion", "publisher", "book", "edition", "components", "assets"]);
const forbiddenPortableKeys = /^(?:localBinding|localSourceBinding|absolutePath|selectedOuterPath|canonicalRealPath|rawDecodedIwb|decodedXml|rawXml|iwbKey|discoveredKey|teacherAnswers|correctAnswers|answerValues?|questionText|optionText|acceptedAnswers?|modelAnswer)$/i;

function isAbsolutePortableString(value) {
  return typeof value === "string" && (/^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value) || value.startsWith("/"));
}

function scanPortableSafety(value, location, errors) {
  if (isAbsolutePortableString(value)) errors.push(`${location} contains an absolute path`);
  else if (Array.isArray(value)) value.forEach((item, index) => scanPortableSafety(item, `${location}[${index}]`, errors));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
    if (forbiddenPortableKeys.test(key)) errors.push(`${location}.${key} is not portable Book Project data`);
    scanPortableSafety(item, `${location}.${key}`, errors);
  }
}

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function validateBookProject(project) {
  const errors = [];
  if (!project || typeof project !== "object" || Array.isArray(project)) return { valid: false, errors: ["Book Project must be an object"] };
  for (const key of Object.keys(project)) if (!BOOK_PROJECT_TOP_LEVEL_FIELDS.has(key)) errors.push(`Unknown Book Project field: ${key}`);
  if (project.schemaVersion !== BOOK_PROJECT_SCHEMA_VERSION) errors.push(`Unsupported Book Project schemaVersion: ${project.schemaVersion || "missing"}`);
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(String(project.projectId || ""))) errors.push("projectId must be a safe identifier");
  if (!Number.isInteger(project.revision) || project.revision < 1) errors.push("revision must be a positive integer");
  if (!BOOK_PROJECT_LIFECYCLE_STATES.has(project.lifecycleStatus)) errors.push("lifecycleStatus is invalid");
  if (!validDate(project.createdAt) || !validDate(project.updatedAt)) errors.push("createdAt and updatedAt must be ISO-compatible timestamps");
  for (const key of ["sourceDescriptor", "sourceSnapshot", "selectedProfile", "publicationDraft", "validationSummary"]) {
    if (!project[key] || typeof project[key] !== "object" || Array.isArray(project[key])) errors.push(`${key} must be an object`);
  }
  if (!Array.isArray(project.detectedFacts)) errors.push("detectedFacts must be an array");
  if (!Array.isArray(project.approvedDecisions)) errors.push("approvedDecisions must be an array");
  try { normalizeDetectedFacts(project.detectedFacts); } catch (error) { errors.push(error.message); }
  try { normalizeApprovedDecisions(project.approvedDecisions, project.detectedFacts); } catch (error) { errors.push(error.message); }
  scanPortableSafety(project, "$", errors);
  return { valid: errors.length === 0, errors };
}

export function normalizeBookProject(project) {
  const facts = normalizeDetectedFacts(project.detectedFacts || []);
  const normalized = {
    ...project,
    sourceDescriptor: sortJsonValue(project.sourceDescriptor || {}),
    sourceSnapshot: sortJsonValue(project.sourceSnapshot || {}),
    selectedProfile: {
      ...(project.selectedProfile || {}),
      matchedEvidence: [...(project.selectedProfile?.matchedEvidence || [])].sort(),
      missingEvidence: [...(project.selectedProfile?.missingEvidence || [])].sort(),
      conflictingEvidence: [...(project.selectedProfile?.conflictingEvidence || [])].sort(),
    },
    detectedFacts: facts,
    approvedDecisions: normalizeApprovedDecisions(project.approvedDecisions || [], facts),
    publicationDraft: sortJsonValue(project.publicationDraft || {}),
    validationSummary: sortJsonValue(project.validationSummary || {}),
  };
  const validation = validateBookProject(normalized);
  if (!validation.valid) throw new Error(`Invalid Book Project: ${validation.errors.join("; ")}`);
  return normalized;
}

export function serializeBookProject(project) {
  return stableJson(normalizeBookProject(project));
}

export function portableBookProject(project) {
  return normalizeBookProject(structuredClone(project));
}

export function projectPublicationManifest(project) {
  const draft = project?.publicationDraft && typeof project.publicationDraft === "object" ? project.publicationDraft : {};
  return sortJsonValue(Object.fromEntries(Object.entries(draft).filter(([key]) => publicationFields.has(key))));
}

export function validatePublicationDraft(project) {
  const manifest = projectPublicationManifest(project);
  return { manifest, ...validateBookManifestStructure(manifest) };
}

export function createBookProject(input) {
  const now = input.now || new Date().toISOString();
  const base = {
    schemaVersion: BOOK_PROJECT_SCHEMA_VERSION,
    projectId: input.projectId,
    revision: input.revision || 1,
    lifecycleStatus: input.lifecycleStatus || "draft",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    sourceDescriptor: input.sourceDescriptor || {},
    sourceSnapshot: input.sourceSnapshot || {},
    selectedProfile: input.selectedProfile || { id: "generic-air-fallback", confidence: 0, detectorVersion: "1.0", matchedEvidence: [], missingEvidence: [], conflictingEvidence: [] },
    detectedFacts: input.detectedFacts || [],
    approvedDecisions: input.approvedDecisions || [],
    publicationDraft: input.publicationDraft || {},
    validationSummary: input.validationSummary || { authoringValid: true, authoringErrors: [], publicationValid: false, publicationErrors: [], warnings: [] },
  };
  return normalizeBookProject(base);
}
