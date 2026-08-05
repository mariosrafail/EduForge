import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBookProject } from "../lib/book-builder/book-project.js";
import { componentDecisionTargetId } from "../lib/book-builder/decision-dependencies.js";
import { createDetectedFact } from "../lib/book-builder/detected-facts.js";
import { ProjectMutationService } from "../lib/book-builder/project-mutation.js";
import { ProjectMutationError } from "../lib/book-builder/project-mutation-error.js";
import { ProjectWriteLock } from "../lib/book-builder/project-write-lock.js";

async function fixture(t, hooks = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-mutation-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  const projectId = "fictional-mutation";
  const projectDirectory = path.join(workspace, "projects", projectId);
  const component = { name: "unit", sourceRelativePath: "Fictional/Books/book1/unit", proposedSemanticRole: "students_book" };
  const fact = createDetectedFact({ kind: "component_structure_candidate", locator: component.sourceRelativePath, value: { name: "unit", proposedSemanticRole: "students_book" }, parserId: "fixture", parserVersion: "1.0" });
  const review = { id: "review_fictional_component", category: "component", reasonCode: "ambiguous_component_role", sourceRelativeLocator: component.sourceRelativePath, dependencyFactIds: [fact.id], status: "open", blocking: true };
  const reviewFact = createDetectedFact({ kind: "review_issue_dependency", locator: `${component.sourceRelativePath}/review/ambiguous_component_role`, value: { reviewId: review.id, category: review.category, reasonCode: review.reasonCode }, parserId: "fixture", parserVersion: "1.0" });
  const project = createBookProject({ projectId, revision: 4, lifecycleStatus: "review_required", now: "2026-08-05T10:00:00.000Z", sourceDescriptor: { label: "Fictional", canonicalAppRelativePath: "." }, sourceSnapshot: {}, detectedFacts: [fact, reviewFact], publicationDraft: {} });
  await fs.mkdir(projectDirectory, { recursive: true });
  await fs.writeFile(path.join(projectDirectory, "book-project.json"), `${JSON.stringify(project, null, 2)}\n`);
  const artifacts = { components: { components: [component] }, reviews: { items: [review] } };
  let clock = 0;
  const service = new ProjectMutationService({ workspace, projectDirectory, projectId, loadArtifacts: async () => artifacts, sessionId: "test-session", now: () => `2026-08-05T10:00:0${clock++}.000Z`, hooks });
  return { root, workspace, projectId, projectDirectory, component, fact, review, project, service };
}

function input(value, component, overrides = {}) {
  return { targetId: componentDecisionTargetId(component), kind: "component_role", value, approvalState: "approved", editorNote: "Confirmed locally.", expectedRevision: 4, clientMutationId: "mutation_component_role_1", ...overrides };
}

test("preview is non-writing and apply changes only decision-safe project fields once", async (t) => {
  const value = await fixture(t);
  const beforeRaw = await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8");
  const preview = await value.service.preview(input("students_book", value.component));
  assert.equal(preview.currentRevision, 4);
  assert.equal(preview.dependencyCount, 2);
  assert.deepEqual(preview.affectedReviews, [value.review.id]);
  assert.equal(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8"), beforeRaw);
  assert.equal(await fs.lstat(path.join(value.projectDirectory, "decision-history")).catch(() => null), null);

  const result = await value.service.apply(input("students_book", value.component));
  assert.equal(result.revision, 5);
  const after = JSON.parse(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8"));
  assert.equal(after.revision, 5);
  assert.equal(after.approvedDecisions.length, 1);
  for (const key of ["sourceDescriptor", "sourceSnapshot", "selectedProfile", "detectedFacts", "publicationDraft"]) assert.deepEqual(after[key], value.project[key]);
  const replay = await value.service.apply(input("students_book", value.component));
  assert.equal(replay.idempotentReplay, true);
  assert.equal(JSON.parse(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8")).revision, 5);
  assert.equal((await value.service.history()).length, 1);
});

test("revision conflicts and changed idempotency payloads fail without mutation", async (t) => {
  const value = await fixture(t);
  await value.service.apply(input("students_book", value.component));
  await assert.rejects(value.service.apply(input("workbook", value.component, { clientMutationId: "mutation_second" })), (error) => error instanceof ProjectMutationError && error.code === "project_revision_conflict" && error.statusCode === 409);
  await assert.rejects(value.service.apply(input("workbook", value.component)), (error) => error.code === "client_mutation_id_reused");
  assert.equal(JSON.parse(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8")).revision, 5);
});

test("remove increments once and returns generated evidence to an unresolved overlay", async (t) => {
  const value = await fixture(t);
  await value.service.apply(input("students_book", value.component));
  const removed = await value.service.remove({ targetId: componentDecisionTargetId(value.component), kind: "component_role", expectedRevision: 5, clientMutationId: "mutation_remove_1" });
  assert.equal(removed.revision, 6);
  assert.equal(removed.removedDecisionId.startsWith("decision_"), true);
  const project = JSON.parse(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8"));
  assert.deepEqual(project.approvedDecisions, []);
});

test("journal recovery rolls back pre-write records and finalizes post-write records", async (t) => {
  let failBefore = true;
  const before = await fixture(t, { afterPending: () => { if (failBefore) { failBefore = false; throw new Error("synthetic pre-write interruption"); } } });
  await assert.rejects(before.service.apply(input("students_book", before.component)), /decision_mutation_failed/);
  assert.equal(JSON.parse(await fs.readFile(path.join(before.projectDirectory, "book-project.json"), "utf8")).revision, 4);
  const recovered = await before.service.apply(input("students_book", before.component));
  assert.equal(recovered.revision, 5);

  let failAfter = true;
  const after = await fixture(t, { afterProjectWrite: () => { if (failAfter) { failAfter = false; throw new Error("synthetic post-write interruption"); } } });
  await assert.rejects(after.service.apply(input("students_book", after.component)), /decision_mutation_failed/);
  assert.equal(JSON.parse(await fs.readFile(path.join(after.projectDirectory, "book-project.json"), "utf8")).revision, 5);
  const finalized = await after.service.apply(input("students_book", after.component));
  assert.equal(finalized.revision, 5);
  assert.equal(finalized.idempotentReplay, true);
});

test("active project locks are respected and confirmed stale locks are recovered", async (t) => {
  const value = await fixture(t);
  const first = await new ProjectWriteLock({ workspace: value.workspace, projectId: value.projectId, sessionId: "one", waitMilliseconds: 50 }).acquire();
  await assert.rejects(new ProjectWriteLock({ workspace: value.workspace, projectId: value.projectId, sessionId: "two", waitMilliseconds: 50 }).acquire(), (error) => error.code === "project_write_locked");
  await first.release();
  const staleDirectory = path.join(value.workspace, ".publisher-review-studio", "locks", `${value.projectId}.lock`);
  await fs.mkdir(staleDirectory, { recursive: true });
  await fs.writeFile(path.join(staleDirectory, "lock.json"), `${JSON.stringify({ schemaVersion: "1.0", projectId: value.projectId, processId: 999999, sessionId: "dead", acquiredAt: "2020-01-01T00:00:00.000Z" })}\n`);
  const recovered = await new ProjectWriteLock({ workspace: value.workspace, projectId: value.projectId, sessionId: "three", waitMilliseconds: 50, staleMilliseconds: 1 }).acquire();
  await recovered.release();
});

test("ambiguous pending recovery blocks writes without altering the project", async (t) => {
  let interrupted = true;
  const value = await fixture(t, { afterPending: () => { if (interrupted) { interrupted = false; throw new Error("synthetic interruption"); } } });
  await assert.rejects(value.service.apply(input("students_book", value.component)));
  const project = JSON.parse(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8"));
  project.revision = 9;
  await fs.writeFile(path.join(value.projectDirectory, "book-project.json"), `${JSON.stringify(project, null, 2)}\n`);
  const before = await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8");
  await assert.rejects(value.service.apply(input("students_book", value.component)), (error) => error.code === "decision_recovery_ambiguous" && error.statusCode === 423);
  assert.equal(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8"), before);
});

test("stale decisions require explicit reapproval and preserve their value", async (t) => {
  const value = await fixture(t);
  await value.service.apply(input("students_book", value.component));
  const projectPath = path.join(value.projectDirectory, "book-project.json");
  const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
  const changedFact = createDetectedFact({ kind: "component_structure_candidate", locator: value.component.sourceRelativePath, value: { name: "unit", proposedSemanticRole: "workbook" }, parserId: "fixture", parserVersion: "1.0" });
  project.detectedFacts = project.detectedFacts.map((item) => item.id === changedFact.id ? changedFact : item);
  project.approvedDecisions[0].stale = true;
  project.approvedDecisions[0].staleReasons = [`dependency_changed:${changedFact.id}`];
  await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  const result = await value.service.reapprove({ targetId: componentDecisionTargetId(value.component), kind: "component_role", expectedRevision: 5, clientMutationId: "mutation_reapprove_1" });
  assert.equal(result.revision, 6);
  const reapproved = JSON.parse(await fs.readFile(projectPath, "utf8")).approvedDecisions[0];
  assert.equal(reapproved.value, "students_book");
  assert.equal(reapproved.stale, false);
  assert.deepEqual(reapproved.staleReasons, []);
  assert.equal(reapproved.dependencyEvidenceHashes[changedFact.id], changedFact.evidenceHash);
});
