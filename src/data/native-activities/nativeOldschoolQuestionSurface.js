import { NATIVE_OPEN_RESPONSE_LEGACY_PANEL_ID } from "./nativeOpenResponse.js";

export function normalizeOldschoolQuestionSurface(input, questions) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).sort().join(",") !== "promptQuestionIds,responseQuestionIds") throw new Error("Oldschool question surface has missing or unknown fields.");
  const ids = new Set(questions.map((question) => question.id));
  return Object.fromEntries(["promptQuestionIds", "responseQuestionIds"].map((key) => {
    const values = input[key];
    if (!Array.isArray(values) || values.length > questions.length || new Set(values).size !== values.length || values.some((id) => !ids.has(id))) throw new Error(`Oldschool question surface ${key} is invalid.`);
    return [key, questions.filter((question) => values.includes(question.id)).map((question) => question.id)];
  }));
}

export function oldschoolQuestionPanel(interaction, { authoring = false } = {}) {
  const ids = interaction.questions.map((question) => question.id);
  return {
    id: NATIVE_OPEN_RESPONSE_LEGACY_PANEL_ID,
    surface: { width: interaction.panels[0].sourceWidth, height: interaction.panels[0].sourceHeight },
    images: (interaction.artwork || []).map((image) => authoring ? image : { ...image, id: image.id.replace(/^art-/, "img-") }),
    ...(interaction.questionSurface || { promptQuestionIds: ids, responseQuestionIds: ids }),
  };
}

export function setOldschoolQuestionMembership(interaction, questionId, membership, included) {
  if (!["prompt", "response"].includes(membership) || !interaction.questions.some((question) => question.id === questionId)) throw new Error("Oldschool question membership is invalid.");
  const panel = oldschoolQuestionPanel(interaction);
  const key = membership === "prompt" ? "promptQuestionIds" : "responseQuestionIds";
  const values = new Set(panel[key]);
  if (included) values.add(questionId); else values.delete(questionId);
  interaction.questionSurface = normalizeOldschoolQuestionSurface({ promptQuestionIds: panel.promptQuestionIds, responseQuestionIds: panel.responseQuestionIds, [key]: [...values] }, interaction.questions);
}
