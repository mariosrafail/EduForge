import { getUltimateB2Unit2Asset, getUltimateB2UnitPartAsset, getUltimateB2UnitPartNumbers } from "virtual:ultimate-b2-page-assets";

const sectionTitles = [
  "Unit opener",
  "Reading",
  "Vocabulary",
  "Grammar",
  "Listening",
  "Speaking",
  "Writing",
  "Review",
  "Practice",
  "Progress check",
  "Extra practice",
  "Revision",
];

const unitPageStarts = {
  1: 1,
  3: 35,
  4: 51,
  5: 67,
  6: 83,
  7: 99,
  8: 115,
  9: 131,
  10: 147,
};

function getUnitPartImage(unitNumber, partNumber) {
  return getUltimateB2UnitPartAsset(unitNumber, partNumber);
}

function buildUltimateB2PageUnit(unitNumber) {
  const partNumbers = getUltimateB2UnitPartNumbers(unitNumber);

  return {
    id: `ub2-sb-unit-${unitNumber}-pages`,
    number: unitNumber,
    title: `Unit ${unitNumber}`,
    unit: `Unit ${unitNumber}`,
    displayLabel: `Unit ${unitNumber}`,
    pages: partNumbers.map((partNumber, index) => {
      const title = sectionTitles[index] || `Part ${partNumber}`;
      const pageNumber = (unitPageStarts[unitNumber] || unitNumber * 100) + index;
      return {
        id: `ub2-sb-unit-${unitNumber}-part-${partNumber}`,
        part: partNumber,
        title,
        label: `Unit ${unitNumber} / ${title}`,
        pageNumber,
        images: [getUnitPartImage(unitNumber, partNumber)].filter(Boolean),
      };
    }),
  };
}

// Keep Unit 2 ids, page numbers, images, and hotspots stable for the existing demo activities.
const ultimateB2StudentsBookUnit2PageUnit = {
  id: "ub2-sb-unit-2-pages",
  number: 2,
  title: "Unit 2",
  unit: "Unit 2",
  displayLabel: "Unit 2",
  pages: [
    { id: "reading-19", title: "Reading", label: "pg 19", pageNumber: 19, images: [getUltimateB2Unit2Asset("19.png")] },
    {
      id: "reading-20-21",
      title: "Reading",
      label: "pg 20-21",
      pageNumber: 20,
      images: [getUltimateB2Unit2Asset("20-21.png")],
      continuesToVideo: true,
      actions: [
        { id: "video", label: "Video", top: "7%", left: "3.2%", width: "45%", height: "14%", ariaLabel: "Open video activity from page 20", target: "video" },
        { id: "text-audio", label: "Text + Audio", top: "22%", left: "3.4%", width: "46.2%", height: "66%", ariaLabel: "Open reading text with audio from page 20", target: "text-audio" },
        { id: "exercise-3", label: "Exercise 3", top: "8%", left: "53.2%", width: "43.5%", height: "38%", ariaLabel: "Open Exercise 3 missing sentences", target: "exercise-3", activityKey: "reading-ex3" },
        { id: "exercise-4", label: "Exercise 4", top: "48%", left: "53.3%", width: "43.4%", height: "29%", ariaLabel: "Open Exercise 4 circle the correct words", target: "exercise-4", activityKey: "reading-ex4" },
      ],
    },
    { id: "vocabulary-22-23", title: "Vocabulary in Use", label: "pg 22-23", pageNumber: 22, images: [getUltimateB2Unit2Asset("22-23.png")] },
    { id: "grammar-24-25", title: "Grammar in Use", label: "pg 24-25", pageNumber: 24, images: [getUltimateB2Unit2Asset("24-25.png")] },
    { id: "listening-26", title: "Listening", label: "pg 26", pageNumber: 26, images: [getUltimateB2Unit2Asset("26.png")] },
    { id: "speaking-27", title: "Speaking", label: "pg 27", pageNumber: 27, images: [getUltimateB2Unit2Asset("27.png")] },
    { id: "writing-28-29", title: "Writing", label: "pg 28-29", pageNumber: 28, images: [getUltimateB2Unit2Asset("28-29.png")] },
    { id: "review-30", title: "Review 2", label: "pg 30", pageNumber: 30, images: [getUltimateB2Unit2Asset("30.png")] },
    { id: "practice-31-32", title: "Practice 2", label: "pg 31-32", pageNumber: 31, images: [getUltimateB2Unit2Asset("31.png"), getUltimateB2Unit2Asset("32.png")] },
    { id: "progress-check-33-34", title: "Progress check 1", label: "pg 33-34", pageNumber: 33, images: [getUltimateB2Unit2Asset("33.png"), getUltimateB2Unit2Asset("34.png")] },
  ],
};

export const ultimateB2StudentsBookPageUnits = [
  buildUltimateB2PageUnit(1),
  ultimateB2StudentsBookUnit2PageUnit,
  buildUltimateB2PageUnit(3),
  buildUltimateB2PageUnit(4),
  buildUltimateB2PageUnit(5),
  buildUltimateB2PageUnit(6),
  buildUltimateB2PageUnit(7),
  buildUltimateB2PageUnit(8),
  buildUltimateB2PageUnit(9),
  buildUltimateB2PageUnit(10),
].filter((unit) => unit.pages.length);


