import completeSentencesSource from "./runtime/unit-01-reading-exercise-4.complete-sentences.json" with { type: "json" };
import debateClubSource from "./runtime/unit-01-reading-debate-club.open-answer.json" with { type: "json" };
import { ultimateB2ExercisePresentationFeatures } from "./exerciseVisualCapabilities.js";

export const ULTIMATE_B2_COMPLETE_SENTENCES_ID = "ultimate-b2-sb-u1-p2-o4";
export const ULTIMATE_B2_DEBATE_CLUB_ID = "ultimate-b2-sb-u1-p2-o5";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value).forEach(deepFreeze);
  return value;
}

const completeSentences = deepFreeze(structuredClone(completeSentencesSource));
const debateClub = deepFreeze(structuredClone(debateClubSource));

export function getUltimateB2ReadingExerciseRuntime(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  if (activityId === ULTIMATE_B2_COMPLETE_SENTENCES_ID) return completeSentences;
  if (activityId === ULTIMATE_B2_DEBATE_CLUB_ID) return debateClub;
  return null;
}

export function getUltimateB2ReadingExercisePresentationFeatures(activityOrId) {
  return ultimateB2ExercisePresentationFeatures(getUltimateB2ReadingExerciseRuntime(activityOrId));
}
