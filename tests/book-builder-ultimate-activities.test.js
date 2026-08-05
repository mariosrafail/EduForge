import test from "node:test";
import assert from "node:assert/strict";
import { activityCandidateId, validateStudentActivityCandidates, validateTeacherSolutionCandidates } from "../lib/book-builder/profiles/ultimate-air-v2/activity-candidate-contract.js";
import { classifyActivityDisposition, mapPublisherActivityTypes } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-activity-types.js";

test("candidate identity is title-independent and stable at the semantic source locator", () => {
  const locator = "Contents/Resources/assets/books/book1/unit/2/part3/obj4";
  assert.equal(activityCandidateId(locator), activityCandidateId(locator));
  assert.doesNotMatch(activityCandidateId(locator), /ultimate-b2/i);
});

test("publisher types remain explicit and publication mapping is never approval", () => {
  const mapped = mapPublisherActivityTypes(["mc"]);
  assert.deepEqual(mapped.rawPublisherTypes, ["mc"]);
  assert.equal(mapped.normalizedCandidateType, "multiple-choice");
  assert.equal(mapped.publicationTypeCandidate, "multiple_choice");
  assert.equal(mapped.runtimeSupportStatus, "candidate-only");
  assert.equal(mapPublisherActivityTypes(["circle"]).unsupportedOrNewRuntime, true);
});

test("dispositions separate non-exercise, media, reveal, display, and unsupported objects", () => {
  assert.equal(classifyActivityDisposition({ signals: {} }).disposition, "non-exercise");
  assert.equal(classifyActivityDisposition({ publisherTypes: ["video"], signals: { video: true } }).disposition, "media-only");
  assert.equal(classifyActivityDisposition({ publisherTypes: ["sa"], signals: {} }).disposition, "teacher-reveal-only");
  assert.equal(classifyActivityDisposition({ publisherTypes: ["print"], signals: {} }).disposition, "display-or-print-content");
  assert.equal(classifyActivityDisposition({ publisherTypes: ["cryptex"], signals: {} }).disposition, "unsupported-publisher-interaction");
});

test("Student contract recursively rejects solution data, keys, XML and absolute paths", () => {
  const base = { schemaVersion: "1.0", audience: "student-safe-authoring", candidates: [{ activityCandidateId: "activity_x", questions: [{ prompt: "Fictional prompt", options: [{ id: "o1", text: "Alpha" }] }] }] };
  assert.equal(validateStudentActivityCandidates(base).valid, true);
  for (const fragment of [{ correctAnswer: "o1" }, { nested: { acceptedAnswers: ["secret"] } }, { rawXml: "<x/>" }, { key: "fictional" }, { source: "C:\\publisher\\file" }, { teacherSolution: {} }, { answerMappings: [] }]) {
    assert.equal(validateStudentActivityCandidates({ ...base, candidates: [{ ...base.candidates[0], ...fragment }] }).valid, false);
  }
});

test("Teacher contract requires explicit local-only classification and safe provenance", () => {
  const artifact = { schemaVersion: "1.0", audience: "teacher-only-internal", classification: "local-only", candidates: [{ activityCandidateId: "activity_x", sourceEvidence: [{ sourceRelativePath: "Contents/Resources/fiction.iwb" }] }] };
  assert.equal(validateTeacherSolutionCandidates(artifact).valid, true);
  assert.equal(validateTeacherSolutionCandidates({ ...artifact, candidates: [{ absolutePath: "C:\\secret" }] }).valid, false);
});
