import { readFile } from "node:fs/promises";
import path from "node:path";
import { decodeIwbXml } from "./iwb-inspector.mjs";
import { isPathWithinRoot, scanUltimateB2StudentsBook } from "./students-book-scanner.mjs";
import {
  readingExercise3,
  readingExercise3Options,
  readingExercise4,
  readingText,
} from "../../src/components/lms/activities/ultimate-b2/content/readingContent.js";

export const NORMALIZED_ACTIVITY_TYPES = Object.freeze([
  "multiple-choice",
  "multiple-select",
  "matching",
  "ordering",
  "true-false",
  "gap-fill",
  "listening-gap-fill",
  "typed-short-answer",
  "sentence-transformation",
  "classification-grouping",
  "drag-and-drop-matching",
  "timed-quiz",
  "media-only-interaction",
  "unsupported-publisher-interaction",
]);

export const QUALITY_CATEGORIES = Object.freeze([
  "ready-for-editorial-review",
  "ready-for-implementation",
  "answer-evidence-present",
  "answer-evidence-missing",
  "question-structure-incomplete",
  "media-only",
  "unsupported-interaction",
  "malformed-source",
  "excluded-non-exercise",
]);

const SUPPORTED_TYPES = new Set(NORMALIZED_ACTIVITY_TYPES.filter((type) => ![
  "media-only-interaction",
  "unsupported-publisher-interaction",
].includes(type)));

const CURATED_ACTIVITY_IDS = Object.freeze({
  exercise3: "ultimate-b2-sb-u2-p2-o3",
  exercise4: "ultimate-b2-sb-u2-p2-o4",
});

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function cleanText(value) {
  const raw = typeof value === "object" && value !== null ? value["#text"] : value;
  return typeof raw === "string" ? raw.replaceAll(/\s+/g, " ").trim() : "";
}

function collectByKey(value, key, results = []) {
  if (!value || typeof value !== "object") return results;
  for (const [name, child] of Object.entries(value)) {
    if (name === key) results.push(...toArray(child));
    if (child && typeof child === "object") collectByKey(child, key, results);
  }
  return results;
}

function sourceValue(value) {
  return value === undefined || value === null ? null : String(value);
}

function makeOption({ id, value, sourcePath }) {
  return { id: String(id), value: value || null, sourcePath };
}

function makeAnswerRecord({
  id,
  sourcePath,
  decodedValue,
  normalizedValue,
  questionId,
  optionIds = [],
  indexBase = null,
  orderingSignificant = false,
  multipleAnswersAccepted = false,
  caseSensitive = true,
  punctuationNormalization = false,
  confidence = "confirmed",
  warnings = [],
}) {
  return {
    id,
    sourceFieldPath: sourcePath,
    decodedPublisherValue: sourceValue(decodedValue),
    normalizedAnswerValue: normalizedValue,
    questionId,
    optionIds,
    answerIndexBase: indexBase,
    orderingSignificant,
    multipleAnswersAccepted,
    caseSensitive,
    punctuationNormalization,
    confidence,
    warnings,
  };
}

function normalizedType(publisherTypes = []) {
  if (publisherTypes.some((type) => ["ticTacToe", "choosingGame", "score4", "spinningWheel"].includes(type))) return "unsupported-publisher-interaction";
  if (publisherTypes.includes("dndCat")) return "classification-grouping";
  if (publisherTypes.includes("dnd")) return "drag-and-drop-matching";
  if (publisherTypes.includes("mc") || publisherTypes.includes("circle")) return "multiple-choice";
  if (publisherTypes.includes("sa")) return "typed-short-answer";
  if (publisherTypes.includes("write")) return "typed-short-answer";
  if (publisherTypes.some((type) => ["video", "karaokeScroll", "display"].includes(type))) return "media-only-interaction";
  return "unsupported-publisher-interaction";
}

export function detectAnswerIndexBase(values, optionCounts) {
  const indexes = values.map(Number);
  if (!indexes.length || indexes.some((value) => !Number.isInteger(value))) return null;
  const counts = Array.isArray(optionCounts) ? optionCounts : indexes.map(() => Number(optionCounts));
  const zeroBased = indexes.every((value, index) => value >= 0 && value < counts[index]);
  const oneBased = indexes.every((value, index) => value >= 1 && value <= counts[index]);
  if (zeroBased && !oneBased) return "zero-based";
  if (oneBased && !zeroBased) return "one-based";
  return "ambiguous";
}

function normalizeQuestionBank(entry, document) {
  const questions = toArray(document.questions?.question);
  const normalizedQuestions = [];
  const answerRecords = [];
  questions.forEach((question, questionIndex) => {
    const questionId = `${entry.id}-q${questionIndex + 1}`;
    const answers = toArray(question.answer).map(cleanText);
    const options = answers.map((value, optionIndex) => makeOption({
      id: `${questionId}-option-${optionIndex + 1}`,
      value,
      sourcePath: `${entry.relativePath}#/questions/question[${questionIndex + 1}]/answer[${optionIndex + 1}]`,
    }));
    const correct = cleanText(question.correct);
    const correctIndexes = answers.map((value, index) => value === correct ? index : -1).filter((index) => index >= 0);
    const answerId = `${questionId}-answer`;
    normalizedQuestions.push({
      id: questionId,
      publisherQuestionId: sourceValue(question["@_id"]) || String(questionIndex + 1),
      prompt: cleanText(question["#text"]) || null,
      options,
      answerRecordIds: [answerId],
      sourcePath: `${entry.relativePath}#/questions/question[${questionIndex + 1}]`,
    });
    answerRecords.push(makeAnswerRecord({
      id: answerId,
      sourcePath: `${entry.relativePath}#/questions/question[${questionIndex + 1}]/correct`,
      decodedValue: correct,
      normalizedValue: correctIndexes.length === 1 ? options[correctIndexes[0]].id : null,
      questionId,
      optionIds: correctIndexes.map((index) => options[index].id),
      indexBase: null,
      multipleAnswersAccepted: correctIndexes.length > 1,
      warnings: correctIndexes.length === 1 ? [] : ["Correct value does not resolve to exactly one option."],
    }));
  });
  return { questions: normalizedQuestions, answerRecords };
}

function normalizeDragAndDrop(entry, exercise) {
  const drags = toArray(exercise.drags?.drag);
  const drops = toArray(exercise.drops?.drop);
  const options = drags.map((drag, index) => makeOption({
    id: `${entry.id}-option-${sourceValue(drag["@_id"]) || index + 1}`,
    value: cleanText(drag) || null,
    sourcePath: `${entry.relativePath}#/params/exercises/exercise/drags/drag[${index + 1}]`,
  }));
  const optionByPublisherId = new Map(drags.map((drag, index) => [String(drag["@_id"]), options[index]]));
  const questions = [];
  const answerRecords = [];
  drops.forEach((drop, index) => {
    const questionId = `${entry.id}-q${index + 1}`;
    const publisherAnswerIds = String(drop["@_answers"] || "").split(",").map((value) => value.trim()).filter(Boolean);
    const answerId = publisherAnswerIds.length ? `${questionId}-answer` : null;
    const relationships = publisherAnswerIds.map((id) => optionByPublisherId.get(id)?.id).filter(Boolean);
    questions.push({
      id: questionId,
      publisherQuestionId: sourceValue(drop["@_id"]) || String(index + 1),
      prompt: null,
      options,
      answerRecordIds: answerId ? [answerId] : [],
      sourcePath: `${entry.relativePath}#/params/exercises/exercise/drops/drop[${index + 1}]`,
    });
    if (answerId) answerRecords.push(makeAnswerRecord({
      id: answerId,
      sourcePath: `${entry.relativePath}#/params/exercises/exercise/drops/drop[${index + 1}]/@answers`,
      decodedValue: drop["@_answers"],
      normalizedValue: relationships.length === 1 ? relationships[0] : relationships,
      questionId,
      optionIds: relationships,
      indexBase: "publisher-id",
      orderingSignificant: relationships.length > 1,
      multipleAnswersAccepted: relationships.length > 1,
      warnings: relationships.length === publisherAnswerIds.length ? [] : ["At least one publisher drag ID did not resolve."],
    }));
  });
  return { questions, answerRecords };
}

function normalizeSentences(entry, exercise) {
  const sentences = toArray(exercise.sentences?.sentence);
  const answerValues = sentences.map((sentence) => sentence["@_answer"]);
  const optionCounts = sentences.map((sentence) => toArray(sentence.choice).length);
  const familyIndexBase = detectAnswerIndexBase(answerValues, optionCounts);
  const questions = [];
  const answerRecords = [];
  sentences.forEach((sentence, index) => {
    const questionId = `${entry.id}-q${index + 1}`;
    const choices = toArray(sentence.choice);
    const options = choices.map((choice, optionIndex) => makeOption({
      id: `${questionId}-option-${optionIndex + 1}`,
      value: cleanText(choice) || null,
      sourcePath: `${entry.relativePath}#/params/exercises/exercise/sentences/sentence[${index + 1}]/choice[${optionIndex + 1}]`,
    }));
    const hasPublisherAnswer = sentence["@_answer"] !== undefined && sentence["@_answer"] !== null && sentence["@_answer"] !== "";
    const publisherIndex = Number(sentence["@_answer"]);
    const normalizedIndex = familyIndexBase === "one-based" ? publisherIndex - 1 : familyIndexBase === "zero-based" ? publisherIndex : -1;
    const selected = options[normalizedIndex];
    const answerId = hasPublisherAnswer ? `${questionId}-answer` : null;
    questions.push({
      id: questionId,
      publisherQuestionId: sourceValue(sentence["@_id"]) || String(index + 1),
      prompt: null,
      options,
      answerRecordIds: answerId ? [answerId] : [],
      sourcePath: `${entry.relativePath}#/params/exercises/exercise/sentences/sentence[${index + 1}]`,
    });
    if (answerId) answerRecords.push(makeAnswerRecord({
      id: answerId,
      sourcePath: `${entry.relativePath}#/params/exercises/exercise/sentences/sentence[${index + 1}]/@answer`,
      decodedValue: sentence["@_answer"],
      normalizedValue: selected?.id || null,
      questionId,
      optionIds: selected ? [selected.id] : [],
      indexBase: familyIndexBase,
      warnings: selected ? [] : ["Publisher answer index could not be resolved."],
    }));
  });
  return { questions, answerRecords };
}

function publisherEvidence(activityId, decodedEntries) {
  const usableEntries = decodedEntries.filter((entry) => entry.document);
  const questionEntry = usableEntries.find((entry) => entry.document.questions?.question);
  if (questionEntry) return normalizeQuestionBank(questionEntry, questionEntry.document);
  const candidates = [...usableEntries].sort((left, right) => (path.posix.basename(left.relativePath) === "obj_params.iwb" ? -1 : 0) - (path.posix.basename(right.relativePath) === "obj_params.iwb" ? -1 : 0));
  for (const candidate of candidates) {
    const exercises = collectByKey(candidate.document, "exercise");
    const entry = { id: activityId, relativePath: candidate.relativePath };
    const dragExercise = exercises.find((exercise) => toArray(exercise.drops?.drop).some((drop) => drop["@_answers"] !== undefined) && toArray(exercise.drags?.drag).length);
    if (dragExercise) return normalizeDragAndDrop(entry, dragExercise);
    const sentenceExercise = exercises.find((exercise) => toArray(exercise.sentences?.sentence).some((sentence) => sentence["@_answer"] !== undefined));
    if (sentenceExercise) return normalizeSentences(entry, sentenceExercise);
  }
  const primary = candidates[0];
  if (primary) {
    const exercises = collectByKey(primary.document, "exercise");
    const entry = { id: activityId, relativePath: primary.relativePath };
    const dragExercise = exercises.find((exercise) => toArray(exercise.drops?.drop).length && toArray(exercise.drags?.drag).length);
    if (dragExercise) return normalizeDragAndDrop(entry, dragExercise);
    const sentenceExercise = exercises.find((exercise) => toArray(exercise.sentences?.sentence).length);
    if (sentenceExercise) return normalizeSentences(entry, sentenceExercise);
  }
  return { questions: [], answerRecords: [] };
}

function readingContextForGap(gap) {
  for (const block of readingText) {
    if (!Array.isArray(block.parts) || !block.parts.some((part) => part?.gap === gap)) continue;
    return block.parts.map((part) => typeof part === "string" ? part : part?.gap === gap ? "____" : "").join(" ");
  }
  return "";
}

function findPublisherExercise(decodedEntries, type) {
  return decodedEntries.flatMap((entry) => collectByKey(entry.document, "exercise").map((exercise) => ({ entry, exercise })))
    .find(({ exercise }) => exercise["@_type"] === type);
}

function curateReadingExercise3(activity, decodedEntries) {
  const publisher = findPublisherExercise(decodedEntries, "dnd");
  const drags = toArray(publisher?.exercise.drags?.drag);
  const drops = toArray(publisher?.exercise.drops?.drop);
  const optionByPublisherId = new Map(drags.map((drag) => [String(drag["@_id"]), cleanText(drag)]));
  const options = readingExercise3Options.map((option, index) => makeOption({
    id: `${activity.id}-option-${option.id}`,
    value: option.text,
    sourcePath: `${publisher.entry.relativePath}#/params/exercises/exercise/drags/drag[${index + 1}]`,
  }));
  const optionByLabel = new Map(readingExercise3Options.map((option, index) => [option.id, options[index]]));
  const questions = [];
  const answerRecords = [];
  readingExercise3.forEach((item, index) => {
    const drop = drops[index];
    const publisherId = String(drop?.["@_answers"] || "");
    const label = optionByPublisherId.get(publisherId);
    const selected = optionByLabel.get(label);
    const questionId = `${activity.id}-q${item.gap}`;
    const answerId = `${questionId}-answer`;
    questions.push({
      id: questionId,
      publisherQuestionId: sourceValue(drop?.["@_id"]) || String(item.gap),
      prompt: readingContextForGap(item.gap) || null,
      options,
      answerRecordIds: [answerId],
      sourcePath: `Contents/Resources/assets/books/book1/unit/2/parts/HD/parts_part_2.png#gap-${item.gap}`,
    });
    answerRecords.push(makeAnswerRecord({
      id: answerId,
      sourcePath: `${publisher.entry.relativePath}#/params/exercises/exercise/drops/drop[${index + 1}]/@answers`,
      decodedValue: publisherId,
      normalizedValue: selected?.id || null,
      questionId,
      optionIds: selected ? [selected.id] : [],
      indexBase: "publisher-id",
      warnings: selected ? [] : ["Publisher drag ID did not resolve to a confirmed sentence label."],
    }));
  });
  return {
    title: "Reading Exercise 3",
    instructions: "Read the text again and insert the missing sentences. There is one extra sentence which you do not need to use.",
    activityType: "drag-and-drop-matching",
    questions,
    answerRecords,
    presentationData: { readingContext: readingText, extraOptionCount: 1 },
    mediaDependencies: [{ id: "ultimate-b2.students-book.unit-2.reading.text-audio", type: "audio", required: false }],
    imageDependencies: [{ id: "ultimate-b2.students-book.unit-2.page-20-21", sourceRelativePath: "Contents/Resources/assets/books/book1/unit/2/parts/HD/parts_part_2.png" }],
    hotspotNavigation: {
      pageId: "page-reading-20-21",
      hotspotIds: ["hotspot-exercise-3"],
      coordinates: [{ left: 53.2, top: 8, width: 43.5, height: 38 }],
      presentation: "overlay-modal",
    },
  };
}

function curateReadingExercise4(activity, decodedEntries) {
  const publisher = findPublisherExercise(decodedEntries, "mc");
  const sentences = toArray(publisher?.exercise.sentences?.sentence);
  const indexBase = detectAnswerIndexBase(sentences.map((sentence) => sentence["@_answer"]), sentences.map((sentence) => toArray(sentence.choice).length));
  const questions = [];
  const answerRecords = [];
  readingExercise4.forEach((item, index) => {
    const sentence = sentences[index];
    const questionId = `${activity.id}-q${index + 1}`;
    const options = item.options.map((value, optionIndex) => makeOption({
      id: `${questionId}-option-${optionIndex + 1}`,
      value,
      sourcePath: `Contents/Resources/assets/books/book1/unit/2/parts/HD/parts_part_2.png#exercise-4-question-${index + 1}-option-${optionIndex + 1}`,
    }));
    const publisherIndex = Number(sentence?.["@_answer"]);
    const normalizedIndex = indexBase === "one-based" ? publisherIndex - 1 : indexBase === "zero-based" ? publisherIndex : -1;
    const selected = options[normalizedIndex];
    const answerId = `${questionId}-answer`;
    questions.push({
      id: questionId,
      publisherQuestionId: sourceValue(sentence?.["@_id"]) || String(index + 1),
      prompt: `${item.before} ____ ${item.after}`.replaceAll(/\s+/g, " ").trim(),
      options,
      answerRecordIds: [answerId],
      sourcePath: `Contents/Resources/assets/books/book1/unit/2/parts/HD/parts_part_2.png#exercise-4-question-${index + 1}`,
      presentation: { before: item.before, after: item.after },
    });
    answerRecords.push(makeAnswerRecord({
      id: answerId,
      sourcePath: `${publisher.entry.relativePath}#/params/exercises/exercise/sentences/sentence[${index + 1}]/@answer`,
      decodedValue: sentence?.["@_answer"],
      normalizedValue: selected?.id || null,
      questionId,
      optionIds: selected ? [selected.id] : [],
      indexBase,
      warnings: selected ? [] : ["Publisher sentence answer index did not resolve."],
    }));
  });
  return {
    title: "Reading Exercise 4",
    instructions: "Circle the correct words.",
    activityType: "multiple-choice",
    questions,
    answerRecords,
    presentationData: { layout: "inline-choice-sentences" },
    imageDependencies: [{ id: "ultimate-b2.students-book.unit-2.page-20-21", sourceRelativePath: "Contents/Resources/assets/books/book1/unit/2/parts/HD/parts_part_2.png" }],
    hotspotNavigation: {
      pageId: "page-reading-20-21",
      hotspotIds: ["hotspot-exercise-4"],
      coordinates: [{ left: 53.3, top: 48, width: 43.4, height: 29 }],
      presentation: "overlay-modal",
    },
  };
}

function questionStructureComplete(activity) {
  if (!activity.questions.length || !activity.answerRecords.length) return false;
  const answerById = new Map(activity.answerRecords.map((record) => [record.id, record]));
  return activity.questions.every((question) => question.prompt
    && question.answerRecordIds.length
    && question.answerRecordIds.every((id) => answerById.get(id)?.optionIds.length)
    && (!["multiple-choice", "multiple-select", "matching", "classification-grouping", "drag-and-drop-matching"].includes(activity.activityType)
      || question.options.length >= 2 && question.options.every((option) => option.value)));
}

function qualityFor(activity, malformed) {
  const categories = [];
  if (malformed) categories.push("malformed-source");
  if (activity.activityType === "media-only-interaction") categories.push("media-only");
  if (activity.activityType === "unsupported-publisher-interaction") categories.push("unsupported-interaction");
  if (activity.answerRecords.length) categories.push("answer-evidence-present");
  else categories.push("answer-evidence-missing");
  const complete = questionStructureComplete(activity);
  if (!complete) categories.push("question-structure-incomplete");
  if (complete && SUPPORTED_TYPES.has(activity.activityType) && !malformed) {
    categories.push("ready-for-editorial-review", "ready-for-implementation");
  }
  return categories;
}

export function validateNormalizedActivity(activity) {
  const errors = [];
  const requiredStrings = ["id", "publisherSourceActivityId", "book", "component", "activityType", "title", "extractionConfidence", "editorialStatus", "publicationStatus"];
  requiredStrings.forEach((field) => { if (typeof activity?.[field] !== "string" || !activity[field]) errors.push(`${field} is required`); });
  if (!NORMALIZED_ACTIVITY_TYPES.includes(activity?.activityType)) errors.push(`Unsupported normalized activity type: ${activity?.activityType}`);
  ["unitNumber", "partNumber", "physicalPageNumber", "activityOrder"].forEach((field) => { if (!Number.isInteger(activity?.[field])) errors.push(`${field} must be an integer`); });
  if (!Array.isArray(activity?.questions) || !Array.isArray(activity?.answerRecords)) errors.push("questions and answerRecords must be arrays");
  if (!Array.isArray(activity?.sourceProvenance) || !activity.sourceProvenance.length) errors.push("sourceProvenance is required");
  const questionIds = new Set();
  const optionIds = new Set();
  for (const question of activity?.questions || []) {
    if (!question.id || questionIds.has(question.id)) errors.push(`duplicate or missing question id: ${question.id || "[missing]"}`);
    questionIds.add(question.id);
    for (const option of question.options || []) {
      if (!option.id) errors.push("option id is missing");
      optionIds.add(option.id);
    }
  }
  const answerIds = new Set();
  for (const answer of activity?.answerRecords || []) {
    if (!answer.id || answerIds.has(answer.id)) errors.push(`duplicate or missing answer id: ${answer.id || "[missing]"}`);
    answerIds.add(answer.id);
    if (!questionIds.has(answer.questionId)) errors.push(`answer ${answer.id} references an unknown question`);
    answer.optionIds.forEach((id) => { if (!optionIds.has(id)) errors.push(`answer ${answer.id} references unknown option ${id}`); });
    if (activity.qualityCategories?.includes("ready-for-implementation") && (!answer.optionIds.length || answer.normalizedAnswerValue === null)) errors.push(`answer ${answer.id} has no normalized answer`);
  }
  if (activity.qualityCategories?.includes("ready-for-implementation")) {
    if (!activity.questions.length) errors.push("ready activity has no questions");
    if (!activity.answerRecords.length) errors.push("ready activity has no explicit answers");
    activity.questions.forEach((question) => {
      if (!question.prompt) errors.push(`ready question ${question.id} has no prompt`);
      if (!question.answerRecordIds?.length) errors.push(`ready question ${question.id} has no answer relationship`);
    });
  }
  const absolutePattern = /(?:^|["'])[A-Za-z]:[\\/]|(?:^|["'])\/(?:Users|home|var|tmp)\//;
  if (absolutePattern.test(JSON.stringify(activity))) errors.push("absolute path leakage detected");
  if (activity.publicationStatus !== "disabled") errors.push("automatic publication must remain disabled");
  return { valid: errors.length === 0, errors };
}

export function validateNormalizedCatalog(activities) {
  const errors = [];
  const ids = new Set();
  activities.forEach((activity) => {
    if (ids.has(activity.id)) errors.push(`duplicate activity id: ${activity.id}`);
    ids.add(activity.id);
    const result = validateNormalizedActivity(activity);
    if (!result.valid) errors.push(...result.errors.map((error) => `${activity.id}: ${error}`));
  });
  return { valid: errors.length === 0, errors };
}

export function normalizeActivity({ sourceActivity, unitNumber, decodedEntries, objectFiles = [] }) {
  const publisherTypes = sourceActivity.publisherExerciseTypes || [];
  const evidence = publisherEvidence(sourceActivity.id, decodedEntries);
  const base = {
    schemaVersion: "1.0",
    id: sourceActivity.id,
    aliases: [],
    publisherSourceActivityId: sourceActivity.id,
    book: "ultimate-b2",
    component: "students-book",
    unitNumber,
    partNumber: sourceActivity.partNumber,
    physicalPageNumber: sourceActivity.pageNumber,
    spread: sourceActivity.spreadNumber,
    activityOrder: sourceActivity.order,
    activityType: normalizedType(publisherTypes),
    publisherInteractionTypes: publisherTypes,
    title: `Unit ${unitNumber} / Part ${sourceActivity.partNumber} / Object ${sourceActivity.order}`,
    titleSource: "application-generated-diagnostic",
    instructions: null,
    questions: evidence.questions,
    answerRecords: evidence.answerRecords,
    scoringRules: {
      mode: "exact-explicit-answer",
      pointsPerQuestion: 1,
      maxScore: evidence.questions.length,
      feedback: { source: "application-generated", correct: "Correct", incorrect: "Incorrect", retry: "Try again", review: "Review your answer" },
    },
    mediaDependencies: sourceActivity.media.map((sourceRelativePath) => ({ id: sourceRelativePath, type: /\.mp3$/i.test(sourceRelativePath) ? "audio" : "video", required: false })),
    imageDependencies: objectFiles.filter((file) => file.originalClassification === "students-book-image").map((file) => ({ id: file.sha256, sourceRelativePath: file.sourceRelativePath })),
    hotspotNavigation: {
      pageId: `ultimate-b2-sb-u${unitNumber}-part-${sourceActivity.partNumber}`,
      hotspotIds: [],
      coordinates: [],
      presentation: "overlay-modal",
    },
    sourceProvenance: [...new Set(sourceActivity.sourceMetadataFiles)].sort(),
    extractionConfidence: "confirmed-structural",
    editorialStatus: "manual-review-required",
    publicationStatus: "disabled",
    qualityCategories: [],
    implementationStatus: "not-implemented",
    unsupportedSourceFields: publisherTypes.filter((type) => ["ticTacToe", "choosingGame", "score4", "spinningWheel", "print", "karaokeScroll", "display"].includes(type)),
    extractionWarnings: [],
    presentationData: {},
  };
  let curated = null;
  if (base.id === CURATED_ACTIVITY_IDS.exercise3) curated = curateReadingExercise3(base, decodedEntries);
  if (base.id === CURATED_ACTIVITY_IDS.exercise4) curated = curateReadingExercise4(base, decodedEntries);
  if (curated) {
    Object.assign(base, curated, {
      aliases: [base.id === CURATED_ACTIVITY_IDS.exercise3 ? "reading-ex3" : "reading-ex4"],
      titleSource: "confirmed-existing-page-audit",
      implementationStatus: "implemented-from-normalized-catalog",
    });
    base.scoringRules.maxScore = base.questions.length;
  }
  const malformed = decodedEntries.some((entry) => entry.error);
  base.extractionWarnings.push(...decodedEntries.filter((entry) => entry.error).map((entry) => `${entry.relativePath}: ${entry.error}`));
  base.qualityCategories = qualityFor(base, malformed);
  const validation = validateNormalizedActivity(base);
  if (!validation.valid) {
    base.extractionWarnings.push(...validation.errors);
    base.qualityCategories = base.qualityCategories.filter((category) => category !== "ready-for-implementation");
  }
  return base;
}

async function readDecodedEntries(sourceRoot, sourcePaths) {
  const entries = [];
  for (const relativePath of sourcePaths.filter((value) => value.endsWith(".iwb"))) {
    const candidate = path.resolve(sourceRoot, relativePath);
    if (!isPathWithinRoot(sourceRoot, candidate)) throw new Error(`Decoded path escapes source root: ${relativePath}`);
    try {
      const decoded = decodeIwbXml(await readFile(candidate));
      entries.push({ relativePath, ...decoded });
    } catch (error) {
      entries.push({ relativePath, error: error.message });
    }
  }
  return entries;
}

export async function extractNormalizedActivities({ sourceRoot, scanResult = null } = {}) {
  if (!sourceRoot) throw new Error("A source root is required");
  const result = scanResult || await scanUltimateB2StudentsBook({ sourceRoot });
  const activities = [];
  const excludedObjects = [];
  for (const unit of result.structure.units) {
    for (const sourceActivity of unit.activities) {
      if (!sourceActivity.detectedExercise) {
        excludedObjects.push({
          id: sourceActivity.id,
          unitNumber: unit.number,
          partNumber: sourceActivity.partNumber,
          physicalPageNumber: sourceActivity.pageNumber,
          classification: sourceActivity.mediaOnlyObject || sourceActivity.recoverability === "media-only" ? "media-only" : "excluded-non-exercise",
          sourceProvenance: sourceActivity.sourceMetadataFiles,
        });
        continue;
      }
      const decodedEntries = await readDecodedEntries(sourceRoot, sourceActivity.sourceMetadataFiles);
      const objectFiles = result.inventory.filter((file) => file.suspectedActivityId === sourceActivity.id);
      activities.push(normalizeActivity({ sourceActivity, unitNumber: unit.number, decodedEntries, objectFiles }));
    }
  }
  activities.sort((left, right) => left.unitNumber - right.unitNumber || left.partNumber - right.partNumber || left.activityOrder - right.activityOrder || left.id.localeCompare(right.id));
  const validation = validateNormalizedCatalog(activities);
  const ready = activities.filter((activity) => activity.qualityCategories.includes("ready-for-implementation"));
  return {
    schemaVersion: "1.0",
    activities,
    excludedObjects,
    validation,
    summary: {
      definiteActivityCount: activities.length,
      readyForImplementationCount: ready.length,
      explicitAnswerEvidenceCount: activities.filter((activity) => activity.answerRecords.length).length,
      missingAnswerEvidenceCount: activities.filter((activity) => !activity.answerRecords.length).length,
      activityTypes: [...new Set(activities.map((activity) => activity.activityType))].sort(),
    },
  };
}
