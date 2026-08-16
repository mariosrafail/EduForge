import { isNativeChildId } from "./nativeChildIdentity.js";

export const NATIVE_SINGLE_CHOICE_LIMITS = Object.freeze({ questions: 20, optionsMinimum: 2, optionsMaximum: 6, promptLength: 2_000, optionTextLength: 1_000 });

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function exactKeys(value, keys, label) {
  const actual = Object.keys(object(value, label)).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has missing or unknown fields.`);
}

function text(value, label, maximum) {
  if (typeof value !== "string" || value.length > maximum || /[<>\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} is invalid.`);
  return value.trim();
}

export function normalizeNativeSingleChoiceInteraction(input) {
  const value = structuredClone(object(input, "Native Single Choice interaction"));
  exactKeys(value, ["kind", "questions"], "Native Single Choice interaction");
  if (value.kind !== "single-choice" || !Array.isArray(value.questions) || value.questions.length > NATIVE_SINGLE_CHOICE_LIMITS.questions) throw new Error("Native Single Choice interaction is invalid.");
  const questionIds = new Set();
  return {
    kind: "single-choice",
    questions: value.questions.map((entry, questionIndex) => {
      const label = `Native Single Choice questions[${questionIndex}]`;
      exactKeys(entry, ["id", "prompt", "options"], label);
      if (!isNativeChildId(entry.id, "q") || questionIds.has(entry.id) || !Array.isArray(entry.options) || entry.options.length > NATIVE_SINGLE_CHOICE_LIMITS.optionsMaximum) throw new Error(`${label} is invalid.`);
      questionIds.add(entry.id);
      const optionIds = new Set();
      return {
        id: entry.id,
        prompt: text(entry.prompt, `${label}.prompt`, NATIVE_SINGLE_CHOICE_LIMITS.promptLength),
        options: entry.options.map((option, optionIndex) => {
          const optionLabel = `${label}.options[${optionIndex}]`;
          exactKeys(option, ["id", "text"], optionLabel);
          if (!isNativeChildId(option.id, "opt") || optionIds.has(option.id)) throw new Error(`${optionLabel}.id is invalid or duplicate.`);
          optionIds.add(option.id);
          return { id: option.id, text: text(option.text, `${optionLabel}.text`, NATIVE_SINGLE_CHOICE_LIMITS.optionTextLength) };
        }),
      };
    }),
  };
}

export function normalizeNativeSingleChoiceSolution(input) {
  const value = structuredClone(object(input, "Native Single Choice Teacher solution"));
  exactKeys(value, ["kind", "correctAnswers"], "Native Single Choice Teacher solution");
  if (value.kind !== "single-choice" || !Array.isArray(value.correctAnswers) || value.correctAnswers.length > NATIVE_SINGLE_CHOICE_LIMITS.questions) throw new Error("Native Single Choice Teacher solution is invalid.");
  const ids = new Set();
  return { kind: "single-choice", correctAnswers: value.correctAnswers.map((answer, index) => {
    const label = `Native Single Choice correctAnswers[${index}]`;
    exactKeys(answer, ["questionId", "correctOptionId"], label);
    if (!isNativeChildId(answer.questionId, "q") || !isNativeChildId(answer.correctOptionId, "opt") || ids.has(answer.questionId)) throw new Error(`${label} is invalid or duplicate.`);
    ids.add(answer.questionId);
    return { questionId: answer.questionId, correctOptionId: answer.correctOptionId };
  }) };
}

export function validateNativeSingleChoiceTopology(publicDocument, teacherDocument) {
  const questions = publicDocument.parts[0].interaction.questions;
  const answers = teacherDocument.parts[0].solution.correctAnswers;
  if (questions.length !== answers.length || questions.some((question, index) => question.id !== answers[index]?.questionId || !question.options.some((option) => option.id === answers[index]?.correctOptionId))) {
    throw new Error("Native Single Choice answers must exactly match public question identity, order, and options.");
  }
  return true;
}

export function assessNativeSingleChoiceReadiness(publicDocument, teacherDocument) {
  const questions = publicDocument.parts[0].interaction.questions;
  const answers = new Map(teacherDocument.parts[0].solution.correctAnswers.map((answer) => [answer.questionId, answer.correctOptionId]));
  const issues = [];
  if (!questions.length) issues.push("Add at least one question.");
  questions.forEach((question, index) => {
    if (!question.prompt) issues.push(`Question ${index + 1} needs a prompt.`);
    if (question.options.length < NATIVE_SINGLE_CHOICE_LIMITS.optionsMinimum) issues.push(`Question ${index + 1} needs at least two options.`);
    question.options.forEach((option, optionIndex) => { if (!option.text) issues.push(`Question ${index + 1}, option ${optionIndex + 1} needs text.`); });
    if (!question.options.some((option) => option.id === answers.get(question.id))) issues.push(`Question ${index + 1} needs a correct option.`);
  });
  return { ready: issues.length === 0, issues };
}

export function createNativeSingleChoiceQuestion(questionId, optionIds) {
  if (!isNativeChildId(questionId, "q") || !Array.isArray(optionIds) || optionIds.length < 2 || optionIds.some((id) => !isNativeChildId(id, "opt"))) throw new Error("Native Single Choice child identities are invalid.");
  return { id: questionId, prompt: "", options: optionIds.map((id) => ({ id, text: "" })) };
}
