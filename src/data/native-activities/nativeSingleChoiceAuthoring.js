import { createNativeChildId } from "./nativeChildIdentity.js";
import { removeNativeManagedAssetReferenceIfUnused } from "./nativeActivityPublic.js";
import { createNativeSingleChoiceQuestion } from "./nativeSingleChoice.js";

function interaction(publicDocument) {
  return publicDocument.parts[0].interaction;
}

function solution(teacherDocument) {
  return teacherDocument.parts[0].solution;
}

export function alignNativeSingleChoiceAnswers(publicDocument, teacherDocument) {
  const answers = new Map(solution(teacherDocument).correctAnswers.map((answer) => [answer.questionId, answer]));
  solution(teacherDocument).correctAnswers = interaction(publicDocument).questions.flatMap((question) => {
    const answer = answers.get(question.id);
    return answer && question.options.some((option) => option.id === answer.correctOptionId) ? [answer] : [];
  });
  return teacherDocument;
}

export function addUnansweredNativeSingleChoiceQuestion(publicDocument, teacherDocument, createId = createNativeChildId) {
  const questionId = createId("q");
  const optionIds = [createId("opt"), createId("opt")];
  interaction(publicDocument).questions.push(createNativeSingleChoiceQuestion(questionId, optionIds));
  alignNativeSingleChoiceAnswers(publicDocument, teacherDocument);
  return { questionId, optionIds };
}

export function setNativeSingleChoiceCorrectAnswer(publicDocument, teacherDocument, questionId, correctOptionId) {
  const question = interaction(publicDocument).questions.find((entry) => entry.id === questionId);
  if (!question || !question.options.some((option) => option.id === correctOptionId)) throw new Error("Correct answer must reference an option on its question.");
  const answers = solution(teacherDocument).correctAnswers;
  const current = answers.find((answer) => answer.questionId === questionId);
  if (current) current.correctOptionId = correctOptionId;
  else answers.push({ questionId, correctOptionId });
  alignNativeSingleChoiceAnswers(publicDocument, teacherDocument);
  return teacherDocument;
}

export function removeNativeSingleChoiceQuestion(publicDocument, teacherDocument, questionId) {
  interaction(publicDocument).questions = interaction(publicDocument).questions.filter((question) => question.id !== questionId);
  const presentation = interaction(publicDocument).presentation;
  if (presentation) for (const panel of presentation.panels) panel.hotspots = panel.hotspots.filter((hotspot) => hotspot.questionId !== questionId);
  alignNativeSingleChoiceAnswers(publicDocument, teacherDocument);
}

export function removeNativeSingleChoiceOption(publicDocument, teacherDocument, questionId, optionId) {
  const question = interaction(publicDocument).questions.find((entry) => entry.id === questionId);
  if (!question) return;
  question.options = question.options.filter((option) => option.id !== optionId);
  const presentation = interaction(publicDocument).presentation;
  if (presentation) for (const panel of presentation.panels) panel.hotspots = panel.hotspots.filter((hotspot) => hotspot.questionId !== questionId || hotspot.optionId !== optionId);
  alignNativeSingleChoiceAnswers(publicDocument, teacherDocument);
}

export function createNativeSingleChoiceVisualPanel(createId = createNativeChildId) {
  return { id: createId("panel"), backgroundAssetSlot: "", sourceWidth: 1024, sourceHeight: 582, hotspots: [] };
}

export function enableNativeSingleChoiceVisualPresentation(publicDocument, createId = createNativeChildId) {
  const current = interaction(publicDocument);
  if (!current.presentation) current.presentation = { kind: "image-hotspot", panels: [createNativeSingleChoiceVisualPanel(createId)] };
  return current.presentation;
}

export function removeNativeSingleChoiceVisualPresentation(publicDocument) {
  const slots = interaction(publicDocument).presentation?.panels.map((panel) => panel.backgroundAssetSlot).filter(Boolean) || [];
  delete interaction(publicDocument).presentation;
  slots.forEach((slot) => removeNativeManagedAssetReferenceIfUnused(publicDocument, slot));
}
