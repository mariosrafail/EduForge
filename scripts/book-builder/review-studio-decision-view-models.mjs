import { DecisionHistoryStore } from "../../lib/book-builder/decision-history.js";
import { stableDecisionId } from "../../lib/book-builder/decision-contracts.js";
import { effectiveReviewQueue } from "../../lib/book-builder/effective-reviews.js";
import {
  ACTIVITY_CONTENT_DECISION_KINDS,
  activityContentDecisionDefinition,
  detectedActivityContentValue,
  findActivityContentTarget,
  projectActivityContentField,
  projectEffectiveActivityContent,
} from "../../lib/book-builder/activity-content-overrides.js";

function list(value) { return Array.isArray(value) ? value : []; }

function decisionFor(project, kind, targetType, targetId) {
  let id;
  try { id = stableDecisionId(kind, targetType, targetId); } catch { return null; }
  return list(project.approvedDecisions).find((item) => item.id === id) || null;
}

function safeDecision(decision) {
  return {
    id: decision.id,
    kind: decision.kind,
    targetType: decision.targetType || null,
    targetId: decision.targetId || null,
    value: decision.value,
    approvalState: decision.approvalState,
    stale: decision.stale === true,
    staleReasons: list(decision.staleReasons),
    editorNote: String(decision.editorNote || "").slice(0, 2000),
    createdAt: decision.createdAt,
    updatedAt: decision.updatedAt,
    dependencyCount: list(decision.dependencyFactIds).length,
    resolvesReviewCount: list(decision.resolvesReviewIds).length,
    valuePresent: typeof decision.value === "string" ? decision.value.length > 0 : decision.value !== null && decision.value !== undefined,
    valuePreview: typeof decision.value === "string" ? decision.value.replaceAll(/\s+/g, " ").slice(0, 120) : null,
  };
}

function stateProjection(decision) {
  return decision ? { decision: safeDecision(decision), decisionState: decision.approvalState, stale: decision.stale === true } : { decision: null, decisionState: "unresolved", stale: false };
}

export function decisionSummary(project) {
  const decisions = list(project.approvedDecisions);
  const count = (state) => decisions.filter((item) => item.approvalState === state).length;
  return { total: decisions.length, approved: count("approved"), draft: count("draft"), rejected: count("rejected"), stale: decisions.filter((item) => item.stale).length, lastDecisionRevision: decisions.length ? project.revision : null };
}

function reviewSummary(effective) {
  return {
    total: effective.summary.totalGenerated,
    blocking: effective.summary.blockingOpen,
    nonBlocking: Math.max(0, effective.summary.open - effective.summary.blockingOpen),
    open: effective.summary.open,
    resolved: effective.summary.resolved,
    deferred: effective.summary.deferred,
    notApplicable: effective.summary.notApplicable,
    acceptedRisk: effective.summary.acceptedRisk,
    stale: effective.summary.stale,
    blockingOpen: effective.summary.blockingOpen,
  };
}

function decorateReviewItem(item, effectiveById, decisionById) {
  const state = effectiveById.get(item.id);
  return state ? { ...item, generatedStatus: state.generatedStatus, effectiveStatus: state.effectiveStatus, resolvingDecisionId: state.resolvingDecisionId, decision: state.resolvingDecisionId ? safeDecision(decisionById.get(state.resolvingDecisionId)) : null, status: state.effectiveStatus, canDecide: true, targetId: item.id } : item;
}

export async function decorateDecisionView(reader, projectId, view, payload) {
  const project = await reader.projectContext(projectId);
  const decisions = list(project.approvedDecisions);
  if (view === "overview") {
    const queue = await reader.readArtifact(projectId, "reviews", { optional: true, project });
    const effective = effectiveReviewQueue(queue, decisions);
    return { ...payload, decisions: decisionSummary(project), project: { ...payload.project, reviewSummary: { ...payload.project.reviewSummary, ...reviewSummary(effective) } }, scan: { ...payload.scan, approvedDecisionCount: decisions.filter((item) => item.approvalState === "approved").length, decisionCount: decisions.length } };
  }
  if (view === "components") return { ...payload, items: list(payload.items).map((item) => {
    const decision = decisionFor(project, "component_role", "component", item.candidateId);
    return { ...item, detectedRole: item.proposedSemanticRole, effectiveRole: decision?.value || item.proposedSemanticRole, ...stateProjection(decision), decisionKinds: ["component_role"] };
  }) };
  if (view === "pages") {
    const decoratePage = (item) => {
      if (!item) return item;
      const printed = decisionFor(project, "printed_page_number", "page", item.candidateId);
      const variant = decisionFor(project, "canonical_page_variant", "page", item.candidateId);
      return { ...item, printedPageDecision: stateProjection(printed), canonicalVariantDecision: stateProjection(variant), effectivePrintedPage: printed?.value || item.printedPage.value, effectiveCanonicalQuality: variant?.value || item.canonicalQuality, decisionKinds: ["printed_page_number", "canonical_page_variant"], hotspots: list(item.hotspots).map((hotspot) => ({ ...hotspot, ...stateProjection(decisionFor(project, "hotspot_candidate_disposition", "hotspot", hotspot.candidateId)), decisionKinds: ["hotspot_candidate_disposition"] })) };
    };
    return { ...payload, items: list(payload.items).map(decoratePage), selected: decoratePage(payload.selected) };
  }
  if (view === "activities") {
    const artifact = await reader.readArtifact(projectId, "activities", { optional: true, project });
    const candidates = new Map(list(artifact?.candidates).map((item) => [item.activityCandidateId, item]));
    const decorateActivity = (item) => {
      if (!item) return item;
      const type = decisionFor(project, "activity_type", "activity", item.activityId);
      const disposition = decisionFor(project, "activity_disposition", "activity", item.activityId);
      const audience = decisionFor(project, "activity_audience_policy", "activity", item.activityId);
      const candidate = item.questions ? item : candidates.get(item.activityId);
      const content = candidate ? projectEffectiveActivityContent(candidate, decisions) : null;
      return { ...item, detectedType: item.normalizedType, effectiveType: type?.value || item.normalizedType, detectedDisposition: item.disposition, effectiveDisposition: disposition?.value || item.disposition, audiencePolicy: audience?.value || "student_and_teacher", decisions: { type: stateProjection(type), disposition: stateProjection(disposition), audience: stateProjection(audience) }, decisionKinds: ["activity_type", "activity_disposition", "activity_audience_policy"], effectiveContentCompleteness: content?.completeness || item.contentCompleteness, contentCounts: content?.counts || null, ...(item.questions && content ? { content } : {}) };
    };
    return { ...payload, items: list(payload.items).map(decorateActivity), selected: decorateActivity(payload.selected) };
  }
  if (view === "reviews") {
    const queue = await reader.readArtifact(projectId, "reviews", { optional: true, project });
    const effective = effectiveReviewQueue(queue, decisions);
    const byId = new Map(effective.items.map((item) => [item.id, item]));
    const decisionById = new Map(decisions.map((item) => [item.id, item]));
    const activities = await reader.readArtifact(projectId, "activities", { optional: true, project });
    const decorate = (item) => {
      const decorated = decorateReviewItem(item, byId, decisionById);
      if (!ACTIVITY_CONTENT_DECISION_KINDS.has(item.suggestedDecisionKind) || !item.targetId) return decorated;
      const target = findActivityContentTarget(activities, item.suggestedDecisionKind, item.targetId);
      if (!target) return decorated;
      const definition = activityContentDecisionDefinition(item.suggestedDecisionKind);
      return { ...decorated, contentOverride: projectActivityContentField({
        kind: item.suggestedDecisionKind, targetId: item.targetId, detectedValue: detectedActivityContentValue(target),
        availability: target.node[definition.availability] || "raster-only-or-missing", decisions,
      }), editorLink: `#/projects/${projectId}/activities?activityId=${target.activity.activityCandidateId}` };
    };
    return { ...payload, summary: { ...payload.summary, ...reviewSummary(effective) }, groups: list(payload.groups).map((group) => ({ ...group, samples: list(group.samples).map(decorate) })), selectedGroup: payload.selectedGroup ? { ...payload.selectedGroup, items: list(payload.selectedGroup.items).map(decorate) } : null };
  }
  return payload;
}

export async function decisionsAndHistoryView(reader, projectId) {
  const project = await reader.projectContext(projectId);
  const projectDirectory = await reader.projectDirectory(projectId);
  const history = await new DecisionHistoryStore(projectDirectory).summaries();
  return { revision: project.revision, summary: decisionSummary(project), decisions: list(project.approvedDecisions).map(safeDecision), history };
}

export function invalidateDecisionViewCache(reader, projectId) {
  for (const key of reader.cache.keys()) if (key.startsWith(`${projectId}:`)) reader.cache.delete(key);
}
