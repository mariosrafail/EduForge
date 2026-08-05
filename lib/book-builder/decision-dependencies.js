import { createHash } from "node:crypto";

import {
  ACTIVITY_AUDIENCE_POLICIES,
  ACTIVITY_DISPOSITIONS,
  COMPONENT_ROLES,
  DECISION_SCHEMA_VERSION,
  HOTSPOT_DISPOSITIONS,
  REVIEW_DISPOSITIONS,
  normalizeDecisionValue,
  stableDecisionId,
} from "./decision-contracts.js";

function list(value) { return Array.isArray(value) ? value : []; }
function digest(...parts) { return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 24); }
export function componentDecisionTargetId(component) { return `component_${digest(component.sourceRelativePath || component.name)}`; }
export function pageDecisionTargetId(spread) { return `page_${digest(spread.component, spread.unit, spread.part)}`; }

function targetTypeForKind(kind) {
  if (kind === "component_role") return "component";
  if (kind === "printed_page_number" || kind === "canonical_page_variant") return "page";
  if (kind.startsWith("activity_")) return "activity";
  if (kind === "hotspot_candidate_disposition") return "hotspot";
  if (kind === "review_disposition") return "review";
  throw new Error(`Unsupported decision kind: ${kind}`);
}

function factMatchesTarget(fact, target, kind) {
  if (kind === "component_role") return fact.kind === "component_structure_candidate" && fact.sourceLocator === target.sourceRelativePath;
  if (kind === "printed_page_number" || kind === "canonical_page_variant") {
    return ["part_page_candidate", "page_asset_variant"].includes(fact.kind)
      && String(fact.value?.component) === String(target.component)
      && Number(fact.value?.unit) === Number(target.unit)
      && Number(fact.value?.part) === Number(target.part);
  }
  if (kind.startsWith("activity_")) return ["activity_signature_candidate", "activity_disposition_candidate", "activity_content_candidate"].includes(fact.kind)
    && fact.value?.activityCandidateId === target.activityCandidateId;
  if (kind === "hotspot_candidate_disposition") return fact.kind === "hotspot_geometry_candidate" && fact.sourceLocator === target.part.sourceRelativePath;
  if (kind === "review_disposition") return fact.kind === "review_issue_dependency" && fact.value?.reviewId === target.id;
  return false;
}

function relevantReviews(queue, target, kind, dependencyFactIds) {
  if (kind === "review_disposition") return [target];
  const dependencies = new Set(dependencyFactIds);
  return list(queue?.items).filter((item) => {
    if (list(item.dependencyFactIds).some((id) => dependencies.has(id))) return true;
    if (kind === "component_role") return item.category === "component" && item.sourceRelativeLocator === target.sourceRelativePath;
    if (kind === "printed_page_number" || kind === "canonical_page_variant") {
      const locators = new Set(list(target.variants).map((item) => item.sourceRelativePath));
      return ["page", "page_number"].includes(item.category) && locators.has(item.sourceRelativeLocator);
    }
    if (kind.startsWith("activity_")) return list(target.reviewItemIds).includes(item.id);
    if (kind === "hotspot_candidate_disposition") return item.category === "hotspot" && item.sourceRelativeLocator === target.part.sourceRelativePath;
    return false;
  });
}

function resolveRawTarget(artifacts, kind, targetId) {
  if (kind === "component_role") return list(artifacts.components?.components).find((item) => componentDecisionTargetId(item) === targetId);
  if (kind === "printed_page_number" || kind === "canonical_page_variant") return list(artifacts.pages?.spreads).find((item) => pageDecisionTargetId(item) === targetId);
  if (kind.startsWith("activity_")) return list(artifacts.activities?.candidates).find((item) => item.activityCandidateId === targetId);
  if (kind === "hotspot_candidate_disposition") {
    for (const part of list(artifacts.hotspots?.parts)) {
      const candidate = [...list(part.hotspots), ...list(part.quads)].find((item) => item.id === targetId);
      if (candidate) return { ...candidate, part };
    }
  }
  if (kind === "review_disposition") return list(artifacts.reviews?.items).find((item) => item.id === targetId);
  return null;
}

function allowedValuesForTarget(kind, target, artifacts) {
  if (kind === "component_role") return [...COMPONENT_ROLES];
  if (kind === "canonical_page_variant") return [...new Set(list(target.variants).map((item) => item.quality).filter(Boolean))].sort();
  if (kind === "activity_type") return [...new Set(list(artifacts.activities?.candidates).map((item) => item.normalizedCandidateType).filter(Boolean))].sort();
  if (kind === "activity_disposition") return [...ACTIVITY_DISPOSITIONS];
  if (kind === "activity_audience_policy") return [...ACTIVITY_AUDIENCE_POLICIES];
  if (kind === "hotspot_candidate_disposition") return [...HOTSPOT_DISPOSITIONS];
  if (kind === "review_disposition") return [...REVIEW_DISPOSITIONS];
  return null;
}

function targetSummary(target, kind, targetId) {
  if (kind === "component_role") return { targetId, targetType: "component", label: target.name, detectedValue: target.proposedSemanticRole || null, sourceRelativeLocator: target.sourceRelativePath };
  if (kind === "printed_page_number" || kind === "canonical_page_variant") return {
    targetId, targetType: "page", label: `${target.component} · Unit ${target.unit} · Part ${target.part}`,
    detectedValue: kind === "printed_page_number" ? target.printedPageCandidate?.numericCandidate ?? null : target.canonicalQualityCandidate ?? null,
    sourceRelativeLocator: list(target.variants)[0]?.sourceRelativePath || `${target.component}/unit-${target.unit}/part-${target.part}`,
  };
  if (kind.startsWith("activity_")) return {
    targetId, targetType: "activity", label: target.activityCandidateId,
    detectedValue: kind === "activity_type" ? target.normalizedCandidateType : kind === "activity_disposition" ? target.disposition : "student_and_teacher",
    sourceRelativeLocator: target.sourceObjectLocator,
  };
  if (kind === "hotspot_candidate_disposition") return { targetId, targetType: "hotspot", label: target.id, detectedValue: target.reviewStatus || "unapproved", sourceRelativeLocator: target.part.sourceRelativePath };
  return { targetId, targetType: "review", label: target.reasonCode, detectedValue: target.status || "open", sourceRelativeLocator: target.sourceRelativeLocator };
}

export function resolveDecisionContext({ project, artifacts, kind, targetId, value }) {
  const target = resolveRawTarget(artifacts, kind, targetId);
  if (!target) throw new Error("Decision target is not available");
  const targetType = targetTypeForKind(kind);
  const allowedValues = allowedValuesForTarget(kind, target, artifacts);
  const normalizedValue = normalizeDecisionValue(kind, value, { allowedValues });
  const targetFacts = list(project.detectedFacts).filter((fact) => factMatchesTarget(fact, target, kind));
  const targetFactIds = targetFacts.map((fact) => fact.id);
  const reviews = relevantReviews(artifacts.reviews, target, kind, targetFactIds);
  const reviewFactIds = list(project.detectedFacts)
    .filter((fact) => fact.kind === "review_issue_dependency" && reviews.some((item) => item.id === fact.value?.reviewId))
    .map((fact) => fact.id);
  const dependencyFactIds = [...new Set([...targetFactIds, ...reviews.flatMap((item) => list(item.dependencyFactIds)), ...reviewFactIds])]
    .filter((id) => list(project.detectedFacts).some((fact) => fact.id === id)).sort();
  if (!dependencyFactIds.length) throw new Error("Decision target has no current evidence dependencies");
  const dependencyEvidenceHashes = Object.fromEntries(dependencyFactIds.map((id) => [id, project.detectedFacts.find((fact) => fact.id === id).evidenceHash]));
  const id = stableDecisionId(kind, targetType, targetId);
  return {
    id,
    kind,
    targetType,
    targetId,
    value: normalizedValue,
    allowedValues,
    dependencyFactIds,
    dependencyEvidenceHashes,
    resolvesReviewIds: reviews.map((item) => item.id).sort(),
    targetSummary: targetSummary(target, kind, targetId),
    currentDecision: list(project.approvedDecisions).find((item) => item.id === id) || null,
  };
}

export function createResolvedDecision(context, input, now = new Date().toISOString()) {
  const current = context.currentDecision;
  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    id: context.id,
    kind: context.kind,
    targetType: context.targetType,
    targetId: context.targetId,
    value: context.value,
    dependencyFactIds: context.dependencyFactIds,
    dependencyEvidenceHashes: context.dependencyEvidenceHashes,
    resolvesReviewIds: context.resolvesReviewIds,
    approvalState: input.approvalState,
    stale: false,
    staleReasons: [],
    editorNote: input.editorNote,
    createdAt: current?.createdAt || now,
    updatedAt: now,
  };
}
