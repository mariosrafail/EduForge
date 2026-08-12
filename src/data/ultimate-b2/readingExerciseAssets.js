import completeInstruction from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj4/image_2.png";
import completeShowText from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj4/showText.png";
import debateBadge from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_1.png";
import debateInstruction from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_2.png";
import debateArgumentOne from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_3.png";
import debateArgumentTwo from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_4.png";
import debatePartOne from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_5.png";
import debatePartTwo from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_6.png";

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

export function resolveUltimateB2ReadingExerciseAsset(binding) {
  return assetsByBinding[binding] || null;
}
