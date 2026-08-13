export const ULTIMATE_B2_HOSTED_OPEN_RESPONSE_SCHEMA_VERSION = "1.0";

const maximumTextLength = 2_000;
const unsafePublicText = /(?:[<>]|https?:\/\/|file:\/\/|www\.|[a-z]:[\\/]|\\\\|(?:^|\s)\.\.[\\/]|\/(?:api|auth|\.netlify)\/)/i;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unsupported fields.`);
}

function publicText(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || value.length > maximumTextLength || (!allowEmpty && !value.trim())) throw new Error(`${label} is invalid.`);
  if (unsafePublicText.test(value)) throw new Error(`${label} cannot contain URLs or filesystem paths.`);
  return value;
}

export function createUltimateB2HostedOpenResponseSeed(activity) {
  const activityId = String(activity?.stableNormalizedId || "");
  const questions = activity?.runtime?.questions;
  if (!activityId || !Array.isArray(questions) || !questions.length) throw new Error("The canonical Open Response activity is unavailable.");
  return Object.freeze({
    schemaVersion: ULTIMATE_B2_HOSTED_OPEN_RESPONSE_SCHEMA_VERSION,
    activityId,
    visibleInstructionText: publicText(String(activity.visibleInstructionText || ""), "visibleInstructionText", { allowEmpty: true }),
    questions: questions.map((question, index) => Object.freeze({
      id: publicText(String(question?.id || ""), `questions[${index}].id`),
      prompt: publicText(String(question?.prompt || ""), `questions[${index}].prompt`),
    })),
  });
}

export function normalizeUltimateB2HostedOpenResponseDraft(input, canonicalSeed) {
  exactKeys(input, ["schemaVersion", "activityId", "visibleInstructionText", "questions"], "Open Response draft");
  if (input.schemaVersion !== ULTIMATE_B2_HOSTED_OPEN_RESPONSE_SCHEMA_VERSION) throw new Error("Unsupported hosted Open Response schema version.");
  if (!canonicalSeed || input.activityId !== canonicalSeed.activityId) throw new Error("Open Response activity ID does not match the canonical activity.");
  if (!Array.isArray(input.questions) || input.questions.length !== canonicalSeed.questions.length) throw new Error("Open Response questions must match the canonical activity.");
  return {
    schemaVersion: input.schemaVersion,
    activityId: input.activityId,
    visibleInstructionText: publicText(input.visibleInstructionText, "visibleInstructionText", { allowEmpty: true }),
    questions: input.questions.map((question, index) => {
      exactKeys(question, ["id", "prompt"], `questions[${index}]`);
      if (question.id !== canonicalSeed.questions[index].id) throw new Error(`questions[${index}].id must match canonical source order.`);
      return { id: question.id, prompt: publicText(question.prompt, `questions[${index}].prompt`) };
    }),
  };
}

export function applyUltimateB2HostedOpenResponseDraft(activity, input) {
  if (!activity || !input) return activity;
  const draft = normalizeUltimateB2HostedOpenResponseDraft(input, createUltimateB2HostedOpenResponseSeed(activity));
  const prompts = new Map(draft.questions.map((question) => [question.id, question.prompt]));
  return {
    ...activity,
    visibleInstructionText: draft.visibleInstructionText,
    runtime: {
      ...activity.runtime,
      questions: activity.runtime.questions.map((question) => ({ ...question, prompt: prompts.get(question.id) })),
    },
  };
}
