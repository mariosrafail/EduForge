import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { assertNoSymlinkPath, isPathWithin } from "../../lib/book-builder/path-safety.js";
import { unavailableClusterReviewResponse } from "./review-studio-cluster-projection.mjs";
import { safeActivityContentDetail } from "./review-studio-activity-content.mjs";
import {
  effectiveHierarchyView,
  hierarchyComponentForFilter,
  hierarchyComponentOptions,
  hierarchyOwnership,
  hierarchyUnitForFilter,
  hierarchyUnitOptions,
} from "./hierarchy-view-models.mjs";
import {
  DEFAULT_PAGE_SIZE,
  MAXIMUM_ARTIFACT_BYTES,
  MAXIMUM_PAGE_SIZE,
  MAXIMUM_PREVIEW_BYTES,
  ReviewStudioError,
  assertAllowedArtifactPath,
  assertSafeProjectId,
  boundedInteger,
  safeConfidence,
  safeCount,
  safeCountRecord,
  safeRelativeLocator,
  safeText,
} from "./review-studio-security.mjs";

const ARTIFACTS = Object.freeze({
  project: ["book-project.json"],
  fingerprint: ["structural-fingerprint.json"],
  reviews: ["review-queue.json"],
  diff: ["rescan-diff.json"],
  components: ["profiles", "$profile", "structure-candidates.json"],
  hierarchy: ["profiles", "$profile", "component-hierarchy.json"],
  pages: ["profiles", "$profile", "page-candidates.json"],
  menu: ["profiles", "$profile", "menu-model.json"],
  branding: ["profiles", "$profile", "branding-model.json"],
  gaf: ["profiles", "$profile", "gaf-model.json"],
  atlas: ["profiles", "$profile", "atlas-inventory.json"],
  hotspots: ["profiles", "$profile", "hotspot-candidates.json"],
  media: ["profiles", "$profile", "media-candidates.json"],
  activities: ["profiles", "$profile", "student-activity-candidates.json"],
  activityClusters: ["profiles", "$profile", "activity-clusters.json"],
  activitySummary: ["profiles", "$profile", "activity-extraction-summary.json"],
});

const RASTER_TYPES = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
});

const safeFilterToken = /^[a-z0-9][a-z0-9._:+-]{0,127}$/i;
const safeProjectDirectoryName = /^[a-z0-9][a-z0-9._-]{0,127}$/;

async function assertPreviewPath(root, target) { try { await assertNoSymlinkPath(root, target); } catch { throw new ReviewStudioError("preview_not_available", 404); } }

function opaqueId(...parts) {
  return createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
}

function pageCandidateId(spread) {
  const parts = spread.sourceBookRoot && spread.sourceBookRoot !== "book1"
    ? [spread.sourceBookRoot, spread.component, spread.unit, spread.part]
    : [spread.component, spread.unit, spread.part];
  return `page_${opaqueId(...parts).slice(0, 24)}`;
}

function previewId(projectId, kind, locator, fingerprint) {
  return `preview_${opaqueId(projectId, kind, locator, fingerprint).slice(0, 24)}`;
}

function profileId(project) {
  const value = String(project?.selectedProfile?.id || "");
  return safeFilterToken.test(value) ? value : "generic-air-fallback";
}

function optionalArray(value) {
  return Array.isArray(value) ? value : [];
}

function optionalRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function exactMatch(value, filter) {
  return !filter || String(value ?? "") === filter;
}

function containsSearch(values, search) {
  if (!search) return true;
  const needle = search.toLowerCase();
  return values.some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function parseFilter(value, name) {
  if (!value) return "";
  if (!safeFilterToken.test(String(value))) throw new ReviewStudioError(`invalid_${name}_filter`, 400);
  return String(value);
}

function parseSearch(value) {
  if (!value) return "";
  return safeText(String(value), "", 100).toLowerCase();
}

function paginate(items, query) {
  const page = boundedInteger(query.get("page"), { fallback: 1, maximum: 100000 });
  const pageSize = boundedInteger(query.get("pageSize"), { fallback: DEFAULT_PAGE_SIZE, maximum: MAXIMUM_PAGE_SIZE });
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const normalizedPage = Math.min(page, pageCount);
  const offset = (normalizedPage - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    pagination: { page: normalizedPage, pageSize, total, pageCount },
  };
}

function lifecycle(value) {
  return new Set(["draft", "scanned", "review_required", "source_changed"]).has(value) ? value : "unavailable";
}

function validationStatus(project) {
  const summary = optionalRecord(project.validationSummary);
  return {
    authoringValid: summary.authoringValid === true,
    authoringErrorCount: optionalArray(summary.authoringErrors).length,
    publicationValid: summary.publicationValid === true,
    publicationErrorCount: optionalArray(summary.publicationErrors).length,
    warningCount: optionalArray(summary.warnings).length,
  };
}

function reviewSummary(queue) {
  const summary = optionalRecord(queue?.summary);
  return {
    total: safeCount(summary.total),
    blocking: safeCount(summary.blocking),
    nonBlocking: Math.max(0, safeCount(summary.total) - safeCount(summary.blocking)),
    byCategory: safeCountRecord(summary.byCategory),
    byReason: safeCountRecord(summary.byReason),
  };
}

function diffSummary(diff) {
  if (!diff) return null;
  return {
    fromRevision: safeCount(diff.fromRevision),
    toRevision: safeCount(diff.toRevision),
    added: optionalArray(diff.added).length,
    changed: optionalArray(diff.changed).length,
    removed: optionalArray(diff.removed).length,
    staleDecisions: optionalArray(diff.staleDecisions).length,
  };
}

function safeProjectSummary(project, queue, diff) {
  const imports = optionalRecord(project.selectedProfile?.importSummary);
  return {
    projectId: assertSafeProjectId(project.projectId),
    sourceLabel: safeText(project.sourceDescriptor?.label, "Local Book Project", 160),
    profile: profileId(project),
    confidence: safeConfidence(project.selectedProfile?.confidence),
    revision: safeCount(project.revision),
    lifecycle: lifecycle(project.lifecycleStatus),
    lastScannedAt: safeText(project.sourceSnapshot?.scannedAt || project.updatedAt, "Unavailable", 64),
    fileCount: safeCount(project.sourceSnapshot?.fileCount),
    totalBytes: safeCount(project.sourceSnapshot?.totalBytes),
    componentCount: safeCount(imports.componentCandidates),
    pageCount: safeCount(imports.pageSpreads),
    activityCount: safeCount(imports.studentCandidateCount),
    reviewSummary: reviewSummary(queue),
    latestDiff: diffSummary(diff),
    diagnostics: validationStatus(project),
  };
}

function safeComponent(component) {
  return {
    candidateId: `component_${opaqueId(component.sourceRelativePath || component.name).slice(0, 24)}`,
    name: safeText(component.name, "Unnamed component", 160),
    sourceRelativeLocator: safeRelativeLocator(component.sourceRelativePath),
    proposedSemanticRole: safeText(component.proposedSemanticRole, "unresolved", 80),
    confidence: safeConfidence(component.roleConfidence),
    unitCount: safeCount(component.unitCount),
    partCount: safeCount(component.partCount),
    objectCount: safeCount(component.objectCount),
    pageSpreadCount: safeCount(component.pageSpreadCount),
    reviewState: safeText(component.approvalStatus, "unapproved", 80),
    hasPages: safeCount(component.pageSpreadCount) > 0,
    hasActivities: safeCount(component.objectCount) > 0,
  };
}

function safeGeometry(value) {
  const geometry = optionalRecord(value);
  const result = {};
  for (const key of ["x", "y", "width", "height"]) if (Number.isFinite(geometry[key])) result[key] = Number(geometry[key]);
  return Object.keys(result).length === 4 ? result : null;
}

function safeNormalizedGeometry(value) {
  const geometry = optionalRecord(value);
  const values = [geometry.xPct, geometry.yPct, geometry.widthPct, geometry.heightPct];
  if (!values.every(Number.isFinite)) return null;
  const [xPct, yPct, widthPct, heightPct] = values.map(Number);
  if (xPct < 0 || yPct < 0 || widthPct <= 0 || heightPct <= 0 || xPct + widthPct > 100.000001 || yPct + heightPct > 100.000001) return null;
  return { x: xPct / 100, y: yPct / 100, width: widthPct / 100, height: heightPct / 100 };
}

function safeHotspot(item, ownership = null, ownerPageKey = null) {
  return {
    candidateId: safeText(item.id, "Unavailable", 128),
    targetObject: Number.isSafeInteger(item.candidateTargetObject) ? item.candidateTargetObject : null,
    confidence: safeConfidence(item.mappingConfidence),
    geometry: safeNormalizedGeometry(item.normalizedGeometry),
    reviewState: safeText(item.reviewStatus, "unapproved", 80),
    ownerPageKey,
    componentKey: ownership?.componentKey || null,
    unitKey: ownership?.unitKey || null,
  };
}

function hotspotPartFor(spread, hotspotArtifact) {
  return optionalArray(hotspotArtifact?.parts).find((part) => (
    String(part.sourceBookRoot || "book1") === String(spread.sourceBookRoot || "book1")
    && String(part.component) === String(spread.component)
    && Number(part.unit) === Number(spread.unit)
    && Number(part.part) === Number(spread.part)
  ));
}

function safePage(projectId, spread, hotspotArtifact, hierarchy, includeHotspots = false) {
  const variants = optionalArray(spread.variants).flatMap((variant) => {
    const locator = safeRelativeLocator(variant.sourceRelativePath, "");
    const sha256 = /^[a-f0-9]{64}$/i.test(String(variant.sha256 || "")) ? String(variant.sha256).toLowerCase() : "";
    const extension = path.extname(locator).toLowerCase();
    if (!locator || !sha256 || !RASTER_TYPES[extension]) return [];
    return [{
      quality: safeText(variant.quality, "Unknown", 20),
      width: safeCount(variant.width),
      height: safeCount(variant.height),
      byteSize: safeCount(variant.byteSize),
      previewId: previewId(projectId, "source", locator, sha256),
    }];
  });
  const ownership = hierarchyOwnership(hierarchy, spread);
  const pageKey = safeText(spread.pageKey, "", 128) || ownership.unitKey && `page:${ownership.unitKey}:part-${safeCount(spread.part)}` || null;
  const part = hotspotPartFor(spread, hotspotArtifact);
  const hotspotItems = [...optionalArray(part?.hotspots), ...optionalArray(part?.quads)].map((item) => safeHotspot(item, ownership, pageKey));
  const unresolved = hotspotItems.filter((item) => !item.geometry).length;
  const printed = optionalRecord(spread.printedPageCandidate);
  return {
    candidateId: pageCandidateId(spread),
    pageKey,
    hierarchy: ownership,
    component: safeText(spread.component, "Unknown", 120),
    unit: safeCount(spread.unit),
    part: safeCount(spread.part),
    sourceRelativeIdentity: `${safeText(spread.component, "component", 120)}/unit-${safeCount(spread.unit)}/part-${safeCount(spread.part)}`,
    canonicalQuality: safeText(spread.canonicalQualityCandidate, "Unavailable", 20),
    variants,
    printedPage: {
      value: Number.isSafeInteger(printed.numericCandidate) ? printed.numericCandidate : null,
      confidence: safeConfidence(printed.confidence),
      direct: printed.direct === true,
    },
    hotspotCount: hotspotItems.length,
    exactCardinality: part?.exactCardinality === true,
    unresolvedHotspotCount: unresolved,
    reviewRequired: unresolved > 0 || part?.exactCardinality !== true,
    ...(includeHotspots ? { hotspots: hotspotItems } : {}),
  };
}

function safeMenuButton(button) {
  const destination = optionalRecord(button.proposedDestination);
  return {
    id: safeText(button.id, "Unavailable", 128),
    name: safeText(button.name, "Unnamed button", 160),
    sourceRelativeLocator: safeRelativeLocator(button.sourceRelativePath),
    destination: {
      kind: safeText(destination.kind, "unresolved", 80),
      component: safeText(destination.component || destination.componentName, "Unavailable", 120),
      unit: Number.isSafeInteger(destination.unit) ? destination.unit : null,
    },
    bounds: {
      x: Number.isFinite(button.x) ? Number(button.x) : null,
      y: Number.isFinite(button.y) ? Number(button.y) : null,
      width: Number.isFinite(button.width) ? Number(button.width) : null,
      height: Number.isFinite(button.height) ? Number(button.height) : null,
    },
    states: {
      normal: Boolean(optionalArray(button.textureTriple)[0]),
      hover: Boolean(optionalArray(button.textureTriple)[1]),
      pressed: Boolean(optionalArray(button.textureTriple)[2]),
    },
    confidence: safeConfidence(button.confidence),
    reviewState: "unapproved",
  };
}

function safeBrandAsset(asset) {
  return {
    role: safeText(asset.role, "asset", 80),
    width: safeCount(asset.width),
    height: safeCount(asset.height),
    byteSize: safeCount(asset.byteSize),
    sourceRelativeLocator: safeRelativeLocator(asset.sourceRelativePath),
  };
}

function geometrySummary(items) {
  const list = optionalArray(items);
  return { count: list.length, withGeometry: list.filter((item) => safeGeometry(item.geometry)).length };
}

function safeActivityListItem(candidate, hierarchy) {
  const questions = optionalArray(candidate.questions);
  const ownership = hierarchyOwnership(hierarchy, candidate);
  return {
    activityId: safeText(candidate.activityCandidateId, "Unavailable", 128),
    component: safeText(candidate.componentCandidateId, "Unavailable", 160),
    componentKey: ownership.componentKey,
    unitKey: ownership.unitKey,
    hierarchy: ownership,
    unit: safeCount(candidate.unit),
    part: safeCount(candidate.part),
    object: safeCount(candidate.object),
    sourceRelativeLocator: safeRelativeLocator(candidate.sourceObjectLocator),
    normalizedType: safeText(candidate.normalizedCandidateType, "unresolved", 100),
    publisherTypes: optionalArray(candidate.publisherExerciseTypes).map((item) => safeText(item, "", 80)).filter(Boolean).slice(0, 20),
    disposition: safeText(candidate.disposition, "unresolved", 100),
    runtimeSupport: safeText(candidate.runtimeSupportStatus, "unresolved", 100),
    contentCompleteness: safeText(candidate.contentCompleteness, "unresolved", 100),
    questionCount: questions.length,
    optionCount: questions.reduce((sum, question) => sum + optionalArray(question.options).length, 0),
    responseFieldCount: optionalArray(candidate.responseFields).length,
    draggableCount: optionalArray(candidate.draggables).length,
    targetCount: optionalArray(candidate.targets).length,
    mediaCount: optionalArray(candidate.mediaCandidateIds).length,
    hotspotCount: optionalArray(candidate.hotspotCandidateIds).length,
    reviewCount: optionalArray(candidate.reviewItemIds).length,
    rasterGap: String(candidate.contentCompleteness || "").includes("raster") || String(candidate.disposition || "").includes("raster"),
    hasStructuredPrompt: questions.some((question) => typeof question.prompt === "string" && question.prompt.trim()),
    hasStructuredOptions: questions.some((question) => optionalArray(question.options).some((option) => typeof option.text === "string" && option.text.trim())),
  };
}

function safeActivityDetail(candidate, hierarchy) {
  const item = safeActivityListItem(candidate, hierarchy);
  return {
    ...item,
    ...safeActivityContentDetail(candidate, safeGeometry),
    draggableLabels: optionalArray(candidate.draggables).map((entry) => safeText(entry.label, "", 500)).filter(Boolean).slice(0, 100),
    targetLabels: optionalArray(candidate.targets).map((entry) => safeText(entry.label, "", 500)).filter(Boolean).slice(0, 100),
    responseFieldGeometry: geometrySummary(candidate.responseFields),
    geometry: {
      draggables: geometrySummary(candidate.draggables),
      targets: geometrySummary(candidate.targets),
    },
    mediaReferences: optionalArray(candidate.mediaCandidateIds).map((item) => safeRelativeLocator(item)).slice(0, 100),
    hotspotReferences: optionalArray(candidate.hotspotCandidateIds).map((item) => safeRelativeLocator(item)).slice(0, 100),
    pageReference: safeText(candidate.pageCandidateId, "Unavailable", 180),
    reviewIds: optionalArray(candidate.reviewItemIds).map((item) => safeText(item, "", 128)).filter(Boolean).slice(0, 200),
    sourceEvidenceDigests: optionalArray(candidate.sourceEvidenceDigests).slice(0, 100).map((evidence) => ({
      sourceRelativeLocator: safeRelativeLocator(evidence.sourceRelativePath),
      sha256: /^[a-f0-9]{64}$/i.test(String(evidence.sourceSha256 || "")) ? String(evidence.sourceSha256).toLowerCase() : null,
    })),
  };
}

function safeReviewItem(item, hierarchy = null) {
  const ownership = hierarchy ? hierarchyOwnership(hierarchy, item) : null;
  return {
    id: safeText(item.id, "Unavailable", 128),
    reasonCode: safeText(item.reasonCode, "unresolved", 128),
    category: safeText(item.category, "unresolved", 128),
    severity: safeText(item.severity, "review", 80),
    blocking: item.blocking === true,
    explanation: safeText(item.explanation, "Review is required.", 1200),
    sourceRelativeLocator: safeRelativeLocator(item.sourceRelativeLocator),
    dependencyCount: optionalArray(item.dependencyFactIds).length,
    suggestedDecisionKind: safeText(item.suggestedDecisionKind, "future_manual_review", 128),
    targetId: item.targetId ? safeText(item.targetId, "", 128) : null,
    activityCandidateId: item.activityCandidateId ? safeText(item.activityCandidateId, "", 128) : null,
    status: safeText(item.status, "unresolved", 80),
    hierarchy: ownership,
  };
}

function locatorComponent(locator) {
  const parts = safeRelativeLocator(locator, "").split("/");
  const marker = parts.findIndex((part) => part === "book1");
  return marker >= 0 ? parts[marker + 1] || "unresolved" : "unresolved";
}

function locatorUnit(locator) {
  const parts = safeRelativeLocator(locator, "").split("/");
  const marker = parts.findIndex((part) => part === "book1");
  return marker >= 0 ? parts[marker + 2] || "unresolved" : "unresolved";
}

function reviewGroupValue(item, mode, hierarchy = null) {
  if (mode === "reason") return safeText(item.reasonCode, "unresolved", 128);
  if (mode === "category") return safeText(item.category, "unresolved", 128);
  if (mode === "severity") return safeText(item.severity, "review", 80);
  if (mode === "decision") return safeText(item.suggestedDecisionKind, "future_manual_review", 128);
  if (mode === "component") return hierarchyOwnership(hierarchy, item).componentKey || "unresolved";
  if (mode === "unit") return hierarchyOwnership(hierarchy, item).unitKey || "unresolved";
  throw new ReviewStudioError("invalid_review_group", 400);
}

function factKind(fact) {
  return safeText(fact?.kind, "unknown", 100);
}

async function recursiveRasterFiles(root, current = root, output = []) {
  let entries;
  try { entries = await fs.readdir(current, { withFileTypes: true }); } catch (error) {
    if (error.code === "ENOENT") return output;
    throw error;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) continue;
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) await recursiveRasterFiles(root, absolute, output);
    else if (entry.isFile() && RASTER_TYPES[path.extname(entry.name).toLowerCase()]) output.push(absolute);
    if (output.length >= 250) break;
  }
  return output;
}

export class ReviewStudioWorkspace {
  constructor({ workspace, onArtifactRead } = {}) {
    this.workspace = path.resolve(workspace);
    this.projectsRoot = path.join(this.workspace, "projects");
    this.realWorkspace = null;
    this.realProjectsRoot = null;
    this.cache = new Map();
    this.onArtifactRead = onArtifactRead;
  }

  async initialize() {
    const workspaceInfo = await fs.lstat(this.workspace).catch(() => null);
    if (!workspaceInfo?.isDirectory() || workspaceInfo.isSymbolicLink()) throw new ReviewStudioError("workspace_not_available", 400);
    this.realWorkspace = await fs.realpath(this.workspace);
    const projectsInfo = await fs.lstat(this.projectsRoot).catch(() => null);
    if (projectsInfo) {
      if (!projectsInfo.isDirectory() || projectsInfo.isSymbolicLink()) throw new ReviewStudioError("workspace_projects_not_available", 400);
      this.realProjectsRoot = await fs.realpath(this.projectsRoot);
      if (!isPathWithin(this.realWorkspace, this.realProjectsRoot)) throw new ReviewStudioError("workspace_projects_not_available", 400);
    } else {
      this.realProjectsRoot = null;
    }
    return this;
  }

  get workspaceLabel() {
    const label = safeText(path.basename(this.realWorkspace || this.workspace), "BookBuilder", 80);
    return `Local workspace · ${label}`;
  }

  async projectDirectory(projectId) {
    assertSafeProjectId(projectId);
    if (!this.realProjectsRoot) throw new ReviewStudioError("project_not_found", 404);
    const target = path.join(this.realProjectsRoot, projectId);
    const info = await fs.lstat(target).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new ReviewStudioError("project_not_found", 404);
    await assertNoSymlinkPath(this.realProjectsRoot, target);
    const realTarget = await fs.realpath(target);
    if (!isPathWithin(this.realProjectsRoot, realTarget)) throw new ReviewStudioError("project_not_found", 404);
    return realTarget;
  }

  artifactParts(key, project) {
    const template = ARTIFACTS[key];
    if (!template) throw new ReviewStudioError("artifact_not_available", 404);
    return assertAllowedArtifactPath(template.map((part) => part === "$profile" ? profileId(project) : part));
  }

  async readArtifact(projectId, key, { optional = false, project = null } = {}) {
    const directory = await this.projectDirectory(projectId);
    const currentProject = project || (key === "project" ? null : await this.readArtifact(projectId, "project"));
    const parts = this.artifactParts(key, currentProject);
    const target = path.join(directory, ...parts);
    await assertNoSymlinkPath(directory, target);
    const info = await fs.lstat(target).catch((error) => {
      if (error.code === "ENOENT" && optional) return null;
      throw error;
    });
    if (!info) return null;
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAXIMUM_ARTIFACT_BYTES) {
      throw new ReviewStudioError("artifact_not_available", 404);
    }
    const revision = key === "project" ? "manifest" : safeCount(currentProject?.revision);
    const cacheKey = `${projectId}:${revision}:${key}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) return cached.value;
    this.onArtifactRead?.({ projectId, key, relativePath: parts.join("/") });
    let value;
    try { value = JSON.parse(await fs.readFile(target, "utf8")); } catch {
      throw new ReviewStudioError("artifact_invalid", 422);
    }
    this.cache.set(cacheKey, { size: info.size, mtimeMs: info.mtimeMs, value });
    return value;
  }

  async listProjects() {
    if (!this.realProjectsRoot) return { projects: [], diagnostics: [] };
    const entries = await fs.readdir(this.realProjectsRoot, { withFileTypes: true });
    const projects = [];
    const diagnostics = [];
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (!safeProjectDirectoryName.test(entry.name)) { diagnostics.push({ code: "invalid_project_directory", projectId: null }); continue; }
      try {
        const project = await this.readArtifact(entry.name, "project");
        if (project.projectId !== entry.name) throw new ReviewStudioError("project_identity_mismatch", 422);
        const [queue, diff] = await Promise.all([
          this.readArtifact(entry.name, "reviews", { optional: true, project }),
          this.readArtifact(entry.name, "diff", { optional: true, project }),
        ]);
        projects.push(safeProjectSummary(project, queue, diff));
      } catch (error) {
        diagnostics.push({ code: error instanceof ReviewStudioError ? error.code : "project_unavailable", projectId: entry.name });
      }
    }
    return { projects, diagnostics };
  }

  async projectContext(projectId) {
    const project = await this.readArtifact(projectId, "project");
    if (project.projectId !== projectId) throw new ReviewStudioError("project_not_found", 404);
    return project;
  }

  async overview(projectId) {
    const project = await this.projectContext(projectId);
    const [queue, diff, fingerprint, hierarchy] = await Promise.all([
      this.readArtifact(projectId, "reviews", { optional: true, project }),
      this.readArtifact(projectId, "diff", { optional: true, project }),
      this.readArtifact(projectId, "fingerprint", { optional: true, project }),
      effectiveHierarchyView(this, projectId, project),
    ]);
    const summary = safeProjectSummary(project, queue, diff);
    return {
      project: summary,
      application: {
        canonicalRelativeLocation: safeRelativeLocator(project.sourceDescriptor?.canonicalAppRelativePath),
        id: safeText(project.sourceDescriptor?.applicationId, "Unavailable", 180),
        name: safeText(project.sourceDescriptor?.applicationName, "Unavailable", 180),
        version: safeText(project.sourceDescriptor?.applicationVersion, "Unavailable", 80),
      },
      profile: {
        id: profileId(project),
        confidence: safeConfidence(project.selectedProfile?.confidence),
        importSummary: Object.fromEntries(Object.entries(optionalRecord(project.selectedProfile?.importSummary))
          .filter(([key, value]) => /^[a-z][a-z0-9]+$/i.test(key) && Number.isSafeInteger(value) && value >= 0)
          .sort(([left], [right]) => left.localeCompare(right))),
      },
      scan: {
        factCount: optionalArray(project.detectedFacts).length,
        approvedDecisionCount: optionalArray(project.approvedDecisions).length,
        structuralFingerprint: safeText(fingerprint?.fingerprintSha256, "Unavailable", 80),
      },
      hierarchy: {
        available: hierarchy.available,
        summary: hierarchy.summary,
        warnings: hierarchy.warnings,
        principalComponents: hierarchy.components.filter((item) => item.effectiveGroupingKind === "numbered_units").map((item) => ({
          componentKey: item.componentKey,
          displayName: item.displayName,
          unitGroupCount: item.unitGroups.length,
          pageCount: item.pageCount,
          activityCount: item.activityCount,
          reviewCount: item.reviewCount,
        })),
      },
      limitations: {
        readOnly: true,
        publicationMessage: "The project is an authoring draft. Publication data is incomplete and no content has been published.",
      },
    };
  }

  async components(projectId, query) {
    const project = await this.projectContext(projectId);
    const [artifact, hierarchy] = await Promise.all([
      this.readArtifact(projectId, "components", { optional: true, project }),
      effectiveHierarchyView(this, projectId, project),
    ]);
    if (!artifact) return { available: false, items: [], pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, pageCount: 1 }, filters: {} };
    const role = parseFilter(query.get("role"), "role");
    const confidenceBand = parseFilter(query.get("confidence"), "confidence");
    const review = parseFilter(query.get("review"), "review");
    const hasPages = parseFilter(query.get("hasPages"), "has_pages");
    const hasActivities = parseFilter(query.get("hasActivities"), "has_activities");
    const search = parseSearch(query.get("search"));
    const items = optionalArray(artifact.components).map(safeComponent).map((item) => {
      const normalized = hierarchy.components.find((component) => component.decisionTargetId === item.candidateId);
      return normalized ? {
        ...item,
        sourceBookRootId: normalized.sourceBookRootId,
        sourceBookRootName: normalized.sourceBookRootName,
        componentKey: normalized.componentKey,
        displayName: normalized.displayName,
        detectedRole: normalized.detectedRole,
        effectiveRole: normalized.effectiveRole,
        groupingKind: normalized.effectiveGroupingKind,
        unitGroups: normalized.unitGroups,
        unresolvedReviewCount: normalized.reviewCount,
      } : item;
    }).filter((item) => {
      const band = item.confidence === null ? "unknown" : item.confidence >= 0.8 ? "high" : item.confidence >= 0.5 ? "medium" : "low";
      return exactMatch(item.effectiveRole || item.proposedSemanticRole, role)
        && exactMatch(band, confidenceBand)
        && (!review || (review === "required" ? item.reviewState !== "approved" : item.reviewState === review))
        && (!hasPages || String(item.hasPages) === hasPages)
        && (!hasActivities || String(item.hasActivities) === hasActivities)
        && containsSearch([item.name, item.displayName, item.sourceRelativeLocator, item.proposedSemanticRole, item.effectiveRole], search);
    });
    return { available: true, hierarchySummary: hierarchy.summary, ...paginate(items, query), filters: {
      roles: [...new Set(hierarchy.components.map((item) => safeText(item.effectiveRole, "unresolved", 80)))].sort(),
    } };
  }

  async pages(projectId, query) {
    const project = await this.projectContext(projectId);
    const [pages, hotspots, hierarchy] = await Promise.all([
      this.readArtifact(projectId, "pages", { optional: true, project }),
      this.readArtifact(projectId, "hotspots", { optional: true, project }),
      effectiveHierarchyView(this, projectId, project),
    ]);
    if (!pages) return { available: false, items: [], selected: null, pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, pageCount: 1 }, filters: {} };
    const componentFilter = parseFilter(query.get("component"), "component");
    const unitFilter = parseFilter(query.get("unit"), "unit");
    const component = componentFilter ? hierarchyComponentForFilter(hierarchy, componentFilter) : null;
    if (componentFilter && !component) throw new ReviewStudioError("invalid_component_filter", 400);
    const unit = unitFilter ? hierarchyUnitForFilter(component, unitFilter) : null;
    if (unitFilter && !component) throw new ReviewStudioError("component_required_for_unit_filter", 400);
    if (unitFilter && !unit) throw new ReviewStudioError("invalid_unit_filter", 400);
    const part = parseFilter(query.get("part"), "part");
    const selectedId = query.get("pageId") ? safeText(query.get("pageId"), "", 128) : "";
    const spreads = optionalArray(pages.spreads).filter((spread) => {
      const ownership = hierarchyOwnership(hierarchy, spread);
      return (!component || ownership.componentKey === component.componentKey)
        && (!unit || ownership.unitKey === unit.unitKey)
        && exactMatch(spread.part, part);
    });
    const projected = spreads.map((spread) => safePage(projectId, spread, hotspots, hierarchy, false));
    const selectedSpread = spreads.find((spread) => pageCandidateId(spread) === selectedId) || spreads[0] || null;
    return {
      available: true,
      ...paginate(projected, query),
      selected: selectedSpread ? safePage(projectId, selectedSpread, hotspots, hierarchy, true) : null,
      filters: {
        components: [...new Set(optionalArray(pages.spreads).map((item) => safeText(item.component, "Unknown", 120)))].sort(),
        componentOptions: hierarchyComponentOptions(hierarchy),
        units: component ? component.unitGroups.map((item) => item.sourceNumber) : [],
        unitOptions: hierarchyUnitOptions(hierarchy, component?.componentKey),
        unitFilterEnabled: Boolean(component),
        selectedComponentKey: component?.componentKey || null,
        selectedUnitKey: unit?.unitKey || null,
      },
    };
  }

  async materializedRasters(projectId, project) {
    const directory = await this.projectDirectory(projectId);
    const root = path.join(directory, "profiles", profileId(project), "review-assets", "menu");
    const rootInfo = await fs.lstat(root).catch(() => null);
    if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) return [];
    await assertNoSymlinkPath(directory, root);
    const files = await recursiveRasterFiles(root);
    const output = [];
    for (const file of files) {
      const info = await fs.lstat(file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAXIMUM_PREVIEW_BYTES) continue;
      const relative = path.relative(root, file).replaceAll("\\", "/");
      const fingerprint = `${info.size}:${info.mtimeMs}`;
      output.push({
        previewId: previewId(projectId, "materialized", relative, fingerprint),
        label: safeText(path.basename(file), "Materialized preview", 160),
        role: safeText(path.dirname(relative).replaceAll("\\", "/"), "menu", 160),
        byteSize: info.size,
      });
    }
    return output;
  }

  async menu(projectId) {
    const project = await this.projectContext(projectId);
    const [menu, branding, gaf, atlas, media, previews, hierarchy] = await Promise.all([
      this.readArtifact(projectId, "menu", { optional: true, project }),
      this.readArtifact(projectId, "branding", { optional: true, project }),
      this.readArtifact(projectId, "gaf", { optional: true, project }),
      this.readArtifact(projectId, "atlas", { optional: true, project }),
      this.readArtifact(projectId, "media", { optional: true, project }),
      this.materializedRasters(projectId, project),
      effectiveHierarchyView(this, projectId, project),
    ]);
    if (!menu && !branding && !gaf) return { available: false, buttons: [], branding: null, gaf: null, startupIntro: null, atlas: null, previews: [] };
    return {
      available: true,
      buttons: optionalArray(menu?.buttons).map((button) => {
        const projected = safeMenuButton(button);
        const evidence = hierarchy.menuEvidence.find((item) => item.menuButtonId === projected.id);
        const component = evidence?.targetComponentKey ? hierarchy.components.find((item) => item.componentKey === evidence.targetComponentKey) : null;
        const group = component?.unitGroups.find((item) => item.unitKey === evidence?.targetUnitKey) || null;
        return {
          ...projected,
          hierarchyDestination: evidence ? {
            status: evidence.status,
            componentKey: component?.componentKey || null,
            componentDisplayName: component?.displayName || null,
            unitKey: group?.unitKey || null,
            groupLabel: group?.displayLabel || null,
          } : null,
        };
      }),
      branding: branding ? {
        menuTitleKind: safeText(branding.menuTitleKind, "unresolved", 100),
        startupIntroIsSeparate: branding.startupIntroIsSeparate === true,
        assets: optionalArray(branding.assets).map(safeBrandAsset),
        movieClips: optionalArray(branding.movieClips).map((clip) => ({
          name: safeText(clip.name, "clip", 120), fps: Number.isFinite(clip.fps) ? Number(clip.fps) : null,
          startFrame: safeCount(clip.startFrame), play: clip.play === true, loop: clip.loop === true,
          x: Number.isFinite(clip.x) ? Number(clip.x) : null, y: Number.isFinite(clip.y) ? Number(clip.y) : null,
          scale: Number.isFinite(clip.scale) ? Number(clip.scale) : null,
        })),
      } : null,
      gaf: gaf ? {
        status: "static-evidence-only",
        signature: safeText(gaf.signature, "Unavailable", 40),
        version: safeText(gaf.version, "Unavailable", 40),
        stage: {
          width: safeCount(gaf.stage?.width), height: safeCount(gaf.stage?.height), fps: Number.isFinite(gaf.stage?.fps) ? Number(gaf.stage.fps) : null,
        },
        timeline: {
          linkage: safeText(gaf.timeline?.linkage, "Unavailable", 160),
          frames: safeCount(gaf.timeline?.frames), frameRecords: safeCount(gaf.timeline?.frameRecords),
          bounds: safeGeometry(gaf.timeline?.bounds), objectCount: safeCount(gaf.timeline?.objects?.count),
        },
      } : null,
      startupIntro: media?.intro ? {
        distinctFromMenuTitle: media.intro.distinctFromMenuTitle === true,
        descriptor: {
          width: safeCount(media.intro.descriptor?.width), height: safeCount(media.intro.descriptor?.height),
          autoPlay: media.intro.descriptor?.autoPlay === true,
        },
        evidenceAvailable: Boolean(media.intro.mediaPath || media.intro.descriptorPath),
      } : null,
      atlas: atlas ? { familyCount: safeCount(atlas.summary?.familyCount), regionCount: safeCount(atlas.summary?.regionCount), invalidFamilyCount: safeCount(atlas.summary?.invalidFamilyCount) } : null,
      previews,
      materializeInstruction: `npm run book-builder:materialize -- --project "${projectId}" --scope menu`,
    };
  }

  async activities(projectId, query) {
    const project = await this.projectContext(projectId);
    const [artifact, hierarchy] = await Promise.all([
      this.readArtifact(projectId, "activities", { optional: true, project }),
      effectiveHierarchyView(this, projectId, project),
    ]);
    if (!artifact) return { available: false, items: [], selected: null, pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, pageCount: 1 }, filters: {} };
    const componentFilter = parseFilter(query.get("component"), "component");
    const unitFilter = parseFilter(query.get("unit"), "unit");
    const component = componentFilter ? hierarchyComponentForFilter(hierarchy, componentFilter) : null;
    if (componentFilter && !component) throw new ReviewStudioError("invalid_component_filter", 400);
    const unit = unitFilter ? hierarchyUnitForFilter(component, unitFilter) : null;
    if (unitFilter && !component) throw new ReviewStudioError("component_required_for_unit_filter", 400);
    if (unitFilter && !unit) throw new ReviewStudioError("invalid_unit_filter", 400);
    const part = parseFilter(query.get("part"), "part");
    const type = parseFilter(query.get("type"), "type");
    const publisherType = parseFilter(query.get("publisherType"), "publisher_type");
    const disposition = parseFilter(query.get("disposition"), "disposition");
    const support = parseFilter(query.get("support"), "support");
    const completeness = parseFilter(query.get("completeness"), "completeness");
    const flags = ["hasPrompt", "hasOptions", "hasMedia", "hasHotspot", "reviewRequired"].map((name) => [name, parseFilter(query.get(name), name.toLowerCase())]);
    const search = parseSearch(query.get("search"));
    const candidates = optionalArray(artifact.candidates);
    const filtered = candidates.filter((candidate) => {
      const item = safeActivityListItem(candidate, hierarchy);
      const booleans = {
        hasPrompt: item.hasStructuredPrompt, hasOptions: item.hasStructuredOptions,
        hasMedia: item.mediaCount > 0, hasHotspot: item.hotspotCount > 0, reviewRequired: item.reviewCount > 0,
      };
      return (!component || item.componentKey === component.componentKey)
        && (!unit || item.unitKey === unit.unitKey) && exactMatch(item.part, part)
        && exactMatch(item.normalizedType, type) && (!publisherType || item.publisherTypes.includes(publisherType))
        && exactMatch(item.disposition, disposition) && exactMatch(item.runtimeSupport, support)
        && exactMatch(item.contentCompleteness, completeness)
        && flags.every(([name, value]) => !value || String(booleans[name]) === value)
        && containsSearch([item.activityId, item.sourceRelativeLocator, item.normalizedType], search);
    });
    const sort = parseFilter(query.get("sort") || "locator", "sort");
    const direction = parseFilter(query.get("direction") || "asc", "direction");
    const sorted = [...filtered].sort((left, right) => {
      const a = sort === "type" ? String(left.normalizedCandidateType) : sort === "reviews" ? optionalArray(left.reviewItemIds).length : String(left.sourceObjectLocator);
      const b = sort === "type" ? String(right.normalizedCandidateType) : sort === "reviews" ? optionalArray(right.reviewItemIds).length : String(right.sourceObjectLocator);
      const result = typeof a === "number" ? a - b : a.localeCompare(b);
      return direction === "desc" ? -result : result;
    });
    const selectedId = query.get("activityId") ? safeText(query.get("activityId"), "", 128) : "";
    const selected = selectedId ? sorted.find((candidate) => candidate.activityCandidateId === selectedId) : sorted[0];
    const page = paginate(sorted.map((candidate) => safeActivityListItem(candidate, hierarchy)), query);
    return {
      available: true,
      ...page,
      selected: selected ? safeActivityDetail(selected, hierarchy) : null,
      filters: {
        components: [...new Set(candidates.map((item) => safeText(item.componentCandidateId, "Unavailable", 160)))].sort(),
        componentOptions: hierarchyComponentOptions(hierarchy),
        units: component ? component.unitGroups.map((item) => item.sourceNumber) : [],
        unitOptions: hierarchyUnitOptions(hierarchy, component?.componentKey),
        unitFilterEnabled: Boolean(component),
        selectedComponentKey: component?.componentKey || null,
        selectedUnitKey: unit?.unitKey || null,
        types: [...new Set(candidates.map((item) => safeText(item.normalizedCandidateType, "unresolved", 100)))].sort(),
        dispositions: [...new Set(candidates.map((item) => safeText(item.disposition, "unresolved", 100)))].sort(),
      },
      notice: "This preview represents the Student-safe authoring projection. Correct answers and Teacher-only evidence are intentionally unavailable.",
    };
  }

  async reviews(projectId, query) {
    const project = await this.projectContext(projectId);
    const [queue, hierarchy] = await Promise.all([
      this.readArtifact(projectId, "reviews", { optional: true, project }),
      effectiveHierarchyView(this, projectId, project),
    ]);
    if (!queue) return { available: false, summary: reviewSummary(null), groups: [], pagination: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, pageCount: 1 }, selectedGroup: null };
    const mode = parseFilter(query.get("groupBy") || "reason", "review_group");
    if (mode === "cluster") return this.clusterReviews(projectId, project, queue, query);
    const reason = parseFilter(query.get("reason"), "reason");
    const category = parseFilter(query.get("category"), "category");
    const severity = parseFilter(query.get("severity"), "severity");
    const componentFilter = parseFilter(query.get("component"), "component");
    const unitFilter = parseFilter(query.get("unit"), "unit");
    const component = componentFilter ? hierarchyComponentForFilter(hierarchy, componentFilter) : null;
    if (componentFilter && !component) throw new ReviewStudioError("invalid_component_filter", 400);
    const unit = unitFilter ? hierarchyUnitForFilter(component, unitFilter) : null;
    if (unitFilter && !component) throw new ReviewStudioError("component_required_for_unit_filter", 400);
    if (unitFilter && !unit) throw new ReviewStudioError("invalid_unit_filter", 400);
    const items = optionalArray(queue.items).filter((item) => exactMatch(item.reasonCode, reason)
      && exactMatch(item.category, category) && exactMatch(item.severity, severity)
      && (!component || hierarchyOwnership(hierarchy, item).componentKey === component.componentKey)
      && (!unit || hierarchyOwnership(hierarchy, item).unitKey === unit.unitKey));
    const groups = new Map();
    for (const item of items) {
      const value = reviewGroupValue(item, mode, hierarchy);
      const ownership = hierarchyOwnership(hierarchy, item);
      const label = mode === "component" ? ownership.componentDisplayName
        : mode === "unit" ? `${ownership.componentDisplayName} · ${ownership.groupLabel}` : value;
      const group = groups.get(value) || { id: value, label, count: 0, blocking: 0, samples: [] };
      group.count += 1;
      if (item.blocking === true) group.blocking += 1;
      if (group.samples.length < 3) group.samples.push(safeReviewItem(item, hierarchy));
      groups.set(value, group);
    }
    const groupList = [...groups.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
    const selectedGroupId = query.get("groupId") ? safeText(query.get("groupId"), "", 128) : groupList[0]?.id;
    const selectedItems = items.filter((item) => reviewGroupValue(item, mode, hierarchy) === selectedGroupId).map((item) => safeReviewItem(item, hierarchy));
    return {
      available: true,
      summary: reviewSummary(queue),
      grouping: mode,
      groups: groupList.slice(0, 100),
      selectedGroup: selectedGroupId ? { id: selectedGroupId, ...paginate(selectedItems, query) } : null,
      filters: {
        categories: Object.keys(reviewSummary(queue).byCategory),
        reasons: Object.keys(reviewSummary(queue).byReason),
        componentOptions: hierarchyComponentOptions(hierarchy),
        unitOptions: hierarchyUnitOptions(hierarchy, component?.componentKey),
        unitFilterEnabled: Boolean(component),
        selectedComponentKey: component?.componentKey || null,
        selectedUnitKey: unit?.unitKey || null,
      },
    };
  }

  async clusterReviews(projectId, project, queue, query) {
    const artifact = await this.readArtifact(projectId, "activityClusters", { optional: true, project });
    if (!artifact) return unavailableClusterReviewResponse(reviewSummary(queue), DEFAULT_PAGE_SIZE);
    const reasonsByObject = new Map();
    for (const item of optionalArray(queue.items)) {
      const locator = safeRelativeLocator(item.sourceRelativeLocator, "");
      const objectMatch = locator.match(/^(.*\/obj\d+)(?:\/|$)/i);
      const objectLocator = objectMatch?.[1] || locator;
      if (!objectLocator) continue;
      const reasons = reasonsByObject.get(objectLocator) || new Set();
      reasons.add(safeText(item.reasonCode, "unresolved", 128));
      reasonsByObject.set(objectLocator, reasons);
    }
    const clusters = optionalArray(artifact?.clusters).map((cluster) => {
      const samples = optionalArray(cluster.examples).map((item) => safeRelativeLocator(item)).slice(0, 3);
      const reasons = [...new Set(samples.flatMap((sample) => [...(reasonsByObject.get(sample) || [])]))].slice(0, 10);
      return {
        id: safeText(cluster.structuralSignatureHash, "Unavailable", 128),
        candidateCount: safeCount(cluster.objectCount),
        dispositions: safeCountRecord(cluster.dispositions),
        commonReviewReasons: reasons,
        samples,
      };
    }).sort((left, right) => right.candidateCount - left.candidateCount || left.id.localeCompare(right.id));
    return {
      available: true,
      clustersAvailable: true,
      summary: reviewSummary(queue),
      grouping: "cluster",
      ...paginate(clusters, query),
      selectedGroup: null,
    };
  }

  async diff(projectId, query) {
    const project = await this.projectContext(projectId);
    const [diff, hierarchy] = await Promise.all([
      this.readArtifact(projectId, "diff", { optional: true, project }),
      effectiveHierarchyView(this, projectId, project),
    ]);
    if (!diff) return { available: false, message: "No rescan diff has been recorded for this project." };
    const collections = {
      added: optionalArray(diff.added), changed: optionalArray(diff.changed), removed: optionalArray(diff.removed), stale: optionalArray(diff.staleDecisions),
    };
    const kindById = new Map(optionalArray(project.detectedFacts).map((fact) => [fact.id, factKind(fact)]));
    const kindCounts = {};
    for (const id of [...collections.added, ...collections.changed, ...collections.removed]) {
      const kind = kindById.get(id) || "unknown";
      kindCounts[kind] = (kindCounts[kind] || 0) + 1;
    }
    const changeType = parseFilter(query.get("changeType") || "added", "change_type");
    if (!Object.hasOwn(collections, changeType)) throw new ReviewStudioError("invalid_change_type", 400);
    const details = collections[changeType].map((id) => ({ id: safeText(id, "Unavailable", 128), kind: kindById.get(id) || (changeType === "stale" ? "decision" : "unknown") }));
    return {
      available: true,
      summary: diffSummary(diff),
      hierarchy: { available: hierarchy.available, summary: hierarchy.summary, warnings: hierarchy.warnings },
      byFactKind: safeCountRecord(kindCounts),
      changeType,
      ...paginate(details, query),
    };
  }

  async preview(projectId, opaquePreviewId) {
    const project = await this.projectContext(projectId);
    const pages = await this.readArtifact(projectId, "pages", { optional: true, project });
    for (const spread of optionalArray(pages?.spreads)) for (const variant of optionalArray(spread.variants)) {
      const locator = safeRelativeLocator(variant.sourceRelativePath, "");
      const sha256 = /^[a-f0-9]{64}$/i.test(String(variant.sha256 || "")) ? String(variant.sha256).toLowerCase() : "";
      if (!locator || !sha256 || previewId(projectId, "source", locator, sha256) !== opaquePreviewId) continue;
      return this.sourcePreview(projectId, locator, sha256, safeCount(variant.byteSize));
    }
    const directory = await this.projectDirectory(projectId);
    const root = path.join(directory, "profiles", profileId(project), "review-assets", "menu");
    const rootInfo = await fs.lstat(root).catch(() => null);
    if (rootInfo?.isDirectory() && !rootInfo.isSymbolicLink()) {
      const files = await recursiveRasterFiles(root);
      for (const file of files) {
        const info = await fs.lstat(file);
        const relative = path.relative(root, file).replaceAll("\\", "/");
        const fingerprint = `${info.size}:${info.mtimeMs}`;
        if (previewId(projectId, "materialized", relative, fingerprint) !== opaquePreviewId) continue;
        return this.materializedPreview(root, file, info);
      }
    }
    throw new ReviewStudioError("preview_not_found", 404);
  }

  async sourcePreview(projectId, sourceRelativePath, expectedSha256, expectedBytes) {
    const directory = await this.projectDirectory(projectId);
    const bindingTarget = path.join(directory, "local-source-binding.json");
    await assertPreviewPath(directory, bindingTarget);
    const bindingInfo = await fs.lstat(bindingTarget).catch(() => null);
    if (!bindingInfo?.isFile() || bindingInfo.isSymbolicLink() || bindingInfo.size > 64 * 1024) throw new ReviewStudioError("preview_not_available", 404);
    this.onArtifactRead?.({ projectId, key: "previewBinding", relativePath: "local-source-binding.json" });
    let binding;
    try { binding = JSON.parse(await fs.readFile(bindingTarget, "utf8")); } catch { throw new ReviewStudioError("preview_not_available", 404); }
    const sourceRoot = path.resolve(String(binding.canonicalApplicationRealPath || ""));
    const sourceInfo = await fs.lstat(sourceRoot).catch(() => null);
    if (!sourceInfo?.isDirectory() || sourceInfo.isSymbolicLink()) throw new ReviewStudioError("preview_not_available", 404);
    const sourceReal = await fs.realpath(sourceRoot);
    const target = path.resolve(sourceReal, ...sourceRelativePath.split("/"));
    if (!isPathWithin(sourceReal, target)) throw new ReviewStudioError("preview_not_available", 404);
    await assertPreviewPath(sourceReal, target);
    const info = await fs.lstat(target).catch(() => null);
    const extension = path.extname(target).toLowerCase();
    if (!info?.isFile() || info.isSymbolicLink() || !RASTER_TYPES[extension] || info.size > MAXIMUM_PREVIEW_BYTES) throw new ReviewStudioError("preview_not_available", 404);
    if (expectedBytes && info.size !== expectedBytes) throw new ReviewStudioError("preview_changed", 409);
    const buffer = await fs.readFile(target);
    const actualSha256 = createHash("sha256").update(buffer).digest("hex");
    if (actualSha256 !== expectedSha256) throw new ReviewStudioError("preview_changed", 409);
    return { buffer, contentType: RASTER_TYPES[extension] };
  }

  async materializedPreview(root, target, info) {
    if (!isPathWithin(root, target)) throw new ReviewStudioError("preview_not_available", 404);
    await assertPreviewPath(root, target);
    const extension = path.extname(target).toLowerCase();
    if (!info.isFile() || info.isSymbolicLink() || !RASTER_TYPES[extension] || info.size > MAXIMUM_PREVIEW_BYTES) throw new ReviewStudioError("preview_not_available", 404);
    return { buffer: await fs.readFile(target), contentType: RASTER_TYPES[extension] };
  }
}

export async function createReviewStudioWorkspace(options) {
  return new ReviewStudioWorkspace(options).initialize();
}
