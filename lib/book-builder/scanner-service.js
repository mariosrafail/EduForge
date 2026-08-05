import fs from "node:fs/promises";
import path from "node:path";
import { resolveApplicationRoot } from "./app-root-resolver.js";
import { atomicWriteJson, atomicWriteText, readJsonFile, resolveProjectDirectory, validateWorkspaceLocation } from "./atomic-json-store.js";
import { createBookProject, validatePublicationDraft } from "./book-project.js";
import { applyRescan } from "./rescan-diff.js";
import { createScanReport } from "./scan-report.js";
import { createLocalSourceBinding } from "./source-binding.js";
import { buildFoundationFacts } from "./source-facts.js";
import { buildSourceInventory } from "./source-inventory.js";
import { buildStructuralFingerprint } from "./structural-fingerprint.js";
import { detectSourceProfile } from "./profile-registry.js";
import { assertSafeId } from "./path-safety.js";
import { runUltimateProfile } from "./profiles/ultimate-air-v2/ultimate-profile.js";

function slug(value) {
  const normalized = String(value || "book-project").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return (normalized || "book-project").slice(0, 80);
}

async function scanResolvedSource(resolution, options = {}) {
  const inventory = await buildSourceInventory(resolution.canonicalAppRoot, {
    mainSwfRelativePath: resolution.mainSwfRelativePath,
    concurrency: options.concurrency,
    maxFiles: options.maxFiles,
    metadataHashLimitBytes: options.metadataHashLimitBytes,
    signal: options.signal,
    onProgress: options.onProgress,
  });
  const fingerprint = await buildStructuralFingerprint({ inventory, descriptor: resolution.descriptor, mainSwfAbsolutePath: resolution.mainSwfAbsolutePath });
  const profile = detectSourceProfile(fingerprint);
  const foundationFacts = buildFoundationFacts({ resolution, inventory, fingerprint, profile });
  const profileResult = profile.id === "ultimate-air-v2" ? await runUltimateProfile({ resolution, inventory, repositoryRoot: options.repositoryRoot, concurrency: options.concurrency }) : null;
  const facts = [...foundationFacts, ...(profileResult?.facts || [])].sort((a, b) => a.id.localeCompare(b.id));
  return { inventory, fingerprint, profile, profileResult, facts };
}

function portableProfile(profile) {
  const { candidates, ...portable } = profile;
  return portable;
}

function selectedProfile(scan) {
  return { ...portableProfile(scan.profile), ...(scan.profileResult ? { parserVersion: scan.profileResult.profileVersion, importSummary: scan.profileResult.summary } : {}) };
}

function sourceDescriptor(resolution) {
  return {
    label: resolution.descriptor?.name || path.basename(resolution.canonicalAppRoot),
    selectedOuterLabel: path.basename(resolution.selectedAbsolutePath),
    kind: resolution.kind,
    canonicalAppRelativePath: resolution.canonicalAppRelativePath,
    applicationId: resolution.descriptor?.id || null,
    applicationName: resolution.descriptor?.name || null,
    applicationVersion: resolution.descriptor?.versionNumber || null,
    descriptorPath: resolution.descriptor?.sourceRelativePath || null,
    mainSwfPath: resolution.mainSwfRelativePath,
  };
}

function sourceSnapshot(scan, now) {
  return {
    inventoryFingerprint: scan.fingerprint.fingerprintSha256,
    fingerprintKind: scan.fingerprint.fingerprintKind,
    scannedAt: now,
    fileCount: scan.inventory.summary.fileCount,
    totalBytes: scan.inventory.summary.totalBytes,
    publisherFileCount: scan.inventory.summary.publisherFileCount,
    publisherBytes: scan.inventory.summary.publisherBytes,
    deferredHashCount: scan.inventory.summary.deferredHashCount,
  };
}

async function persistProjectFiles(projectDirectory, project, binding, scan, resolution, { expectedRevision } = {}) {
  await fs.mkdir(projectDirectory, { recursive: true });
  await atomicWriteJson(path.join(projectDirectory, "book-project.json"), project, { allowedRoot: projectDirectory, expectedRevision });
  await atomicWriteJson(path.join(projectDirectory, "local-source-binding.json"), binding, { allowedRoot: projectDirectory });
  await atomicWriteJson(path.join(projectDirectory, "source-inventory.json"), scan.inventory, { allowedRoot: projectDirectory });
  await atomicWriteJson(path.join(projectDirectory, "detected-facts.json"), { schemaVersion: "1.0", facts: project.detectedFacts }, { allowedRoot: projectDirectory });
  await atomicWriteJson(path.join(projectDirectory, "structural-fingerprint.json"), scan.fingerprint, { allowedRoot: projectDirectory });
  await atomicWriteText(path.join(projectDirectory, "scan-report.md"), createScanReport({ project, resolution, inventory: scan.inventory, fingerprint: scan.fingerprint }), { allowedRoot: projectDirectory });
  if (scan.profileResult) {
    const profileDirectory = path.join(projectDirectory, "profiles", scan.profileResult.profileId);
    const files = new Map([
      ["swf-static-evidence.json", "swfStaticEvidence"], ["iwb-key-discovery.json", "iwbKeyDiscovery"], ["iwb-index.json", "iwbIndex"],
      ["iwb-schema-summary.json", "iwbSchemaSummary"], ["structure-candidates.json", "structureCandidates"], ["page-candidates.json", "pageCandidates"],
      ["menu-model.json", "menuModel"], ["branding-model.json", "brandingModel"], ["gaf-model.json", "gafModel"],
      ["atlas-inventory.json", "atlasInventory"], ["atlas-crop-plan.json", "atlasCropPlan"], ["hotspot-candidates.json", "hotspotCandidates"],
      ["media-candidates.json", "mediaCandidates"],
      ["activity-signatures.json", "activitySignatures"], ["activity-clusters.json", "activityClusters"],
      ["student-activity-candidates.json", "studentActivityCandidates"], ["activity-evidence.json", "activityEvidence"],
      ["activity-extraction-summary.json", "activityExtractionSummary"], ["activity-review-items.json", "activityReviewItems"],
    ]);
    for (const [filename, key] of files) await atomicWriteJson(path.join(profileDirectory, filename), scan.profileResult.artifacts[key], { allowedRoot: projectDirectory });
    await atomicWriteText(path.join(profileDirectory, "milestone-2-report.md"), scan.profileResult.report, { allowedRoot: projectDirectory });
    await atomicWriteText(path.join(profileDirectory, "activity-extraction-report.md"), scan.profileResult.activityReport, { allowedRoot: projectDirectory });
    await atomicWriteJson(path.join(profileDirectory, "internal", "teacher-solution-candidates.json"), scan.profileResult.artifacts.teacherSolutionCandidates, { allowedRoot: projectDirectory });
    await atomicWriteJson(path.join(profileDirectory, "internal", "answer-evidence-index.json"), scan.profileResult.artifacts.answerEvidenceIndex, { allowedRoot: projectDirectory });
    await atomicWriteJson(path.join(projectDirectory, "review-queue.json"), scan.profileResult.reviewQueue, { allowedRoot: projectDirectory });
  }
}

export async function createProjectFromSource({ source, workspace, projectId, repositoryRoot, now = new Date().toISOString(), ...scanOptions }) {
  const resolution = await resolveApplicationRoot(source, scanOptions);
  const realWorkspace = await validateWorkspaceLocation(workspace, { repositoryRoot, sourceRoot: resolution.selectedRealPath });
  const scan = await scanResolvedSource(resolution, { ...scanOptions, repositoryRoot });
  const resolvedProjectId = assertSafeId(projectId || slug(resolution.descriptor?.id || path.basename(resolution.selectedRealPath)), "projectId");
  const projectDirectory = resolveProjectDirectory(realWorkspace, resolvedProjectId);
  try { await fs.access(path.join(projectDirectory, "book-project.json")); throw new Error(`Book Project already exists: ${resolvedProjectId}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const publication = validatePublicationDraft({ publicationDraft: {} });
  const project = createBookProject({
    projectId: resolvedProjectId,
    lifecycleStatus: scan.profile.id === "generic-air-fallback" || scan.profileResult?.reviewQueue.summary.total ? "review_required" : "scanned",
    now,
    sourceDescriptor: sourceDescriptor(resolution),
    sourceSnapshot: sourceSnapshot(scan, now),
    selectedProfile: selectedProfile(scan),
    detectedFacts: scan.facts,
    approvedDecisions: [],
    publicationDraft: {},
    validationSummary: { authoringValid: true, authoringErrors: [], publicationValid: publication.valid, publicationErrors: publication.errors, warnings: [...resolution.diagnostics.map((item) => item.code), ...(scan.profileResult ? [`ultimate_review_items:${scan.profileResult.reviewQueue.summary.total}`] : [])] },
  });
  const binding = createLocalSourceBinding({ projectId: resolvedProjectId, resolution, now });
  await persistProjectFiles(projectDirectory, project, binding, scan, resolution);
  return { projectDirectory, project, binding, resolution, scan };
}

export async function rescanProject({ projectDirectory, repositoryRoot, now = new Date().toISOString(), ...scanOptions }) {
  const directory = await fs.realpath(path.resolve(projectDirectory));
  const previousProject = await readJsonFile(path.join(directory, "book-project.json"));
  const previousBinding = await readJsonFile(path.join(directory, "local-source-binding.json"));
  if (previousBinding.projectId !== previousProject.projectId) throw new Error("Local source binding does not match the Book Project");
  await validateWorkspaceLocation(path.resolve(directory, "..", ".."), { repositoryRoot, sourceRoot: previousBinding.selectedOuterRealPath });
  const resolution = await resolveApplicationRoot(previousBinding.selectedOuterPath, scanOptions);
  if (resolution.canonicalAppRoot !== previousBinding.canonicalApplicationRealPath) throw new Error("Canonical application root no longer matches the local source binding");
  const scan = await scanResolvedSource(resolution, { ...scanOptions, repositoryRoot });
  const applied = applyRescan({ previousFacts: previousProject.detectedFacts, nextFacts: scan.facts, approvedDecisions: previousProject.approvedDecisions });
  const changed = applied.diff.added.length + applied.diff.changed.length + applied.diff.removed.length > 0;
  const project = createBookProject({
    ...previousProject,
    revision: previousProject.revision + 1,
    lifecycleStatus: applied.staleDecisionIds.length || scan.profileResult?.reviewQueue.summary.total ? "review_required" : changed ? "source_changed" : "scanned",
    createdAt: previousProject.createdAt,
    updatedAt: now,
    sourceDescriptor: sourceDescriptor(resolution),
    sourceSnapshot: sourceSnapshot(scan, now),
    selectedProfile: selectedProfile(scan),
    detectedFacts: applied.facts,
    approvedDecisions: applied.decisions,
  });
  const binding = { ...previousBinding, lastScannedAt: now, canonicalApplicationRoot: resolution.canonicalAppRoot, canonicalApplicationRealPath: resolution.canonicalAppRoot };
  await persistProjectFiles(directory, project, binding, scan, resolution, { expectedRevision: previousProject.revision });
  const portableDiff = {
    schemaVersion: "1.0",
    fromRevision: previousProject.revision,
    toRevision: project.revision,
    added: applied.diff.added.map((fact) => fact.id),
    changed: applied.diff.changed.map((item) => item.id),
    removed: applied.diff.removed.map((fact) => fact.id),
    staleDecisions: applied.staleDecisionIds,
  };
  await atomicWriteJson(path.join(directory, "rescan-diff.json"), portableDiff, { allowedRoot: directory });
  return { projectDirectory: directory, project, binding, resolution, scan, diff: portableDiff };
}

export async function inspectProject(projectDirectory) {
  const directory = await fs.realpath(path.resolve(projectDirectory));
  const project = await readJsonFile(path.join(directory, "book-project.json"));
  const binding = await readJsonFile(path.join(directory, "local-source-binding.json"));
  let reviewSummary = null;
  try { reviewSummary = (await readJsonFile(path.join(directory, "review-queue.json"))).summary; } catch (error) { if (!error.message.includes("missing")) throw error; }
  return {
    portable: { projectId: project.projectId, revision: project.revision, lifecycleStatus: project.lifecycleStatus, sourceLabel: project.sourceDescriptor?.label, profile: project.selectedProfile?.id, confidence: project.selectedProfile?.confidence, factCount: project.detectedFacts?.length || 0, decisionCount: project.approvedDecisions?.length || 0, importSummary: project.selectedProfile?.importSummary || null, reviewSummary },
    localBinding: { present: Boolean(binding), sourceKind: binding.sourceKind, lastScannedAt: binding.lastScannedAt },
  };
}
