import { randomUUID } from "node:crypto";

import { sortJsonValue, stableJson } from "./stable-json.js";

export const MANUAL_ACTIVITY_SCHEMA_VERSION = "1.0";
export const MANUAL_ACTIVITY_TYPES = new Set([
  "multiple_choice", "true_false", "typed_gap_fill", "open_answer", "media_audio",
  "media_video", "scrollable_panel", "image_backed",
]);
export const MANUAL_ACTIVITY_STATUSES = new Set(["draft", "approved", "archived"]);
export const MANUAL_ACTIVITY_SOURCE_MODES = new Set(["manual", "detected_candidate_prefill"]);
export const MANUAL_ACTIVITY_VIEWPORT_MODES = new Set(["fit", "vertical_scroll", "horizontal_scroll"]);
export const IMAGE_BACKED_FIELD_KINDS = new Set([
  "static_label", "single_choice", "text_input", "media_trigger", "linked_text_panel",
]);

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/mp4", "audio/aac", "video/mp4"]);
const ASSET_ROLES = new Set(["background", "image", "audio", "video", "poster", "media_trigger"]);
const ABSOLUTE_PATH = /^(?:[a-z]:[\\/]|\\\\|\/(?:Users|home|var|tmp)\/)/i;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const FORBIDDEN_KEY = /^(?:correctAnswer|correctAnswers|correctOptionId|correctOptionIds|acceptedAnswer|acceptedAnswers|answerRecords|modelAnswer|teacherSolution|teacherSolutions|solution|solutions|scoringKey|dragDropMappings|decodedXml|rawXml|iwbKey|absolutePath)$/i;
const FORBIDDEN_MARKUP = /<(?:script|iframe|object|embed|style|link|meta)\b|javascript\s*:|on[a-z]+\s*=/i;

const COMMON_FIELDS = new Set([
  "schemaVersion", "activityId", "status", "sourceMode", "sourceCandidateId", "replacesCandidateId",
  "hierarchy", "type", "title", "instructions", "content", "presentation", "assetReferences",
  "dependencyFactIds", "dependencyEvidenceHashes", "prefilledAt", "prefilledFieldOrigins",
  "stale", "staleReasons", "createdAt", "updatedAt",
]);
const HIERARCHY_FIELDS = new Set([
  "sourceBookRootKey", "componentKey", "effectiveComponentRole", "unitGroupKey", "unitGroupNumber",
  "part", "pageCandidateId", "hotspotCandidateIds",
]);
const ASSET_FIELDS = new Set(["assetId", "role", "mimeType", "sourceRelativeIdentity", "digest", "stale"]);
const PRESENTATION_FIELDS = new Set(["viewportMode", "viewportSizeMode", "backgroundReviewRequired"]);

function issue(errors, path, message) { errors.push(`${path} ${message}`); }
function record(value) { return value && typeof value === "object" && !Array.isArray(value); }
function known(value, fields, path, errors) {
  if (!record(value)) { issue(errors, path, "must be an object"); return false; }
  for (const key of Object.keys(value)) if (!fields.has(key)) issue(errors, `${path}.${key}`, "is unknown");
  return true;
}
function safeId(value, path, errors, { required = true } = {}) {
  if (!required && (value === undefined || value === null)) return null;
  if (!SAFE_ID.test(String(value || ""))) issue(errors, path, "must be a stable safe ID");
  return String(value || "");
}
function safeText(value, path, errors, { required = false, maximum = 4000 } = {}) {
  if (value === undefined || value === null) {
    if (required) issue(errors, path, "is required");
    return "";
  }
  if (typeof value !== "string" || value.length > maximum || CONTROL.test(value) || ABSOLUTE_PATH.test(value) || FORBIDDEN_MARKUP.test(value)) {
    issue(errors, path, "must be bounded safe plain text"); return "";
  }
  if (required && !value.trim()) issue(errors, path, "is required");
  return value;
}
function isoDate(value, path, errors, { required = true } = {}) {
  if (!required && value === undefined) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) issue(errors, path, "must be an ISO-compatible timestamp");
  return value;
}
function array(value, path, errors, maximum = 200) {
  if (!Array.isArray(value)) { issue(errors, path, "must be an array"); return []; }
  if (value.length > maximum) issue(errors, path, `must contain at most ${maximum} items`);
  return value.slice(0, maximum);
}
function uniqueIds(items, path, errors) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const id = item?.id;
    if (seen.has(id)) issue(errors, `${path}[${index}].id`, "must be unique");
    seen.add(id);
  }
}
function scanStudentBoundary(value, path, errors) {
  if (typeof value === "string") { if (ABSOLUTE_PATH.test(value)) issue(errors, path, "contains an absolute path"); return; }
  if (Array.isArray(value)) return value.forEach((item, index) => scanStudentBoundary(item, `${path}[${index}]`, errors));
  if (!record(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEY.test(key)) issue(errors, `${path}.${key}`, "is forbidden in Student data");
    scanStudentBoundary(item, `${path}.${key}`, errors);
  }
}

function validateHierarchy(value, errors, { allowIncomplete }) {
  if (!known(value, HIERARCHY_FIELDS, "$.hierarchy", errors)) return;
  safeId(value.sourceBookRootKey, "$.hierarchy.sourceBookRootKey", errors);
  safeId(value.componentKey, "$.hierarchy.componentKey", errors);
  safeId(value.effectiveComponentRole, "$.hierarchy.effectiveComponentRole", errors);
  safeId(value.unitGroupKey, "$.hierarchy.unitGroupKey", errors, { required: !allowIncomplete });
  if (value.unitGroupNumber !== null && value.unitGroupNumber !== undefined && (!Number.isSafeInteger(value.unitGroupNumber) || value.unitGroupNumber < 0 || value.unitGroupNumber > 9999)) issue(errors, "$.hierarchy.unitGroupNumber", "is invalid");
  if (value.part !== null && value.part !== undefined && (!Number.isSafeInteger(value.part) || value.part < 0 || value.part > 9999)) issue(errors, "$.hierarchy.part", "is invalid");
  safeId(value.pageCandidateId, "$.hierarchy.pageCandidateId", errors, { required: false });
  const hotspots = array(value.hotspotCandidateIds ?? [], "$.hierarchy.hotspotCandidateIds", errors, 100);
  hotspots.forEach((id, index) => safeId(id, `$.hierarchy.hotspotCandidateIds[${index}]`, errors));
  if (new Set(hotspots).size !== hotspots.length) issue(errors, "$.hierarchy.hotspotCandidateIds", "must be unique");
}

function validateAssets(value, errors) {
  const assets = array(value, "$.assetReferences", errors, 100);
  const ids = new Set();
  assets.forEach((asset, index) => {
    const path = `$.assetReferences[${index}]`;
    if (!known(asset, ASSET_FIELDS, path, errors)) return;
    const id = safeId(asset.assetId, `${path}.assetId`, errors);
    if (ids.has(id)) issue(errors, `${path}.assetId`, "must be unique"); ids.add(id);
    if (!ASSET_ROLES.has(asset.role)) issue(errors, `${path}.role`, "is invalid");
    if (!MIME_TYPES.has(asset.mimeType)) issue(errors, `${path}.mimeType`, "is not approved");
    safeText(asset.sourceRelativeIdentity, `${path}.sourceRelativeIdentity`, errors, { required: true, maximum: 2048 });
    if (!SHA256.test(String(asset.digest || ""))) issue(errors, `${path}.digest`, "must be a SHA-256 digest");
    if (typeof asset.stale !== "boolean") issue(errors, `${path}.stale`, "must be boolean");
  });
  return new Set(assets.map((asset) => asset?.assetId));
}

function validateOptions(value, path, errors, { approval }) {
  const options = array(value, path, errors, 50);
  uniqueIds(options, path, errors);
  for (const [index, option] of options.entries()) {
    const itemPath = `${path}[${index}]`;
    if (!known(option, new Set(["id", "text"]), itemPath, errors)) continue;
    safeId(option.id, `${itemPath}.id`, errors);
    safeText(option.text, `${itemPath}.text`, errors, { required: approval, maximum: 1000 });
  }
  if (approval && options.length < 2) issue(errors, path, "must contain at least two options");
}

function validateMultipleChoice(content, errors, approval) {
  if (!known(content, new Set(["questions"]), "$.content", errors)) return;
  const questions = array(content.questions, "$.content.questions", errors, 100); uniqueIds(questions, "$.content.questions", errors);
  questions.forEach((question, index) => {
    const path = `$.content.questions[${index}]`;
    if (!known(question, new Set(["id", "prompt", "options"]), path, errors)) return;
    safeId(question.id, `${path}.id`, errors); safeText(question.prompt, `${path}.prompt`, errors, { required: approval });
    validateOptions(question.options, `${path}.options`, errors, { approval });
  });
  if (approval && !questions.length) issue(errors, "$.content.questions", "must contain at least one question");
}
function validateTrueFalse(content, errors, approval) {
  if (!known(content, new Set(["statements"]), "$.content", errors)) return;
  const statements = array(content.statements, "$.content.statements", errors, 200); uniqueIds(statements, "$.content.statements", errors);
  statements.forEach((item, index) => { const path = `$.content.statements[${index}]`; if (known(item, new Set(["id", "prompt"]), path, errors)) { safeId(item.id, `${path}.id`, errors); safeText(item.prompt, `${path}.prompt`, errors, { required: approval }); } });
  if (approval && !statements.length) issue(errors, "$.content.statements", "must contain at least one statement");
}
function validateTypedGap(content, errors, approval) {
  if (!known(content, new Set(["items"]), "$.content", errors)) return;
  const items = array(content.items, "$.content.items", errors, 200); uniqueIds(items, "$.content.items", errors); const fieldIds = new Set();
  items.forEach((item, index) => { const path = `$.content.items[${index}]`; if (!known(item, new Set(["id", "prompt", "responseFieldId", "displayGuidance"]), path, errors)) return; safeId(item.id, `${path}.id`, errors); const field = safeId(item.responseFieldId, `${path}.responseFieldId`, errors); if (fieldIds.has(field)) issue(errors, `${path}.responseFieldId`, "must be unique"); fieldIds.add(field); safeText(item.prompt, `${path}.prompt`, errors, { required: approval }); if (item.displayGuidance !== undefined) { if (known(item.displayGuidance, new Set(["case", "punctuation"]), `${path}.displayGuidance`, errors)) { safeText(item.displayGuidance.case, `${path}.displayGuidance.case`, errors, { maximum: 120 }); safeText(item.displayGuidance.punctuation, `${path}.displayGuidance.punctuation`, errors, { maximum: 120 }); } } });
  if (approval && !items.length) issue(errors, "$.content.items", "must contain at least one response field");
}
function validateOpenAnswer(content, errors, approval) { if (known(content, new Set(["prompt", "responseGuidance"]), "$.content", errors)) { safeText(content.prompt, "$.content.prompt", errors, { required: approval }); safeText(content.responseGuidance, "$.content.responseGuidance", errors, { maximum: 1000 }); } }
function validateMedia(content, errors, approval, type, assetIds) {
  const fields = type === "media_audio" ? new Set(["assetId", "transcript", "posterAssetId"]) : new Set(["assetId", "captions", "transcript", "posterAssetId"]);
  if (!known(content, fields, "$.content", errors)) return;
  const id = safeId(content.assetId, "$.content.assetId", errors, { required: approval });
  if (id && !assetIds.has(id)) issue(errors, "$.content.assetId", "must reference an approved activity asset");
  safeText(content.transcript, "$.content.transcript", errors, { maximum: 12000 });
  safeText(content.captions, "$.content.captions", errors, { maximum: 12000 });
  const poster = safeId(content.posterAssetId, "$.content.posterAssetId", errors, { required: false }); if (poster && !assetIds.has(poster)) issue(errors, "$.content.posterAssetId", "must reference an approved activity asset");
}
function validateScrollable(content, errors, approval, assetIds) {
  if (!known(content, new Set(["blocks", "linkedAudioAssetId"]), "$.content", errors)) return;
  const blocks = array(content.blocks, "$.content.blocks", errors, 200); uniqueIds(blocks, "$.content.blocks", errors);
  blocks.forEach((block, index) => { const path = `$.content.blocks[${index}]`; if (!known(block, new Set(["id", "kind", "text", "assetId", "altText"]), path, errors)) return; safeId(block.id, `${path}.id`, errors); if (!new Set(["text", "image"]).has(block.kind)) issue(errors, `${path}.kind`, "is invalid"); if (block.kind === "text") safeText(block.text, `${path}.text`, errors, { required: approval, maximum: 12000 }); if (block.kind === "image") { const id = safeId(block.assetId, `${path}.assetId`, errors, { required: approval }); if (id && !assetIds.has(id)) issue(errors, `${path}.assetId`, "must reference an approved activity asset"); safeText(block.altText, `${path}.altText`, errors, { required: approval, maximum: 1000 }); } });
  if (approval && !blocks.length) issue(errors, "$.content.blocks", "must contain at least one block");
  const audio = safeId(content.linkedAudioAssetId, "$.content.linkedAudioAssetId", errors, { required: false }); if (audio && !assetIds.has(audio)) issue(errors, "$.content.linkedAudioAssetId", "must reference an approved activity asset");
}
function geometry(value, path, errors) {
  if (!known(value, new Set(["x", "y", "width", "height"]), path, errors)) return;
  for (const key of ["x", "y", "width", "height"]) if (!Number.isFinite(value[key])) issue(errors, `${path}.${key}`, "must be finite");
  if (value.x < 0 || value.y < 0 || value.width <= 0 || value.height <= 0 || value.x + value.width > 1 || value.y + value.height > 1) issue(errors, path, "must be positive normalized geometry inside the background");
}
function validateImageBacked(content, errors, approval, assetIds) {
  if (!known(content, new Set(["backgroundAssetId", "fields"]), "$.content", errors)) return;
  const background = safeId(content.backgroundAssetId, "$.content.backgroundAssetId", errors, { required: approval }); if (background && !assetIds.has(background)) issue(errors, "$.content.backgroundAssetId", "must reference an approved activity asset");
  const fields = array(content.fields, "$.content.fields", errors, 200); uniqueIds(fields, "$.content.fields", errors);
  fields.forEach((field, index) => { const path = `$.content.fields[${index}]`; if (!known(field, new Set(["id", "kind", "geometry", "label", "prompt", "options", "assetId", "text"]), path, errors)) return; safeId(field.id, `${path}.id`, errors); if (!IMAGE_BACKED_FIELD_KINDS.has(field.kind)) issue(errors, `${path}.kind`, "is invalid"); geometry(field.geometry, `${path}.geometry`, errors); safeText(field.label, `${path}.label`, errors, { required: approval && field.kind === "static_label", maximum: 1000 }); safeText(field.prompt, `${path}.prompt`, errors, { required: approval && ["single_choice", "text_input"].includes(field.kind), maximum: 4000 }); safeText(field.text, `${path}.text`, errors, { required: approval && field.kind === "linked_text_panel", maximum: 12000 }); if (field.kind === "single_choice") validateOptions(field.options, `${path}.options`, errors, { approval }); if (field.kind === "media_trigger") { const id = safeId(field.assetId, `${path}.assetId`, errors, { required: approval }); if (id && !assetIds.has(id)) issue(errors, `${path}.assetId`, "must reference an approved activity asset"); } });
  if (approval && !fields.length) issue(errors, "$.content.fields", "must contain at least one field");
}

export function createManualActivityId() { return `manual_activity_${randomUUID()}`; }
export function createManualNodeId(prefix = "node") {
  if (!/^[a-z][a-z0-9_]{0,31}$/i.test(prefix)) throw new Error("Manual node prefix is invalid");
  return `${prefix}_${randomUUID()}`;
}

export function validateManualActivity(activity, { hierarchyResolver, assetCatalog, requireApproval = activity?.status === "approved" } = {}) {
  const errors = []; const warnings = [];
  if (!known(activity, COMMON_FIELDS, "$", errors)) return { valid: false, errors, warnings };
  if (activity.schemaVersion !== MANUAL_ACTIVITY_SCHEMA_VERSION) issue(errors, "$.schemaVersion", "is unsupported");
  safeId(activity.activityId, "$.activityId", errors);
  if (!MANUAL_ACTIVITY_STATUSES.has(activity.status)) issue(errors, "$.status", "is invalid");
  if (!MANUAL_ACTIVITY_SOURCE_MODES.has(activity.sourceMode)) issue(errors, "$.sourceMode", "is invalid");
  if (!MANUAL_ACTIVITY_TYPES.has(activity.type)) issue(errors, "$.type", "is unsupported");
  safeId(activity.sourceCandidateId, "$.sourceCandidateId", errors, { required: activity.sourceMode === "detected_candidate_prefill" });
  safeId(activity.replacesCandidateId, "$.replacesCandidateId", errors, { required: false });
  validateHierarchy(activity.hierarchy, errors, { allowIncomplete: !requireApproval });
  safeText(activity.title, "$.title", errors, { required: requireApproval, maximum: 300 });
  safeText(activity.instructions, "$.instructions", errors, { maximum: 4000 });
  const assetIds = validateAssets(activity.assetReferences, errors);
  if (known(activity.presentation, PRESENTATION_FIELDS, "$.presentation", errors)) {
    if (!MANUAL_ACTIVITY_VIEWPORT_MODES.has(activity.presentation.viewportMode)) issue(errors, "$.presentation.viewportMode", "is invalid");
    if (!new Set(["responsive", "compact", "wide"]).has(activity.presentation.viewportSizeMode)) issue(errors, "$.presentation.viewportSizeMode", "is invalid");
    if (activity.presentation.backgroundReviewRequired !== undefined && typeof activity.presentation.backgroundReviewRequired !== "boolean") issue(errors, "$.presentation.backgroundReviewRequired", "must be boolean");
  }
  const validator = {
    multiple_choice: validateMultipleChoice, true_false: validateTrueFalse, typed_gap_fill: validateTypedGap,
    open_answer: validateOpenAnswer,
    media_audio: (value, out, approved) => validateMedia(value, out, approved, "media_audio", assetIds),
    media_video: (value, out, approved) => validateMedia(value, out, approved, "media_video", assetIds),
    scrollable_panel: (value, out, approved) => validateScrollable(value, out, approved, assetIds),
    image_backed: (value, out, approved) => validateImageBacked(value, out, approved, assetIds),
  }[activity.type];
  validator?.(activity.content, errors, requireApproval);
  const facts = array(activity.dependencyFactIds, "$.dependencyFactIds", errors, 500); facts.forEach((id, index) => safeId(id, `$.dependencyFactIds[${index}]`, errors));
  if (new Set(facts).size !== facts.length) issue(errors, "$.dependencyFactIds", "must be unique");
  if (!record(activity.dependencyEvidenceHashes)) issue(errors, "$.dependencyEvidenceHashes", "must be an object"); else { for (const [id, hash] of Object.entries(activity.dependencyEvidenceHashes)) { if (!facts.includes(id)) issue(errors, `$.dependencyEvidenceHashes.${id}`, "has no matching dependency"); if (!SHA256.test(String(hash))) issue(errors, `$.dependencyEvidenceHashes.${id}`, "must be SHA-256"); } for (const id of facts) if (!SHA256.test(String(activity.dependencyEvidenceHashes[id] || ""))) issue(errors, `$.dependencyEvidenceHashes.${id}`, "is required"); }
  isoDate(activity.prefilledAt, "$.prefilledAt", errors, { required: false });
  if (activity.prefilledFieldOrigins !== undefined && !record(activity.prefilledFieldOrigins)) issue(errors, "$.prefilledFieldOrigins", "must be an object"); else for (const [path, origin] of Object.entries(activity.prefilledFieldOrigins || {})) { safeText(path, "$.prefilledFieldOrigins key", errors, { required: true, maximum: 300 }); safeText(origin, `$.prefilledFieldOrigins.${path}`, errors, { required: true, maximum: 300 }); }
  if (typeof activity.stale !== "boolean") issue(errors, "$.stale", "must be boolean");
  const reasons = array(activity.staleReasons, "$.staleReasons", errors, 100); reasons.forEach((value, index) => safeId(value, `$.staleReasons[${index}]`, errors));
  isoDate(activity.createdAt, "$.createdAt", errors); isoDate(activity.updatedAt, "$.updatedAt", errors);
  if (requireApproval && activity.stale) issue(errors, "$.stale", "must be false for approval");
  if (requireApproval && activity.assetReferences.some((asset) => asset.stale)) issue(errors, "$.assetReferences", "must not contain stale assets for approval");
  if (typeof hierarchyResolver === "function") { const result = hierarchyResolver(activity.hierarchy); if (result !== true) issue(errors, "$.hierarchy", typeof result === "string" ? result : "is not owned by the selected component and Unit/group"); }
  if (assetCatalog) for (const asset of activity.assetReferences) { const current = assetCatalog.get?.(asset.assetId) || assetCatalog[asset.assetId]; if (!current || current.digest !== asset.digest || current.stale) issue(errors, `$.assetReferences.${asset.assetId}`, "is unavailable or stale"); }
  scanStudentBoundary(activity, "$", errors);
  if (!requireApproval && errors.length) warnings.push(...errors.map((value) => `Draft incomplete: ${value}`));
  return { valid: errors.length === 0, errors, warnings };
}

export function normalizeManualActivity(activity, options = {}) {
  const validation = validateManualActivity(activity, options);
  if (!validation.valid && options.allowIncomplete !== true) throw new Error(`Invalid manual activity: ${validation.errors.join("; ")}`);
  return sortJsonValue(structuredClone(activity));
}

export function serializeManualActivitiesArtifact(artifact) {
  const fields = new Set(["schemaVersion", "audience", "activities"]); const errors = [];
  if (!known(artifact, fields, "$", errors)) throw new Error(errors.join("; "));
  if (artifact.schemaVersion !== MANUAL_ACTIVITY_SCHEMA_VERSION || artifact.audience !== "student-safe-authoring" || !Array.isArray(artifact.activities)) throw new Error("Invalid manual activities artifact");
  const ids = new Set();
  for (const activity of artifact.activities) { const validation = validateManualActivity(activity, { requireApproval: activity.status === "approved" }); if (!validation.valid && activity.status !== "draft") throw new Error(`Invalid manual activity: ${validation.errors.join("; ")}`); if (ids.has(activity.activityId)) throw new Error(`Duplicate manual activity: ${activity.activityId}`); ids.add(activity.activityId); }
  return stableJson({ schemaVersion: MANUAL_ACTIVITY_SCHEMA_VERSION, audience: "student-safe-authoring", activities: [...artifact.activities].sort((a, b) => a.activityId.localeCompare(b.activityId)) });
}
