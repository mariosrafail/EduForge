import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { componentDecisionTargetId } from "../lib/book-builder/decision-dependencies.js";
import { createDetectedFact } from "../lib/book-builder/detected-facts.js";
import { createReviewStudioApi } from "../scripts/book-builder/review-studio-api.mjs";
import { BOOK_BUILDER_API_ROOT, BOOK_BUILDER_SESSION_HEADER, BOOK_BUILDER_WRITE_HEADER } from "../scripts/book-builder/review-studio-security.mjs";
import { SYNTHETIC_TEACHER_SECRET, createBookBuilderStudioFixture } from "./helpers/book-builder-studio-fixture.mjs";

async function prepareMutableProject(fixture) {
  const projectPath = path.join(fixture.ultimate.projectRoot, "book-project.json");
  const project = JSON.parse(await fs.readFile(projectPath, "utf8"));
  const componentsPath = path.join(fixture.ultimate.projectRoot, "profiles", "ultimate-air-v2", "structure-candidates.json");
  const components = JSON.parse(await fs.readFile(componentsPath, "utf8"));
  const component = components.components[0];
  const fact = createDetectedFact({ kind: "component_structure_candidate", locator: component.sourceRelativePath, value: { name: component.name, proposedSemanticRole: component.proposedSemanticRole }, parserId: "synthetic-write-fixture", parserVersion: "1.0" });
  const review = { id: "review_fictional_component_write", category: "component", severity: "review", blocking: true, explanation: "Fictional component role needs review.", sourceRelativeLocator: component.sourceRelativePath, dependencyFactIds: [fact.id], reasonCode: "ambiguous_component_role", suggestedDecisionKind: "component_role", evidence: [], status: "open" };
  const reviewFact = createDetectedFact({ kind: "review_issue_dependency", locator: `${component.sourceRelativePath}/review/ambiguous_component_role`, value: { reviewId: review.id, category: review.category, reasonCode: review.reasonCode, suggestedDecisionKind: review.suggestedDecisionKind, blocking: true }, parserId: "synthetic-write-fixture", parserVersion: "1.0" });
  project.detectedFacts = [fact, reviewFact];
  project.approvedDecisions = [];
  await fs.writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, "utf8");
  const queuePath = path.join(fixture.ultimate.projectRoot, "review-queue.json");
  await fs.writeFile(queuePath, `${JSON.stringify({ schemaVersion: "1.0", parserId: "synthetic", parserVersion: "1.0", items: [review], summary: { total: 1, blocking: 1, byCategory: { component: 1 }, byReason: { ambiguous_component_role: 1 } } }, null, 2)}\n`, "utf8");
  return { projectPath, component, revision: project.revision };
}

async function harness(t, { writeEnabled = true } = {}) {
  const fixture = await createBookBuilderStudioFixture();
  const mutable = await prepareMutableProject(fixture);
  const api = createReviewStudioApi({ workspace: fixture.workspace, sessionToken: "read-session", writeEnabled, writeToken: writeEnabled ? "write-capability" : null, authoringSessionId: "authoring-session" });
  const server = http.createServer((request, response) => api.dispatch(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await fixture.cleanup(); });
  const request = (route, body, headers = {}, method = "POST") => fetch(`${origin}${BOOK_BUILDER_API_ROOT}${route}`, {
    method,
    headers: { Origin: origin, [BOOK_BUILDER_SESSION_HEADER]: "read-session", [BOOK_BUILDER_WRITE_HEADER]: "write-capability", "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
  return { fixture, mutable, api, origin, request };
}

function decisionInput(mutable, overrides = {}) {
  return { targetId: componentDecisionTargetId(mutable.component), kind: "component_role", value: "students_book", approvalState: "approved", editorNote: "Publisher confirmation.", expectedRevision: mutable.revision, clientMutationId: "mutation_write_api_1", ...overrides };
}

test("read-only bootstrap withholds write capability and decision mutations fail closed", async (t) => {
  const { origin, request } = await harness(t, { writeEnabled: false });
  const bootstrap = await (await fetch(`${origin}${BOOK_BUILDER_API_ROOT}/bootstrap`, { headers: { Origin: origin } })).json();
  assert.equal(bootstrap.readOnly, true);
  assert.equal(bootstrap.writeEnabled, false);
  assert.equal(Object.hasOwn(bootstrap, "writeCapability"), false);
  const denied = await request("/projects/fictional-ultimate-review/decisions/apply", {});
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "write_mode_disabled");
});

test("edit bootstrap supplies ephemeral capability and preview remains non-writing", async (t) => {
  const { origin, mutable, request } = await harness(t);
  const bootstrap = await (await fetch(`${origin}${BOOK_BUILDER_API_ROOT}/bootstrap`, { headers: { Origin: origin } })).json();
  assert.equal(bootstrap.readOnly, false);
  assert.equal(bootstrap.writeEnabled, true);
  assert.equal(bootstrap.writeCapability, "write-capability");
  const before = await fs.readFile(mutable.projectPath, "utf8");
  const preview = await request("/projects/fictional-ultimate-review/decisions/preview", decisionInput(mutable));
  assert.equal(preview.status, 200);
  const payload = await preview.json();
  assert.equal(payload.currentRevision, mutable.revision);
  assert.equal(payload.dependencyCount, 2);
  assert.doesNotMatch(JSON.stringify(payload), /evidenceHash|[A-Z]:\\|\/Users\/|\/home\//i);
  assert.equal(await fs.readFile(mutable.projectPath, "utf8"), before);
});

test("write API applies, persists, rejects conflicts, and replays idempotently", async (t) => {
  const { mutable, request } = await harness(t);
  const applied = await request("/projects/fictional-ultimate-review/decisions/apply", decisionInput(mutable));
  assert.equal(applied.status, 200);
  assert.equal((await applied.json()).revision, mutable.revision + 1);
  const project = JSON.parse(await fs.readFile(mutable.projectPath, "utf8"));
  assert.equal(project.approvedDecisions.length, 1);
  assert.equal(project.approvedDecisions[0].approvalState, "approved");
  const replay = await request("/projects/fictional-ultimate-review/decisions/apply", decisionInput(mutable));
  assert.equal((await replay.json()).idempotentReplay, true);
  const conflict = await request("/projects/fictional-ultimate-review/decisions/apply", decisionInput(mutable, { clientMutationId: "mutation_conflict" }));
  assert.equal(conflict.status, 409);
  const conflictBody = await conflict.json();
  assert.equal(conflictBody.error.code, "project_revision_conflict");
  assert.deepEqual(Object.keys(conflictBody.error.details).sort(), ["currentRevision", "expectedRevision", "guidance"]);
});

test("write API enforces tokens, origin, content type, size, strict fields, and answer separation", async (t) => {
  const { mutable, request } = await harness(t);
  const route = "/projects/fictional-ultimate-review/decisions/apply";
  assert.equal((await request(route, decisionInput(mutable), { [BOOK_BUILDER_SESSION_HEADER]: "wrong" })).status, 401);
  assert.equal((await request(route, decisionInput(mutable), { [BOOK_BUILDER_WRITE_HEADER]: "wrong" })).status, 401);
  assert.equal((await request(route, decisionInput(mutable), { Origin: "http://evil.example" })).status, 403);
  assert.equal((await request(route, decisionInput(mutable), { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await request(route, "x".repeat(129 * 1024), { "Content-Type": "application/json" })).status, 413);
  const arbitrary = await request(route, { ...decisionInput(mutable), dependencyFactIds: ["fact_arbitrary"] });
  assert.equal(arbitrary.status, 400);
  const answer = await request(route, { ...decisionInput(mutable), editorNote: `Do not expose correctAnswers ${SYNTHETIC_TEACHER_SECRET}` });
  assert.equal(answer.status, 400);
  assert.doesNotMatch(await answer.text(), new RegExp(SYNTHETIC_TEACHER_SECRET));
});
