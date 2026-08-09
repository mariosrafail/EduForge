export const ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID = "ultimate-b2-sb-u1-p1-o1";
export const ULTIMATE_B2_PAGE5_PUBLISHER_DISPLAY_ID = "ultimate-b2-sb-u1-p1-o2";

const questionIds = Object.freeze([
  `${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}-q1`,
  `${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}-q2`,
  `${ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID}-q3`,
]);

const artworkBindings = Object.freeze({
  instruction: "unit1.page5.exercise1.instruction",
  quote: "unit1.page5.exercise1.quote",
  heading: "unit1.page5.exercise2.heading",
});

export const ultimateB2Page5AuthoringLimits = Object.freeze({
  payloadBytes: 24_000,
  questionCount: 3,
  textLength: 1_000,
  modelAnswerLength: 3_000,
  bulletCount: 8,
  bulletTextLength: 500,
});

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, allowed, label) {
  const keys = Object.keys(record(value, label));
  const allowedSet = new Set(allowed);
  if (keys.some((key) => !allowedSet.has(key)) || allowed.some((key) => !keys.includes(key))) {
    throw new Error(`${label} has missing or unknown fields.`);
  }
}

function boundedText(value, label, maximum, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || value.length > maximum || (!allowEmpty && !value.trim())) {
    throw new Error(`${label} must be ${allowEmpty ? "a" : "a non-empty"} string no longer than ${maximum} characters.`);
  }
  if (/[<>]/.test(value)) throw new Error(`${label} must not contain HTML markup.`);
  return value.trim();
}

function assertPayloadSize(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > ultimateB2Page5AuthoringLimits.payloadBytes) throw new Error("Page 5 authoring payload is too large.");
}

export function normalizeUltimateB2Page5OpenResponseAuthoring(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Open-response authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "instructionText", "instructionArtworkBinding", "quoteArtworkBinding", "questions"], "Open-response authoring");
  if (value.schemaVersion !== 1) throw new Error("Unsupported open-response schema version.");
  if (value.activityId !== ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) throw new Error("Unexpected open-response activity ID.");
  if (value.instructionArtworkBinding !== artworkBindings.instruction || value.quoteArtworkBinding !== artworkBindings.quote) throw new Error("Unknown open-response artwork binding.");
  if (!Array.isArray(value.questions) || value.questions.length !== questionIds.length) throw new Error("Open-response authoring must contain exactly three questions.");
  const questions = value.questions.map((question, index) => {
    exactKeys(question, ["id", "prompt"], `questions[${index}]`);
    if (question.id !== questionIds[index]) throw new Error(`questions[${index}].id is fixed and cannot be changed.`);
    return { id: question.id, prompt: boundedText(question.prompt, `questions[${index}].prompt`, ultimateB2Page5AuthoringLimits.textLength) };
  });
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    instructionText: boundedText(value.instructionText, "instructionText", ultimateB2Page5AuthoringLimits.textLength),
    instructionArtworkBinding: value.instructionArtworkBinding,
    quoteArtworkBinding: value.quoteArtworkBinding,
    questions,
  };
}

export function normalizeUltimateB2Page5TeacherAnswers(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Teacher answer authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "modelAnswers"], "Teacher answer authoring");
  if (value.schemaVersion !== 1) throw new Error("Unsupported Teacher answer schema version.");
  if (value.activityId !== ULTIMATE_B2_PAGE5_OPEN_RESPONSE_ID) throw new Error("Unexpected Teacher answer activity ID.");
  if (!Array.isArray(value.modelAnswers) || value.modelAnswers.length !== questionIds.length) throw new Error("Teacher answer authoring must contain exactly three model answers.");
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    modelAnswers: value.modelAnswers.map((answer, index) => {
      exactKeys(answer, ["questionId", "text"], `modelAnswers[${index}]`);
      if (answer.questionId !== questionIds[index]) throw new Error(`modelAnswers[${index}].questionId is fixed and cannot be changed.`);
      return { questionId: answer.questionId, text: boundedText(answer.text, `modelAnswers[${index}].text`, ultimateB2Page5AuthoringLimits.modelAnswerLength) };
    }),
  };
}

export function normalizeUltimateB2Page5PublisherDisplayAuthoring(input) {
  assertPayloadSize(input);
  const value = structuredClone(record(input, "Publisher-display authoring"));
  exactKeys(value, ["schemaVersion", "activityId", "headingArtworkBinding", "imageAlt", "bullets"], "Publisher-display authoring");
  if (value.schemaVersion !== 1) throw new Error("Unsupported publisher-display schema version.");
  if (value.activityId !== ULTIMATE_B2_PAGE5_PUBLISHER_DISPLAY_ID) throw new Error("Unexpected publisher-display activity ID.");
  if (value.headingArtworkBinding !== artworkBindings.heading) throw new Error("Unknown publisher-display artwork binding.");
  if (!Array.isArray(value.bullets) || value.bullets.length < 1 || value.bullets.length > ultimateB2Page5AuthoringLimits.bulletCount) throw new Error("Publisher display must contain 1–8 bullets.");
  const ids = new Set();
  const bullets = value.bullets.map((bullet, index) => {
    exactKeys(bullet, ["id", "text"], `bullets[${index}]`);
    const id = boundedText(bullet.id, `bullets[${index}].id`, 80);
    if (!/^bullet-[1-9][0-9]*$/.test(id) || ids.has(id)) throw new Error(`bullets[${index}].id is invalid or duplicated.`);
    ids.add(id);
    return { id, text: boundedText(bullet.text, `bullets[${index}].text`, ultimateB2Page5AuthoringLimits.bulletTextLength) };
  });
  return {
    schemaVersion: 1,
    activityId: value.activityId,
    headingArtworkBinding: value.headingArtworkBinding,
    imageAlt: boundedText(value.imageAlt, "imageAlt", ultimateB2Page5AuthoringLimits.textLength),
    bullets,
  };
}

export const ultimateB2Page5ArtworkBindings = artworkBindings;
export const ultimateB2Page5QuestionIds = questionIds;
