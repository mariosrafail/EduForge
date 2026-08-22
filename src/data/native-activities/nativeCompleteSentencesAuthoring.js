import { createNativeChildId } from "./nativeChildIdentity.js";
import { removeNativeManagedAssetReferenceIfUnused } from "./nativeActivityPublic.js";

const interaction = (document) => document.parts[0].interaction;
const solution = (document) => document.parts[0].solution;

export function addNativeCompleteSentencesItem(publicDocument, teacherDocument, createId = createNativeChildId) {
  const itemId = createId("item");
  interaction(publicDocument).items.push({ id: itemId, prompt: "" });
  solution(teacherDocument).answers.push({ itemId, text: "" });
  return itemId;
}

export function alignNativeCompleteSentencesAnswers(publicDocument, teacherDocument) {
  const answers = new Map(solution(teacherDocument).answers.map((answer) => [answer.itemId, answer]));
  solution(teacherDocument).answers = interaction(publicDocument).items.map((item) => answers.get(item.id) || { itemId: item.id, text: "" });
}

export function removeNativeCompleteSentencesItem(publicDocument, teacherDocument, itemId) {
  interaction(publicDocument).items = interaction(publicDocument).items.filter((item) => item.id !== itemId);
  interaction(publicDocument).presentation.hotspots = interaction(publicDocument).presentation.hotspots.filter((hotspot) => hotspot.itemId !== itemId);
  alignNativeCompleteSentencesAnswers(publicDocument, teacherDocument);
}

export function replaceNativeCompleteSentencesBackground(publicDocument, reference, dimensions) {
  const presentation = interaction(publicDocument).presentation;
  const previous = presentation.backgroundAssetSlot;
  presentation.backgroundAssetSlot = reference.slot;
  presentation.sourceWidth = dimensions.width;
  presentation.sourceHeight = dimensions.height;
  presentation.hotspots = [];
  if (previous && previous !== reference.slot) removeNativeManagedAssetReferenceIfUnused(publicDocument, previous);
}
