import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { createReviewStudioApi } from "../scripts/book-builder/review-studio-api.mjs";
import { BOOK_BUILDER_API_ROOT, BOOK_BUILDER_SESSION_HEADER, BOOK_BUILDER_WRITE_HEADER } from "../scripts/book-builder/review-studio-security.mjs";
import { createBookBuilderStudioFixture } from "./helpers/book-builder-studio-fixture.mjs";

async function serverFor(t, fixture, { writeEnabled = true } = {}) {
  const api = createReviewStudioApi({ workspace: fixture.workspace, sessionToken: "manual-read", writeEnabled, writeToken: writeEnabled ? "manual-write" : null, authoringSessionId: "manual-session" });
  const server = http.createServer((request, response) => api.dispatch(request, response)); await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (route, { method = "GET", body, write = false, headers = {} } = {}) => fetch(`${origin}${BOOK_BUILDER_API_ROOT}${route}`, { method, headers: { Origin: origin, [BOOK_BUILDER_SESSION_HEADER]: "manual-read", ...(write ? { [BOOK_BUILDER_WRITE_HEADER]: "manual-write" } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { request, origin };
}
async function prepareManualProject(fixture) {
  const target = path.join(fixture.ultimate.projectRoot, "book-project.json"); const project = JSON.parse(await fs.readFile(target, "utf8")); project.detectedFacts = []; project.approvedDecisions = []; await fs.writeFile(target, `${JSON.stringify(project, null, 2)}\n`);
}
function draft(hierarchy, type = "multiple_choice") {
  const now = "2026-08-06T16:00:00.000Z"; const content = type === "multiple_choice" ? { questions: [{ id: "question_api", prompt: "Which fictional colour?", options: [{ id: "option_amber", text: "Amber" }, { id: "option_blue", text: "Blue" }] }] } : { prompt: "Explain the fictional scene.", responseGuidance: "Two sentences." };
  return { schemaVersion: "1.0", activityId: `manual_activity_api_${type}`, status: "draft", sourceMode: "manual", hierarchy: { sourceBookRootKey: hierarchy.sourceBookRootKey, componentKey: hierarchy.componentKey, effectiveComponentRole: hierarchy.effectiveComponentRole, unitGroupKey: hierarchy.groups[0].unitGroupKey, unitGroupNumber: hierarchy.groups[0].unitGroupNumber, part: null, hotspotCandidateIds: [] }, type, title: "Fictional API activity", instructions: "Complete it.", content, presentation: { viewportMode: "fit", viewportSizeMode: "responsive", backgroundReviewRequired: false }, assetReferences: [], dependencyFactIds: [], dependencyEvidenceHashes: {}, stale: false, staleReasons: [], createdAt: now, updatedAt: now };
}

test("manual API prefills without writing, creates Student draft, and updates Teacher solution only through its narrow route", async (t) => {
  const fixture = await createBookBuilderStudioFixture(); t.after(fixture.cleanup); await prepareManualProject(fixture); const { request } = await serverFor(t, fixture); const project = fixture.ultimate.projectId;
  const initial = await (await request(`/projects/${project}/manual-activities`)).json(); assert.ok(initial.detectedCandidates.length); const revision = initial.revision;
  const prefill = await request(`/projects/${project}/manual-activities/prefill`, { method: "POST", write: true, body: { activityCandidateId: initial.detectedCandidates[0].activityCandidateId } }); assert.equal(prefill.status, 200); const prefilled = (await prefill.json()).activity; assert.equal(prefilled.sourceMode, "detected_candidate_prefill"); assert.doesNotMatch(JSON.stringify(prefilled), /correctOptionId|acceptedAnswers|teacherSolution/);
  const activity = draft(initial.hierarchyOptions[0]); const created = await request(`/projects/${project}/manual-activities/create`, { method: "POST", write: true, body: { activity, expectedRevision: revision, clientMutationId: "mutation_api_create" } }); assert.equal(created.status, 200); const createResult = await created.json(); assert.equal(createResult.revision, revision + 1);
  const detail = await (await request(`/projects/${project}/manual-activities/${activity.activityId}`)).json(); assert.doesNotMatch(JSON.stringify(detail), /correctOptionId|acceptedValues/);
  const missingTeacher = await request(`/projects/${project}/manual-solutions/${activity.activityId}`, { write: true }); assert.equal(missingTeacher.status, 404);
  const solution = { schemaVersion: "1.0", activityId: activity.activityId, type: activity.type, solutions: { questions: [{ questionId: "question_api", correctOptionId: "option_blue" }] }, updatedAt: "2026-08-06T16:01:00.000Z" };
  const teacherWrite = await request(`/projects/${project}/manual-solutions/update`, { method: "POST", write: true, body: { activityId: activity.activityId, solution, expectedRevision: revision + 1, clientMutationId: "mutation_api_teacher" } }); assert.equal(teacherWrite.status, 200); assert.equal((await teacherWrite.json()).revision, revision + 2);
  const teacher = await (await request(`/projects/${project}/manual-solutions/${activity.activityId}`, { write: true })).json(); assert.equal(teacher.solutions.questions[0].correctOptionId, "option_blue");
});

test("manual API denies read-only mutations and Teacher routes while showing approved Student content only", async (t) => {
  const fixture = await createBookBuilderStudioFixture(); t.after(fixture.cleanup); await prepareManualProject(fixture); const writer = await serverFor(t, fixture); const project = fixture.ultimate.projectId; const initial = await (await writer.request(`/projects/${project}/manual-activities`)).json(); const activity = draft(initial.hierarchyOptions[0], "open_answer"); activity.status = "approved";
  assert.equal((await writer.request(`/projects/${project}/manual-activities/create`, { method: "POST", write: true, body: { activity, expectedRevision: initial.revision, clientMutationId: "mutation_api_approved" } })).status, 200);
  const reader = await serverFor(t, fixture, { writeEnabled: false }); const listing = await reader.request(`/projects/${project}/manual-activities`); assert.equal(listing.status, 200); const payload = await listing.json(); assert.equal(payload.items.length, 1); assert.equal(payload.items[0].status, "approved"); assert.equal(payload.detectedCandidates.length, 0);
  assert.equal((await reader.request(`/projects/${project}/manual-solutions/${activity.activityId}`)).status, 403); assert.equal((await reader.request(`/projects/${project}/manual-activities/remove`, { method: "POST", body: { activityId: activity.activityId, expectedRevision: initial.revision + 1, clientMutationId: "mutation_denied" } })).status, 403);
});

test("manual API enforces origin, capability, strict bodies and keeps Teacher fields out of Student mutations", async (t) => {
  const fixture = await createBookBuilderStudioFixture(); t.after(fixture.cleanup); await prepareManualProject(fixture); const { request } = await serverFor(t, fixture); const project = fixture.ultimate.projectId; const initial = await (await request(`/projects/${project}/manual-activities`)).json(); const activity = draft(initial.hierarchyOptions[0]); const route = `/projects/${project}/manual-activities/create`;
  assert.equal((await request(route, { method: "POST", body: { activity, expectedRevision: initial.revision, clientMutationId: "mutation_no_cap" } })).status, 401);
  assert.equal((await request(route, { method: "POST", write: true, headers: { Origin: "http://evil.example" }, body: { activity, expectedRevision: initial.revision, clientMutationId: "mutation_bad_origin" } })).status, 403);
  const injected = await request(route, { method: "POST", write: true, body: { activity, solution: { correctOptionId: "option_blue" }, expectedRevision: initial.revision, clientMutationId: "mutation_injected" } }); assert.equal(injected.status, 400); assert.doesNotMatch(await injected.text(), /option_blue/);
});
