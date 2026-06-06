function lockedResourceExercise({ id, title, component, unit, lesson, resourceCount = 0, estimatedTime = "Demo" }) {
  return {
    id,
    title,
    component,
    unit,
    lesson,
    skill: "Book resources",
    type: "Imported AIR assets",
    estimatedTime,
    assignable: false,
    availableToStudent: false,
    locked: true,
    status: "Locked",
    progressLabel: "Imported, not mapped",
    studentProgressLabel: "Locked for mapping",
    description: `${resourceCount} source asset${resourceCount === 1 ? "" : "s"} found in the English Journey 6 AIR package. Map this part to an interactive activity before assigning it.`,
  };
}

function buildPartLesson({ componentKey, componentLabel, unitNumber, partNumber, resourceCount }) {
  const unit = Number.isFinite(unitNumber) ? `Unit ${unitNumber}` : `Test ${unitNumber}`;
  return {
    id: `ej6-${componentKey}-${unitNumber}-part-${partNumber}`,
    title: `Part ${partNumber}`,
    locked: true,
    exercises: [
      lockedResourceExercise({
        id: `ej6-${componentKey}-${unitNumber}-part-${partNumber}-resources`,
        title: `Part ${partNumber} resources`,
        component: componentLabel,
        unit,
        lesson: `Part ${partNumber}`,
        resourceCount,
      }),
    ],
  };
}

function buildUnits({ componentKey, componentLabel, unitNumbers, partCount, resourceCounts, titlePrefix = "Unit" }) {
  return unitNumbers.map((unitNumber) => ({
    id: `ej6-${componentKey}-${unitNumber}`,
    title: `${titlePrefix} ${unitNumber}`,
    unit: `${titlePrefix} ${unitNumber}`,
    locked: true,
    lessons: Array.from({ length: partCount }, (_, index) => buildPartLesson({
      componentKey,
      componentLabel,
      unitNumber,
      partNumber: index + 1,
      resourceCount: Math.max(1, Math.round((resourceCounts[unitNumber] || partCount) / partCount)),
    })),
  }));
}

function buildPageSet({ componentFolder, unitNumber, partCount, titlePrefix = "Unit" }) {
  return {
    id: `ej6-pages-${componentFolder}-${unitNumber}`,
    title: `${titlePrefix} ${unitNumber}`,
    unit: `${titlePrefix} ${unitNumber}`,
    pages: Array.from({ length: partCount }, (_, index) => {
      const pageNumber = index + 1;
      return {
        id: `ej6-${componentFolder}-${unitNumber}-page-${pageNumber}`,
        title: `Part ${pageNumber}`,
        label: `${titlePrefix} ${unitNumber} / Part ${pageNumber}`,
        imagePath: `/src/assets/books/english-journey-6/pages/${componentFolder}/${unitNumber}/parts_part_${pageNumber}.png`,
      };
    }),
  };
}

function buildPageUnits({ componentFolder, unitNumbers, partCount, partCounts = {}, titlePrefix = "Unit" }) {
  return unitNumbers.map((unitNumber) => buildPageSet({
    componentFolder,
    unitNumber,
    partCount: partCounts[unitNumber] || partCount,
    titlePrefix,
  }));
}

function buildSinglePartUnits({ componentKey, componentLabel, unitNumbers, resourceCounts, titlePrefix }) {
  return unitNumbers.map((unitNumber) => ({
    id: `ej6-${componentKey}-${unitNumber}`,
    title: `${titlePrefix} ${unitNumber}`,
    unit: `${titlePrefix} ${unitNumber}`,
    locked: true,
    lessons: [
      buildPartLesson({
        componentKey,
        componentLabel,
        unitNumber,
        partNumber: 1,
        resourceCount: resourceCounts[unitNumber] || 1,
      }),
    ],
  }));
}

const unitNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const studentsBookResourceCounts = {
  1: 123,
  2: 117,
  3: 112,
  4: 127,
  5: 129,
  6: 121,
  7: 111,
  8: 100,
  9: 115,
  10: 123,
};

const workbookResourceCounts = {
  1: 44,
  2: 58,
  3: 45,
  4: 44,
  5: 53,
  6: 45,
  7: 45,
  8: 44,
  9: 43,
  10: 43,
};

const grammarResourceCounts = {
  1: 30,
  2: 55,
  3: 28,
  4: 33,
  5: 35,
  6: 39,
  7: 41,
  8: 39,
  9: 45,
  10: 35,
};

const workbookPageCounts = {
  6: 7,
};

const grammarPageCounts = {
  1: 4,
  2: 6,
  3: 5,
  4: 6,
  5: 6,
  6: 6,
  7: 7,
  8: 5,
  9: 6,
  10: 5,
};

export const englishJourney6Package = {
  id: "english-journey-6",
  slug: "english-journey-6",
  packageTitle: "English Journey 6",
  packageLabel: "English Journey 6 package",
  level: "A2",
  publisher: "Imported AIR package",
  demoSchool: "Hamilton House ELT Demo",
  activationCodeExample: "EJ6-DEMO-2026",
  description: "English Journey 6 digital book package imported from the Adobe AIR source bundle.",
  classes: ["English Journey 6 A", "English Journey 6 B"],
  components: [
    {
      id: "ej6-students-book",
      slug: "english-journey-6-students-book",
      title: "English Journey 6 Students Book",
      subtitle: "Coursebook units imported from book1/unit",
      type: "Students Book",
      componentType: "students_book",
      coverTone: "orange",
      coverAssetPath: "src/assets/books/english-journey-6/covers/english_journey_6_students_book.png",
      pageUnits: buildPageUnits({
        componentFolder: "students-book",
        unitNumbers,
        partCount: 10,
      }),
      units: buildUnits({
        componentKey: "students-book",
        componentLabel: "Students Book",
        unitNumbers,
        partCount: 10,
        resourceCounts: studentsBookResourceCounts,
      }),
    },
    {
      id: "ej6-workbook",
      slug: "english-journey-6-workbook",
      title: "English Journey 6 Workbook",
      subtitle: "Workbook units imported from book1/work",
      type: "Workbook",
      componentType: "workbook",
      coverTone: "blue",
      coverAssetPath: "src/assets/books/english-journey-6/covers/english_journey_6_students_book.png",
      pageUnits: buildPageUnits({
        componentFolder: "workbook",
        unitNumbers,
        partCount: 6,
        partCounts: workbookPageCounts,
      }),
      units: buildUnits({
        componentKey: "workbook",
        componentLabel: "Workbook",
        unitNumbers,
        partCount: 6,
        resourceCounts: workbookResourceCounts,
      }),
    },
    {
      id: "ej6-grammar-book",
      slug: "english-journey-6-grammar-book",
      title: "English Journey 6 Grammar Book",
      subtitle: "Grammar units imported from book1/grammar",
      type: "Grammar Book",
      componentType: "grammar_book",
      coverTone: "green",
      coverAssetPath: "src/assets/books/english-journey-6/covers/english_journey_6_students_book.png",
      pageUnits: buildPageUnits({
        componentFolder: "grammar-book",
        unitNumbers,
        partCount: 6,
        partCounts: grammarPageCounts,
      }),
      units: buildUnits({
        componentKey: "grammar-book",
        componentLabel: "Grammar Book",
        unitNumbers,
        partCount: 6,
        resourceCounts: grammarResourceCounts,
      }),
    },
    {
      id: "ej6-test-book",
      slug: "english-journey-6-test-book",
      title: "English Journey 6 Test Book",
      subtitle: "Tests imported from book1/test",
      type: "Test Book",
      componentType: "test_book",
      coverTone: "slate",
      coverAssetPath: "src/assets/books/english-journey-6/covers/english_journey_6_students_book.png",
      pageUnits: buildPageUnits({
        componentFolder: "test-book",
        unitNumbers: [1, 2],
        partCount: 1,
        titlePrefix: "Test",
      }),
      units: buildSinglePartUnits({
        componentKey: "test-book",
        componentLabel: "Test Book",
        unitNumbers: [1, 2],
        resourceCounts: { 1: 15, 2: 18 },
        titlePrefix: "Test",
      }),
    },
    {
      id: "ej6-video-bank",
      slug: "english-journey-6-video-bank",
      title: "English Journey 6 Video Bank",
      subtitle: "Video resources imported from book1/video",
      type: "Video Bank",
      componentType: "video_bank",
      coverTone: "purple",
      coverAssetPath: "src/assets/books/english-journey-6/covers/english_journey_6_students_book.png",
      pageUnits: buildPageUnits({
        componentFolder: "video-bank",
        unitNumbers: [1],
        partCount: 1,
        titlePrefix: "Video set",
      }),
      units: buildSinglePartUnits({
        componentKey: "video-bank",
        componentLabel: "Video Bank",
        unitNumbers: [1],
        resourceCounts: { 1: 13 },
        titlePrefix: "Video set",
      }),
    },
  ],
};

export const englishJourney6ComponentTitles = englishJourney6Package.components.map((component) => component.title);
