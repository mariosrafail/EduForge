import { createManualActivityId, createManualNodeId } from "./manual-activity-contract.js";

function list(value) { return Array.isArray(value) ? value : []; }
function safeText(value, maximum) { return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maximum) : ""; }
function proposedType(candidate) {
  const value = String(candidate.normalizedCandidateType || "").replaceAll("-", "_");
  if (/multiple.*choice|sentence.*choice/.test(value)) return "multiple_choice";
  if (/true.*false/.test(value)) return "true_false";
  if (/short.*answer|write.*response|gap/.test(value) || list(candidate.responseFields).length) return "typed_gap_fill";
  if (list(candidate.mediaCandidateIds).length && /video/i.test(list(candidate.mediaCandidateIds)[0])) return "media_video";
  if (list(candidate.mediaCandidateIds).length) return "media_audio";
  return "open_answer";
}
function factsForCandidate(candidate, detectedFacts) {
  const locator = String(candidate.sourceObjectLocator || "");
  return list(detectedFacts).filter((fact) => String(fact.sourceLocator || "").startsWith(locator) || list(candidate.dependencyFactIds).includes(fact.id));
}

export function prefillManualActivityFromDetectedCandidate({ candidate, hierarchy, detectedFacts = [], now = new Date().toISOString() } = {}) {
  if (!candidate?.activityCandidateId) throw new Error("Detected candidate is required");
  const type = proposedType(candidate); const origins = {}; let content;
  if (type === "multiple_choice") content = { questions: list(candidate.questions).map((question, questionIndex) => {
    const questionId = createManualNodeId("question"); origins[`content.questions.${questionId}`] = question.id || `detected-question-${questionIndex}`;
    return { id: questionId, prompt: safeText(question.prompt, 4000), options: list(question.options).map((option, optionIndex) => { const optionId = createManualNodeId("option"); origins[`content.options.${optionId}`] = option.id || `detected-option-${questionIndex}-${optionIndex}`; return { id: optionId, text: safeText(option.text, 1000) }; }) };
  }) };
  else if (type === "true_false") content = { statements: list(candidate.questions).map((question, index) => { const id = createManualNodeId("statement"); origins[`content.statements.${id}`] = question.id || `detected-statement-${index}`; return { id, prompt: safeText(question.prompt, 4000) }; }) };
  else if (type === "typed_gap_fill") {
    const source = list(candidate.responseFields).length ? candidate.responseFields : candidate.questions;
    content = { items: source.map((item, index) => { const id = createManualNodeId("item"); const responseFieldId = createManualNodeId("field"); origins[`content.items.${id}`] = item.id || `detected-field-${index}`; return { id, prompt: safeText(item.prompt, 4000), responseFieldId, displayGuidance: { case: "", punctuation: "" } }; }) };
  } else if (type === "media_audio" || type === "media_video") content = { assetId: "", transcript: "" };
  else content = { prompt: safeText(candidate.instructions || candidate.questions?.[0]?.prompt, 4000), responseGuidance: "" };
  const dependencies = factsForCandidate(candidate, detectedFacts);
  return {
    schemaVersion: "1.0", activityId: createManualActivityId(), status: "draft", sourceMode: "detected_candidate_prefill", sourceCandidateId: candidate.activityCandidateId,
    hierarchy, type, title: safeText(candidate.displayTitle, 300), instructions: safeText(candidate.instructions, 4000), content,
    presentation: { viewportMode: "fit", viewportSizeMode: "responsive", backgroundReviewRequired: false }, assetReferences: [],
    dependencyFactIds: dependencies.map((fact) => fact.id).sort(), dependencyEvidenceHashes: Object.fromEntries(dependencies.map((fact) => [fact.id, fact.evidenceHash]).sort(([a], [b]) => a.localeCompare(b))),
    prefilledAt: now, prefilledFieldOrigins: origins, stale: false, staleReasons: [], createdAt: now, updatedAt: now,
  };
}

export function refreshManualActivityStaleness(activity, { detectedFacts = [], assetCatalog = new Map() } = {}) {
  const currentFacts = new Map(detectedFacts.map((fact) => [fact.id, fact.evidenceHash])); const reasons = [];
  for (const factId of activity.dependencyFactIds || []) if (!currentFacts.has(factId)) reasons.push(`dependency_removed:${factId}`); else if (currentFacts.get(factId) !== activity.dependencyEvidenceHashes?.[factId]) reasons.push(`dependency_changed:${factId}`);
  for (const asset of activity.assetReferences || []) { const current = assetCatalog.get?.(asset.assetId); if (!current) reasons.push(`asset_removed:${asset.assetId}`); else if (current.digest !== asset.digest || current.stale) reasons.push(`asset_changed:${asset.assetId}`); }
  return { ...structuredClone(activity), stale: reasons.length > 0, staleReasons: reasons.sort() };
}
