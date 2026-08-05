import { randomUUID } from "node:crypto";
import path from "node:path";

import { atomicWriteJson, readJsonFile } from "./atomic-json-store.js";
import { normalizeBookProject, validateBookProject } from "./book-project.js";
import { createManualActivityId, createManualNodeId, validateManualActivity } from "./manual-activity-contract.js";
import { validateManualActivitySolution } from "./manual-activity-solutions.js";
import { ManualActivityHistoryStore } from "./manual-activity-history.js";
import { ManualActivityStore } from "./manual-activity-store.js";
import { ProjectMutationError } from "./project-mutation-error.js";
import { withProjectWriteLock } from "./project-write-lock.js";
import { sortJsonValue, stableHash } from "./stable-json.js";

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,159}$/i;
const MUTATION_FIELDS = new Set(["activity", "solution", "activityId", "expectedRevision", "clientMutationId"]);

function strictInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ProjectMutationError("invalid_manual_activity_mutation", 400);
  for (const key of Object.keys(input)) if (!MUTATION_FIELDS.has(key)) throw new ProjectMutationError("invalid_manual_activity_mutation", 400);
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw new ProjectMutationError("invalid_expected_revision", 400);
  if (!SAFE_ID.test(String(input.clientMutationId || ""))) throw new ProjectMutationError("invalid_client_mutation_id", 400);
  return input;
}
function replace(items, next) { return [...items.filter((item) => item.activityId !== next.activityId), next].sort((a, b) => a.activityId.localeCompare(b.activityId)); }
function remove(items, activityId) { return items.filter((item) => item.activityId !== activityId); }
function publicActivity(activity) { return activity ? { activityId: activity.activityId, status: activity.status, sourceMode: activity.sourceMode, sourceCandidateId: activity.sourceCandidateId || null, replacesCandidateId: activity.replacesCandidateId || null, hierarchy: activity.hierarchy, type: activity.type, title: activity.title, stale: activity.stale } : null; }

function remapClone(activity, solution, timestamp) {
  const copy = structuredClone(activity); const teacher = solution ? structuredClone(solution) : null; const ids = new Map();
  const nextId = (old, prefix) => { const value = createManualNodeId(prefix); ids.set(old, value); return value; };
  copy.activityId = createManualActivityId(); copy.status = "draft"; copy.replacesCandidateId = undefined; copy.createdAt = timestamp; copy.updatedAt = timestamp;
  for (const question of copy.content?.questions || []) { question.id = nextId(question.id, "question"); for (const option of question.options || []) option.id = nextId(option.id, "option"); }
  for (const statement of copy.content?.statements || []) statement.id = nextId(statement.id, "statement");
  for (const item of copy.content?.items || []) { item.id = nextId(item.id, "item"); item.responseFieldId = nextId(item.responseFieldId, "field"); }
  for (const block of copy.content?.blocks || []) block.id = nextId(block.id, "block");
  for (const field of copy.content?.fields || []) { field.id = nextId(field.id, "field"); for (const option of field.options || []) option.id = nextId(option.id, "option"); }
  if (teacher) {
    teacher.activityId = copy.activityId; teacher.updatedAt = timestamp;
    for (const item of teacher.solutions?.questions || []) { item.questionId = ids.get(item.questionId); item.correctOptionId = ids.get(item.correctOptionId); }
    for (const item of teacher.solutions?.statements || []) item.statementId = ids.get(item.statementId);
    for (const item of teacher.solutions?.fields || []) { if (item.responseFieldId) item.responseFieldId = ids.get(item.responseFieldId); if (item.fieldId) item.fieldId = ids.get(item.fieldId); if (item.correctOptionId) item.correctOptionId = ids.get(item.correctOptionId); }
  }
  return { activity: sortJsonValue(copy), solution: teacher ? sortJsonValue(teacher) : null };
}

export class ManualActivityTransactionService {
  constructor({ workspace, projectDirectory, projectId, sessionId = randomUUID(), now = () => new Date().toISOString(), hooks = {}, hierarchyResolver, assetCatalog } = {}) {
    this.workspace = path.resolve(workspace); this.projectDirectory = path.resolve(projectDirectory); this.projectId = projectId; this.sessionId = sessionId; this.now = now; this.hooks = hooks; this.hierarchyResolver = hierarchyResolver; this.assetCatalog = assetCatalog;
    this.projectPath = path.join(this.projectDirectory, "book-project.json"); this.store = new ManualActivityStore(this.projectDirectory);
  }

  async loadProject() { const project = await readJsonFile(this.projectPath); const validation = validateBookProject(project); if (!validation.valid) throw new ProjectMutationError("book_project_invalid", 422); if (project.projectId !== this.projectId) throw new ProjectMutationError("project_identity_mismatch", 422); return normalizeBookProject(project); }

  async state() { const project = await this.loadProject(); const { student, teacher } = await this.store.readAll(); return { project, student, teacher }; }

  async history() { return new ManualActivityHistoryStore(this.projectDirectory).summaries(); }

  async preview(operation, rawInput) {
    const input = strictInput(rawInput); const state = await this.state();
    const proposed = this.propose(operation, input, state, this.now());
    return { currentRevision: state.project.revision, revisionMatches: state.project.revision === input.expectedRevision, operation, activity: publicActivity(proposed.activity), validation: proposed.validation, writes: ["Student manual activity artifact", "Teacher-only solution artifact", "Book Project revision", "sanitized manual activity history"] };
  }

  propose(operation, input, state, timestamp) {
    const current = state.student.activities.find((item) => item.activityId === (input.activityId || input.activity?.activityId)) || null;
    const currentSolution = state.teacher.activities.find((item) => item.activityId === current?.activityId) || null;
    let activity = input.activity ? structuredClone(input.activity) : current ? structuredClone(current) : null;
    let solution = input.solution ? structuredClone(input.solution) : currentSolution ? structuredClone(currentSolution) : null;
    if (operation === "create" && current) throw new ProjectMutationError("manual_activity_already_exists", 409);
    if (["update", "archive", "remove", "clone"].includes(operation) && !current) throw new ProjectMutationError("manual_activity_not_found", 404);
    if (operation === "clone") ({ activity, solution } = remapClone(current, currentSolution, timestamp));
    if (operation === "archive") { activity.status = "archived"; activity.updatedAt = timestamp; }
    if (operation === "remove") return { activity: null, solution: null, current, currentSolution, validation: { valid: true, errors: [], warnings: [] } };
    if (!activity) throw new ProjectMutationError("invalid_manual_activity_mutation", 400);
    if (operation === "create" && !activity.createdAt) activity.createdAt = timestamp;
    activity.updatedAt = timestamp;
    if (solution) { solution.activityId = activity.activityId; solution.type = activity.type; solution.updatedAt = timestamp; }
    const validation = validateManualActivity(activity, { hierarchyResolver: this.hierarchyResolver, assetCatalog: this.assetCatalog, requireApproval: activity.status === "approved" });
    if (activity.status === "approved" && !validation.valid) throw new ProjectMutationError("manual_activity_invalid", 422, { errors: validation.errors });
    if (solution) { const teacher = validateManualActivitySolution(solution, activity, { requireComplete: activity.status === "approved" }); if (!teacher.valid) throw new ProjectMutationError("manual_activity_solution_invalid", 422, { errors: teacher.errors }); }
    else if (activity.status === "approved" && ["multiple_choice", "true_false", "typed_gap_fill", "image_backed"].includes(activity.type)) throw new ProjectMutationError("manual_activity_solution_required", 422);
    return { activity: sortJsonValue(activity), solution: solution ? sortJsonValue(solution) : null, current, currentSolution, validation };
  }

  async mutate(operation, rawInput) {
    return withProjectWriteLock({ workspace: this.workspace, projectId: this.projectId, sessionId: this.sessionId }, async () => {
      const input = strictInput(rawInput); const history = await new ManualActivityHistoryStore(this.projectDirectory).initialize(); await this.store.validatePaths();
      let state = await this.state();
      await history.reconcile({ project: state.project, studentState: state.student, teacherState: state.teacher, store: this.store });
      state = await this.state();
      const requestHash = stableHash({ operation, input }); const existing = await history.findEntry(input.clientMutationId);
      if (existing) { if (existing.requestHash !== requestHash) throw new ProjectMutationError("client_mutation_id_reused", 409); return { ...existing.result, idempotentReplay: true }; }
      if (state.project.revision !== input.expectedRevision) throw new ProjectMutationError("project_revision_conflict", 409, { expectedRevision: input.expectedRevision, currentRevision: state.project.revision, guidance: "Reload current project evidence; the browser draft has been preserved." });
      const proposed = this.propose(operation, input, state, this.now()); const timestamp = this.now();
      const student = { ...state.student, activities: operation === "remove" ? remove(state.student.activities, proposed.current.activityId) : replace(state.student.activities, proposed.activity) };
      const teacher = { ...state.teacher, activities: operation === "remove" || !proposed.solution ? remove(state.teacher.activities, proposed.current?.activityId || proposed.activity.activityId) : replace(state.teacher.activities, proposed.solution) };
      const nextProject = normalizeBookProject({ ...state.project, revision: state.project.revision + 1, updatedAt: timestamp });
      const result = { projectId: this.projectId, revision: nextProject.revision, operation, activity: publicActivity(proposed.activity), removedActivityId: operation === "remove" ? proposed.current.activityId : null, idempotentReplay: false };
      const record = { mutationId: input.clientMutationId, requestHash, operation, activityId: proposed.activity?.activityId || proposed.current.activityId, type: proposed.activity?.type || proposed.current.type, hierarchy: proposed.activity?.hierarchy || proposed.current.hierarchy, statusBefore: proposed.current?.status || null, statusAfter: proposed.activity?.status || null, previousRevision: state.project.revision, resultingRevision: nextProject.revision, previousDigests: { project: stableHash(state.project), student: stableHash(state.student), teacher: stableHash(state.teacher) }, resultingDigests: { project: stableHash(nextProject), student: stableHash(student), teacher: stableHash(teacher) }, startedAt: timestamp, committedAt: timestamp, result };
      try {
        await history.writeSnapshots(input.clientMutationId, await this.store.pathState("student"), await this.store.pathState("teacher"), timestamp); await this.hooks.afterSnapshots?.(record);
        await history.writePending(record); await this.hooks.afterPending?.(record);
        await this.store.writeStudent(student); await this.hooks.afterStudentWrite?.(record);
        await this.store.writeTeacher(teacher, student.activities); await this.hooks.afterTeacherWrite?.(record);
        await atomicWriteJson(this.projectPath, nextProject, { allowedRoot: this.projectDirectory, expectedRevision: state.project.revision }); await this.hooks.afterProjectWrite?.(record);
        await history.commit(record); await this.hooks.afterHistoryWrite?.(record);
        return result;
      } catch (error) { if (error instanceof ProjectMutationError) throw error; throw new ProjectMutationError("manual_activity_mutation_failed", 500); }
    });
  }

  create(input) { return this.mutate("create", input); }
  update(input) { return this.mutate("update", input); }
  clone(input) { return this.mutate("clone", input); }
  archive(input) { return this.mutate("archive", input); }
  remove(input) { return this.mutate("remove", input); }
}
