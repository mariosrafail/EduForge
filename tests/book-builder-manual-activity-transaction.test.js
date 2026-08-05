import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBookProject } from "../lib/book-builder/book-project.js";
import { ManualActivityTransactionService } from "../lib/book-builder/manual-activity-transaction.js";
import { ProjectWriteLock } from "../lib/book-builder/project-write-lock.js";

const now = "2026-08-06T12:00:00.000Z";
function activity() { return { schemaVersion: "1.0", activityId: "manual_activity_tx", status: "approved", sourceMode: "manual", hierarchy: { sourceBookRootKey: "bookroot_fiction", componentKey: "componentkey_students", effectiveComponentRole: "students_book", unitGroupKey: "unitgroup_students_1", unitGroupNumber: 1, part: 1, hotspotCandidateIds: [] }, type: "multiple_choice", title: "Transaction activity", instructions: "Choose.", content: { questions: [{ id: "question_tx", prompt: "Choose a colour.", options: [{ id: "option_blue", text: "Blue" }, { id: "option_gold", text: "Gold" }] }] }, presentation: { viewportMode: "fit", viewportSizeMode: "responsive", backgroundReviewRequired: false }, assetReferences: [], dependencyFactIds: [], dependencyEvidenceHashes: {}, stale: false, staleReasons: [], createdAt: now, updatedAt: now }; }
function solution() { return { schemaVersion: "1.0", activityId: "manual_activity_tx", type: "multiple_choice", solutions: { questions: [{ questionId: "question_tx", correctOptionId: "option_gold" }] }, updatedAt: now }; }
async function fixture(t, hooks = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hhplms-manual-tx-")); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace"); const projectId = "fictional-manual-project"; const projectDirectory = path.join(workspace, "projects", projectId); await fs.mkdir(projectDirectory, { recursive: true });
  const project = createBookProject({ projectId, revision: 7, now, sourceDescriptor: { label: "Fictional" } }); await fs.writeFile(path.join(projectDirectory, "book-project.json"), `${JSON.stringify(project, null, 2)}\n`);
  const service = new ManualActivityTransactionService({ workspace, projectDirectory, projectId, sessionId: `session_${randomUUID()}`, now: () => now, hooks, hierarchyResolver: () => true });
  return { root, workspace, projectId, projectDirectory, project, service };
}
function input(overrides = {}) { return { activity: activity(), solution: solution(), expectedRevision: 7, clientMutationId: "mutation_manual_create", ...overrides }; }

test("manual transaction writes split artifacts and increments Book Project exactly once", async (t) => {
  const value = await fixture(t); const before = await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8");
  const preview = await value.service.preview("create", input()); assert.equal(preview.revisionMatches, true); assert.equal(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8"), before);
  const result = await value.service.create(input()); assert.equal(result.revision, 8);
  const project = JSON.parse(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8")); assert.equal(project.revision, 8); assert.equal(project.schemaVersion, "1.0");
  const student = await fs.readFile(path.join(value.projectDirectory, "authoring", "manual-activities.json"), "utf8"); const teacher = await fs.readFile(path.join(value.projectDirectory, "internal", "manual-activity-solutions.json"), "utf8");
  assert.doesNotMatch(student, /correctOptionId/); assert.match(teacher, /correctOptionId/);
  assert.equal((await value.service.history()).length, 1);
});

test("idempotent retry replays and changed payload or stale revision conflicts", async (t) => {
  const value = await fixture(t); await value.service.create(input());
  assert.equal((await value.service.create(input())).idempotentReplay, true);
  await assert.rejects(value.service.create(input({ activity: { ...activity(), title: "Changed" } })), (error) => error.code === "client_mutation_id_reused");
  await assert.rejects(value.service.update({ activity: activity(), solution: solution(), expectedRevision: 7, clientMutationId: "mutation_conflict" }), (error) => error.code === "project_revision_conflict");
});

for (const hook of ["afterPending", "afterStudentWrite", "afterTeacherWrite"]) test(`recovery rolls back interruption at ${hook}`, async (t) => {
  let fail = true; const value = await fixture(t, { [hook]: () => { if (fail) { fail = false; throw new Error("synthetic interruption"); } } });
  await assert.rejects(value.service.create(input()), (error) => error.code === "manual_activity_mutation_failed");
  assert.equal(JSON.parse(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8")).revision, 7);
  const result = await value.service.create(input()); assert.equal(result.revision, 8);
});

test("recovery finalizes a committed project after history interruption", async (t) => {
  let fail = true; const value = await fixture(t, { afterProjectWrite: () => { if (fail) { fail = false; throw new Error("synthetic interruption"); } } });
  await assert.rejects(value.service.create(input())); assert.equal(JSON.parse(await fs.readFile(path.join(value.projectDirectory, "book-project.json"), "utf8")).revision, 8);
  const replay = await value.service.create(input()); assert.equal(replay.revision, 8); assert.equal(replay.idempotentReplay, true);
});

test("ambiguous recovery blocks writes and exposes no Teacher data in diagnostics", async (t) => {
  let fail = true; const value = await fixture(t, { afterStudentWrite: () => { if (fail) { fail = false; throw new Error("synthetic interruption"); } } }); await assert.rejects(value.service.create(input()));
  const projectPath = path.join(value.projectDirectory, "book-project.json"); const project = JSON.parse(await fs.readFile(projectPath, "utf8")); project.revision = 99; await fs.writeFile(projectPath, `${JSON.stringify(project)}\n`);
  await assert.rejects(value.service.create(input()), (error) => error.code === "manual_activity_recovery_ambiguous" && !JSON.stringify(error.details).includes("option_gold"));
});

test("clone remaps all structural and Teacher references; archive and remove increment once", async (t) => {
  const value = await fixture(t); await value.service.create(input());
  const cloned = await value.service.clone({ activityId: "manual_activity_tx", expectedRevision: 8, clientMutationId: "mutation_clone" }); assert.equal(cloned.revision, 9); assert.notEqual(cloned.activity.activityId, "manual_activity_tx");
  const state = await value.service.state(); const cloneActivity = state.student.activities.find((item) => item.activityId === cloned.activity.activityId); const cloneTeacher = state.teacher.activities.find((item) => item.activityId === cloned.activity.activityId); assert.equal(cloneActivity.status, "draft"); assert.equal(cloneTeacher.solutions.questions[0].questionId, cloneActivity.content.questions[0].id); assert.equal(cloneTeacher.solutions.questions[0].correctOptionId, cloneActivity.content.questions[0].options[1].id);
  assert.equal((await value.service.archive({ activityId: cloned.activity.activityId, expectedRevision: 9, clientMutationId: "mutation_archive" })).revision, 10);
  assert.equal((await value.service.remove({ activityId: cloned.activity.activityId, expectedRevision: 10, clientMutationId: "mutation_remove" })).revision, 11);
});

test("two-process project lock prevents concurrent manual writes", async (t) => {
  const value = await fixture(t); const lock = await new ProjectWriteLock({ workspace: value.workspace, projectId: value.projectId, sessionId: "other", waitMilliseconds: 25 }).acquire(); t.after(() => lock.release());
  await assert.rejects(value.service.create(input()), (error) => error.code === "project_write_locked");
});
