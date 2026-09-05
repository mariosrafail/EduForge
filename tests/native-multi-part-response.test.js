import assert from "node:assert/strict";
import test from "node:test";
import { nativeAssignmentCapability } from "../netlify/functions/_book-content/native-assignment-runtime.js";
import { createPublicationV2FixtureSources, publicationV2Fixture } from "./fixtures/publication-v2.js";
import { buildNativeFinalSubmission, restoreNativeSubmissionResponses } from "../src/components/lms/student/runtime/studentSubmissionContract.js";

function fixture(kinds = ["single-choice", "single-choice"]) {
  const source = createPublicationV2FixtureSources();
  const base = structuredClone(source.native.activities[publicationV2Fixture.singleChoiceId].public.payload);
  const teacher = structuredClone(source.native.activities[publicationV2Fixture.singleChoiceId].teacher.payload);
  base.kind = teacher.kind = "multi-part";
  const sections = []; const solutions = []; const responses = {};
  kinds.forEach((kind, index) => {
    const entry = source.native.activities[kind === "open-response" ? publicationV2Fixture.openResponseId : publicationV2Fixture.singleChoiceId];
    const id = `section-${String(index + 1).padStart(32, "0")}`;
    sections.push({ id, kind, title: `Section ${index + 1}`, panelId: "panel-00000000000000000000000000000001", bankRegion: null, interaction: structuredClone(entry.public.payload.parts[0].interaction) });
    solutions.push({ id, kind, solution: structuredClone(entry.teacher.payload.parts[0].solution) });
    responses[id] = kind === "open-response" ? Object.fromEntries(entry.public.payload.parts[0].interaction.questions.map((question) => [question.id, "Own learner text"])) : Object.fromEntries(entry.teacher.payload.parts[0].solution.correctAnswers.map((answer) => [answer.questionId, answer.correctOptionId]));
  });
  base.parts = [{ id: "part-1", interaction: { kind: "multi-part", schemaVersion: "multi-part.v1", panels: [], sections } }];
  teacher.parts = [{ id: "part-1", solution: { kind: "multi-part", schemaVersion: "multi-part.v1", sections: solutions } }];
  return { document: base, teacher, responses };
}
test("same local IDs remain section-scoped through final submission, weighted scoring, restore and Teacher review", () => {
  const { document, teacher, responses } = fixture();
  const capability = nativeAssignmentCapability("multi-part", document);
  const submission = buildNativeFinalSubmission({ assignmentId: "one-assignment", target: { nativeKind: "multi-part", entry: { document }, capability }, responses });
  const normalized = capability.normalizeResponse(document, submission.response);
  assert.equal(normalized.error, undefined);
  assert.deepEqual(restoreNativeSubmissionResponses(normalized.payload), responses);
  const score = capability.evaluateResponse(document, teacher, normalized.payload);
  assert.equal(score.scorePercent, 100); assert.equal(score.totalCount, 4); assert.equal(score.sectionResults.length, 2);
  const details = capability.teacherReviewProjection(document, teacher, normalized.payload);
  assert.equal(new Set(details.map((detail) => detail.questionId)).size, 4);
});
test("mixed Multi-Part retains automatic section results and awaits overall Teacher review", () => {
  const { document, teacher, responses } = fixture(["single-choice", "open-response"]);
  const capability = nativeAssignmentCapability("multi-part", document);
  const raw = buildNativeFinalSubmission({ target: { nativeKind: "multi-part", entry: { document }, capability }, responses }).response;
  const normalized = capability.normalizeResponse(document, raw);
  assert.equal(normalized.error, undefined);
  const score = capability.evaluateResponse(document, teacher, normalized.payload);
  assert.equal(score.status, "awaiting_review"); assert.equal(score.scorePercent, null); assert.equal(score.sectionResults[0].scorePercent, 100); assert.equal(score.sectionResults[1].status, "awaiting_review");
});
test("Multi-Part submission rejects spoofed sections, duplicate IDs, nested Teacher data and UTF-8 aggregate overflow", () => {
  const { document, responses } = fixture(); const capability = nativeAssignmentCapability("multi-part", document);
  const raw = buildNativeFinalSubmission({ target: { nativeKind: "multi-part", entry: { document }, capability }, responses }).response;
  for (const mutate of [
    (value) => value.sections.push(value.sections[0]),
    (value) => { value.sections[0].kind = "image"; },
    (value) => { value.sections[0].id = "foreign"; },
    (value) => { value.sections[0].response.modelAnswers = []; },
    (value) => { value.sections[0].response.items[0].value = "😀".repeat(26000); },
  ]) { const value = structuredClone(raw); mutate(value); assert.ok(capability.normalizeResponse(document, value).error); }
});
