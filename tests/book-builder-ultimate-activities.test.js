import test from "node:test";
import assert from "node:assert/strict";
import { activityCandidateId, validateStudentActivityCandidates, validateTeacherSolutionCandidates } from "../lib/book-builder/profiles/ultimate-air-v2/activity-candidate-contract.js";
import { classifyActivityDisposition, mapPublisherActivityTypes } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-activity-types.js";
import { parseQuestionBank } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-question-bank-parser.js";
import { detectSentenceIndexBase, parseSentenceMultipleChoice } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-multiple-choice-parser.js";
import { parseDragAndDrop } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-dnd-parser.js";
import { parseWriteResponses } from "../lib/book-builder/profiles/ultimate-air-v2/ultimate-write-parser.js";

const activityId = "activity_fictional";
const source = { activityCandidateId: activityId, sourceRelativePath: "Contents/Resources/assets/books/book1/unit/9/part2/obj7/fiction.iwb", sourceSha256: "a".repeat(64) };

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

test("question bank separates ordered Student options from exact Teacher correctness", () => {
  const xml = `<questions><question id="q1"><![CDATA[Which fictional moon?]]><answer id="a">Azure</answer><answer id="b">Copper</answer><correct>Copper</correct></question></questions>`;
  const result = parseQuestionBank({ xml, ...source });
  assert.equal(result.summary.questionCount, 1); assert.equal(result.summary.optionCount, 2);
  assert.equal(result.questions[0].prompt, "Which fictional moon?");
  assert.equal(result.solutions[0].correctOptionIds[0], result.questions[0].options[1].id);
  assert.equal(JSON.stringify(result.questions).includes("Copper"), true);
  assert.equal(Object.hasOwn(result.questions[0], "correctOptionIds"), false);
});

test("question-bank zero and multiple exact matches are reviewable and never guessed", () => {
  const zero = parseQuestionBank({ xml: `<questions><question><answer>A</answer><correct>Z</correct></question></questions>`, ...source });
  const multiple = parseQuestionBank({ xml: `<questions><question><answer>A</answer><answer>A</answer><correct>A</correct></question></questions>`, ...source });
  assert.equal(zero.issues[0].reasonCode, "correct_value_option_mismatch"); assert.deepEqual(zero.solutions[0].correctOptionIds, []);
  assert.equal(multiple.issues[0].reasonCode, "multiple_correct_option_matches"); assert.deepEqual(multiple.solutions[0].correctOptionIds, []);
});

test("sentence MC proves index base per parsed family and reviews ambiguity/raster gaps", () => {
  const zeroXml = `<params><sentence answer="0"><choice x="1">A</choice><choice x="2">B</choice></sentence><sentence answer="1"><choice>A</choice><choice>B</choice></sentence></params>`;
  const oneXml = `<params><sentence answer="2"><choice>A</choice><choice>B</choice></sentence></params>`;
  const ambiguousXml = `<params><sentence answer="1"><choice/><choice/></sentence></params>`;
  assert.equal(detectSentenceIndexBase([{ "@_answer": "0", choice: [{}, {}] }]), "zero-based");
  assert.equal(parseSentenceMultipleChoice({ xml: zeroXml, ...source }).summary.indexBase, "zero-based");
  assert.equal(parseSentenceMultipleChoice({ xml: oneXml, ...source }).summary.indexBase, "one-based");
  const ambiguous = parseSentenceMultipleChoice({ xml: ambiguousXml, ...source });
  assert.equal(ambiguous.summary.indexBase, "ambiguous"); assert.ok(ambiguous.issues.some((item) => item.reasonCode === "raster_option_text_missing"));
  assert.equal(Object.hasOwn(ambiguous.questions[0], "correctOptionIds"), false);
});

test("DnD preserves IDs and geometry while mappings stay Teacher-only", () => {
  const xml = `<params><drags><drag id="d1" x="1" y="2">Tile</drag><drag id="d2">Other</drag></drags><drops><drop id="t1" answers="d1|d2" x="4"/><drop id="t2" answers="missing"/></drops></params>`;
  const result = parseDragAndDrop({ xml, ...source });
  assert.equal(result.summary.multiTargetCount, 1); assert.equal(result.summary.unresolvedReferenceCount, 1);
  assert.deepEqual(result.draggables[0].geometry, { x: 1, y: 2 });
  assert.equal(Object.hasOwn(result.targets[0], "acceptedDraggableIds"), false);
});

test("write parser preserves exact Teacher values and only splits a proven delimiter", () => {
  const token = "FICTIONAL_M3_SECRET_7QX";
  const xml = `<params><text id="r1" answers="${token}|second" x="3"/><text id="r2" answers=""/></params>`;
  const ambiguous = parseWriteResponses({ xml, ...source }); const proven = parseWriteResponses({ xml, ...source, provenAlternativeDelimiter: "|" });
  assert.equal(ambiguous.summary.ambiguousDelimiterCount, 1); assert.equal(ambiguous.solutions[0].acceptedValues.length, 1);
  assert.equal(proven.solutions[0].acceptedValues.length, 2); assert.equal(proven.summary.emptyAnswerCount, 1);
  assert.equal(JSON.stringify(ambiguous.responseFields).includes(token), false);
});
