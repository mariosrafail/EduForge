import authoring from "./_ultimate-b2-unit1-opener-model-answers.json" with { type: "json" };
import { normalizeUltimateB2Page5TeacherAnswers } from "../../src/data/ultimate-b2/page5AuthoringSchema.js";

const normalized = normalizeUltimateB2Page5TeacherAnswers(authoring);

export const ULTIMATE_B2_UNIT1_OPENER_MODEL_ANSWERS = Object.freeze(
  Object.fromEntries(normalized.modelAnswers.map((answer) => [answer.questionId, answer.text])),
);
