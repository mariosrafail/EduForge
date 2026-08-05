import { safeCount, safeText } from "./review-studio-security.mjs";

function list(value) { return Array.isArray(value) ? value : []; }

function safeContentNode(node, valueField, availabilityField, safeGeometry) {
  return {
    id: safeText(node.id, "unavailable", 128),
    [valueField]: typeof node[valueField] === "string" ? safeText(node[valueField], "", 4000) : null,
    [availabilityField]: safeText(node[availabilityField], "unavailable", 80),
    geometry: safeGeometry(node.geometry),
  };
}

function safeQuestion(question, safeGeometry) {
  return {
    id: safeText(question.id, "question", 128),
    prompt: typeof question.prompt === "string" ? safeText(question.prompt, "", 4000) : null,
    promptAvailability: safeText(question.promptAvailability, "unavailable", 80),
    responseKind: safeText(question.responseKind, "unresolved", 80),
    options: list(question.options).slice(0, 100).map((option) => ({
      id: safeText(option.id, "option", 128),
      order: safeCount(option.order),
      text: typeof option.text === "string" ? safeText(option.text, "", 2000) : null,
      textAvailability: safeText(option.textAvailability, "unavailable", 80),
      geometry: safeGeometry(option.geometry),
    })),
  };
}

export function safeActivityContentDetail(candidate, safeGeometry) {
  return {
    displayTitle: typeof candidate.displayTitle === "string" ? safeText(candidate.displayTitle, "", 300) : null,
    displayTitleAvailability: safeText(candidate.displayTitleAvailability, "raster-only-or-missing", 80),
    instructions: typeof candidate.instructions === "string" ? safeText(candidate.instructions, "", 4000) : null,
    instructionAvailability: safeText(candidate.instructionAvailability, "raster-only-or-missing", 80),
    questions: list(candidate.questions).slice(0, 100).map((item) => safeQuestion(item, safeGeometry)),
    draggables: list(candidate.draggables).slice(0, 100).map((item) => safeContentNode(item, "label", "labelAvailability", safeGeometry)),
    targets: list(candidate.targets).slice(0, 100).map((item) => safeContentNode(item, "label", "labelAvailability", safeGeometry)),
    responseFieldItems: list(candidate.responseFields).slice(0, 100).map((item) => safeContentNode(item, "prompt", "promptAvailability", safeGeometry)),
  };
}
