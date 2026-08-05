import assert from "node:assert/strict";
import test from "node:test";

import {
  createNestedCandidateIdAllocator,
  nestedCandidateId,
  validateStudentActivityCandidates,
} from "../lib/book-builder/profiles/ultimate-air-v2/activity-candidate-contract.js";
import { buildActivityExtraction } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-activity-extraction.js";
import { parseQuestionBank } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-question-bank-parser.js";
import { parseWriteResponses } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-write-parser.js";

const sha = "a".repeat(64);
const activityId = "activity_fictional_b1plus";
const sourceRoot = "Contents/Resources/assets/books/book1/unit/1/part1/obj1";

function parseWriteFragments(fragments, id = activityId) {
  const nestedIdAllocator = createNestedCandidateIdAllocator();
  return fragments.map(({ filename, xml }) => parseWriteResponses({
    xml,
    activityCandidateId: id,
    sourceRelativePath: `${sourceRoot}/${filename}`,
    sourceSha256: sha,
    nestedIdAllocator,
  }));
}

function allIds(artifact) {
  return artifact.candidates.flatMap((activity) => [
    activity.activityCandidateId,
    ...activity.questions.flatMap((question) => [question.id, ...question.options.map((option) => option.id)]),
    ...activity.draggables.map((item) => item.id),
    ...activity.targets.map((item) => item.id),
    ...activity.responseFields.map((item) => item.id),
  ]);
}

function extractionFixture() {
  const firstPath = `${sourceRoot}/a/questions_params.iwb`;
  const secondPath = `${sourceRoot}/b/questions_params.iwb`;
  const firstXml = `<questions><question id="Repeated"><answer id="Choice">Amber</answer><correct>Amber</correct></question><text id="Field" answers="FICTIONAL_TEACHER_TOKEN">Prompt one</text></questions>`;
  const secondXml = `<questions><question id="repeated"><answer id="choice">Blue</answer><correct>Blue</correct></question><text id="field" answers="FICTIONAL_TEACHER_TOKEN_2">Prompt two</text></questions>`;
  const records = [firstPath, secondPath].map((sourceRelativePath) => ({
    sourceRelativePath,
    family: "questions_params.iwb",
    sourceSha256: sha,
    exerciseTypeCounts: {},
    tagNameSummary: { answer: 1 },
  }));
  const signature = {
    activityCandidateId: activityId,
    sourceObjectLocator: sourceRoot,
    sourceBookRoot: "book1",
    componentSourceDirectory: "unit",
    unit: 1,
    part: 1,
    object: 1,
    publisherExerciseTypes: ["mc", "write"],
    disposition: {
      normalizedCandidateType: "mixed-structured",
      disposition: "structured-activity-candidate",
      runtimeSupportStatus: "candidate-only",
      confidence: 1,
      reviewRequired: false,
    },
    mediaCandidateIds: [],
    hotspotCandidateIds: [],
    pageCandidateId: null,
    sourceFiles: records.map(({ sourceRelativePath, sourceSha256 }) => ({ sourceRelativePath, sourceSha256 })),
    structuralSignatureHash: "b".repeat(64),
    contentEvidenceHash: "c".repeat(64),
  };
  return {
    signatures: { records: [signature] },
    iwbIndex: { documents: records },
    internalDocuments: new Map([[firstPath, firstXml], [secondPath, secondXml]]),
  };
}

test("duplicate publisher response-field IDs remain unique within one parser call", () => {
  const [parsed] = parseWriteFragments([{ filename: "one.iwb", xml: `<params><text id="same"/><text id="same"/></params>` }]);
  assert.equal(new Set(parsed.responseFields.map((field) => field.id)).size, 2);
  assert.equal(parsed.responseFields[0].id, nestedCandidateId("response", activityId, "same"));
});

test("duplicate publisher IDs across parser fragments preserve the first legacy identity", () => {
  const parsed = parseWriteFragments([
    { filename: "first.iwb", xml: `<params><text id="same"/></params>` },
    { filename: "second.iwb", xml: `<params><text id="same"/></params>` },
  ]);
  const ids = parsed.flatMap((result) => result.responseFields.map((field) => field.id));
  assert.equal(new Set(ids).size, 2);
  assert.equal(ids[0], nestedCandidateId("response", activityId, "same"));
  assert.notEqual(ids[1], ids[0]);
});

test("publisher IDs collide case-insensitively and are disambiguated deterministically", () => {
  const run = () => parseWriteFragments([
    { filename: "first.iwb", xml: `<params><text id="PublisherField"/></params>` },
    { filename: "second.iwb", xml: `<params><text id="publisherfield"/></params>` },
  ]).flatMap((result) => result.responseFields.map((field) => field.id));
  assert.equal(new Set(run()).size, 2);
  assert.deepEqual(run(), run());
});

test("missing publisher IDs use fragment-scoped deterministic structural identities", () => {
  const run = () => parseWriteFragments([
    { filename: "first.iwb", xml: `<params><text/></params>` },
    { filename: "second.iwb", xml: `<params><text/></params>` },
  ]).flatMap((result) => result.responseFields.map((field) => field.id));
  const ids = run();
  assert.equal(ids[0], nestedCandidateId("response", activityId, "text-1"));
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(ids, run());
});

test("the same publisher ID in different activities stays parent-scoped", () => {
  const one = parseWriteFragments([{ filename: "one.iwb", xml: `<params><text id="same"/></params>` }], "activity_one")[0].responseFields[0].id;
  const two = parseWriteFragments([{ filename: "one.iwb", xml: `<params><text id="same"/></params>` }], "activity_two")[0].responseFields[0].id;
  assert.notEqual(one, two);
});

test("repeated parser invocation receives stable unique IDs within a shared activity scope", () => {
  const run = () => {
    const nestedIdAllocator = createNestedCandidateIdAllocator();
    const input = { xml: `<params><text id="same"/></params>`, activityCandidateId: activityId, sourceRelativePath: `${sourceRoot}/same.iwb`, sourceSha256: sha, nestedIdAllocator };
    return [parseWriteResponses(input), parseWriteResponses(input)].map((result) => result.responseFields[0].id);
  };
  const ids = run();
  assert.equal(new Set(ids).size, 2);
  assert.deepEqual(ids, run());
});

test("unrelated activities and their fields cannot renumber an existing activity", () => {
  const existing = () => parseWriteFragments([
    { filename: "first.iwb", xml: `<params><text id="same"/></params>` },
    { filename: "second.iwb", xml: `<params><text id="same"/></params>` },
  ], "activity_existing").flatMap((result) => result.responseFields.map((field) => field.id));
  const before = existing();
  parseWriteFragments([{ filename: "unrelated.iwb", xml: `<params><text/><text id="other"/></params>` }], "activity_inserted_before");
  assert.deepEqual(existing(), before);
});

test("question and option collisions across merged documents are also globally unique", () => {
  const allocator = createNestedCandidateIdAllocator();
  const parse = (filename, questionId, optionId) => parseQuestionBank({
    xml: `<questions><question id="${questionId}"><answer id="${optionId}">Fictional</answer><correct>Fictional</correct></question></questions>`,
    activityCandidateId: activityId,
    sourceRelativePath: `${sourceRoot}/${filename}`,
    sourceSha256: sha,
    nestedIdAllocator: allocator,
  });
  const results = [parse("one.iwb", "Q", "A"), parse("two.iwb", "q", "a")];
  assert.equal(new Set(results.flatMap((result) => result.questions.map((question) => question.id))).size, 2);
  assert.equal(new Set(results.flatMap((result) => result.questions.flatMap((question) => question.options.map((option) => option.id)))).size, 2);
});

test("complete extraction is byte-deterministic, globally unique, and Student-safe", () => {
  const first = buildActivityExtraction(extractionFixture());
  const second = buildActivityExtraction(extractionFixture());
  const ids = allIds(first.studentArtifact);
  assert.deepEqual(first.studentArtifact, second.studentArtifact);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(validateStudentActivityCandidates(first.studentArtifact).valid, true);
  assert.doesNotMatch(JSON.stringify(first.studentArtifact), /FICTIONAL_TEACHER_TOKEN|correct|answer/i);
});

test("legacy B1+ target identities and fictional content decisions stay attached", () => {
  const [legacy] = parseWriteFragments([{ filename: "legacy.iwb", xml: `<params><text id="publisher-field"/></params>` }]);
  const targetId = nestedCandidateId("response", activityId, "publisher-field");
  const decisions = [{ kind: "response_field_prompt_text", targetId, value: "Fictional prompt" }];
  assert.equal(legacy.responseFields[0].id, targetId);
  assert.equal(decisions.filter((decision) => legacy.responseFields.some((field) => field.id === decision.targetId)).length, 1);
});

test("the strict duplicate validator still rejects an intentionally invalid artifact", () => {
  const invalid = {
    schemaVersion: "1.0",
    audience: "student-safe-authoring",
    candidates: [{ activityCandidateId: activityId, responseFields: [{ id: "response_duplicate" }, { id: "response_duplicate" }] }],
  };
  const result = validateStudentActivityCandidates(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /duplicate stable ID/);
});
