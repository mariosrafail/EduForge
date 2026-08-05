import path from "node:path";

import { atomicWriteJson, readJsonFile } from "./atomic-json-store.js";
import { normalizeBookProject, validateBookProject } from "./book-project.js";
import { normalizeDecisionMutationInput } from "./decision-contracts.js";
import { createResolvedDecision, resolveDecisionContext } from "./decision-dependencies.js";
import { DecisionHistoryStore } from "./decision-history.js";
import { ProjectMutationError } from "./project-mutation-error.js";
import { withProjectWriteLock } from "./project-write-lock.js";
import { stableHash } from "./stable-json.js";

const REMOVE_FIELDS = new Set(["targetId", "kind", "expectedRevision", "clientMutationId"]);

function assertMutationShape(value, allowed = REMOVE_FIELDS) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProjectMutationError("invalid_decision_mutation", 400);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ProjectMutationError("invalid_decision_mutation", 400);
  if (!/^[a-z0-9][a-z0-9._:-]{0,159}$/.test(String(value.targetId || ""))) throw new ProjectMutationError("invalid_decision_target", 400);
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(String(value.clientMutationId || ""))) throw new ProjectMutationError("invalid_client_mutation_id", 400);
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 1) throw new ProjectMutationError("invalid_expected_revision", 400);
  return { targetId: value.targetId, kind: value.kind, expectedRevision: value.expectedRevision, clientMutationId: value.clientMutationId };
}

function publicDecision(decision) {
  if (!decision) return null;
  return {
    id: decision.id, kind: decision.kind, targetType: decision.targetType || null, targetId: decision.targetId || null,
    value: decision.value, approvalState: decision.approvalState, stale: decision.stale,
    staleReasons: decision.staleReasons, editorNote: decision.editorNote, createdAt: decision.createdAt,
    updatedAt: decision.updatedAt, dependencyCount: decision.dependencyFactIds?.length || 0,
    resolvesReviewIds: decision.resolvesReviewIds || [],
  };
}

function replaceDecision(decisions, next) {
  return [...decisions.filter((item) => item.id !== next.id), next].sort((left, right) => left.id.localeCompare(right.id));
}

function changedFields(current, next) {
  if (!current) return ["decision"];
  return ["value", "approvalState", "editorNote", "dependencies"].filter((field) => {
    if (field === "dependencies") return stableHash(current.dependencyEvidenceHashes) !== stableHash(next.dependencyEvidenceHashes);
    return stableHash(current[field]) !== stableHash(next[field]);
  });
}

function mutationError(error) {
  if (error instanceof ProjectMutationError) return error;
  return new ProjectMutationError("decision_mutation_failed", 422);
}

export class ProjectMutationService {
  constructor({ workspace, projectDirectory, projectId, loadArtifacts, sessionId, now = () => new Date().toISOString(), hooks = {} } = {}) {
    this.workspace = path.resolve(workspace);
    this.projectDirectory = path.resolve(projectDirectory);
    this.projectId = projectId;
    this.projectPath = path.join(this.projectDirectory, "book-project.json");
    this.loadArtifacts = loadArtifacts;
    this.sessionId = sessionId;
    this.now = now;
    this.hooks = hooks;
  }

  async loadProject() {
    const project = await readJsonFile(this.projectPath);
    const validation = validateBookProject(project);
    if (!validation.valid) throw new ProjectMutationError("book_project_invalid", 422);
    if (project.projectId !== this.projectId) throw new ProjectMutationError("project_identity_mismatch", 422);
    return normalizeBookProject(project);
  }

  conflict(expectedRevision, currentRevision) {
    throw new ProjectMutationError("project_revision_conflict", 409, {
      expectedRevision, currentRevision, guidance: "Reload current project evidence and review the preserved draft.",
    });
  }

  async context(project, input) {
    const artifacts = await this.loadArtifacts(project);
    try { return resolveDecisionContext({ project, artifacts, kind: input.kind, targetId: input.targetId, value: input.value }); }
    catch { throw new ProjectMutationError("invalid_decision_target_or_value", 422); }
  }

  async preview(rawInput) {
    let input;
    try { input = normalizeDecisionMutationInput(rawInput); } catch { throw new ProjectMutationError("invalid_decision_mutation", 400); }
    const project = await this.loadProject();
    const context = await this.context(project, input);
    const proposed = createResolvedDecision(context, input, this.now());
    return {
      currentRevision: project.revision,
      revisionMatches: project.revision === input.expectedRevision,
      target: context.targetSummary,
      currentDecision: publicDecision(context.currentDecision),
      proposedDecision: publicDecision(proposed),
      changedFields: changedFields(context.currentDecision, proposed),
      dependencyCount: context.dependencyFactIds.length,
      affectedReviews: context.resolvesReviewIds,
      stale: Boolean(context.currentDecision?.stale),
      validationWarnings: project.revision === input.expectedRevision ? [] : ["Project revision changed; reload before confirming."],
      resultingEffectiveStatus: proposed.approvalState === "approved" ? "resolved" : "open",
    };
  }

  async mutate(operation, rawInput) {
    return withProjectWriteLock({ workspace: this.workspace, projectId: this.projectId, sessionId: this.sessionId }, async () => {
      const history = await new DecisionHistoryStore(this.projectDirectory).initialize();
      const project = await this.loadProject();
      await history.reconcile(project);
      const input = operation === "apply" ? (() => { try { return normalizeDecisionMutationInput(rawInput); } catch { throw new ProjectMutationError("invalid_decision_mutation", 400); } })() : assertMutationShape(rawInput);
      const requestHash = stableHash({ operation, input });
      const existing = await history.findEntry(input.clientMutationId);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ProjectMutationError("client_mutation_id_reused", 409);
        return { ...existing.result, idempotentReplay: true };
      }
      if (project.revision !== input.expectedRevision) this.conflict(input.expectedRevision, project.revision);
      const artifacts = await this.loadArtifacts(project);
      let currentDecision = project.approvedDecisions.find((item) => item.kind === input.kind && item.targetId === input.targetId) || null;
      let nextDecisions;
      let nextDecision = null;
      if (operation === "apply") {
        const context = await this.context(project, input);
        currentDecision = context.currentDecision;
        nextDecision = createResolvedDecision(context, input, this.now());
        nextDecisions = replaceDecision(project.approvedDecisions, nextDecision);
      } else {
        if (!currentDecision) throw new ProjectMutationError("decision_not_found", 404);
        if (operation === "reapprove") {
          if (!currentDecision.stale) throw new ProjectMutationError("decision_not_stale", 409);
          const context = await this.context(project, { ...input, value: currentDecision.value });
          nextDecision = createResolvedDecision(context, { ...input, approvalState: currentDecision.approvalState, editorNote: currentDecision.editorNote }, this.now());
          nextDecisions = replaceDecision(project.approvedDecisions, nextDecision);
        } else if (operation === "remove") nextDecisions = project.approvedDecisions.filter((item) => item.id !== currentDecision.id);
        else throw new ProjectMutationError("unsupported_decision_operation", 404);
      }
      const timestamp = this.now();
      const nextProject = normalizeBookProject({ ...project, approvedDecisions: nextDecisions, revision: project.revision + 1, updatedAt: timestamp });
      const result = {
        projectId: project.projectId, revision: nextProject.revision, operation,
        decision: publicDecision(nextDecision), removedDecisionId: operation === "remove" ? currentDecision.id : null,
        affectedReviews: nextDecision?.resolvesReviewIds || currentDecision.resolvesReviewIds || [], idempotentReplay: false,
      };
      const record = {
        mutationId: input.clientMutationId, requestHash, previousRevision: project.revision,
        resultingRevision: nextProject.revision, previousApprovedDecisions: project.approvedDecisions,
        resultingApprovedDecisionsDigest: stableHash(nextProject.approvedDecisions), operation,
        changedDecision: {
          id: (nextDecision || currentDecision).id, kind: (nextDecision || currentDecision).kind,
          targetType: (nextDecision || currentDecision).targetType, targetId: (nextDecision || currentDecision).targetId,
          beforeState: currentDecision?.approvalState || null, afterState: nextDecision?.approvalState || null,
        },
        projectHashBefore: stableHash(project), projectHashAfter: stableHash(nextProject),
        startedAt: timestamp, committedAt: timestamp, result,
      };
      try {
        await history.writePending(record);
        await this.hooks.afterPending?.(record);
        await history.writeSnapshot(project.revision, project.approvedDecisions, timestamp);
        await atomicWriteJson(this.projectPath, nextProject, { allowedRoot: this.projectDirectory, expectedRevision: project.revision });
        await this.hooks.afterProjectWrite?.(record);
        await history.commit(record);
        return result;
      } catch (error) { throw mutationError(error); }
    });
  }

  apply(input) { return this.mutate("apply", input); }
  remove(input) { return this.mutate("remove", input); }
  reapprove(input) { return this.mutate("reapprove", input); }

  async history() {
    const store = await new DecisionHistoryStore(this.projectDirectory).initialize();
    return store.summaries();
  }
}
