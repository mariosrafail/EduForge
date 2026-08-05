import { createHash } from "node:crypto";
import path from "node:path";

import { hierarchyOwnership } from "./hierarchy-view-models.mjs";
import { safeActivityContentDetail } from "./review-studio-activity-content.mjs";
import { ReviewStudioError, safeConfidence, safeCount, safeRelativeLocator, safeText } from "./review-studio-security.mjs";

const RASTER_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const list = (value) => Array.isArray(value) ? value : [];
const record = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};

function opaqueId(...parts) {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
}

export function pageCandidateId(spread) {
  const parts = spread.sourceBookRoot && spread.sourceBookRoot !== "book1"
    ? [spread.sourceBookRoot, spread.component, spread.unit, spread.part]
    : [spread.component, spread.unit, spread.part];
  return `page_${opaqueId(...parts).slice(0, 24)}`;
}

function previewId(projectId, locator, fingerprint) {
  return `preview_${opaqueId(projectId, "source", locator, fingerprint).slice(0, 24)}`;
}

function safeGeometry(value) {
  const geometry = record(value);
  const result = {};
  for (const key of ["x", "y", "width", "height"]) if (Number.isFinite(geometry[key])) result[key] = Number(geometry[key]);
  return Object.keys(result).length === 4 ? result : null;
}

function safeNormalizedGeometry(value) {
  const geometry = record(value);
  const values = [geometry.xPct, geometry.yPct, geometry.widthPct, geometry.heightPct];
  if (!values.every(Number.isFinite)) return null;
  const [xPct, yPct, widthPct, heightPct] = values.map(Number);
  if (xPct < 0 || yPct < 0 || widthPct <= 0 || heightPct <= 0 || xPct + widthPct > 100.000001 || yPct + heightPct > 100.000001) return null;
  return { x: xPct / 100, y: yPct / 100, width: widthPct / 100, height: heightPct / 100 };
}

function hotspotPartFor(spread, hotspotArtifact) {
  return list(hotspotArtifact?.parts).find((part) => (
    String(part.sourceBookRoot || "book1") === String(spread.sourceBookRoot || "book1")
    && String(part.component) === String(spread.component)
    && Number(part.unit) === Number(spread.unit)
    && Number(part.part) === Number(spread.part)
  ));
}

function safeHotspot(item, ownership, ownerPageKey) {
  return {
    candidateId: safeText(item.id, "Unavailable", 128),
    targetObject: Number.isSafeInteger(item.candidateTargetObject) ? item.candidateTargetObject : null,
    confidence: safeConfidence(item.mappingConfidence),
    geometry: safeNormalizedGeometry(item.normalizedGeometry),
    reviewState: safeText(item.reviewStatus, "unapproved", 80),
    ownerPageKey,
    componentKey: ownership.componentKey,
    unitKey: ownership.unitKey,
  };
}

export function safePage(projectId, spread, hotspotArtifact, hierarchy, includeHotspots = false) {
  const variants = list(spread.variants).flatMap((variant) => {
    const locator = safeRelativeLocator(variant.sourceRelativePath, "");
    const sha256 = /^[a-f0-9]{64}$/i.test(String(variant.sha256 || "")) ? String(variant.sha256).toLowerCase() : "";
    if (!locator || !sha256 || !RASTER_TYPES.has(path.extname(locator).toLowerCase())) return [];
    return [{
      quality: safeText(variant.quality, "Unknown", 20),
      width: safeCount(variant.width),
      height: safeCount(variant.height),
      byteSize: safeCount(variant.byteSize),
      previewId: previewId(projectId, locator, sha256),
    }];
  });
  const ownership = hierarchyOwnership(hierarchy, spread);
  const pageKey = safeText(spread.pageKey, "", 128) || ownership.unitKey && `page:${ownership.unitKey}:part-${safeCount(spread.part)}` || null;
  const part = hotspotPartFor(spread, hotspotArtifact);
  const hotspotItems = [...list(part?.hotspots), ...list(part?.quads)].map((item) => safeHotspot(item, ownership, pageKey));
  const unresolved = hotspotItems.filter((item) => !item.geometry).length;
  const printed = record(spread.printedPageCandidate);
  return {
    candidateId: pageCandidateId(spread), pageKey, hierarchy: ownership,
    component: safeText(spread.component, "Unknown", 120), unit: safeCount(spread.unit), part: safeCount(spread.part),
    sourceRelativeIdentity: `${safeText(spread.component, "component", 120)}/unit-${safeCount(spread.unit)}/part-${safeCount(spread.part)}`,
    canonicalQuality: safeText(spread.canonicalQualityCandidate, "Unavailable", 20), variants,
    printedPage: { value: Number.isSafeInteger(printed.numericCandidate) ? printed.numericCandidate : null, confidence: safeConfidence(printed.confidence), direct: printed.direct === true },
    hotspotCount: hotspotItems.length, exactCardinality: part?.exactCardinality === true, unresolvedHotspotCount: unresolved,
    reviewRequired: unresolved > 0 || part?.exactCardinality !== true,
    ...(includeHotspots ? { hotspots: hotspotItems } : {}),
  };
}

function geometrySummary(items) {
  const values = list(items);
  return { count: values.length, withGeometry: values.filter((item) => safeGeometry(item.geometry)).length };
}

export function safeActivityListItem(candidate, hierarchy) {
  const questions = list(candidate.questions);
  const ownership = hierarchyOwnership(hierarchy, candidate);
  return {
    activityId: safeText(candidate.activityCandidateId, "Unavailable", 128),
    component: safeText(candidate.componentCandidateId, "Unavailable", 160), componentKey: ownership.componentKey, unitKey: ownership.unitKey, hierarchy: ownership,
    unit: safeCount(candidate.unit), part: safeCount(candidate.part), object: safeCount(candidate.object), sourceRelativeLocator: safeRelativeLocator(candidate.sourceObjectLocator),
    normalizedType: safeText(candidate.normalizedCandidateType, "unresolved", 100),
    publisherTypes: list(candidate.publisherExerciseTypes).map((item) => safeText(item, "", 80)).filter(Boolean).slice(0, 20),
    disposition: safeText(candidate.disposition, "unresolved", 100), runtimeSupport: safeText(candidate.runtimeSupportStatus, "unresolved", 100), contentCompleteness: safeText(candidate.contentCompleteness, "unresolved", 100),
    questionCount: questions.length, optionCount: questions.reduce((sum, question) => sum + list(question.options).length, 0), responseFieldCount: list(candidate.responseFields).length,
    draggableCount: list(candidate.draggables).length, targetCount: list(candidate.targets).length, mediaCount: list(candidate.mediaCandidateIds).length, hotspotCount: list(candidate.hotspotCandidateIds).length, reviewCount: list(candidate.reviewItemIds).length,
    rasterGap: String(candidate.contentCompleteness || "").includes("raster") || String(candidate.disposition || "").includes("raster"),
    hasStructuredPrompt: questions.some((question) => typeof question.prompt === "string" && question.prompt.trim()),
    hasStructuredOptions: questions.some((question) => list(question.options).some((option) => typeof option.text === "string" && option.text.trim())),
  };
}

export function safeActivityDetail(candidate, hierarchy) {
  return {
    ...safeActivityListItem(candidate, hierarchy), ...safeActivityContentDetail(candidate, safeGeometry),
    draggableLabels: list(candidate.draggables).map((entry) => safeText(entry.label, "", 500)).filter(Boolean).slice(0, 100),
    targetLabels: list(candidate.targets).map((entry) => safeText(entry.label, "", 500)).filter(Boolean).slice(0, 100),
    responseFieldGeometry: geometrySummary(candidate.responseFields),
    geometry: { draggables: geometrySummary(candidate.draggables), targets: geometrySummary(candidate.targets) },
    mediaReferences: list(candidate.mediaCandidateIds).map((item) => safeRelativeLocator(item)).slice(0, 100),
    hotspotReferences: list(candidate.hotspotCandidateIds).map((item) => safeRelativeLocator(item)).slice(0, 100),
    pageReference: safeText(candidate.pageCandidateId, "Unavailable", 180),
    reviewIds: list(candidate.reviewItemIds).map((item) => safeText(item, "", 128)).filter(Boolean).slice(0, 200),
    sourceEvidenceDigests: list(candidate.sourceEvidenceDigests).slice(0, 100).map((evidence) => ({ sourceRelativeLocator: safeRelativeLocator(evidence.sourceRelativePath), sha256: /^[a-f0-9]{64}$/i.test(String(evidence.sourceSha256 || "")) ? String(evidence.sourceSha256).toLowerCase() : null })),
  };
}

export function safeReviewItem(item, hierarchy = null) {
  return {
    id: safeText(item.id, "Unavailable", 128), reasonCode: safeText(item.reasonCode, "unresolved", 128), category: safeText(item.category, "unresolved", 128), severity: safeText(item.severity, "review", 80),
    blocking: item.blocking === true, explanation: safeText(item.explanation, "Review is required.", 1200), sourceRelativeLocator: safeRelativeLocator(item.sourceRelativeLocator),
    dependencyCount: list(item.dependencyFactIds).length, suggestedDecisionKind: safeText(item.suggestedDecisionKind, "future_manual_review", 128),
    targetId: item.targetId ? safeText(item.targetId, "", 128) : null, activityCandidateId: item.activityCandidateId ? safeText(item.activityCandidateId, "", 128) : null,
    status: safeText(item.status, "unresolved", 80), hierarchy: hierarchy ? hierarchyOwnership(hierarchy, item) : null,
  };
}

export function reviewGroupValue(item, mode, hierarchy) {
  if (mode === "reason") return safeText(item.reasonCode, "unresolved", 128);
  if (mode === "category") return safeText(item.category, "unresolved", 128);
  if (mode === "severity") return safeText(item.severity, "review", 80);
  if (mode === "decision") return safeText(item.suggestedDecisionKind, "future_manual_review", 128);
  if (mode === "component") return hierarchyOwnership(hierarchy, item).componentKey || "unresolved";
  if (mode === "unit") return hierarchyOwnership(hierarchy, item).unitKey || "unresolved";
  throw new ReviewStudioError("invalid_review_group", 400);
}
