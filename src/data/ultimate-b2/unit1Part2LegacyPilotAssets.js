import obj1Instruction from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj1/image_2.png";
import obj1Worksheet from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj1/page_1.jpg";
import obj1WorksheetPdf from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj1/video-worksheet.pdf?url";
import obj1Captions from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj1/video/obj1.vtt?url";
import obj2Background from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj2/image_1.png";
import obj2Instruction from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj2/image_2.png";
import obj2ReadingText from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj2/showText.png";
import obj3QuestionsOneToFour from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj3/image_1.png";
import obj3Instruction from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj3/image_2.png";
import obj3QuestionsFiveToSix from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj3/image_3.png";
import obj3ReadingText from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj3/showText.png";
import obj4Instruction from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj4/image_2.png";
import obj4ReadingText from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj4/showText.png";
import obj5DebateClub from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_1.png";
import obj5Instruction from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_2.png";
import obj5HomeArgument from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_3.png";
import obj5CinemaArgument from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_4.png";
import obj5HomePhoto from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_5.png";
import obj5CinemaPhoto from "../../assets/books/ultimate-b2/legacy-pilot/unit-1/part-2/obj5/image_6.png";

export const ULTIMATE_B2_UNIT1_PART2_PILOT_IDS = Object.freeze([
  "ultimate-b2-sb-u1-p2-o1",
  "ultimate-b2-sb-u1-p2-o2",
  "ultimate-b2-sb-u1-p2-o3",
  "ultimate-b2-sb-u1-p2-o4",
  "ultimate-b2-sb-u1-p2-o5",
]);

const pilotIdSet = new Set(ULTIMATE_B2_UNIT1_PART2_PILOT_IDS);

export function isUltimateB2Unit1Part2LegacyPilot(activity) {
  return Boolean(
    activity
    && pilotIdSet.has(activity.stableNormalizedId)
    && activity.unitNumber === 1
    && activity.partNumber === 2,
  );
}

export const ultimateB2Unit1Part2LegacyImages = Object.freeze({
  "ultimate-b2-sb-u1-p2-o1": {
    instruction: obj1Instruction,
    worksheet: obj1Worksheet,
    worksheetPdf: obj1WorksheetPdf,
    captions: obj1Captions,
  },
  "ultimate-b2-sb-u1-p2-o2": {
    instruction: obj2Instruction,
    background: obj2Background,
    readingText: obj2ReadingText,
  },
  "ultimate-b2-sb-u1-p2-o3": {
    instruction: obj3Instruction,
    questionPanels: [obj3QuestionsOneToFour, obj3QuestionsFiveToSix],
    readingText: obj3ReadingText,
  },
  "ultimate-b2-sb-u1-p2-o4": {
    instruction: obj4Instruction,
    readingText: obj4ReadingText,
  },
  "ultimate-b2-sb-u1-p2-o5": {
    instruction: obj5Instruction,
    badge: obj5DebateClub,
    argumentBubbles: [obj5HomeArgument, obj5CinemaArgument],
    photos: [obj5HomePhoto, obj5CinemaPhoto],
  },
});

const region = (x, y, width, height) => ({
  left: x / 10,
  top: (y / 1219) * 100,
  width: width / 10,
  height: (height / 1219) * 100,
});

export const ultimateB2Unit1Part2HighlightGroups = Object.freeze({
  "ultimate-b2-sb-u1-p2-o2": [
    {
      id: "obj2-highlight-1",
      label: "Text highlight 1",
      logicalKey: "ultimate-b2.legacy-pilot.unit-1.part-2.obj2.highlight-1",
      regions: [region(659, 998, 285, 19), region(516, 1019, 429, 19), region(516, 1040, 323, 19)],
    },
    {
      id: "obj2-highlight-2",
      label: "Text highlight 2",
      logicalKey: "ultimate-b2.legacy-pilot.unit-1.part-2.obj2.highlight-2",
      regions: [
        region(82, 729, 414, 19),
        region(82, 750, 414, 19),
        region(82, 770, 414, 19),
        region(82, 790, 414, 19),
        region(517, 266, 429, 19),
        region(517, 287, 429, 19),
        region(516, 308, 364, 19),
      ],
    },
    {
      id: "obj2-highlight-3",
      label: "Text highlight 3",
      logicalKey: "ultimate-b2.legacy-pilot.unit-1.part-2.obj2.highlight-3",
      regions: [region(516, 536, 429, 19), region(516, 557, 242, 19)],
    },
  ],
  "ultimate-b2-sb-u1-p2-o3": [
    {
      id: "obj3-highlight-1",
      label: "Question 1 text",
      logicalKey: "ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-1",
      regions: [region(168, 405, 327, 17), region(81, 424, 283, 17)],
    },
    {
      id: "obj3-highlight-2",
      label: "Question 2 text",
      logicalKey: "ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-2",
      regions: [region(367, 454, 129, 17), region(81, 473, 417, 17), region(81, 493, 86, 17)],
    },
    {
      id: "obj3-highlight-3",
      label: "Question 3 text",
      logicalKey: "ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-3",
      regions: [region(555, 432, 388, 17), region(517, 451, 426, 17), region(517, 471, 79, 17)],
    },
    {
      id: "obj3-highlight-4",
      label: "Question 4 text",
      logicalKey: "ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-4",
      regions: [region(803, 490, 138, 17), region(517, 509, 404, 17)],
    },
    {
      id: "obj3-highlight-5",
      label: "Question 5 text",
      logicalKey: "ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-5",
      regions: [
        region(803, 576, 138, 17),
        region(517, 595, 426, 17),
        region(517, 615, 426, 17),
        region(517, 635, 426, 17),
        region(517, 655, 426, 17),
        region(517, 674, 426, 17),
        region(517, 693, 426, 17),
        region(517, 712, 315, 17),
      ],
    },
    {
      id: "obj3-highlight-6",
      label: "Question 6 text",
      logicalKey: "ultimate-b2.legacy-pilot.unit-1.part-2.obj3.highlight-6",
      regions: [
        region(701, 759, 242, 17),
        region(517, 778, 426, 17),
        region(517, 798, 426, 17),
        region(517, 818, 426, 17),
        region(517, 838, 242, 17),
      ],
    },
  ],
});
