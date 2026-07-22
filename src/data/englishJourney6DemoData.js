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

function buildPageSet({ componentFolder, unitNumber, partCount, titlePrefix = "Unit", startPageNumber = 1, unitTitle = null, pageSections = null }) {
  const unitLabel = unitTitle ? `${unitNumber} ${unitTitle}` : `${titlePrefix} ${unitNumber}`;
  const title = unitTitle || `${titlePrefix} ${unitNumber}`;
  const unitPageLabel = unitTitle ? `${titlePrefix} ${unitNumber}, ${unitTitle}` : `${titlePrefix} ${unitNumber}`;
  const pageItems = pageSections || Array.from({ length: partCount }, (_, index) => ({
    part: index + 1,
    title: `Part ${index + 1}`,
  }));

  return {
    id: `ej6-pages-${componentFolder}-${unitNumber}`,
    number: unitNumber,
    title,
    unit: `${titlePrefix} ${unitNumber}`,
    displayLabel: unitLabel,
    pages: pageItems.map((section, index) => {
      const partNumber = section.part || index + 1;
      return {
        id: `ej6-${componentFolder}-${unitNumber}-page-${partNumber}`,
        sectionId: section.id || `part-${partNumber}`,
        part: partNumber,
        title: section.title || `Part ${partNumber}`,
        label: `${unitPageLabel} / ${section.title || `Part ${partNumber}`}`,
        pageNumber: startPageNumber + index,
        imagePath: `/src/assets/books/english-journey-6/pages/${componentFolder}/${unitNumber}/parts_part_${partNumber}.png`,
      };
    }),
  };
}

function buildPageUnits({ componentFolder, unitNumbers, units = null, partCount, partCounts = {}, titlePrefix = "Unit", pageSections = null }) {
  let nextPageNumber = 1;
  const pageUnitItems = units || unitNumbers.map((unitNumber) => ({ number: unitNumber }));

  return pageUnitItems.map((unitItem) => {
    const unitNumber = unitItem.number;
    const unitPageSections = pageSections || null;
    const pageCount = unitPageSections?.length || partCounts[unitNumber] || partCount;
    const pageSet = buildPageSet({
      componentFolder,
      unitNumber,
      partCount: pageCount,
      titlePrefix,
      startPageNumber: nextPageNumber,
      unitTitle: unitItem.title || null,
      pageSections: unitPageSections,
    });
    nextPageNumber += pageCount;
    return pageSet;
  });
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

const englishJourney6StudentsBookUnits = [
  { number: 1, title: "This Is Me!" },
  { number: 2, title: "People of the World" },
  { number: 3, title: "Museums & Collections" },
  { number: 4, title: "Getting Around" },
  { number: 5, title: "Eating & Drinking" },
  { number: 6, title: "Feeling Fine" },
  { number: 7, title: "The Countryside" },
  { number: 8, title: "Towns & Cities" },
  { number: 9, title: "Celebrate!" },
  { number: 10, title: "Music" },
];

const englishJourney6StudentsBookPageSections = [
  { part: 1, id: "unit-opener", title: "Unit opener" },
  { part: 2, id: "reading", title: "Reading" },
  { part: 3, id: "vocabulary-1", title: "Vocabulary 1" },
  { part: 4, id: "grammar-1", title: "Grammar 1" },
  { part: 5, id: "vocabulary-2", title: "Vocabulary 2" },
  { part: 6, id: "grammar-2", title: "Grammar 2" },
  { part: 7, id: "listening", title: "Listening" },
  { part: 8, id: "speaking", title: "Speaking" },
  { part: 9, id: "writing", title: "Writing" },
  { part: 10, id: "reload", title: "Reload" },
];

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
  description: "English Journey 6 digital book package imported from the legacy digital source bundle.",
  classes: ["English Journey 6 A", "English Journey 6 B"],
  components: [
    {
      id: "ej6-students-book",
      slug: "english-journey-6-students-book",
      routeSlug: "students-book",
      title: "English Journey 6 Students Book",
      subtitle: "Coursebook units imported from book1/unit",
      type: "Students Book",
      componentType: "students_book",
      coverTone: "orange",
      coverAssetPath: "src/assets/books/english-journey-6/covers/english_journey_6_students_book.png",
      pageUnits: buildPageUnits({
        componentFolder: "students-book",
        units: englishJourney6StudentsBookUnits,
        partCount: 10,
        pageSections: englishJourney6StudentsBookPageSections,
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
      routeSlug: "workbook",
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
      routeSlug: "grammar-book",
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
      routeSlug: "test-book",
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
      routeSlug: "video-bank",
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
