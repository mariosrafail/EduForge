import { attachManualActivityAsset, createManualActivityAssetCatalog, publicManualActivityAssetCatalog } from "../../lib/book-builder/manual-activity-assets.js";
import { createManualHierarchyResolver, manualHierarchyFromOwnership } from "../../lib/book-builder/manual-activity-hierarchy.js";
import { prefillManualActivityFromDetectedCandidate, refreshManualActivityStaleness } from "../../lib/book-builder/manual-activity-prefill.js";
import { ManualActivityStore } from "../../lib/book-builder/manual-activity-store.js";
import { ManualActivityTransactionService } from "../../lib/book-builder/manual-activity-transaction.js";
import { validateManualActivity } from "../../lib/book-builder/manual-activity-contract.js";
import { effectiveHierarchyView, hierarchyOwnership } from "./hierarchy-view-models.mjs";
import { pageCandidateId } from "./review-studio-hierarchy-projections.mjs";
import { readManualActivityAssetContent } from "./manual-activity-asset-content.mjs";
import { readJsonBody } from "./review-studio-mutation-api.mjs";
import { BOOK_BUILDER_WRITE_HEADER, ReviewStudioError, equalSessionToken, safeText } from "./review-studio-security.mjs";

function list(value) { return Array.isArray(value) ? value : []; }
function strictBody(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !allowed.has(key))) throw new ReviewStudioError("invalid_manual_activity_mutation", 400);
  return value;
}
function publicActivity(activity) {
  return structuredClone(activity);
}
function filterActivities(activities, query) {
  const search = safeText(query.get("search"), "", 100).toLowerCase();
  const type = safeText(query.get("type"), "", 80); const status = safeText(query.get("status"), "", 80); const sourceMode = safeText(query.get("sourceMode"), "", 80); const stale = query.get("stale");
  return activities.filter((item) => (!search || `${item.title} ${item.instructions} ${item.activityId}`.toLowerCase().includes(search)) && (!type || item.type === type) && (!status || item.status === status) && (!sourceMode || item.sourceMode === sourceMode) && (stale === null || item.stale === (stale === "true")));
}
function pagination(items, query) {
  const pageSize = Math.min(100, Math.max(1, Number(query.get("pageSize")) || 25)); const pageCount = Math.max(1, Math.ceil(items.length / pageSize)); const page = Math.min(pageCount, Math.max(1, Number(query.get("page")) || 1));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: items.length, pageCount } };
}

async function context(reader, projectId) {
  const project = await reader.projectContext(projectId); const projectDirectory = await reader.projectDirectory(projectId);
  const [hierarchy, pages, hotspots, media, detected] = await Promise.all([
    effectiveHierarchyView(reader, projectId, project), reader.readArtifact(projectId, "pages", { optional: true, project }),
    reader.readArtifact(projectId, "hotspots", { optional: true, project }), reader.readArtifact(projectId, "media", { optional: true, project }),
    reader.readArtifact(projectId, "activities", { optional: true, project }),
  ]);
  const pageOwners = list(pages?.spreads).map((spread) => ({ candidateId: pageCandidateId(spread), sourceIdentity: `${spread.component}/${spread.unit}/part${spread.part}`, part: spread.part, hierarchy: hierarchyOwnership(hierarchy, spread) }));
  const hotspotOwners = list(hotspots?.parts).flatMap((part) => { const owner = hierarchyOwnership(hierarchy, part); return [...list(part.hotspots), ...list(part.quads)].map((item) => ({ candidateId: item.id, componentKey: owner.componentKey, unitKey: owner.unitKey })); });
  const assetCatalog = createManualActivityAssetCatalog({ pages, media });
  return { project, projectDirectory, hierarchy, pages, hotspots, media, detected, pageOwners, assetCatalog, hierarchyResolver: createManualHierarchyResolver(hierarchy, { pages: pageOwners, hotspots: hotspotOwners }) };
}

function hierarchyOptions(hierarchy) {
  return hierarchy.components.map((component) => ({ sourceBookRootKey: component.sourceBookRootId, componentKey: component.componentKey, label: component.displayName, effectiveComponentRole: component.effectiveRole, groups: component.unitGroups.map((group) => ({ unitGroupKey: group.unitKey, unitGroupNumber: group.sourceNumber, label: group.displayLabel })) }));
}

function candidatePageId(candidate, ownership, pageOwners) {
  return pageOwners.find((page) => page.candidateId === candidate.pageCandidateId || page.sourceIdentity === candidate.pageCandidateId)?.candidateId
    || pageOwners.find((page) => page.hierarchy.componentKey === ownership.componentKey && page.hierarchy.unitKey === ownership.unitKey && Number(page.part) === Number(candidate.part))?.candidateId
    || null;
}

function detectedOptions(detected, hierarchy, pageOwners) {
  return list(detected?.candidates).map((candidate) => { const ownership = hierarchyOwnership(hierarchy, candidate); return { activityCandidateId: candidate.activityCandidateId, title: candidate.displayTitle || candidate.instructions || candidate.activityCandidateId, type: candidate.normalizedCandidateType, hierarchy: ownership.resolved ? manualHierarchyFromOwnership(ownership, { part: candidate.part, pageCandidateId: candidatePageId(candidate, ownership, pageOwners), hotspotCandidateIds: candidate.hotspotCandidateIds }) : null, rasterGap: String(candidate.contentCompleteness || candidate.disposition).includes("raster") }; }).filter((item) => item.hierarchy);
}

export function createManualActivityDispatcher({ workspace, writeEnabled, writeToken, sessionId, getReader, invalidateProject, hooks } = {}) {
  const requireWrite = (request) => { if (!writeEnabled) throw new ReviewStudioError("write_mode_disabled", 403); if (!equalSessionToken(request.headers[BOOK_BUILDER_WRITE_HEADER], writeToken)) throw new ReviewStudioError("invalid_write_capability", 401); };
  async function transaction(current, projectId) { return new ManualActivityTransactionService({ workspace, projectDirectory: current.projectDirectory, projectId, sessionId, hooks, hierarchyResolver: current.hierarchyResolver, assetCatalog: current.assetCatalog }); }
  async function dispatch(request, segments, parsed) {
    if (segments[0] !== "projects" || !["manual-activities", "manual-assets", "manual-solutions", "manual-activity-history"].includes(segments[2])) return null;
    const projectId = segments[1]; const reader = await getReader(); const current = await context(reader, projectId); const store = new ManualActivityStore(current.projectDirectory);
    if (segments[2] === "manual-assets") {
      if (request.method !== "GET" && request.method !== "HEAD") throw new ReviewStudioError("method_not_allowed", 405);
      if (segments.length === 3) return { statusCode: 200, payload: { items: publicManualActivityAssetCatalog(current.assetCatalog) } };
      if (segments.length === 5 && segments[4] === "content") { const asset = current.assetCatalog.get(segments[3]); if (!asset) throw new ReviewStudioError("manual_asset_not_available", 404); return { statusCode: 200, preview: await readManualActivityAssetContent(current.projectDirectory, asset) }; }
      throw new ReviewStudioError("route_not_found", 404);
    }
    if (segments[2] === "manual-solutions") {
      requireWrite(request); const activityId = segments[3];
      if (request.method === "GET" && activityId && segments.length === 4) { const all = await store.readAll(); const solution = all.teacher.activities.find((item) => item.activityId === activityId); if (!solution) throw new ReviewStudioError("manual_activity_solution_not_found", 404); return { statusCode: 200, payload: solution }; }
      if (request.method === "POST" && segments[3] === "update") { const body = strictBody(await readJsonBody(request), new Set(["activityId", "solution", "expectedRevision", "clientMutationId"])); const all = await store.readStudent(); const activity = all.activities.find((item) => item.activityId === body.activityId); if (!activity) throw new ReviewStudioError("manual_activity_not_found", 404); const service = await transaction(current, projectId); const result = await service.update({ activity, solution: body.solution, expectedRevision: body.expectedRevision, clientMutationId: body.clientMutationId }); await invalidateProject?.(projectId); return { statusCode: 200, payload: result }; }
      throw new ReviewStudioError("route_not_found", 404);
    }
    if (segments[2] === "manual-activity-history") {
      if (request.method !== "GET") throw new ReviewStudioError("method_not_allowed", 405); return { statusCode: 200, payload: { items: await (await transaction(current, projectId)).history() } };
    }
    if ((request.method === "GET" || request.method === "HEAD") && segments.length <= 4) {
      const artifact = await store.readStudent(); const refreshed = artifact.activities.map((item) => refreshManualActivityStaleness(item, { detectedFacts: current.project.detectedFacts, assetCatalog: current.assetCatalog }));
      const visible = writeEnabled ? refreshed : refreshed.filter((item) => item.status === "approved");
      if (segments[3]) { const activity = visible.find((item) => item.activityId === segments[3]); if (!activity) throw new ReviewStudioError("manual_activity_not_found", 404); return { statusCode: 200, payload: { activity: publicActivity(activity) } }; }
      const page = pagination(filterActivities(visible, parsed.searchParams), parsed.searchParams); return { statusCode: 200, payload: { ...page, revision: current.project.revision, readOnly: !writeEnabled, filters: { types: [...new Set(visible.map((item) => item.type))].sort(), statuses: [...new Set(visible.map((item) => item.status))].sort(), sourceModes: [...new Set(visible.map((item) => item.sourceMode))].sort() }, hierarchyOptions: hierarchyOptions(current.hierarchy), detectedCandidates: writeEnabled ? detectedOptions(current.detected, current.hierarchy, current.pageOwners) : [], relationships: list(current.detected?.candidates).map((candidate) => { const linked = visible.find((item) => item.sourceCandidateId === candidate.activityCandidateId || item.replacesCandidateId === candidate.activityCandidateId); return { activityCandidateId: candidate.activityCandidateId, manualActivityId: linked?.activityId || null, manualStatus: linked?.status || null, replacementConfirmed: linked?.replacesCandidateId === candidate.activityCandidateId, stale: linked?.stale === true }; }) } };
    }
    requireWrite(request); if (request.method !== "POST") throw new ReviewStudioError("method_not_allowed", 405); const operation = segments[3]; let body = await readJsonBody(request);
    body = strictBody(body, operation === "prefill" ? new Set(["activityCandidateId"]) : operation === "preview" ? new Set(["activity"]) : ["create", "update"].includes(operation) ? new Set(["activity", "expectedRevision", "clientMutationId"]) : new Set(["activityId", "expectedRevision", "clientMutationId"]));
    if (operation === "prefill") { const candidate = list(current.detected?.candidates).find((item) => item.activityCandidateId === body.activityCandidateId); if (!candidate) throw new ReviewStudioError("detected_candidate_not_found", 404); const ownership = hierarchyOwnership(current.hierarchy, candidate); const hierarchy = manualHierarchyFromOwnership(ownership, { part: candidate.part, pageCandidateId: candidatePageId(candidate, ownership, current.pageOwners), hotspotCandidateIds: candidate.hotspotCandidateIds }); return { statusCode: 200, payload: { activity: prefillManualActivityFromDetectedCandidate({ candidate, hierarchy, detectedFacts: current.project.detectedFacts }) } }; }
    if (operation === "preview") return { statusCode: 200, payload: { activity: body.activity, validation: validateManualActivity(body.activity, { hierarchyResolver: current.hierarchyResolver, assetCatalog: current.assetCatalog, requireApproval: body.activity?.status === "approved" }), writes: [] } };
    if (!["create", "update", "clone", "archive", "remove"].includes(operation)) throw new ReviewStudioError("route_not_found", 404);
    const service = await transaction(current, projectId); const input = operation === "create" || operation === "update" ? { activity: body.activity, expectedRevision: body.expectedRevision, clientMutationId: body.clientMutationId } : { activityId: body.activityId, expectedRevision: body.expectedRevision, clientMutationId: body.clientMutationId };
    const result = await service[operation](input); await invalidateProject?.(projectId); return { statusCode: 200, payload: result };
  }
  return { dispatch };
}

export { attachManualActivityAsset };
