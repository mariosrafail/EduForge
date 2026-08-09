import completeInstruction from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj4/image_2.png";
import completeShowText from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj4/showText.png";
import debateBadge from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_1.png";
import debateInstruction from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_2.png";
import debateArgumentOne from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_3.png";
import debateArgumentTwo from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_4.png";
import debatePartOne from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_5.png";
import debatePartTwo from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_6.png";
import completeSource from "./authoring/unit-01-reading-exercise-4.complete-sentences.json" with { type: "json" };
import debateSource from "./authoring/unit-01-reading-debate-club.open-answer.json" with { type: "json" };
import { ultimateB2ExercisePresentationFeatures } from "./exerciseVisualCapabilities.js";
import {
  normalizeUltimateB2CompleteSentencesAuthoring,
  normalizeUltimateB2DebateClubAuthoring,
  ULTIMATE_B2_COMPLETE_SENTENCES_ID,
  ULTIMATE_B2_DEBATE_CLUB_ID,
} from "./readingExerciseAuthoringSchema.js";

const assetsByBinding = Object.freeze({
  "unit1.reading.exercise4.instruction": completeInstruction,
  "unit1.reading.exercise4.show-text": completeShowText,
  "unit1.reading.debate-club.instruction": debateInstruction,
  "unit1.reading.debate-club.badge": debateBadge,
  "unit1.reading.debate-club.part-1-photo": debatePartOne,
  "unit1.reading.debate-club.part-2-photo": debatePartTwo,
  "unit1.reading.debate-club.part-1-argument": debateArgumentOne,
  "unit1.reading.debate-club.part-2-argument": debateArgumentTwo,
});

const completeSentences = Object.freeze(normalizeUltimateB2CompleteSentencesAuthoring(completeSource));
const debateClub = Object.freeze(normalizeUltimateB2DebateClubAuthoring(debateSource));

export function resolveUltimateB2ReadingExerciseAsset(binding) {
  return assetsByBinding[binding] || null;
}

export function getUltimateB2ReadingExerciseAuthoring(activityOrId) {
  const activityId = typeof activityOrId === "string" ? activityOrId : activityOrId?.stableNormalizedId;
  if (activityId === ULTIMATE_B2_COMPLETE_SENTENCES_ID) return completeSentences;
  if (activityId === ULTIMATE_B2_DEBATE_CLUB_ID) return debateClub;
  return null;
}

export function getUltimateB2ReadingExercisePresentationFeatures(activityOrId) {
  return ultimateB2ExercisePresentationFeatures(getUltimateB2ReadingExerciseAuthoring(activityOrId));
}
